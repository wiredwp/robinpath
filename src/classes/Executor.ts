/**
 * Executor class for executing RobinPath statements
 */

import { isTruthy, type Value, splitIntoLogicalLines, type AttributePathSegment } from '../utils';
import { LexerUtils } from '../utils';
import { ReturnException, BreakException, EndException } from './exceptions';
import { ExpressionEvaluator } from './ExpressionEvaluator';
import { Parser } from './Parser';
import JSON5 from 'json5';
import type { 
    Environment, 
    Frame, 
    Statement, 
    Arg, 
    CommandCall,
    DefineFunction,
    Assignment,
    ShorthandAssignment,
    InlineIf,
    IfBlock,
    IfTrue,
    IfFalse,
    ReturnStatement,
    BreakStatement,
    ScopeBlock,
    TogetherBlock,
    ForLoop,
    OnBlock,
    BuiltinCallback,
    ModuleMetadata,
    DecoratorCall
} from '../index';
import type { RobinPathThread } from './RobinPathThread';

export class Executor {
    private environment: Environment;
    private callStack: Frame[] = [];
    private parentThread: RobinPathThread | null = null;

    constructor(environment: Environment, parentThread?: RobinPathThread | null) {
        this.environment = environment;
        this.parentThread = parentThread || null;
        // Initialize global frame
        this.callStack.push({
            locals: new Map(),
            lastValue: null
        });
    }


    getCurrentFrame(frameOverride?: Frame): Frame {
        // If a frame is explicitly provided (for parallel execution), use it
        if (frameOverride !== undefined) {
            return frameOverride;
        }
        return this.callStack[this.callStack.length - 1];
    }

    getEnvironment(): Environment {
        return this.environment;
    }

    getCallStack(): Frame[] {
        return this.callStack;
    }

    /**
     * Execute an event handler with the provided arguments
     * Arguments are available as $1, $2, $3, etc. in the handler body
     */
    async executeEventHandler(handler: OnBlock, args: Value[]): Promise<void> {
        // Create a new frame for the handler
        const frame: Frame = {
            locals: new Map(),
            lastValue: null,
            isFunctionFrame: true
        };
        
        // Set positional parameters ($1, $2, $3, ...)
        for (let i = 0; i < args.length; i++) {
            frame.locals.set(String(i + 1), args[i]);
        }
        
        // Push frame to call stack
        this.callStack.push(frame);
        
        try {
            // Execute handler body
            for (const stmt of handler.body) {
                await this.executeStatement(stmt);
            }
        } finally {
            // Clean up frame
            this.callStack.pop();
        }
    }

    /**
     * Execute a single statement (public method for state tracking)
     */
    async executeStatementPublic(stmt: Statement): Promise<void> {
        await this.executeStatement(stmt);
    }

    /**
     * Execute a function call and return the result (public method for expression evaluation)
     */
    async executeFunctionCall(funcName: string, args: Arg[]): Promise<Value> {
        const frame = this.getCurrentFrame();
        
        // Check if function is forgotten in current scope
        if (frame.forgotten && frame.forgotten.has(funcName)) {
            // Function is forgotten in this scope - throw error (as if it doesn't exist)
            throw new Error(`Unknown function: ${funcName}`);
        }
        
        const evaluatedArgs = await Promise.all(args.map(arg => this.evaluateArg(arg)));
        
        // Optimize: Use get() instead of has() + get() to reduce lookups
        // Check if it's a builtin function
        const builtinHandler = this.environment.builtins.get(funcName);
        if (builtinHandler) {
            const result = await Promise.resolve(async () => {
                return await builtinHandler(evaluatedArgs)
            });
            return result !== undefined ? result : null;
        }
        
        // Check if it's a user-defined function
        const userFunc = this.environment.functions.get(funcName);
        if (userFunc) {
            return await this.callFunction(userFunc, evaluatedArgs);
        }
        
        throw new Error(`Unknown function: ${funcName}`);
    }

    async execute(statements: Statement[]): Promise<Value> {
        try {
            for (const stmt of statements) {
                await this.executeStatement(stmt);
            }
            return this.getCurrentFrame().lastValue;
        } catch (error) {
            if (error instanceof ReturnException) {
                // Return statement was executed - return the value and stop execution
                return error.value;
            }
            if (error instanceof BreakException) {
                // Break statement used outside a loop - this is an error
                throw new Error('break statement can only be used inside a for loop');
            }
            if (error instanceof EndException) {
                // End statement was executed - stop execution and return current last value
                return this.getCurrentFrame().lastValue;
            }
            throw error;
        }
    }

    private async executeStatement(stmt: Statement, frameOverride?: Frame): Promise<void> {
        switch (stmt.type) {
            case 'command':
                await this.executeCommand(stmt, frameOverride);
                break;
            case 'assignment':
                await this.executeAssignment(stmt, frameOverride);
                break;
            case 'shorthand':
                this.executeShorthandAssignment(stmt, frameOverride);
                break;
            case 'inlineIf':
                await this.executeInlineIf(stmt, frameOverride);
                break;
            case 'ifBlock':
                await this.executeIfBlock(stmt, frameOverride);
                break;
            case 'ifTrue':
                await this.executeIfTrue(stmt, frameOverride);
                break;
            case 'ifFalse':
                await this.executeIfFalse(stmt, frameOverride);
                break;
            case 'define':
                this.registerFunction(stmt);
                break;
            case 'do':
                await this.executeScope(stmt, frameOverride);
                break;
            case 'together':
                await this.executeTogether(stmt);
                break;
            case 'forLoop':
                await this.executeForLoop(stmt, frameOverride);
                break;
            case 'return':
                await this.executeReturn(stmt, frameOverride);
                break;
            case 'break':
                await this.executeBreak(stmt, frameOverride);
                break;
            case 'onBlock':
                this.registerEventHandler(stmt);
                break;
            case 'comment':
                // Comments are no-ops during execution
                break;
        }
    }

    /**
     * Reconstructs the original input string from an Arg object.
     * This is useful for commands that need to preserve the original input
     * (e.g., variable/function names) rather than evaluating them.
     * 
     * Examples:
     * - { type: 'var', name: 'a' } -> '$a'
     * - { type: 'var', name: 'a', path: [{ type: 'property', name: 'b' }] } -> '$a.b'
     * - { type: 'var', name: 'a', path: [{ type: 'index', index: 0 }] } -> '$a[0]'
     * - { type: 'string', value: 'hello' } -> 'hello'
     * 
     * @param arg The Arg object to reconstruct
     * @returns The original input string, or null if the arg type cannot be reconstructed
     */
    private reconstructOriginalInput(arg: Arg): string | null {
        if (arg.type === 'var') {
            // Reconstruct variable name from Arg object
            // Start with the base variable name (e.g., '$a')
            let varStr = '$' + arg.name;
            
            // Append path segments if present (e.g., '.property' or '[index]')
            if (arg.path) {
                for (const seg of arg.path) {
                    if (seg.type === 'property') {
                        varStr += '.' + seg.name;
                    } else if (seg.type === 'index') {
                        varStr += '[' + seg.index + ']';
                    }
                }
            }
            return varStr;
        } else if (arg.type === 'string') {
            // Return the string value directly
            return arg.value;
        } else if (arg.type === 'literal') {
            // For literal values, try to convert back to string representation
            // This handles cases where a function name or variable name was parsed as a literal
            const value = arg.value;
            if (typeof value === 'string') {
                return value;
            }
            // For other literal types, we can't reconstruct the original
            return null;
        }
        
        // For other types (number, subexpr, lastValue, etc.), we cannot reconstruct
        // the original input, so return null
        return null;
    }

    private async executeCommand(cmd: CommandCall, frameOverride?: Frame): Promise<void> {
        const frame = this.getCurrentFrame(frameOverride);
        
        // Separate positional args and named args
        const positionalArgs: Value[] = [];
        let namedArgsObj: Record<string, Value> | null = null;
        
        for (const arg of cmd.args) {
            if (arg.type === 'namedArgs') {
                // Evaluate named arguments into an object
                namedArgsObj = await this.evaluateArg(arg, frameOverride) as Record<string, Value>;
            } else {
                // Positional argument
                const value = await this.evaluateArg(arg, frameOverride);
                positionalArgs.push(value);
            }
        }
        
        // Combine positional args with named args object (if present)
        // Named args object is appended as the last argument
        const args = namedArgsObj 
            ? [...positionalArgs, namedArgsObj]
            : positionalArgs;

        // Special handling for "_subexpr" command - internal command to execute subexpression
        if (cmd.name === '_subexpr') {
            if (args.length === 0) {
                throw new Error('_subexpr command requires a subexpression argument');
            }
            // The subexpression result is already evaluated by evaluateArg, so just return it
            frame.lastValue = args[0];
            return;
        }

        // Special handling for "_var" command - internal command to return variable value
        if (cmd.name === '_var') {
            if (args.length === 0) {
                throw new Error('_var command requires a variable name argument');
            }
            // The variable value is already evaluated by evaluateArg, so just return it
            frame.lastValue = args[0];
            return;
        }

        // Special handling for "_object" command - internal command for object literals
        if (cmd.name === '_object') {
            if (args.length === 0) {
                throw new Error('_object command requires an object literal argument');
            }
            // The object is already evaluated by evaluateArg, so just return it
            frame.lastValue = args[0];
            return;
        }

        // Special handling for "_array" command - internal command for array literals
        if (cmd.name === '_array') {
            if (args.length === 0) {
                throw new Error('_array command requires an array literal argument');
            }
            // The array is already evaluated by evaluateArg, so just return it
            frame.lastValue = args[0];
            return;
        }

        // Special handling for "use" command - it needs to modify the environment
        if (cmd.name === 'use') {
            // Show help if no arguments
            if (args.length === 0) {
                const result = `Use Command:
  use <moduleName>         - Set module context (e.g., "use math")
  use clear                - Clear module context
  
Examples:
  use math                 - Use math module (then "add 5 5" instead of "math.add 5 5")
  use clear                - Clear module context`;
                console.log(result);
                frame.lastValue = result;
                return;
            }
            
            const moduleName = String(args[0]);
            
            // If "clear", clear the current module context
            if (moduleName === 'clear' || moduleName === '' || moduleName === null) {
                this.environment.currentModule = null;
                const result = 'Cleared module context';
                console.log(result);
                frame.lastValue = result;
                return;
            }
            
            // Convert to string (handles both quoted strings and unquoted literals)
            const name = String(moduleName);
            
            // Check if the module exists (has metadata or has registered functions)
            // Optimize: Check metadata first (faster), then check builtins only if needed
            const hasMetadata = this.environment.moduleMetadata.has(name);
            let hasFunctions = false;
            if (!hasMetadata) {
                // Only check builtins if metadata doesn't exist
                // Optimize: Use direct iteration instead of Array.from().some()
                const prefix = `${name}.`;
                for (const key of this.environment.builtins.keys()) {
                    if (key.startsWith(prefix)) {
                        hasFunctions = true;
                        break;
                    }
                }
            }
            
            if (!hasMetadata && !hasFunctions) {
                const errorMsg = `Error: Module "${name}" not found`;
                console.log(errorMsg);
                frame.lastValue = errorMsg;
                return;
            }
            
            // Set the current module context in this executor's environment
            this.environment.currentModule = name;
            const result = `Using module: ${name}`;
            console.log(result);
            frame.lastValue = result;
            return;
        }

        // Special handling for "explain" command - it needs to respect current module context
        if (cmd.name === 'explain') {
            // Show help if no arguments
            if (args.length === 0) {
                const result = `Explain Command:
  explain <moduleName>     - Show module documentation and available methods
  explain <module.function> - Show function documentation with parameters and return type
  
Examples:
  explain math             - Show math module documentation
  explain math.add         - Show add function documentation
  explain add              - Show add function (if "use math" is active)`;
                console.log(result);
                frame.lastValue = result;
                return;
            }
            
            const nameArg = args[0];
            if (!nameArg) {
                const errorMsg = 'Error: explain requires a module or function name';
                console.log(errorMsg);
                frame.lastValue = errorMsg;
                return;
            }
            
            // Convert to string (handles both quoted strings and unquoted literals)
            let name = String(nameArg);
            
            // If name doesn't have a dot and currentModule is set, check if it's the module name itself
            // If it matches the current module, treat it as a module name (don't prepend)
            // Otherwise, prepend the current module to make it a function call
            if (!name.includes('.') && this.environment.currentModule) {
                // Check if the name matches the current module name
                if (name === this.environment.currentModule) {
                    // It's the module name itself - don't prepend, treat as module
                    // name stays as is
                } else {
                    // It's a function name - prepend the current module
                    name = `${this.environment.currentModule}.${name}`;
                }
            }

            // Check if it's a module name (no dot) or module.function (has dot)
            if (name.includes('.')) {
                // It's a module.function - return function metadata as JSON
                const functionMetadata = this.environment.metadata.get(name);
                if (!functionMetadata) {
                    const error = { error: `No documentation available for function: ${name}` };
                    frame.lastValue = error;
                    return;
                }

                // Return structured JSON object
                const result = {
                    type: 'function',
                    name: name,
                    description: functionMetadata.description,
                    parameters: functionMetadata.parameters || [],
                    returnType: functionMetadata.returnType,
                    returnDescription: functionMetadata.returnDescription,
                    example: functionMetadata.example || null
                };
                
                frame.lastValue = result;
                return;
            } else {
                // It's a module name - return module metadata as JSON
                const moduleMetadata = this.environment.moduleMetadata.get(name);
                if (!moduleMetadata) {
                    const error = { error: `No documentation available for module: ${name}` };
                    frame.lastValue = error;
                    return;
                }

                // Return structured JSON object
                const result = {
                    type: 'module',
                    name: name,
                    description: moduleMetadata.description,
                    methods: moduleMetadata.methods || []
                };
                
                frame.lastValue = result;
                return;
            }
        }

        // Special handling for "thread" command - needs access to parent RobinPath
        if (cmd.name === 'thread') {
            const parent = this.parentThread?.getParent();
            
            if (!parent) {
                const errorMsg = 'Error: thread command must be executed in a thread context';
                console.log(errorMsg);
                frame.lastValue = errorMsg;
                return;
            }
            
            // Check if thread control is enabled
            if (!parent.isThreadControlEnabled()) {
                const errorMsg = 'Error: Thread control is disabled. Set threadControl: true in constructor to enable.';
                console.log(errorMsg);
                frame.lastValue = errorMsg;
                return;
            }
            
            // Show help if no arguments
            if (args.length === 0) {
                const result = `Thread Commands:
  thread list              - List all threads
  thread use <id>          - Switch to a thread
  thread create <id>       - Create a new thread with ID
  thread close [id]        - Close current thread or thread by ID`;
                console.log(result);
                frame.lastValue = result;
                return;
            }
            
            const subcommand = String(args[0]);
            
            if (subcommand === 'list') {
                const threads = parent.listThreads();
                let result = 'Threads:\n';
                for (const thread of threads) {
                    const marker = thread.isCurrent ? ' (current)' : '';
                    result += `  - ${thread.id}${marker}\n`;
                }
                console.log(result);
                frame.lastValue = result;
                return;
            }
            
            if (subcommand === 'use' && args.length > 1) {
                const threadId = String(args[1]);
                try {
                    parent.useThread(threadId);
                    const result = `Switched to thread: ${threadId}`;
                    console.log(result);
                    frame.lastValue = result;
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    console.log(errorMsg);
                    frame.lastValue = errorMsg;
                }
                return;
            }
            
            if (subcommand === 'create' && args.length > 1) {
                const threadId = String(args[1]);
                try {
                    parent.createThread(threadId);
                    const result = `Created thread: ${threadId}`;
                    console.log(result);
                    frame.lastValue = result;
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    console.log(errorMsg);
                    frame.lastValue = errorMsg;
                }
                return;
            }
            
            if (subcommand === 'close') {
                if (args.length > 1) {
                    // Close specific thread by ID
                    const threadId = String(args[1]);
                    try {
                        parent.closeThread(threadId);
                        const result = `Closed thread: ${threadId}`;
                        console.log(result);
                        frame.lastValue = result;
                    } catch (error) {
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        console.log(errorMsg);
                        frame.lastValue = errorMsg;
                    }
                } else {
                    // Close current thread
                    const currentThread = parent.getCurrentThread();
                    if (!currentThread) {
                        const errorMsg = 'Error: No current thread to close';
                        console.log(errorMsg);
                        frame.lastValue = errorMsg;
                    } else {
                        const threadId = currentThread.id;
                        parent.closeThread(threadId);
                        const result = `Closed current thread: ${threadId}`;
                        console.log(result);
                        frame.lastValue = result;
                    }
                }
                return;
            }
            
            const errorMsg = 'Error: thread command usage: thread list|use <id>|create <id>|close [id]';
            console.log(errorMsg);
            frame.lastValue = errorMsg;
            return;
        }

        // Special handling for "module" command
        if (cmd.name === 'module') {
            const parent = this.parentThread?.getParent();
            
            // Show help if no arguments
            if (args.length === 0) {
                const result = `Module Commands:
  module list              - List all available modules`;
                console.log(result);
                frame.lastValue = result;
                return;
            }
            
            const subcommand = String(args[0]);
            
            if (subcommand === 'list') {
                // Get all modules from moduleMetadata
                // Use parent's getAllModuleInfo if available, otherwise use current executor's environment
                let moduleMap: Map<string, ModuleMetadata>;
                if (parent) {
                    moduleMap = parent.getAllModuleInfo();
                } else {
                    moduleMap = new Map(this.environment.moduleMetadata);
                }
                
                const modules = Array.from(moduleMap.keys());
                let result = 'Available Modules:\n';
                if (modules.length === 0) {
                    result += '  (no modules registered)\n';
                } else {
                    for (const moduleName of modules.sort()) {
                        const moduleInfo = moduleMap.get(moduleName);
                        if (moduleInfo) {
                            result += `  - ${moduleName}: ${moduleInfo.description}\n`;
                        } else {
                            result += `  - ${moduleName}\n`;
                        }
                    }
                }
                console.log(result);
                frame.lastValue = result;
                return;
            }
            
            const errorMsg = 'Error: module command usage: module list';
            console.log(errorMsg);
            frame.lastValue = errorMsg;
            return;
        }

        // Special handling for "set" command - assigns a value to a variable
        if (cmd.name === 'set') {
            if (cmd.args.length < 2) {
                throw new Error('set requires at least 2 arguments: variable name and value (optional fallback as 3rd arg)');
            }
            
            // Preserve the last value - assign should not affect $
            const previousLastValue = frame.lastValue;
            
            // Get variable name from first arg (must be a variable reference)
            const varArg = cmd.args[0];
            if (varArg.type !== 'var') {
                throw new Error('set first argument must be a variable (e.g., $myVar)');
            }
            const varName = varArg.name;
            const varPath = varArg.path; // Support attribute paths (e.g., $user.city)
            
            // Evaluate the second arg as the value to assign
            let value = await this.evaluateArg(cmd.args[1], frameOverride);
            
            // Check if value is empty or null, and if so, use fallback (3rd arg) if provided
            const isEmpty = value === null || value === undefined || 
                          (typeof value === 'string' && value.trim() === '') ||
                          (Array.isArray(value) && value.length === 0) ||
                          (typeof value === 'object' && Object.keys(value).length === 0);
            
            if (isEmpty && cmd.args.length >= 3) {
                // Use fallback value (3rd argument)
                value = await this.evaluateArg(cmd.args[2], frameOverride);
            }
            
            // Set the variable (with path support)
            if (varPath && varPath.length > 0) {
                this.setVariableAtPath(varName, varPath, value);
            } else {
            this.setVariable(varName, value);
            }
            
            // Restore the last value - set command should not affect $
            frame.lastValue = previousLastValue;
            return;
        }

        // Special handling for "var" command - declares a variable with optional default value
        if (cmd.name === 'var') {
            if (cmd.args.length < 1) {
                throw new Error('var requires at least 1 argument: variable name (optional default value as 2nd arg)');
            }
            
            // Preserve the last value - var should not affect $
            const previousLastValue = frame.lastValue;
            
            // Get variable name from first arg (must be a variable reference)
            const varArg = cmd.args[0];
            if (varArg.type !== 'var') {
                throw new Error('var first argument must be a variable (e.g., $myVar)');
            }
            const varName = varArg.name;
            const varPath = varArg.path;
            
            // If path is provided, throw error (var only supports simple variable names)
            if (varPath && varPath.length > 0) {
                throw new Error('var command does not support attribute paths (e.g., $user.name). Use simple variable names only.');
            }
            
            // Check if variable already exists
            if (this.environment.variables.has(varName)) {
                throw new Error(`Variable $${varName} is already declared`);
            }
            
            // Evaluate default value if provided (2nd arg)
            let value: Value = null;
            if (cmd.args.length >= 2) {
                value = await this.evaluateArg(cmd.args[1], frameOverride);
            }
            
            // Declare the variable (not a constant)
            this.environment.variables.set(varName, value);
            
            // Execute decorators if any (for variable metadata)
            if (cmd.decorators && cmd.decorators.length > 0) {
                await this.executeDecorators(cmd.decorators, varName, null, [], frameOverride);
            }
            
            // Restore the last value - var command should not affect $
            frame.lastValue = previousLastValue;
            return;
        }

        // Special handling for "const" command - declares a constant with required value
        if (cmd.name === 'const') {
            if (cmd.args.length < 2) {
                throw new Error('const requires 2 arguments: constant name and value');
            }
            
            // Preserve the last value - const should not affect $
            const previousLastValue = frame.lastValue;
            
            // Get constant name from first arg (must be a variable reference)
            const varArg = cmd.args[0];
            if (varArg.type !== 'var') {
                throw new Error('const first argument must be a variable (e.g., $MY_CONST)');
            }
            const constName = varArg.name;
            const varPath = varArg.path;
            
            // If path is provided, throw error (const only supports simple variable names)
            if (varPath && varPath.length > 0) {
                throw new Error('const command does not support attribute paths (e.g., $user.name). Use simple variable names only.');
            }
            
            // Check if constant already exists
            if (this.environment.constants.has(constName)) {
                throw new Error(`Constant $${constName} is already declared`);
            }
            
            // Check if variable with same name exists
            if (this.environment.variables.has(constName)) {
                throw new Error(`Variable $${constName} already exists. Cannot declare as constant.`);
            }
            
            // Evaluate the value (required, 2nd arg)
            const value = await this.evaluateArg(cmd.args[1]);
            
            // Declare the constant
            this.environment.variables.set(constName, value);
            this.environment.constants.add(constName);
            
            // Execute decorators if any (for constant metadata)
            if (cmd.decorators && cmd.decorators.length > 0) {
                await this.executeDecorators(cmd.decorators, constName, null, [], frameOverride);
            }
            
            // Restore the last value - const command should not affect $
            frame.lastValue = previousLastValue;
            return;
        }

        // Special handling for "empty" command - clears/empties a variable
        if (cmd.name === 'empty') {
            if (cmd.args.length < 1) {
                throw new Error('empty requires 1 argument: variable name');
            }
            
            // Preserve the last value - empty should not affect $
            const previousLastValue = frame.lastValue;
            
            // Get variable name from first arg (must be a variable reference)
            const varArg = cmd.args[0];
            if (varArg.type !== 'var') {
                throw new Error('empty first argument must be a variable (e.g., $myVar)');
            }
            const varName = varArg.name;
            const varPath = varArg.path; // Support attribute paths (e.g., $user.city)
            
            // Check if this is a constant - constants cannot be emptied
            if (!varPath || varPath.length === 0) {
                if (this.environment.constants.has(varName)) {
                    throw new Error(`Cannot empty constant $${varName}. Constants are immutable.`);
                }
            }
            
            // Set the variable to null (empty)
            if (varPath && varPath.length > 0) {
                this.setVariableAtPath(varName, varPath, null);
            } else {
            this.setVariable(varName, null);
            }
            
            // Restore the last value - empty command should not affect $
            frame.lastValue = previousLastValue;
            return;
        }

        // Special handling for "end" command - ends script execution
        if (cmd.name === 'end') {
            // Throw EndException to stop script execution
            throw new EndException();
        }

        // Special handling for "meta" command - stores metadata for functions or variables
        if (cmd.name === 'meta') {
            if (cmd.args.length < 3) {
                throw new Error('meta requires 3 arguments: target (fn/variable), meta key, and value');
            }
            
            // Extract original input from cmd.args (before evaluation)
            // For target: always use the original arg (never evaluate)
            const targetArg = cmd.args[0];
            const targetOriginal = this.reconstructOriginalInput(targetArg);
            if (targetOriginal === null) {
                throw new Error('meta target must be a variable or string literal');
            }
            const target: string = targetOriginal;
            
            // Extract metaKey from original arg
            const metaKey = String(await this.evaluateArg(cmd.args[1], frameOverride));
            
            // Evaluate metaValue (this should be evaluated)
            const metaValue = await this.evaluateArg(cmd.args[2], frameOverride);

            // Check if target is a variable (starts with $)
            if (target.startsWith('$')) {
                // Variable metadata
                const varName = target.slice(1); // Remove $
                
                // Get or create metadata map for this variable
                if (!this.environment.variableMetadata.has(varName)) {
                    this.environment.variableMetadata.set(varName, new Map());
                }
                const varMeta = this.environment.variableMetadata.get(varName)!;
                varMeta.set(metaKey, metaValue);
            } else {
                // Function metadata
                const funcName = target;
                
                // Get or create metadata map for this function
                if (!this.environment.functionMetadata.has(funcName)) {
                    this.environment.functionMetadata.set(funcName, new Map());
                }
                const funcMeta = this.environment.functionMetadata.get(funcName)!;
                funcMeta.set(metaKey, metaValue);
            }
            
            // meta command should not affect the last value
            return;
        }

        // Special handling for "getMeta" command - retrieves metadata for functions or variables
        if (cmd.name === 'getMeta') {
            if (cmd.args.length < 1) {
                throw new Error('getMeta requires at least 1 argument: target (fn/variable)');
            }
            
            // Extract original input from cmd.args (before evaluation)
            // For target: always use the original arg (never evaluate)
            const targetArg = cmd.args[0];
            const targetOriginal = this.reconstructOriginalInput(targetArg);
            if (targetOriginal === null) {
                throw new Error('getMeta target must be a variable or string literal');
            }
            const target: string = targetOriginal;
            
            // Check if target is a variable (starts with $)
            if (target.startsWith('$')) {
                // Variable metadata
                const varName = target.slice(1); // Remove $
                const varMeta = this.environment.variableMetadata?.get(varName);
                
                if (!varMeta || varMeta.size === 0) {
                    // Return null if no metadata
                    frame.lastValue = null;
                    return;
                }
                
                // If second argument provided, return specific key value
                if (cmd.args.length >= 2) {
                    const metaKey = String(await this.evaluateArg(cmd.args[1], frameOverride));
                    const value = varMeta.get(metaKey);
                    frame.lastValue = value !== undefined ? value : null;
                    return;
                }
                
                // Return all metadata as an object
                const metadataObj: Record<string, Value> = {};
                for (const [key, value] of varMeta.entries()) {
                    metadataObj[key] = value;
                }
                frame.lastValue = metadataObj;
                return;
            } else {
                // Function metadata
                const funcName = target;
                const funcMeta = this.environment.functionMetadata?.get(funcName);
                
                if (!funcMeta || funcMeta.size === 0) {
                    // Return null if no metadata
                    frame.lastValue = null;
                    return;
                }
                
                // If second argument provided, return specific key value
                if (cmd.args.length >= 2) {
                    const metaKey = String(await this.evaluateArg(cmd.args[1], frameOverride));
                    const value = funcMeta.get(metaKey);
                    frame.lastValue = value !== undefined ? value : null;
                    return;
                }
                
                // Return all metadata as an object
                const metadataObj: Record<string, Value> = {};
                for (const [key, value] of funcMeta.entries()) {
                    metadataObj[key] = value;
                }
                frame.lastValue = metadataObj;
                return;
            }
        }

        // Special handling for "getType" command - returns the type of a variable
        if (cmd.name === 'getType') {
            if (cmd.args.length < 1) {
                throw new Error('getType requires 1 argument: variable name');
            }
            
            // Get variable name from first arg (must be a variable reference)
            const varArg = cmd.args[0];
            if (varArg.type !== 'var') {
                throw new Error('getType first argument must be a variable (e.g., $myVar)');
            }
            
            // Evaluate the variable to get its value
            const value = await this.evaluateArg(varArg, frameOverride);
            
            // Determine the type
            let type: string;
            if (value === null) {
                type = 'null';
            } else if (value === undefined) {
                type = 'undefined';
            } else if (typeof value === 'string') {
                type = 'string';
            } else if (typeof value === 'number') {
                type = 'number';
            } else if (typeof value === 'boolean') {
                type = 'boolean';
            } else if (Array.isArray(value)) {
                type = 'array';
            } else if (typeof value === 'object') {
                type = 'object';
            } else {
                type = 'unknown';
            }
            
            frame.lastValue = type;
            return;
        }

        // Special handling for "has" command - checks if variable or function exists
        if (cmd.name === 'has') {
            if (cmd.args.length < 1) {
                throw new Error('has requires at least 1 argument: variable/function name');
            }
            
            // Extract original input from cmd.args (before evaluation)
            // For name: always use the original arg (never evaluate)
            const nameArg = cmd.args[0];
            let name: string | null = this.reconstructOriginalInput(nameArg);
            
            // Fallback: if reconstruction fails, try evaluating as string
            // This handles cases where identifiers like "math.add" are parsed differently
            if (name === null) {
                // Only try fallback for literal types that might be identifiers
                if (nameArg.type === 'literal' && typeof nameArg.value === 'string') {
                    name = nameArg.value;
                } else {
                    throw new Error('has target must be a variable or string literal');
                }
            }
            
            // Check if it's a variable (starts with $)
            if (name.startsWith('$')) {
                const varName = name.substring(1);
                // Use the same resolution logic as resolveVariable
                let exists = false;
                const currentFrame = this.getCurrentFrame();
                
                // Check locals first (function scope)
                if (currentFrame.locals.has(varName)) {
                    exists = true;
                } else if (this.environment.variables.has(varName)) {
                    // Check globals (outer scope)
                    exists = true;
                }
                
                frame.lastValue = exists;
                return;
            }
            
            // Check if it's a module function (contains .)
            // Optimize: Use indexOf instead of includes + split for better performance
            const dotIndex = name.indexOf('.');
            if (dotIndex >= 0) {
                const moduleName = name.substring(0, dotIndex);
                const funcName = name.substring(dotIndex + 1);
                const fullName = `${moduleName}.${funcName}`;
                // Optimize: Use get() instead of has() + has() to reduce lookups
                const exists = this.environment.builtins.has(fullName) || 
                              (this.environment.metadata && this.environment.metadata.has(fullName));
                frame.lastValue = exists;
                return;
            }
            
            // Optimize: Use get() instead of has() to reduce lookups
            // Check if it's a user-defined function
            if (this.environment.functions.has(name)) {
                frame.lastValue = true;
                return;
            }
            
            // Check if it's a builtin function
            if (this.environment.builtins.has(name)) {
                frame.lastValue = true;
                return;
            }
            
            // Not found
            frame.lastValue = false;
            return;
        }

        // Special handling for "clear" command - clears the last return value ($)
        if (cmd.name === 'clear') {
            // Clear the last value in the current frame
            frame.lastValue = null;
            // clear command should not affect the last value (it sets it to null)
            return;
        }

        // Special handling for "forget" command - ignores a variable or function in current scope only
        if (cmd.name === 'forget') {
            if (cmd.args.length < 1) {
                throw new Error('forget requires 1 argument: variable or function name');
            }
            
            // Get the name from the first argument (must be a variable or string literal)
            const nameArg = cmd.args[0];
            let name: string;
            
            if (nameArg.type === 'var') {
                // Variable reference: $var -> "var"
                name = nameArg.name;
            } else if (nameArg.type === 'string' || nameArg.type === 'literal') {
                // String literal or literal: function name
                name = String(await this.evaluateArg(nameArg, frameOverride));
            } else {
                throw new Error('forget argument must be a variable (e.g., $var) or function name (string)');
            }
            
            // Initialize forgotten set if it doesn't exist
            if (!frame.forgotten) {
                frame.forgotten = new Set();
            }
            
            // Add to forgotten set for this scope
            frame.forgotten.add(name);
            
            // forget command should not affect the last value
            return;
        }

        // Special handling for "fallback" command - returns variable value or fallback if empty/null
        if (cmd.name === 'fallback') {
            if (cmd.args.length < 1) {
                throw new Error('fallback requires at least 1 argument: variable name (optional fallback as 2nd arg)');
            }
            
            // Get variable name from first arg (must be a variable reference)
            const varArg = cmd.args[0];
            if (varArg.type !== 'var') {
                throw new Error('fallback first argument must be a variable (e.g., $myVar)');
            }
            
            // Evaluate the variable to get its value
            const varValue = await this.evaluateArg(varArg, frameOverride);
            
            // Check if value is empty or null
            const isEmpty = varValue === null || varValue === undefined || 
                          (typeof varValue === 'string' && varValue.trim() === '') ||
                          (Array.isArray(varValue) && varValue.length === 0) ||
                          (typeof varValue === 'object' && Object.keys(varValue).length === 0);
            
            // If empty and fallback is provided, use fallback; otherwise use variable value
            if (isEmpty && cmd.args.length >= 2) {
                const fallbackValue = await this.evaluateArg(cmd.args[1], frameOverride);
                frame.lastValue = fallbackValue;
                return;
            }
            
            // Return the variable value (even if null/empty if no fallback provided)
            frame.lastValue = varValue;
            return;
        }

        // Special handling: if "json" is called with arguments, always treat as builtin function
        // (not as module, even if json module exists)
        if (cmd.name === 'json' && args.length > 0) {
            if (this.environment.builtins.has('json')) {
                const handler = this.environment.builtins.get('json')!;
                const result = await Promise.resolve(handler(args));
                frame.lastValue = result !== undefined ? result : null;
                return;
            }
        }

        // Determine the actual function name to use
        // If command doesn't have a dot and currentModule is set, prepend module name
        const hasDot = cmd.name.includes('.');
        let functionName = cmd.name;
        if (!hasDot && this.environment.currentModule) {
            functionName = `${this.environment.currentModule}.${functionName}`;
        }

        // Check if function is forgotten in current scope
        // Check both the original name and the module-prefixed name
        if (frame.forgotten) {
            if (frame.forgotten.has(cmd.name) || (functionName !== cmd.name && frame.forgotten.has(functionName))) {
                // Function is forgotten in this scope - throw error (as if it doesn't exist)
                throw new Error(`Unknown function: ${cmd.name}`);
            }
        }

        // Optimize: Check user-defined functions first (most common case)
        const userFunc = this.environment.functions.get(cmd.name);
        if (userFunc) {
            const previousLastValue = frame.lastValue; // Preserve last value for into handling
            const result = await this.callFunction(userFunc, args);
            
            // Handle "into" assignment if present - use the actual result value
            if (cmd.into) {
                const value = result !== undefined ? result : null;
                // // console.log('====> Executor: user function with into, setting variable', cmd.into.targetName, 'to', value);
                if (cmd.into.targetPath && cmd.into.targetPath.length > 0) {
                    this.setVariableAtPath(cmd.into.targetName, cmd.into.targetPath, value);
                } else {
                    this.setVariable(cmd.into.targetName, value);
                }
                // Restore the last value - into command should not affect $
                frame.lastValue = previousLastValue;
            } else {
                // Ensure lastValue is set (even if result is undefined, preserve it)
                frame.lastValue = result !== undefined ? result : null;
            }
            return;
        }

        // Handle function name conflicts by checking argument types
        // For example, "length" exists in both string and array modules
        if (cmd.name === 'length' && args.length > 0) {
            const firstArg = args[0];
            if (Array.isArray(firstArg)) {
                // Call array.length
                const handler = this.environment.builtins.get('array.length');
                if (handler) {
                    const result = await Promise.resolve(handler(args));
                    frame.lastValue = result !== undefined ? result : null;
                    return;
                }
            } else {
                // Call string.length
                const handler = this.environment.builtins.get('string.length');
                if (handler) {
                    const result = await Promise.resolve(handler(args));
                    frame.lastValue = result !== undefined ? result : null;
                    return;
                }
            }
        }

        // Check if it's a builtin (try module-prefixed name first, then original)
        // Optimize: Use get() instead of has() + get() to reduce lookups
        let handler = this.environment.builtins.get(functionName);
        if (!handler && functionName !== cmd.name) {
            handler = this.environment.builtins.get(cmd.name);
        }

        if (handler) {
            const previousLastValue = frame.lastValue; // Preserve last value for log and assertion functions
            
            // Create callback function if callback block is present
            let callback: BuiltinCallback | null = null;
            if (cmd.callback) {
                callback = async (callbackArgs: Value[]): Promise<Value | null> => {
                    // Execute the callback scope block with the provided arguments
                    // The callback block's parameters ($1, $2, etc.) will be set from callbackArgs
                    const callbackFrame: Frame = {
                        locals: new Map(),
                        lastValue: null,
                        isFunctionFrame: true
                    };
                    
                    // Set positional parameters ($1, $2, $3, ...) from callbackArgs
                    for (let i = 0; i < callbackArgs.length; i++) {
                        callbackFrame.locals.set(String(i + 1), callbackArgs[i]);
                    }
                    
                    // Also set parameter names if callback has paramNames
                    if (cmd.callback && cmd.callback.paramNames) {
                        for (let i = 0; i < cmd.callback.paramNames.length; i++) {
                            const paramName = cmd.callback.paramNames[i];
                            const paramValue = i < callbackArgs.length ? callbackArgs[i] : null;
                            callbackFrame.locals.set(paramName, paramValue);
                        }
                    }
                    
                    // Push callback frame to call stack
                    this.callStack.push(callbackFrame);
                    
                    try {
                        // Execute callback body
                        if (cmd.callback) {
                            for (const stmt of cmd.callback.body) {
                                await this.executeStatement(stmt, callbackFrame);
                            }
                        }
                        
                        return callbackFrame.lastValue;
                    } catch (error) {
                        if (error instanceof ReturnException) {
                            // Return statement was executed in callback - return the value
                            return error.value;
                        }
                        throw error;
                    } finally {
                        // Clean up callback frame
                        this.callStack.pop();
                    }
                };
            }
            
            const result = await Promise.resolve(handler(args, callback));
            // log and assertion functions (assert*) should not affect the last value
            // Helper functions like isEqual, isBigger should set lastValue normally
            // time.sleep should not affect the last value
            const isLog = functionName === 'log' || cmd.name === 'log';
            const isAssertion = (functionName.startsWith('test.assert') || cmd.name.startsWith('test.assert')) ||
                               (functionName === 'assert' || cmd.name === 'assert');
            const isSleep = functionName === 'time.sleep' || cmd.name === 'time.sleep' || 
                           (functionName === 'sleep' && this.environment.currentModule === 'time');
            
            // Handle "into" assignment if present - use the actual result value
            // console.log('====> Executor: cmd.into:', cmd.into, 'result:', result, 'cmd.name:', cmd.name);
            if (cmd.into) {
                const value = result !== undefined ? result : null;
                // console.log('====> Executor: setting variable', cmd.into.targetName, 'to', value, 'result was:', result);
                if (cmd.into.targetPath && cmd.into.targetPath.length > 0) {
                    this.setVariableAtPath(cmd.into.targetName, cmd.into.targetPath, value);
                } else {
                    this.setVariable(cmd.into.targetName, value);
                }
                // Restore the last value - into command should not affect $
                frame.lastValue = previousLastValue;
            } else {
                // Only set lastValue if there's no "into" assignment
                if (isLog || isAssertion || isSleep) {
                    frame.lastValue = previousLastValue;
                } else {
                    // Ensure lastValue is set (even if result is undefined, preserve it)
                    frame.lastValue = result !== undefined ? result : null;
                }
            }
            
            return;
        }

        throw new Error(`Unknown function: ${cmd.name}`);
    }

    /**
     * Execute decorators for a target (function or variable)
     * @param decorators Array of decorator calls
     * @param targetName Name of the target (function or variable)
     * @param func Function object (null for variables)
     * @param originalArgs Original arguments (for functions, empty array for variables)
     * @returns Modified arguments (for functions) or original args unchanged
     */
    private async executeDecorators(decorators: DecoratorCall[], targetName: string, func: DefineFunction | null, originalArgs: Value[], frameOverride?: Frame): Promise<Value[]> {
        let modifiedArgs = originalArgs;
        
            // Execute decorators in order (first decorator executes first)
        for (const decorator of decorators) {
                // Evaluate decorator arguments
                const decoratorArgs: Value[] = [];
                for (const arg of decorator.args) {
                    const evaluatedArg = await this.evaluateArg(arg, frameOverride);
                    decoratorArgs.push(evaluatedArg);
                }
                
                // Call decorator handler from registry ONLY (not as a function call)
                // Decorators can ONLY be registered via registerDecorator() API, never via 'def' in scripts
                // Even if a function with the same name exists, it will NOT be used as a decorator
                const decoratorHandler = this.environment.decorators.get(decorator.name);
                if (!decoratorHandler) {
                    throw new Error(`Unknown decorator: @${decorator.name}. Decorators must be registered via registerDecorator() API, not defined in scripts.`);
                }
                
                // Provide environment to decorator handler (for built-in decorators that need it)
                (decoratorHandler as any).__environment = this.environment;
                
            // Call decorator handler: decorator(targetName, func, originalArgs, decoratorArgs, originalDecoratorArgs)
                const decoratorResult = await decoratorHandler(
                targetName,        // Target name (function or variable name)
                func,              // Function object (null for variables)
                modifiedArgs,      // Current args (may have been modified by previous decorators)
                decoratorArgs,     // Decorator's own arguments (evaluated)
                decorator.args     // Original decorator args (AST nodes, for extracting variable names)
                );
                
                // Clean up environment reference
                delete (decoratorHandler as any).__environment;
                
                // If decorator returns an array, use it as modified args
                // Otherwise, keep current args unchanged
                if (Array.isArray(decoratorResult)) {
                    modifiedArgs = decoratorResult;
                }
                // If decorator returns non-array or null/undefined, keep current args unchanged
            }
        
        return modifiedArgs;
    }

    private async callFunction(func: DefineFunction, args: Value[]): Promise<Value> {
        // Execute decorators before function execution (in order, first decorator executes first)
        // Decorators can modify the args
        let modifiedArgs = args;
        if (func.decorators && func.decorators.length > 0) {
            modifiedArgs = await this.executeDecorators(func.decorators, func.name, func, args);
        }
        
        // Create new frame
        const frame: Frame = {
            locals: new Map(),
            lastValue: null,
            isFunctionFrame: true
        };

        // Separate positional args and named args
        // Named args object is the last argument if it's an object with non-numeric keys
        let positionalArgs: Value[] = [];
        let namedArgsObj: Record<string, Value> = {};
        
        // Check if last argument is a named args object (from parenthesized or CLI-style call)
        // We detect this by checking if it's an object with string keys (not array indices)
        if (modifiedArgs.length > 0) {
            const lastArg = modifiedArgs[modifiedArgs.length - 1];
            if (typeof lastArg === 'object' && lastArg !== null && !Array.isArray(lastArg)) {
                // Check if it looks like a named args object (has non-numeric keys)
                const keys = Object.keys(lastArg);
                const hasNonNumericKeys = keys.some(key => !/^\d+$/.test(key));
                if (hasNonNumericKeys && keys.length > 0) {
                    // This is likely a named args object
                    namedArgsObj = lastArg as Record<string, Value>;
                    positionalArgs = modifiedArgs.slice(0, -1);
                } else {
                    // Regular object passed as positional arg (or empty object)
                    positionalArgs = modifiedArgs;
                }
            } else {
                positionalArgs = modifiedArgs;
            }
        }

        // Set parameter name aliases ($a = $1, $b = $2, etc.)
        // Named arguments override positional arguments
        // Also set positional parameters based on parameter name order when named args are used
        const finalPositionalValues: Value[] = [];
        
        for (let i = 0; i < func.paramNames.length; i++) {
            const paramName = func.paramNames[i];
            let paramValue: Value;
            
            // Check if this parameter was provided as a named argument
            if (namedArgsObj && paramName in namedArgsObj) {
                // Use named argument value
                paramValue = namedArgsObj[paramName];
            } else {
                // Use positional argument value (or null if not provided)
                paramValue = i < positionalArgs.length ? positionalArgs[i] : null;
            }
            
            // Set the parameter name alias
            frame.locals.set(paramName, paramValue);
            // Store for setting positional parameters
            finalPositionalValues.push(paramValue);
        }
        
        // Set positional parameters ($1, $2, $3, ...)
        // Use values from named args if available, otherwise from positional args
        for (let i = 0; i < finalPositionalValues.length; i++) {
            frame.locals.set(String(i + 1), finalPositionalValues[i]);
        }
        
        // Also set any additional positional args beyond the named parameters
        for (let i = func.paramNames.length; i < positionalArgs.length; i++) {
            frame.locals.set(String(i + 1), positionalArgs[i]);
        }

        // Set $args variable with named arguments
        frame.locals.set('args', namedArgsObj);

        this.callStack.push(frame);

        try {
            // Execute function body
            for (const stmt of func.body) {
                await this.executeStatement(stmt);
            }

            return frame.lastValue;
        } catch (error) {
            if (error instanceof ReturnException) {
                // Return statement was executed - return the value
                return error.value;
            }
            throw error;
        } finally {
            this.callStack.pop();
        }
    }

    private async executeAssignment(assign: Assignment, frameOverride?: Frame): Promise<void> {
        // Check if this is a constant - constants cannot be reassigned
        if (this.environment.constants.has(assign.targetName)) {
            throw new Error(`Cannot reassign constant $${assign.targetName}. Constants are immutable.`);
        }
        
        const frame = this.getCurrentFrame(frameOverride);
        
        let value: Value;
        if (assign.isLastValue) {
            // Special case: $var = $ means assign last value
            value = frame.lastValue;
        } else if (assign.literalValue !== undefined) {
            // Direct literal assignment
            value = assign.literalValue;
        } else if (assign.command) {
            // Command-based assignment
            const previousLastValue = frame.lastValue; // Preserve last value
            await this.executeCommand(assign.command, frameOverride);
            value = frame.lastValue;
            frame.lastValue = previousLastValue; // Restore last value (assignments don't affect $)
        } else {
            throw new Error('Assignment must have either literalValue or command');
        }
        
        // Assignments should not affect the last value ($)
        // frame.lastValue is not updated here
        
        // If there's a targetPath, set value at attribute path; otherwise set variable directly
        if (assign.targetPath && assign.targetPath.length > 0) {
            this.setVariableAtPath(assign.targetName, assign.targetPath, value);
        } else {
            this.setVariable(assign.targetName, value);
        }
    }

    private executeShorthandAssignment(assign: ShorthandAssignment, frameOverride?: Frame): void {
        // Check if this is a constant - constants cannot be reassigned
        if (this.environment.constants.has(assign.targetName)) {
            throw new Error(`Cannot reassign constant $${assign.targetName}. Constants are immutable.`);
        }
        
        const frame = this.getCurrentFrame(frameOverride);
        const value = frame.lastValue;
        
        // Check if this is a positional parameter (numeric name)
        // Positional params are read-only, so this is a no-op
        if (/^[0-9]+$/.test(assign.targetName)) {
            // This is a positional param reference (like $1, $2) - just a no-op
            // The value is already available via the parameter
            return;
        }
        
        // Regular variable assignment
        this.setVariable(assign.targetName, value);
    }

    private async executeInlineIf(ifStmt: InlineIf, frameOverride?: Frame): Promise<void> {
        const frame = this.getCurrentFrame(frameOverride);
        const evaluator = new ExpressionEvaluator(frame, this.environment, this);
        const condition = await evaluator.evaluate(ifStmt.conditionExpr);
        
        if (condition) {
            await this.executeStatement(ifStmt.command, frameOverride);
        }
    }

    private async executeIfBlock(ifStmt: IfBlock, frameOverride?: Frame): Promise<void> {
        const frame = this.getCurrentFrame(frameOverride);
        const evaluator = new ExpressionEvaluator(frame, this.environment, this);
        
        // Check main condition
        if (await evaluator.evaluate(ifStmt.conditionExpr)) {
            for (const stmt of ifStmt.thenBranch) {
                await this.executeStatement(stmt, frameOverride);
            }
            return;
        }

        // Check elseif branches
        if (ifStmt.elseifBranches) {
            for (const branch of ifStmt.elseifBranches) {
                if (await evaluator.evaluate(branch.condition)) {
                    for (const stmt of branch.body) {
                        await this.executeStatement(stmt, frameOverride);
                    }
                    return;
                }
            }
        }

        // Execute else branch if present
        if (ifStmt.elseBranch) {
            for (const stmt of ifStmt.elseBranch) {
                await this.executeStatement(stmt, frameOverride);
            }
        }
    }

    private async executeIfTrue(ifStmt: IfTrue, frameOverride?: Frame): Promise<void> {
        const frame = this.getCurrentFrame(frameOverride);
        if (isTruthy(frame.lastValue)) {
            await this.executeStatement(ifStmt.command, frameOverride);
        }
    }

    private async executeIfFalse(ifStmt: IfFalse, frameOverride?: Frame): Promise<void> {
        const frame = this.getCurrentFrame(frameOverride);
        if (!isTruthy(frame.lastValue)) {
            await this.executeStatement(ifStmt.command, frameOverride);
        }
    }

    private async executeReturn(returnStmt: ReturnStatement, frameOverride?: Frame): Promise<void> {
        const frame = this.getCurrentFrame(frameOverride);
        
        // If a value is specified, evaluate it; otherwise use lastValue ($)
        if (returnStmt.value !== undefined) {
            const value = await this.evaluateArg(returnStmt.value, frameOverride);
            throw new ReturnException(value);
        } else {
            // No value specified - return $ (last value)
            throw new ReturnException(frame.lastValue);
        }
    }

    private async executeBreak(_breakStmt: BreakStatement, _frameOverride?: Frame): Promise<void> {
        // Throw BreakException to exit the current loop
        // This will be caught by executeForLoop
        throw new BreakException();
    }

    private registerFunction(func: DefineFunction): void {
        // If function already exists (from extracted functions with decorators), preserve its decorators
        const existingFunc = this.environment.functions.get(func.name);
        if (existingFunc && existingFunc.decorators) {
            // Preserve decorators from the extracted function
            func.decorators = existingFunc.decorators;
        }
        this.environment.functions.set(func.name, func);
    }

    private registerEventHandler(onBlock: OnBlock): void {
        // Get existing handlers for this event name, or create new array
        const handlers = this.environment.eventHandlers.get(onBlock.eventName) || [];
        // Add the new handler to the array
        handlers.push(onBlock);
        // Store back in the map
        this.environment.eventHandlers.set(onBlock.eventName, handlers);
    }

    private async executeScope(scope: ScopeBlock, frameOverride?: Frame): Promise<void> {
        const parentFrame = this.getCurrentFrame(frameOverride);
        const originalLastValue = parentFrame.lastValue; // Preserve parent's $
        
        // console.log('====> Executor: executeScope called, scope.into:', scope.into);
        
        // If parameters are declared, create an isolated scope (no parent variable access)
        // Otherwise, create a scope that inherits from parent (current behavior)
        const isIsolated = scope.paramNames && scope.paramNames.length > 0;
        
        const frame: Frame = {
            locals: new Map(),
            lastValue: isIsolated ? null : parentFrame.lastValue, // Inherit parent's $ unless isolated scope
            isFunctionFrame: true, // Scope uses function-like scoping rules
            isIsolatedScope: isIsolated // Mark as isolated if parameters are declared
        };

        // If scope has parameters, initialize them (they'll be null by default)
        // In the future, these could be set by calling the scope with arguments
        if (scope.paramNames) {
            for (const paramName of scope.paramNames) {
                frame.locals.set(paramName, null);
            }
        }

        this.callStack.push(frame);

        let scopeValue: Value = null;
        try {
            // Execute scope body - pass frame directly to avoid race conditions in parallel execution
            for (const stmt of scope.body) {
                await this.executeStatement(stmt, frame);
            }

            // Capture the scope's lastValue before restoring parent's $
            // If body is empty, scopeValue should be null (not parent's last value)
            if (scope.body.length === 0) {
                scopeValue = null;
            } else {
                scopeValue = frame.lastValue;
            }
            // console.log('====> Executor: executeScope scopeValue after body:', scopeValue);
            // Scope's lastValue should not affect parent's $ - restore original value
            parentFrame.lastValue = originalLastValue;
        } catch (error) {
            // Handle return statements inside do blocks
            if (error instanceof ReturnException) {
                // Set the frame's lastValue to the return value
                frame.lastValue = error.value;
                scopeValue = error.value;
                // Scope's lastValue should not affect parent's $ - restore original value
                parentFrame.lastValue = originalLastValue;
                // Exit normally (don't re-throw) - the return value is stored in frame.lastValue
            } else {
                // Scope's lastValue should not affect parent's $ - restore original value even on error
                parentFrame.lastValue = originalLastValue;
                // Re-throw other errors to ensure they propagate properly
                throw error;
            }
        } finally {
            // Pop the scope frame first (before setting variable in parent scope)
            this.callStack.pop();
            
            // Handle "into" assignment if present - set in parent scope AFTER popping frame
            // console.log('====> Executor: executeScope finally, scope.into:', scope.into, 'scopeValue:', scopeValue);
            if (scope.into) {
                // console.log('====> Executor: Setting variable', scope.into.targetName, 'to', scopeValue, 'in parent scope');
                // Now that the scope frame is popped, setVariable will use the parent frame
                if (scope.into.targetPath && scope.into.targetPath.length > 0) {
                    this.setVariableAtPath(scope.into.targetName, scope.into.targetPath, scopeValue);
                } else {
                    this.setVariable(scope.into.targetName, scopeValue);
                }
            }
        }
    }

    private async executeTogether(together: TogetherBlock): Promise<void> {
        // Execute all do blocks in parallel
        // together doesn't have its own scope - variables set inside do blocks are in parent scope
        
        // Capture the parent frame before executing do blocks
        // This is the frame that contains the together block (together has no scope)
        const parentFrame = this.getCurrentFrame();
        
        // Create promises for each do block
        const promises = together.blocks.map(async (doBlock) => {
            const isIsolated = doBlock.paramNames && doBlock.paramNames.length > 0;
            
            const frame: Frame = {
                locals: new Map(),
                lastValue: null, // Start with null for do blocks
                isFunctionFrame: true,
                isIsolatedScope: isIsolated
            };

            // If scope has parameters, initialize them
            if (doBlock.paramNames) {
                for (const paramName of doBlock.paramNames) {
                    frame.locals.set(paramName, null);
                }
            }

            this.callStack.push(frame);

            let value: Value = null;
            try {
                // Execute scope body - pass frame directly to avoid race conditions
                // This ensures each parallel block uses its own frame, not the shared callStack
                for (const stmt of doBlock.body) {
                    await this.executeStatement(stmt, frame);
                }
            } catch (error) {
                // Handle return statements inside do blocks
                if (error instanceof ReturnException) {
                    // Set frame.lastValue to the return value
                    // We'll capture this in the finally block
                    frame.lastValue = error.value;
                    // Don't re-throw - exit normally so execution continues
                } else {
                    // Re-throw other errors
                    throw error;
                }
            } finally {
                // Capture the value before popping the frame (after all statements execute)
                // This ensures we get the last value whether there was a return statement or not
                // Use the frame variable directly (not getCurrentFrame()) to avoid race conditions
                // when blocks execute in parallel - each block has its own frame reference
                if (doBlock.into) {
                    value = frame.lastValue;
                }
                // Pop the scope frame
                this.callStack.pop();
                }

                // If this do block has "into", assign the last value to the target variable in parent scope
            // Set the variable directly in the parent scope (together has no scope)
                if (doBlock.into) {
                // Set variable in parent scope - check parent frame first, then globals
                    if (doBlock.into.targetPath && doBlock.into.targetPath.length > 0) {
                    // Path assignment - need to handle base value and path traversal
                    this.setVariableAtPathInParentScope(parentFrame, doBlock.into.targetName, doBlock.into.targetPath, value);
                    } else {
                    // Simple assignment - check parent frame locals, then globals
                    if (parentFrame.locals.has(doBlock.into.targetName)) {
                        parentFrame.locals.set(doBlock.into.targetName, value);
                    } else if (this.environment.variables.has(doBlock.into.targetName)) {
                        this.environment.variables.set(doBlock.into.targetName, value);
                    } else {
                        // Variable doesn't exist - create in parent scope or globals
                        if (parentFrame.isFunctionFrame) {
                            parentFrame.locals.set(doBlock.into.targetName, value);
                        } else {
                            this.environment.variables.set(doBlock.into.targetName, value);
                        }
                    }
                }
            }
        });

        // Wait for all do blocks to complete
        await Promise.all(promises);
    }

    /**
     * Set a variable at a path in the parent scope (for together blocks)
     */
    private setVariableAtPathInParentScope(parentFrame: Frame, name: string, path: AttributePathSegment[], value: Value): void {
        // Get the base variable value from parent scope
        let baseValue: Value;
        
        if (parentFrame.locals.has(name)) {
            baseValue = parentFrame.locals.get(name)!;
        } else if (this.environment.variables.has(name)) {
            baseValue = this.environment.variables.get(name)!;
        } else {
            // Variable doesn't exist - create it as an object or array based on first path segment
            if (path[0].type === 'index') {
                baseValue = [];
            } else {
                baseValue = {};
            }
            // Set it in the appropriate scope
            if (parentFrame.isFunctionFrame) {
                parentFrame.locals.set(name, baseValue);
            } else {
                this.environment.variables.set(name, baseValue);
            }
        }
        
        // If variable exists but is a primitive, convert it to object/array
        if (baseValue !== null && baseValue !== undefined && typeof baseValue !== 'object') {
            // Convert primitive to object or array based on first path segment
            if (path[0].type === 'index') {
                baseValue = [];
            } else {
                baseValue = {};
            }
            // Update the variable in the appropriate scope
            if (parentFrame.locals.has(name)) {
                parentFrame.locals.set(name, baseValue);
            } else {
                this.environment.variables.set(name, baseValue);
            }
        }
        
        // Ensure baseValue is an object (not null, not primitive)
        if (baseValue === null || baseValue === undefined) {
            throw new Error(`Cannot set property on null or undefined`);
        }
        if (typeof baseValue !== 'object') {
            throw new Error(`Cannot set property on ${typeof baseValue}`);
        }
        
        // Traverse the path to the parent of the target property/index
        let current: any = baseValue;
        for (let i = 0; i < path.length - 1; i++) {
            const segment = path[i];
            const nextSegment = path[i + 1];
            
            if (segment.type === 'property') {
                // Property access: .propertyName
                if (current[segment.name] === null || current[segment.name] === undefined) {
                    // Create intermediate object or array based on next segment
                    if (nextSegment.type === 'index') {
                        current[segment.name] = [];
                    } else {
                        current[segment.name] = {};
                    }
                } else if (typeof current[segment.name] !== 'object') {
                    throw new Error(`Cannot access property '${segment.name}' of ${typeof current[segment.name]}`);
                }
                current = current[segment.name];
            } else if (segment.type === 'index') {
                // Array index access: [index]
                if (!Array.isArray(current)) {
                    throw new Error(`Cannot access index ${segment.index} of non-array value`);
                }
                if (segment.index < 0) {
                    throw new Error(`Index ${segment.index} must be non-negative`);
                }
                // Extend array if needed
                while (current.length <= segment.index) {
                    current.push(null);
                }
                if (current[segment.index] === null || current[segment.index] === undefined) {
                    // Create intermediate object or array based on next segment
                    if (nextSegment.type === 'index') {
                        current[segment.index] = [];
                    } else {
                        current[segment.index] = {};
                    }
                }
                current = current[segment.index];
            }
        }
        
        // Set the value at the final path segment
        const finalSegment = path[path.length - 1];
        if (finalSegment.type === 'property') {
            current[finalSegment.name] = value;
        } else if (finalSegment.type === 'index') {
            if (!Array.isArray(current)) {
                throw new Error(`Cannot set index ${finalSegment.index} on non-array value`);
            }
            if (finalSegment.index < 0) {
                throw new Error(`Index ${finalSegment.index} must be non-negative`);
            }
            // Extend array if index is beyond current length
            while (current.length <= finalSegment.index) {
                current.push(null);
            }
            current[finalSegment.index] = value;
        }
    }

    private async executeForLoop(forLoop: ForLoop, frameOverride?: Frame): Promise<void> {
        const frame = this.getCurrentFrame(frameOverride);
        
        // Evaluate the iterable expression
        // We need to evaluate it as a command/expression to get the iterable value
        const iterable = await this.evaluateIterableExpr(forLoop.iterableExpr);
        
        if (!Array.isArray(iterable)) {
            throw new Error(`for loop iterable must be an array, got ${typeof iterable}`);
        }
        
        // Store the original lastValue to restore after loop (if zero iterations)
        const originalLastValue = frame.lastValue;
        
        // Iterate over the array
        for (let i = 0; i < iterable.length; i++) {
            const element = iterable[i];
            
            // Set loop variable in current frame
            frame.locals.set(forLoop.varName, element);
            frame.lastValue = element;
            
            // Execute body - pass frame directly to avoid race conditions
            try {
            for (const stmt of forLoop.body) {
                await this.executeStatement(stmt, frameOverride);
                }
            } catch (error) {
                if (error instanceof BreakException) {
                    // Break statement encountered - exit the loop
                    break;
                }
                // Re-throw other errors
                throw error;
            }
        }
        
        // After loop, $ is the last body's $ from the last iteration
        // (or originalLastValue if zero iterations)
        if (iterable.length === 0) {
            frame.lastValue = originalLastValue;
        }
        // Otherwise, frame.lastValue is already set from the last iteration
    }
    
    private async evaluateIterableExpr(expr: string): Promise<Value> {
        const exprTrimmed = expr.trim();
        
        // Special case: if the expression is just a variable reference, resolve it directly
        // This avoids treating it as a shorthand assignment
        if (LexerUtils.isVariable(exprTrimmed)) {
            const { name, path } = LexerUtils.parseVariablePath(exprTrimmed);
            return this.resolveVariable(name, path);
        }
        
        // Parse the expression as if it were a command/statement
        // This handles: range 1 10, db.query ..., etc.
        const lines = [expr];
        const parser = new Parser(lines);
        const statements = parser.parse();
        
        if (statements.length === 0) {
            throw new Error(`Invalid iterable expression: ${expr}`);
        }
        
        // Execute the statement(s) to get the value
        // Usually it's a single command or variable reference
        for (const stmt of statements) {
            await this.executeStatement(stmt);
        }
        
        return this.getCurrentFrame().lastValue;
    }

    private async evaluateArg(arg: Arg, frameOverride?: Frame): Promise<Value> {
        const frame = this.getCurrentFrame(frameOverride);

        switch (arg.type) {
            case 'subexpr':
                // Execute subexpression in a new frame with same environment
                return await this.executeSubexpression(arg.code);
            case 'lastValue':
                return frame.lastValue;
            case 'var':
                return this.resolveVariable(arg.name, arg.path);
            case 'number':
                return arg.value;
            case 'string':
                return arg.value;
            case 'literal':
                return arg.value;
            case 'object':
                // Parse object literal as JSON5
                // Handle empty object literal {}
                if (!arg.code || arg.code.trim() === '') {
                    return {};
                }
                try {
                    // Interpolate variables and subexpressions in the object literal code
                    const interpolatedCode = await this.interpolateObjectLiteral(arg.code);
                    // Wrap the extracted content in braces since extractObjectLiteral only returns the inner content
                    return JSON5.parse(`{${interpolatedCode}}`);
                } catch (error) {
                    throw new Error(`Invalid object literal: ${error instanceof Error ? error.message : String(error)}`);
                }
            case 'array':
                // Parse array literal as JSON5 (to support objects with unquoted keys inside arrays)
                // Handle empty array literal []
                if (!arg.code || arg.code.trim() === '') {
                    return [];
                }
                try {
                    // Interpolate variables and subexpressions in the array literal code
                    const interpolatedCode = await this.interpolateObjectLiteral(arg.code); // Reuse same method
                    // Wrap the extracted content in brackets since extractArrayLiteral only returns the inner content
                    return JSON5.parse(`[${interpolatedCode}]`);
                } catch (error) {
                    throw new Error(`Invalid array literal: ${error instanceof Error ? error.message : String(error)}`);
                }
            case 'namedArgs':
                // Evaluate all named arguments and return as object
                const obj: Record<string, Value> = {};
                for (const [key, valueArg] of Object.entries(arg.args)) {
                    obj[key] = await this.evaluateArg(valueArg, frameOverride);
                }
                return obj;
        }
    }

    /**
     * Interpolate variables and subexpressions in object literal code
     * Replaces $var, $(expr), and [$key] with their actual values
     */
    private async interpolateObjectLiteral(code: string): Promise<string> {
        let result = code;
        
        // First, replace subexpressions $(...)
        const subexprRegex = /\$\(([^)]*)\)/g;
        let match;
        const subexprPromises: Array<{ start: number; end: number; promise: Promise<string> }> = [];
        
        while ((match = subexprRegex.exec(code)) !== null) {
            const subexprCode = match[1];
            const start = match.index;
            const end = match.index + match[0].length;
            
            subexprPromises.push({
                start,
                end,
                promise: this.executeSubexpression(subexprCode).then(val => {
                    // Serialize the value to JSON5-compatible string
                    if (val === null) return 'null';
                    if (typeof val === 'string') return JSON.stringify(val);
                    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
                    if (Array.isArray(val)) return JSON.stringify(val);
                    if (typeof val === 'object') return JSON.stringify(val);
                    return String(val);
                })
            });
        }
        
        // Wait for all subexpressions to be evaluated
        const subexprResults = await Promise.all(subexprPromises.map(p => p.promise));
        
        // Replace subexpressions in reverse order to maintain indices
        for (let i = subexprPromises.length - 1; i >= 0; i--) {
            const { start, end } = subexprPromises[i];
            const replacement = subexprResults[i];
            result = result.substring(0, start) + replacement + result.substring(end);
        }
        
        // Now replace variable references $var and computed property names [$var]
        // We need to be careful not to replace variables inside strings
        
        // Replace computed property names: [$var]: -> "key":
        // We need to find patterns like [$var]: (computed property name followed by colon)
        const computedPropRegex = /\[(\$[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d+\])*)\]\s*:/g;
        const computedPropReplacements: Array<{ match: string; replacement: string }> = [];
        
        let computedMatch;
        while ((computedMatch = computedPropRegex.exec(result)) !== null) {
            const varPath = computedMatch[1];
            const { name, path } = LexerUtils.parseVariablePath(varPath);
            const value = this.resolveVariable(name, path);
            
            if (value !== null && value !== undefined) {
                // For computed property names, use the value as the key
                // If it's a valid identifier, use it unquoted; otherwise quote it
                const key = typeof value === 'string' ? value : String(value);
                // Check if it's a valid identifier (starts with letter/underscore, contains only alphanumeric/underscore)
                if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
                    computedPropReplacements.push({
                        match: computedMatch[0],
                        replacement: `${key}:`
                    });
                } else {
                    // Need to quote the key
                    computedPropReplacements.push({
                        match: computedMatch[0],
                        replacement: `"${key.replace(/"/g, '\\"')}":`
                    });
                }
            }
        }
        
        // Apply computed property replacements in reverse order
        // Optimize: Use substring operations instead of replace() for better performance
        for (let i = computedPropReplacements.length - 1; i >= 0; i--) {
            const { match, replacement } = computedPropReplacements[i];
            const matchIndex = result.lastIndexOf(match);
            if (matchIndex >= 0) {
                result = result.substring(0, matchIndex) + replacement + result.substring(matchIndex + match.length);
            }
        }
        
        // Replace variable references in values (not in strings or keys)
        // This is tricky - we need to identify where variables can appear
        // Variables can appear after : (in values) or after , (in array elements)
        // We'll use a more sophisticated approach: parse the structure and replace values
        
        // Simple approach: replace $var patterns that are not inside strings
        // Optimize: Use array builder pattern instead of string concatenation
        // We'll track string boundaries
        let inString: false | '"' | "'" | '`' = false;
        let escaped = false;
        let i = 0;
        const outputParts: string[] = [];
        let lastIndex = 0;
        
        while (i < result.length) {
            const char = result[i];
            
            // Handle string boundaries
            if (!escaped && (char === '"' || char === "'" || char === '`')) {
                if (!inString) {
                    inString = char;
                } else if (char === inString) {
                    inString = false;
                }
                escaped = false;
                i++;
                continue;
            }
            
            if (inString) {
                escaped = char === '\\' && !escaped;
                i++;
                continue;
            }
            
            // Check for variable reference $var
            if (char === '$' && i + 1 < result.length) {
                const nextChar = result[i + 1];
                
                // Check if it's a variable: $var, $var.property, etc.
                if (/[A-Za-z_]/.test(nextChar)) {
                    // Extract the variable path
                    let j = i + 1;
                    while (j < result.length && /[A-Za-z0-9_.\[\]]/.test(result[j])) {
                        j++;
                    }
                    const varPath = result.substring(i, j);
                    
                    // Parse and resolve the variable
                    try {
                        const { name, path } = LexerUtils.parseVariablePath(varPath);
                        const value = this.resolveVariable(name, path);
                        
                        // Serialize the value appropriately
                        let replacement: string;
                        if (value === null) {
                            replacement = 'null';
                        } else if (typeof value === 'string') {
                            replacement = JSON.stringify(value);
                        } else if (typeof value === 'number' || typeof value === 'boolean') {
                            replacement = String(value);
                        } else if (Array.isArray(value)) {
                            replacement = JSON.stringify(value);
                        } else if (typeof value === 'object') {
                            replacement = JSON.stringify(value);
                        } else {
                            replacement = String(value);
                        }
                        
                        // Add text before variable and replacement
                        if (i > lastIndex) {
                            outputParts.push(result.substring(lastIndex, i));
                        }
                        outputParts.push(replacement);
                        lastIndex = j;
                        i = j;
                        continue;
                    } catch {
                        // If parsing fails, continue normally
                    }
                }
            }
            
            escaped = false;
            i++;
        }
        
        // Add remaining text
        if (lastIndex < result.length) {
            outputParts.push(result.substring(lastIndex));
        }
        
        return outputParts.join('');
    }

    async executeSubexpression(code: string): Promise<Value> {
        // Split into logical lines (handles ; inside $())
        const lines = splitIntoLogicalLines(code);
        
        // Parse the subexpression
        const parser = new Parser(lines);
        const statements = parser.parse();
        
        // Create a new frame for the subexpression
        // It shares the same environment but has its own frame for $ and locals
        const currentFrame = this.getCurrentFrame();
        const subexprFrame: Frame = {
            locals: new Map(),
            lastValue: currentFrame.lastValue, // Start with caller's $ (though it will be overwritten)
            isFunctionFrame: false // Subexpressions are not function frames
        };
        
        // Copy all local variables from parent frame to subexpression frame
        // This allows subexpressions to access local variables, including positional parameters
        // from with/endwith blocks and def functions
        for (const [key, value] of currentFrame.locals.entries()) {
            subexprFrame.locals.set(key, value);
        }
        
        // Push the subexpression frame
        this.callStack.push(subexprFrame);
        
        try {
            // Execute statements in the subexpression
            for (const stmt of statements) {
                await this.executeStatement(stmt);
            }
            
            // Return the final $ from the subexpression
            return subexprFrame.lastValue;
        } finally {
            // Pop the subexpression frame
            this.callStack.pop();
        }
    }

    private resolveVariable(name: string, path?: AttributePathSegment[]): Value {
        const frame = this.getCurrentFrame();
        
        // Check if variable is forgotten in current scope
        if (frame.forgotten && frame.forgotten.has(name)) {
            // Variable is forgotten in this scope - return null (as if it doesn't exist)
            return null;
        }
        
        // If this is an isolated scope (has parameters), only check locals
        // Don't access parent scopes or globals
        if (frame.isIsolatedScope) {
            let baseValue: Value;
            
            // If name is empty, it means last value ($) with attributes
            if (name === '') {
                baseValue = frame.lastValue;
            } else {
                // Only check locals in isolated scope
                if (frame.locals.has(name)) {
                    baseValue = frame.locals.get(name)!;
                } else {
                    return null; // Variable not found in isolated scope
                }
            }
            
            // If no path, return the base value
            if (!path || path.length === 0) {
                return baseValue;
            }
            
            // Traverse the path segments
            let current: any = baseValue;
            for (let i = 0; i < path.length; i++) {
                const segment = path[i];
                
                if (segment.type === 'property') {
                    // Property access: .propertyName
                    if (current === null || current === undefined) {
                        return null;
                    }
                    if (typeof current !== 'object') {
                        return null;
                    }
                    current = current[segment.name];
                } else if (segment.type === 'index') {
                    // Array index access: [index]
                    if (!Array.isArray(current)) {
                        return null;
                    }
                    if (segment.index < 0 || segment.index >= current.length) {
                        return null;
                    }
                    current = current[segment.index];
                }
            }
            
            return current;
        }
        
        // Variable resolution follows JavaScript scoping rules:
        // 1. Check current frame's locals first (function parameters and local variables)
        // 2. If not found in locals, check globals (outer scope)
        // This allows functions to read global variables but ensures local variables
        // shadow globals with the same name.
        
        let baseValue: Value;
        
        // If name is empty, it means last value ($) with attributes
        if (name === '') {
            baseValue = frame.lastValue;
        } else {
        // Check locals first (function scope)
        if (frame.locals.has(name)) {
                baseValue = frame.locals.get(name)!;
            } else if (this.environment.variables.has(name)) {
        // Check globals (outer scope)
                baseValue = this.environment.variables.get(name)!;
            } else {
                return null;
            }
        }
        
        // If no path, return the base value
        if (!path || path.length === 0) {
            return baseValue;
        }
        
        // Traverse the path segments
        let current: any = baseValue;
        for (let i = 0; i < path.length; i++) {
            const segment = path[i];
            
            if (segment.type === 'property') {
                // Property access: .propertyName
                if (current === null || current === undefined) {
                    return null; // Accessing property on null/undefined returns null
                }
                if (typeof current !== 'object') {
                    return null; // Accessing property on primitive returns null (consistent with out-of-bounds array access)
                }
                current = current[segment.name];
            } else if (segment.type === 'index') {
                // Array index access: [index]
                if (!Array.isArray(current)) {
                    return null; // Accessing index on non-array returns null (consistent with property access on primitives)
                }
                if (segment.index < 0 || segment.index >= current.length) {
                    return null; // Out of bounds returns null
                }
                current = current[segment.index];
            }
        }
        
        return current;
    }

    private setVariable(name: string, value: Value): void {
        // Check if this is a constant - constants cannot be reassigned
        if (this.environment.constants.has(name)) {
            throw new Error(`Cannot reassign constant $${name}. Constants are immutable.`);
        }
        
        const currentFrame = this.getCurrentFrame();
        const isFunctionFrame = currentFrame.isFunctionFrame === true;
        const isIsolatedScope = currentFrame.isIsolatedScope === true;
        
        // If this is an isolated scope, only set variables in the current frame
        // Don't modify parent scopes or globals
        if (isIsolatedScope) {
            currentFrame.locals.set(name, value);
            return;
        }
        
        // Check if variable exists in current frame's locals first
        // This ensures that loop variables and other locals can be reassigned
        if (currentFrame.locals.has(name)) {
            currentFrame.locals.set(name, value);
            return;
        }
        
        // Check if variable exists in parent scopes (walking up the call stack)
        // This allows subexpressions to modify parent scope variables
        for (let i = this.callStack.length - 2; i >= 0; i--) {
            const parentFrame = this.callStack[i];
            // Skip isolated scopes when walking up the call stack
            if (parentFrame.isIsolatedScope) {
                continue;
            }
            if (parentFrame.locals.has(name)) {
                // Variable exists in parent frame - modify it
                parentFrame.locals.set(name, value);
                return;
            }
        }
        
        // Check if variable exists in global environment
        if (this.environment.variables.has(name)) {
            // Variable exists in global scope - modify it
            this.environment.variables.set(name, value);
            return;
        }
        
        // Variable doesn't exist in any parent scope - create new variable
        if (this.callStack.length === 1) {
            // Global scope - write to environment
            this.environment.variables.set(name, value);
        } else if (isFunctionFrame) {
            // Function scope - create local variable
            // This ensures variables declared within def stay within def
            currentFrame.locals.set(name, value);
        } else {
            // Subexpression scope - create in global environment
            // This ensures variables created in subexpressions are accessible after the subexpression
            // and allows subexpressions to modify parent variables if they exist (checked above)
            this.environment.variables.set(name, value);
        }
    }

    /**
     * Set a value at an attribute path (e.g., $animal.cat = 5 or $.property = value)
     */
    private setVariableAtPath(name: string, path: AttributePathSegment[], value: Value): void {
        // Check if this is a constant - constants cannot be reassigned
        // Note: We only check if the base variable is a constant (not path assignments)
        // Path assignments like $const.prop = value modify the object, not the constant itself
        if (!path || path.length === 0) {
            if (this.environment.constants.has(name)) {
                throw new Error(`Cannot reassign constant $${name}. Constants are immutable.`);
            }
        }
        
            const frame = this.getCurrentFrame();
            const isIsolatedScope = frame.isIsolatedScope === true;
        
        // Get the base variable value
        let baseValue: Value;
        
        // If name is empty, it means last value ($) with attributes
        if (name === '') {
            baseValue = frame.lastValue;
            if (baseValue === null || baseValue === undefined || typeof baseValue !== 'object') {
                // Last value is null/undefined/primitive - create object or array based on first path segment
                if (path[0].type === 'index') {
                    baseValue = [];
                } else {
                    baseValue = {};
                }
                frame.lastValue = baseValue;
            }
        } else {
            // If this is an isolated scope, only check and create variables in locals
            if (isIsolatedScope) {
                if (frame.locals.has(name)) {
                    baseValue = frame.locals.get(name)!;
                } else {
                    // Variable doesn't exist - create it as an object or array based on first path segment
                    if (path[0].type === 'index') {
                        baseValue = [];
                    } else {
                        baseValue = {};
                    }
                    frame.locals.set(name, baseValue);
                }
                
                // If variable exists but is a primitive, convert it to object/array
                if (baseValue !== null && baseValue !== undefined && typeof baseValue !== 'object') {
                    // Convert primitive to object or array based on first path segment
                    if (path[0].type === 'index') {
                        baseValue = [];
                    } else {
                        baseValue = {};
                    }
                    frame.locals.set(name, baseValue);
                }
            } else {
                // Check locals first (function scope)
                if (frame.locals.has(name)) {
                    baseValue = frame.locals.get(name)!;
                } else if (this.environment.variables.has(name)) {
                    // Check globals (outer scope)
                    baseValue = this.environment.variables.get(name)!;
                } else {
                    // Variable doesn't exist - create it as an object or array based on first path segment
                    if (path[0].type === 'index') {
                        baseValue = [];
                    } else {
                        baseValue = {};
                    }
                    // Set it in the appropriate scope
                    if (this.callStack.length === 1) {
                        this.environment.variables.set(name, baseValue);
                    } else {
                        const currentFrame = this.getCurrentFrame();
                        const isFunctionFrame = currentFrame.isFunctionFrame === true;
                        if (isFunctionFrame) {
                            currentFrame.locals.set(name, baseValue);
                        } else {
                            this.environment.variables.set(name, baseValue);
                        }
                    }
                }
                
                // If variable exists but is a primitive, convert it to object/array
                if (baseValue !== null && baseValue !== undefined && typeof baseValue !== 'object') {
                    // Convert primitive to object or array based on first path segment
                    if (path[0].type === 'index') {
                        baseValue = [];
                    } else {
                        baseValue = {};
                    }
                    // Update the variable in the appropriate scope
                    if (frame.locals.has(name)) {
                        frame.locals.set(name, baseValue);
                    } else {
                        this.environment.variables.set(name, baseValue);
                    }
                }
            }
        }
        
        // Ensure baseValue is an object (not null, not primitive)
        if (baseValue === null || baseValue === undefined) {
            throw new Error(`Cannot set property on null or undefined`);
        }
        if (typeof baseValue !== 'object') {
            throw new Error(`Cannot set property on ${typeof baseValue}`);
        }
        
        // Traverse the path to the parent of the target property/index
        let current: any = baseValue;
        for (let i = 0; i < path.length - 1; i++) {
            const segment = path[i];
            const nextSegment = path[i + 1];
            
            if (segment.type === 'property') {
                // Property access: .propertyName
                if (current[segment.name] === null || current[segment.name] === undefined) {
                    // Create intermediate object or array based on next segment
                    if (nextSegment.type === 'index') {
                        current[segment.name] = [];
                    } else {
                        current[segment.name] = {};
                    }
                } else if (typeof current[segment.name] !== 'object') {
                    throw new Error(`Cannot access property '${segment.name}' of ${typeof current[segment.name]}`);
                }
                current = current[segment.name];
            } else if (segment.type === 'index') {
                // Array index access: [index]
                if (!Array.isArray(current)) {
                    throw new Error(`Cannot access index ${segment.index} of non-array value`);
                }
                if (segment.index < 0) {
                    throw new Error(`Index ${segment.index} must be non-negative`);
                }
                // Extend array if needed
                while (current.length <= segment.index) {
                    current.push(null);
                }
                if (current[segment.index] === null || current[segment.index] === undefined) {
                    // Create intermediate object or array based on next segment
                    if (nextSegment.type === 'index') {
                        current[segment.index] = [];
                    } else {
                        current[segment.index] = {};
                    }
                }
                current = current[segment.index];
            }
        }
        
        // Set the value at the final path segment
        const finalSegment = path[path.length - 1];
        if (finalSegment.type === 'property') {
            current[finalSegment.name] = value;
        } else if (finalSegment.type === 'index') {
            if (!Array.isArray(current)) {
                throw new Error(`Cannot set index ${finalSegment.index} on non-array value`);
            }
            if (finalSegment.index < 0) {
                throw new Error(`Index ${finalSegment.index} must be non-negative`);
            }
            // Extend array if index is beyond current length
            while (current.length <= finalSegment.index) {
                current.push(null);
            }
            current[finalSegment.index] = value;
        }
    }


    // isTruthy isTruthy is imported from utils
}
