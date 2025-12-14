/**
 * Executor class for executing RobinPath statements
 * 
 * AST REFACTORING NOTES:
 * ======================
 * This file is being prepared for the Expression-based AST refactoring.
 * See EXECUTOR_REFACTOR_PLAN.md for detailed migration plan.
 * 
 * Key changes needed:
 * 1. Replace string-based expression evaluation with Expression node evaluation
 * 2. Remove runtime parsing (Parser, JSON5.parse)
 * 3. Add evaluateExpression() and related helper methods
 * 4. Update evaluateArg() to work with Expression | NamedArgsExpression
 * 
 * Current pain points:
 * - conditionExpr: string (InlineIf, IfBlock) → should be Expression
 * - iterableExpr: string (ForLoop) → should be Expression
 * - subexpr.code: string → should be SubexpressionExpression with Statement[]
 * - object.code: string → should be ObjectLiteralExpression with properties
 * - array.code: string → should be ArrayLiteralExpression with elements
 */

import { isTruthy, type Value, type AttributePathSegment } from '../utils';
import { LexerUtils } from '../utils';
import { ReturnException, BreakException, ContinueException, EndException } from './exceptions';
import { Parser } from './Parser';
import { createErrorWithContext } from '../utils/errorFormatter';
import { StringTemplateParser } from '../parsers/StringTemplateParser';
import JSON5 from 'json5';
import type { 
    Environment, 
    Frame,
    BuiltinCallback,
    ModuleMetadata
} from '../index';
import type {
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
    ContinueStatement,
    ScopeBlock,
    TogetherBlock,
    ForLoop,
    OnBlock,
    DecoratorCall,
    Expression,
    CodePosition
} from '../types/Ast.type';
import type { RobinPathThread } from './RobinPathThread';

export class Executor {
    private environment: Environment;
    private callStack: Frame[] = [];
    private parentThread: RobinPathThread | null = null;
    private sourceCode: string | null = null; // Store source code for error messages
    
    /**
     * Debug mode flag - set to true to enable logging
     * Can be controlled via VITE_DEBUG environment variable or set programmatically
     */
    static debug: boolean = (() => {
        try {
            // Check process.env (Node.js)
            const proc = (globalThis as any).process;
            if (proc && proc.env?.VITE_DEBUG === 'true') {
                return true;
            }
            // Check import.meta.env (Vite/browser)
            const importMeta = (globalThis as any).import?.meta;
            if (importMeta && importMeta.env?.VITE_DEBUG === 'true') {
                return true;
            }
        } catch {
            // Ignore errors
        }
        return false;
    })();

    constructor(environment: Environment, parentThread?: RobinPathThread | null, sourceCode?: string | null) {
        this.environment = environment;
        this.parentThread = parentThread || null;
        this.sourceCode = sourceCode || null;
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
        
        const evaluatedArgs = await Promise.all(args.map(arg => this.evaluateArg(arg, undefined, undefined)));
        
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
                await this.registerFunction(stmt);
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
                case 'continue':
                    await this.executeContinue(stmt, frameOverride);
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
        // Use frameOverride directly if provided, otherwise get from call stack
        // This ensures we're updating the correct frame's lastValue
        const frame = frameOverride !== undefined ? frameOverride : this.getCurrentFrame();
        
        // Separate positional args and named args
        const positionalArgs: Value[] = [];
        let namedArgsObj: Record<string, Value> | null = null;
        
        for (const arg of cmd.args) {
            if (arg.type === 'namedArgs') {
                // Evaluate named arguments into an object
                namedArgsObj = await this.evaluateArg(arg, frameOverride, cmd.codePos) as Record<string, Value>;
            } else {
                // Positional argument - pass codePos for better error messages
                const value = await this.evaluateArg(arg, frameOverride, cmd.codePos);
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

        // Special handling for "_literal" command - internal command for standalone literals (strings, numbers, booleans, null)
        if (cmd.name === '_literal') {
            if (args.length === 0) {
                throw new Error('_literal command requires a literal argument');
            }
            // The literal is already evaluated by evaluateArg, so just return it
            // This allows: "hello"; log $  # sets $ to "hello"
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
                this.setVariableAtPath(varName, varPath, value, frameOverride);
                // If setting a path on last value ($.property), preserve the object
                // setVariableAtPath already updates frame.lastValue if name is empty
                if (varName === '') {
                    // For $.property, the object is already updated in setVariableAtPath
                    // Don't overwrite $ with the assigned value - keep the object
                    return;
                }
            } else {
                this.setVariable(varName, value, frameOverride);
            }
            
            // Set lastValue to the assigned value (only if not setting a path on $)
            frame.lastValue = value;
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

        // Special handling for "meta" and "setMeta" commands - stores metadata for functions or variables
        if (cmd.name === 'meta' || cmd.name === 'setMeta') {
            if (cmd.args.length < 3) {
                throw new Error(`${cmd.name} requires 3 arguments: target (fn/variable), meta key, and value`);
            }
            
            // Extract original input from cmd.args (before evaluation)
            // For target: always use the original arg (never evaluate)
            const targetArg = cmd.args[0];
            const targetOriginal = this.reconstructOriginalInput(targetArg);
            if (targetOriginal === null) {
                throw new Error(`${cmd.name} target must be a variable or string literal`);
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
            
            // Fallback: if reconstruction fails, try other types
            if (name === null) {
                // Handle call expressions (e.g., "math.add" parsed as a function call)
                if (nameArg.type === 'call') {
                    name = nameArg.callee;
                }
                // Handle literal types that might be identifiers
                else if (nameArg.type === 'literal' && typeof nameArg.value === 'string') {
                    name = nameArg.value;
                } else {
                    throw new Error('has target must be a variable, function name, or string literal');
                }
            }

            // Ensure we have a valid name at this point
            if (name === null) {
                throw new Error('has target must be a variable, function name, or string literal');
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
                // Capture parent frame before creating callback (for into assignment)
                const parentFrameForCallback = this.getCurrentFrame(frameOverride);
                
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

                    // Track initial lastValue to detect if body produces a new value
                    const initialLastValue = callbackFrame.lastValue;
                    
                    // Push callback frame to call stack
                    this.callStack.push(callbackFrame);
                    
                    let scopeValue: Value = null;
                    try {
                        // Execute callback body
                        if (cmd.callback) {
                            for (const stmt of cmd.callback.body) {
                                await this.executeStatement(stmt, callbackFrame);
                            }

                            // Capture the scope's lastValue after executing all statements
                            // If body is empty, scopeValue should be null
                            // If body didn't produce a new value (lastValue unchanged), scopeValue should be null
                            if (cmd.callback.body.length === 0) {
                                scopeValue = null;
                            } else if (callbackFrame.lastValue === initialLastValue) {
                                // Body didn't produce a new value, return null
                                scopeValue = null;
                            } else {
                                scopeValue = callbackFrame.lastValue;
                            }
                        }
                    } catch (error) {
                        if (error instanceof ReturnException) {
                            // Return statement was executed in callback - set scopeValue to return value
                            scopeValue = error.value;
                            // Don't re-throw - we'll handle the value below
                        } else {
                        throw error;
                        }
                    } finally {
                        // Clean up callback frame first (before setting variable in parent scope)
                        this.callStack.pop();

                        // Handle "into" assignment if present in the callback block
                        // Set in parent scope AFTER popping callback frame
                        if (cmd.callback && cmd.callback.into) {
                            // Set variable in parent scope (the scope that called the command)
                            if (cmd.callback.into.targetPath && cmd.callback.into.targetPath.length > 0) {
                                this.setVariableAtPath(cmd.callback.into.targetName, cmd.callback.into.targetPath, scopeValue, parentFrameForCallback);
                            } else {
                                this.setVariable(cmd.callback.into.targetName, scopeValue, parentFrameForCallback);
                            }
                        }
                    }

                    return scopeValue;
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
    async executeDecorators(decorators: DecoratorCall[], targetName: string, func: DefineFunction | null, originalArgs: Value[], frameOverride?: Frame): Promise<Value[]> {
        let modifiedArgs = originalArgs;
        
            // Execute decorators in order (first decorator executes first)
        for (const decorator of decorators) {
            // Skip parse decorators - they are executed during parsing, not at runtime
            if (this.environment.parseDecorators.has(decorator.name)) {
                continue;
            }

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
        // Named args object is the last argument if it's an object where ALL keys match parameter names
        // This distinguishes named args from regular object literals passed as positional arguments
        let positionalArgs: Value[] = [];
        let namedArgsObj: Record<string, Value> = {};
        
        // Check if last argument is a named args object (from parenthesized or CLI-style call)
        // We detect this by checking if it's an object where ALL keys match function parameter names
        // This prevents regular object literals from being treated as named args
        if (modifiedArgs.length > 0 && func.paramNames.length > 0) {
            const lastArg = modifiedArgs[modifiedArgs.length - 1];
            if (typeof lastArg === 'object' && lastArg !== null && !Array.isArray(lastArg)) {
                const keys = Object.keys(lastArg);
                // Only treat as named args if ALL keys match parameter names
                // This ensures object literals like { hello: "world" } are treated as positional args
                const allKeysMatchParams = keys.length > 0 && 
                    keys.every(key => func.paramNames.includes(key));
                if (allKeysMatchParams) {
                    // This is a named args object (all keys match parameter names)
                    namedArgsObj = lastArg as Record<string, Value>;
                    positionalArgs = modifiedArgs.slice(0, -1);
                } else {
                    // Regular object passed as positional arg
                    positionalArgs = modifiedArgs;
                }
            } else {
                positionalArgs = modifiedArgs;
            }
        } else {
            // No parameters or no args - all args are positional
            positionalArgs = modifiedArgs;
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
        
        // Use frameOverride directly if provided, otherwise get from call stack
        // This ensures we're reading from the correct frame's lastValue
        const frame = frameOverride !== undefined ? frameOverride : this.getCurrentFrame();
        
        let value: Value;
        if (assign.isLastValue) {
            // Special case: $var = $ means assign last value
            value = frame.lastValue;
        } else if (assign.literalValue !== undefined) {
            // Direct literal assignment
            // Check if this is a template string (marked with \0TEMPLATE\0 prefix)
            if (assign.literalValueType === 'string' && 
                typeof assign.literalValue === 'string' && 
                assign.literalValue.startsWith('\0TEMPLATE\0')) {
                const template = assign.literalValue.substring(10); // Remove \0TEMPLATE\0 prefix (10 chars)
                value = await StringTemplateParser.evaluate(template, {
                    resolveVariable: (name, path, frame) => this.resolveVariable(name, path, frame),
                    getLastValue: (frame) => {
                        const f = frame !== undefined ? frame : this.getCurrentFrame();
                        return f.lastValue;
                    },
                    executeSubexpression: (code, frame) => this.executeSubexpressionWithFrame(code, frame)
                }, frameOverride);
            } else {
            value = assign.literalValue;
            }
        } else if (assign.command) {
            // Command-based assignment
            const previousLastValue = frame.lastValue; // Preserve last value
            // Temporarily store assignment codePos so evaluateArg can use it
            // We'll pass it through the command's codePos which is already set
            await this.executeCommand(assign.command, frameOverride);
            value = frame.lastValue;
            frame.lastValue = previousLastValue; // Restore last value (assignments don't affect $)
        } else {
            throw createErrorWithContext({
                message: 'Assignment must have either literalValue or command',
                codePos: assign.codePos,
                code: this.sourceCode || undefined
            });
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
        // Use frameOverride directly if provided, otherwise get from call stack
        const frame = frameOverride !== undefined ? frameOverride : this.getCurrentFrame();
        
        // Evaluate Expression node
        const conditionValue = await this.evaluateExpression(ifStmt.condition, frame);
        const condition = isTruthy(conditionValue);
        
        if (condition) {
            await this.executeStatement(ifStmt.command, frame);
        } else if (ifStmt.elseCommand) {
            // Execute else command if condition is false and else command exists
            await this.executeStatement(ifStmt.elseCommand, frame);
        }
    }

    private async executeIfBlock(ifStmt: IfBlock, frameOverride?: Frame): Promise<void> {
        // Use frameOverride directly if provided, otherwise get from call stack
        // We need to use the same frame throughout to ensure lastValue is preserved correctly
        const frame = frameOverride !== undefined ? frameOverride : this.getCurrentFrame();
        
        // Evaluate Expression node for main condition
        // Note: evaluateExpression should not modify lastValue
        const conditionValue = await this.evaluateExpression(ifStmt.condition, frame);
        const condition = isTruthy(conditionValue);
        
        // Store lastValue after condition evaluation (in case condition evaluation modified it)
        // This will be restored if no branch executes
        const lastValueAfterCondition = frame.lastValue;
        
        if (condition) {
            // Execute then branch - lastValue will be set by the last statement
            // Explicitly pass the frame to ensure we're modifying the correct frame
            for (const stmt of ifStmt.thenBranch) {
                await this.executeStatement(stmt, frame);
            }
            // lastValue should now be set by the last statement in the branch
            // It's already on the frame, so we just return
            return;
        }

        // Check elseif branches
        if (ifStmt.elseifBranches) {
            for (const branch of ifStmt.elseifBranches) {
                // branch.condition is Expression
                const branchConditionValue = await this.evaluateExpression(branch.condition, frame);
                if (isTruthy(branchConditionValue)) {
                    // Execute elseif branch - lastValue will be set by the last statement
                    // Explicitly pass the frame to ensure we're modifying the correct frame
                    for (const stmt of branch.body) {
                        await this.executeStatement(stmt, frame);
                    }
                    // lastValue is now set to the result of the last statement in the branch body
                    return;
                }
            }
        }

        // Execute else branch if present
        if (ifStmt.elseBranch) {
            // Execute else branch - lastValue will be set by the last statement
            // Explicitly pass the frame to ensure we're modifying the correct frame
            for (const stmt of ifStmt.elseBranch) {
                await this.executeStatement(stmt, frame);
            }
            // lastValue is now set to the result of the last statement in elseBranch
        } else {
            // No branch executed - restore lastValue from after condition evaluation
            frame.lastValue = lastValueAfterCondition;
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
        // If a value is specified, evaluate it
        if (returnStmt.value !== undefined) {
            const value = await this.evaluateArg(returnStmt.value, frameOverride);
            throw new ReturnException(value);
        } else {
            // No value specified - return null (not lastValue)
            // This should not happen if parser is correct, but handle it gracefully
            throw new ReturnException(null);
        }
    }

    private async executeBreak(_breakStmt: BreakStatement, _frameOverride?: Frame): Promise<void> {
        // Throw BreakException to exit the current loop
        // This will be caught by executeForLoop
        throw new BreakException();
    }

    private async executeContinue(_continueStmt: ContinueStatement, _frameOverride?: Frame): Promise<void> {
        // Throw ContinueException to skip to next iteration of the current loop
        // This will be caught by executeForLoop
        throw new ContinueException();
    }

    private async registerFunction(func: DefineFunction): Promise<void> {
        // If function already exists (from extracted functions with decorators), preserve its decorators
        const existingFunc = this.environment.functions.get(func.name);
        if (existingFunc && existingFunc.decorators) {
            // Preserve decorators from the extracted function
            func.decorators = existingFunc.decorators;
        }
        this.environment.functions.set(func.name, func);

        // Execute decorators when function is registered (for metadata decorators like @desc, @param, etc.)
        if (func.decorators && func.decorators.length > 0) {
            await this.executeDecorators(func.decorators, func.name, func, []);
        }
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
        
        if (Executor.debug) {
            const timestamp = new Date().toISOString();
            console.log(`[Executor.executeScope] [${timestamp}] Starting do block execution. Body statements: ${scope.body.length}, isolated: ${scope.paramNames && scope.paramNames.length > 0}, callStack depth: ${this.callStack.length}`);
        }
        
        // If parameters are declared, create an isolated scope (no parent variable access)
        // Otherwise, create a scope that inherits from parent (current behavior)
        const isIsolated = scope.paramNames && scope.paramNames.length > 0;

        // Track initial lastValue to detect if body produces a new value
        const initialLastValue = isIsolated ? null : parentFrame.lastValue;
        
        const frame: Frame = {
            locals: new Map(),
            lastValue: initialLastValue, // Inherit parent's $ unless isolated scope
            isFunctionFrame: true, // Scope uses function-like scoping rules
            isIsolatedScope: isIsolated // Mark as isolated if parameters are declared
        };

        // If scope has parameters, initialize them with values from parent scope
        // if variables with the same names exist, otherwise null
        if (scope.paramNames) {
            for (const paramName of scope.paramNames) {
                // Try to get value from parent frame or globals
                let paramValue: Value = null;

                // Check parent frame locals
                if (parentFrame.locals.has(paramName)) {
                    paramValue = parentFrame.locals.get(paramName)!;
                } else {
                    // Check globals
                    if (this.environment.variables.has(paramName)) {
                        paramValue = this.environment.variables.get(paramName)!;
                    }
                }

                frame.locals.set(paramName, paramValue);
            }
        }

        this.callStack.push(frame);

        let scopeValue: Value = null;
        try {
            // Execute scope body - pass frame directly to avoid race conditions in parallel execution
            let stmtIndex = 0;
            for (const stmt of scope.body) {
                stmtIndex++;
                if (Executor.debug) {
                    const timestamp = new Date().toISOString();
                    console.log(`[Executor.executeScope] [${timestamp}] Executing statement ${stmtIndex}/${scope.body.length}, type: ${stmt.type}`);
                }
                await this.executeStatement(stmt, frame);
            }
            
            if (Executor.debug) {
                const timestamp = new Date().toISOString();
                console.log(`[Executor.executeScope] [${timestamp}] Completed do block execution. Statements executed: ${stmtIndex}`);
            }

            // Capture the scope's lastValue before restoring parent's $
            // If body is empty, scopeValue should be null (not parent's last value)
            // If body didn't produce a new value (lastValue unchanged), preserve the original value
            if (scope.body.length === 0) {
                scopeValue = null;
            } else if (frame.lastValue === initialLastValue) {
                // Body didn't produce a new value, preserve the original lastValue
                scopeValue = initialLastValue;
            } else {
                scopeValue = frame.lastValue;
            }
            // console.log('====> Executor: executeScope scopeValue after body:', scopeValue);
            // Don't restore parent's $ here - we'll handle it in finally block
            // If there's no "into", we want to set parent's $ to scopeValue
            // If there's an "into", we'll restore originalLastValue
        } catch (error) {
            // Handle return statements inside do blocks
            if (error instanceof ReturnException) {
                // Set the frame's lastValue to the return value
                frame.lastValue = error.value;
                scopeValue = error.value;
                // Don't restore parent's $ here - we'll handle it in finally block
                // Exit normally (don't re-throw) - the return value is stored in frame.lastValue
            } else {
                // Don't restore parent's $ here - we'll handle it in finally block
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
                // When using "into", restore parent's $ to original value (into assigns to specific variable, not $)
                parentFrame.lastValue = originalLastValue;
            } else {
                // When there's no "into", set parent's $ to the scope's result value
                parentFrame.lastValue = scopeValue;
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

            // Track initial lastValue to detect if body produces a new value
            const initialLastValue = isIsolated ? null : parentFrame.lastValue;
            
            const frame: Frame = {
                locals: new Map(),
                lastValue: initialLastValue, // Inherit parent's $ unless isolated scope
                isFunctionFrame: true,
                isIsolatedScope: isIsolated
            };

            // If scope has parameters, initialize them with values from parent scope
            // if variables with the same names exist, otherwise null
            if (doBlock.paramNames) {
                for (const paramName of doBlock.paramNames) {
                    // Try to get value from parent frame or globals
                    let paramValue: Value = null;

                    // Check parent frame locals
                    if (parentFrame.locals.has(paramName)) {
                        paramValue = parentFrame.locals.get(paramName)!;
                    } else {
                        // Check globals
                        if (this.environment.variables.has(paramName)) {
                            paramValue = this.environment.variables.get(paramName)!;
                        }
                    }

                    frame.locals.set(paramName, paramValue);
                }
            }

            this.callStack.push(frame);

            let scopeValue: Value = null;
            try {
                // Execute scope body - pass frame directly to avoid race conditions
                // This ensures each parallel block uses its own frame, not the shared callStack
                for (const stmt of doBlock.body) {
                    await this.executeStatement(stmt, frame);
                }

                // Capture the scope's lastValue after executing all statements
                // If body is empty, scopeValue should be null (not parent's last value)
                // If body didn't produce a new value (lastValue unchanged), scopeValue should be null
                if (doBlock.body.length === 0) {
                    scopeValue = null;
                } else if (frame.lastValue === initialLastValue) {
                    // Body didn't produce a new value, return null
                    scopeValue = null;
                } else {
                    scopeValue = frame.lastValue;
                }
            } catch (error) {
                // Handle return statements inside do blocks
                if (error instanceof ReturnException) {
                    // Set frame.lastValue to the return value
                    frame.lastValue = error.value;
                    scopeValue = error.value;
                    // Don't re-throw - exit normally so execution continues
                } else {
                    // Re-throw other errors
                    throw error;
                }
            } finally {
                // Pop the scope frame
                this.callStack.pop();
                }

                // If this do block has "into", assign the last value to the target variable in parent scope
            // Set the variable directly in the parent scope (together has no scope)
                if (doBlock.into) {
                // Set variable in parent scope - check parent frame first, then globals
                    if (doBlock.into.targetPath && doBlock.into.targetPath.length > 0) {
                    // Path assignment - need to handle base value and path traversal
                    this.setVariableAtPathInParentScope(parentFrame, doBlock.into.targetName, doBlock.into.targetPath, scopeValue);
                    } else {
                    // Simple assignment - check parent frame locals, then globals
                    if (parentFrame.locals.has(doBlock.into.targetName)) {
                        parentFrame.locals.set(doBlock.into.targetName, scopeValue);
                    } else if (this.environment.variables.has(doBlock.into.targetName)) {
                        this.environment.variables.set(doBlock.into.targetName, scopeValue);
                    } else {
                        // Variable doesn't exist - create in parent scope or globals
                        if (parentFrame.isFunctionFrame) {
                            parentFrame.locals.set(doBlock.into.targetName, scopeValue);
                        } else {
                            this.environment.variables.set(doBlock.into.targetName, scopeValue);
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
        const iterable = await this.evaluateExpression(forLoop.iterable, frameOverride);
        
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
                if (error instanceof ContinueException) {
                    // Continue statement encountered - skip to next iteration
                    continue;
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
    

    private async evaluateArg(arg: Arg, frameOverride?: Frame, parentCodePos?: CodePosition): Promise<Value> {
        // Check if this is an Expression node (new format)
        // Expression types: 'var', 'lastValue', 'literal', 'number', 'string',
        // 'objectLiteral', 'arrayLiteral', 'subexpression', 'binary', 'unary', 'call'
        if (arg.type === 'var' || arg.type === 'lastValue' || arg.type === 'literal' || 
            arg.type === 'number' || arg.type === 'string' || arg.type === 'objectLiteral' ||
            arg.type === 'arrayLiteral' || arg.type === 'subexpression' || arg.type === 'binary' ||
            arg.type === 'unary' || arg.type === 'call') {
            // It's an Expression - evaluate it
            return await this.evaluateExpression(arg as Expression, frameOverride);
        }

        // Legacy Arg types for backward compatibility
        // These are the old types that haven't been migrated yet
        // Note: SubexpressionExpression (type: 'subexpression') is handled above as an Expression
        if (arg.type === 'subexpr' || arg.type === 'object' || arg.type === 'array') {
            switch (arg.type) {
                case 'subexpr':
                    // Execute subexpression in a new frame with same environment
                    // TODO: Replace with: return await this.evaluateExpression(arg); // where arg is SubexpressionExpression
                    return await this.executeSubexpression(arg.code);
                case 'object':
                    // Parse object literal as JSON5
                    // Handle empty object literal {}
                    // TODO: Replace with: return await this.evaluateObjectLiteral(arg.properties, frameOverride);
                    if (!arg.code || arg.code.trim() === '') {
                        return {};
                    }
                    try {
                        // Interpolate variables and subexpressions in the object literal code
                        const interpolatedCode = await this.interpolateObjectLiteral(arg.code, frameOverride);
                        // Wrap the extracted content in braces since extractObjectLiteral only returns the inner content
                        return JSON5.parse(`{${interpolatedCode}}`);
                    } catch (error) {
                        // Use parent codePos if available for better error messages
                        // The error might contain position info from JSON5 (e.g., "at 1:6")
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        throw createErrorWithContext({
                            message: `Invalid object literal: ${errorMsg}`,
                            codePos: parentCodePos,
                            code: this.sourceCode || undefined
                        });
                    }
                case 'array':
                    // Parse array literal as JSON5 (to support objects with unquoted keys inside arrays)
                    // Handle empty array literal []
                    // TODO: Replace with: return await this.evaluateArrayLiteral(arg.elements, frameOverride);
                    if (!arg.code || arg.code.trim() === '') {
                        return [];
                    }
                    try {
                        // Interpolate variables and subexpressions in the array literal code
                        const interpolatedCode = await this.interpolateObjectLiteral(arg.code, frameOverride); // Reuse same method
                        // Wrap the extracted content in brackets since extractArrayLiteral only returns the inner content
                        return JSON5.parse(`[${interpolatedCode}]`);
                    } catch (error) {
                        // Use parent codePos if available for better error messages
                        // The error might contain position info from JSON5 (e.g., "at 1:6")
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        throw createErrorWithContext({
                            message: `Invalid array literal: ${errorMsg}`,
                            codePos: parentCodePos,
                            code: this.sourceCode || undefined
                        });
                    }
            }
        }
        
        // Handle namedArgs (which is also an Expression type but needs special handling)
        if (arg.type === 'namedArgs') {
            // Evaluate all named arguments and return as object
            // namedArgs.args is now Record<string, Expression>
            const obj: Record<string, Value> = {};
            for (const [key, valueExpr] of Object.entries(arg.args)) {
                // valueExpr is now an Expression, not an Arg
                obj[key] = await this.evaluateExpression(valueExpr, frameOverride);
            }
            return obj;
        }
        
        // This should never happen - all cases should be handled above
        throw new Error(`Unknown arg type: ${(arg as any).type}`);
    }

    /**
     * Interpolate variables and subexpressions in object literal code
     * Replaces $var, $(expr), $ (last value), and [$key] with their actual values
     * 
     * TODO: AST Refactor - This method will be removed once ObjectLiteralExpression
     * is used. Object literals will be evaluated by walking the properties AST nodes.
     */
    private async interpolateObjectLiteral(code: string, frameOverride?: Frame): Promise<string> {
        let result = code;
        
        // First, replace subexpressions $(...)
        // We need to handle nested subexpressions, so we'll find them manually
        const subexprPromises: Array<{ start: number; end: number; promise: Promise<string> }> = [];
        let pos = 0;
        
        while (pos < code.length) {
            // Look for $( pattern
            if (code[pos] === '$' && pos + 1 < code.length && code[pos + 1] === '(') {
                // Found start of subexpression - find matching closing paren
                let depth = 1;
                let j = pos + 2; // Start after $(
                
                while (j < code.length && depth > 0) {
                    if (code[j] === '\\') {
                        // Skip escaped characters
                        j += 2;
                        continue;
                    }
                    if (code[j] === '$' && j + 1 < code.length && code[j + 1] === '(') {
                        // Nested subexpression
                        depth++;
                        j += 2;
                        continue;
                    }
                    if (code[j] === '(') {
                        depth++;
                    } else if (code[j] === ')') {
                        depth--;
                        if (depth === 0) {
                            // Found matching closing paren
                            const subexprCode = code.substring(pos + 2, j); // Content between $( and )
                            const start = pos;
                            const end = j + 1; // Include the closing )
                            
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
                            
                            pos = j + 1; // Move past the closing paren
                            break;
                        }
                    }
                    j++;
                }
                
                if (depth > 0) {
                    // Unclosed subexpression - skip this $ and continue
                    pos++;
                }
            } else {
                pos++;
            }
        }
        
        // Wait for all subexpressions to be evaluated
        const subexprResults = await Promise.all(subexprPromises.map(p => p.promise));
        
        // Replace subexpressions in reverse order to maintain indices
        for (let i = subexprPromises.length - 1; i >= 0; i--) {
            const { start, end } = subexprPromises[i];
            const replacement = subexprResults[i];
            result = result.substring(0, start) + replacement + result.substring(end);
        }
        
        // Now process template strings (backtick strings) - replace them with JSON5-compatible quoted strings
        // Template strings like `$var` should be evaluated and replaced with "value"
        const templateStringRegex = /`([^`]*)`/g;
        const templateStringPromises: Array<{ start: number; end: number; promise: Promise<string> }> = [];
        let templateMatch;
        
        while ((templateMatch = templateStringRegex.exec(result)) !== null) {
            const templateContent = templateMatch[1];
            const start = templateMatch.index;
            const end = templateMatch.index + templateMatch[0].length;
            
            templateStringPromises.push({
                start,
                end,
                promise: StringTemplateParser.evaluate(templateContent, {
                    resolveVariable: (name: string, path?: any[], frameOverride?: Frame) => {
                        return this.resolveVariable(name, path, frameOverride);
                    },
                    getLastValue: (frameOverride?: Frame) => {
                        const frame = this.getCurrentFrame(frameOverride);
                        return frame.lastValue;
                    },
                    executeSubexpression: async (code: string, frameOverride?: Frame) => {
                        return await this.executeSubexpressionWithFrame(code, frameOverride);
                    }
                }, frameOverride).then(evaluated => {
                    // Convert the evaluated template string to a JSON5-compatible quoted string
                    return JSON.stringify(evaluated);
                })
            });
        }
        
        // Wait for all template strings to be evaluated
        const templateStringResults = await Promise.all(templateStringPromises.map(p => p.promise));
        
        // Replace template strings in reverse order to maintain indices
        for (let i = templateStringPromises.length - 1; i >= 0; i--) {
            const { start, end } = templateStringPromises[i];
            const replacement = templateStringResults[i];
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
            
            // Check for variable reference $var, $1 (positional), or standalone $ (last value)
            if (char === '$') {
                const nextChar = i + 1 < result.length ? result[i + 1] : null;
                
                // Check if it's a standalone $ (last value) - not followed by letter/underscore/digit
                // Standalone $ can be followed by: space, comma, }, ], ), or end of string
                if (nextChar === null || /[\s,}\]\)]/.test(nextChar)) {
                    // This is a standalone $ (last value reference)
                    const frame = this.getCurrentFrame(frameOverride);
                    const value = frame.lastValue;
                    
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
                    
                    // Add text before $ and replacement
                    if (i > lastIndex) {
                        outputParts.push(result.substring(lastIndex, i));
                    }
                    outputParts.push(replacement);
                    lastIndex = i + 1;
                    i = i + 1;
                    continue;
                }
                // Check if it's a variable: $var, $1, $2, $var.property, etc.
                else if (/[A-Za-z_0-9]/.test(nextChar)) {
                    // Extract the variable path (handles $var, $1, $var.property, etc.)
                    let j = i + 1;
                    // For positional params ($1, $2), just consume the digits
                    if (/[0-9]/.test(nextChar)) {
                        while (j < result.length && /[0-9]/.test(result[j])) {
                            j++;
                        }
                    } else {
                        // For named variables, consume letters, digits, dots, brackets
                        while (j < result.length && /[A-Za-z0-9_.\[\]]/.test(result[j])) {
                            j++;
                        }
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


    /**
     * Execute a subexpression from code string with frame override support
     * 
     * @param code - The subexpression code to execute
     * @param frameOverride - Optional frame override for variable resolution
     */
    private async executeSubexpressionWithFrame(code: string, frameOverride?: Frame): Promise<Value> {
        // Split into logical lines (handles ; inside ${})
        // Parse the subexpression
        const parser = new Parser(code);
        const statements = await parser.parse();

        // Use the provided frameOverride as the parent frame, or current frame
        const parentFrame = frameOverride !== undefined ? frameOverride : this.getCurrentFrame();
        const subexprFrame: Frame = {
            locals: new Map(),
            lastValue: parentFrame.lastValue, // Start with parent's $ (though it will be overwritten)
            isFunctionFrame: false // Subexpressions are not function frames
        };

        // Copy all local variables from parent frame to subexpression frame
        for (const [key, value] of parentFrame.locals.entries()) {
            subexprFrame.locals.set(key, value);
        }

        // Push the subexpression frame
        this.callStack.push(subexprFrame);

        try {
            // Execute statements in the subexpression
            for (const stmt of statements) {
                await this.executeStatement(stmt, subexprFrame);
            }

            // Return the final $ from the subexpression
            return subexprFrame.lastValue;
        } finally {
            // Pop the subexpression frame
            this.callStack.pop();
        }
    }

    /**
     * Execute a subexpression from code string
     * 
     * TODO: AST Refactor - This will be replaced with executeSubexpressionStatements()
     * which takes Statement[] directly, eliminating runtime parsing.
     */
    async executeSubexpression(code: string): Promise<Value> {
        // Split into logical lines (handles ; inside $())
        // Parse the subexpression
        // TODO: AST Refactor - Remove Parser instantiation, use pre-parsed Statement[]
        const parser = new Parser(code);
        const statements = await parser.parse();
        
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

    /**
     * Execute subexpression statements directly (for Expression-based AST)
     * 
     * @param statements - Pre-parsed statements from SubexpressionExpression.body
     * @param frameOverride - Optional frame override for parallel execution
     * @returns The lastValue after executing the statements
     */
    async executeSubexpressionStatements(statements: Statement[], frameOverride?: Frame): Promise<Value> {
        const currentFrame = this.getCurrentFrame(frameOverride);
        const subexprFrame: Frame = {
            locals: new Map(),
            lastValue: currentFrame.lastValue,
            isFunctionFrame: false
        };
        
        // Copy all local variables from parent frame
        for (const [key, value] of currentFrame.locals.entries()) {
            subexprFrame.locals.set(key, value);
        }
        
        this.callStack.push(subexprFrame);
        
        try {
            for (const stmt of statements) {
                await this.executeStatement(stmt, subexprFrame);
            }
            return subexprFrame.lastValue;
        } finally {
            this.callStack.pop();
        }
    }

    /**
     * Evaluate an Expression node
     * 
     * @param expr - The Expression node to evaluate
     * @param frameOverride - Optional frame override
     * @returns The evaluated value
     */
    async evaluateExpression(expr: Expression, frameOverride?: Frame): Promise<Value> {
        switch (expr.type) {
            case 'var':
                return this.resolveVariable(expr.name, expr.path, frameOverride);
            case 'lastValue':
                // Use frameOverride directly if provided, otherwise get from call stack
                // This ensures we're reading from the correct frame's lastValue
                const frame = frameOverride !== undefined ? frameOverride : this.getCurrentFrame();
                return frame.lastValue;
            case 'literal':
                return expr.value;
            case 'number':
                return expr.value;
            case 'string':
                // Check if this is a template string (backtick string)
                // Template strings are marked with \0TEMPLATE\0 prefix
                if (typeof expr.value === 'string' && expr.value.startsWith('\0TEMPLATE\0')) {
                    const template = expr.value.substring(10); // Remove \0TEMPLATE\0 prefix (10 chars)
                    return await StringTemplateParser.evaluate(template, {
                        resolveVariable: (name, path, frame) => this.resolveVariable(name, path, frame),
                        getLastValue: (frame) => {
                            const f = frame !== undefined ? frame : this.getCurrentFrame();
                            return f.lastValue;
                        },
                        executeSubexpression: (code, frame) => this.executeSubexpressionWithFrame(code, frame)
                    }, frameOverride);
                }
                return expr.value;
            case 'objectLiteral':
                return await this.evaluateObjectLiteral(expr, frameOverride);
            case 'arrayLiteral':
                return await this.evaluateArrayLiteral(expr, frameOverride);
            case 'subexpression':
                return await this.executeSubexpressionStatements(expr.body, frameOverride);
            case 'binary':
                return await this.evaluateBinaryExpression(expr, frameOverride);
            case 'unary':
                return await this.evaluateUnaryExpression(expr, frameOverride);
            case 'call':
                return await this.evaluateCallExpression(expr, frameOverride);
            default:
                // Handle legacy Arg types that might be passed as Expressions
                // This can happen when named argument values are parsed as legacy types
                const exprAny = expr as any;
                if (exprAny.type === 'array' && exprAny.code !== undefined) {
                    // Legacy array type - handle it like in evaluateArg
                    if (!exprAny.code || exprAny.code.trim() === '') {
                        return [];
                    }
                    try {
                        const interpolatedCode = await this.interpolateObjectLiteral(exprAny.code, frameOverride);
                        return JSON5.parse(`[${interpolatedCode}]`);
                    } catch (error) {
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        throw createErrorWithContext({
                            message: `Invalid array literal: ${errorMsg}`,
                            codePos: exprAny.codePos,
                            code: this.sourceCode || undefined
                        });
                    }
                }
                if (exprAny.type === 'object' && exprAny.code !== undefined) {
                    // Legacy object type - handle it like in evaluateArg
                    if (!exprAny.code || exprAny.code.trim() === '') {
                        return {};
                    }
                    try {
                        const interpolatedCode = await this.interpolateObjectLiteral(exprAny.code, frameOverride);
                        return JSON5.parse(`{${interpolatedCode}}`);
                    } catch (error) {
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        throw createErrorWithContext({
                            message: `Invalid object literal: ${errorMsg}`,
                            codePos: exprAny.codePos,
                            code: this.sourceCode || undefined
                        });
                    }
                }
                throw new Error(`Unknown expression type: ${(expr as any).type}`);
        }
    }

    /**
     * Evaluate an ObjectLiteralExpression
     * 
     * @param expr - The ObjectLiteralExpression node
     * @param frameOverride - Optional frame override
     * @returns The evaluated object
     */
    async evaluateObjectLiteral(expr: import('../types/Ast.type').ObjectLiteralExpression, frameOverride?: Frame): Promise<Record<string, Value>> {
        const result: Record<string, Value> = {};
        
        for (const prop of expr.properties) {
            // Evaluate key (can be string or Expression for computed properties)
            const key = typeof prop.key === 'string' 
                ? prop.key 
                : String(await this.evaluateExpression(prop.key, frameOverride));
            
            // Evaluate value
            const value = await this.evaluateExpression(prop.value, frameOverride);
            
            result[key] = value;
        }
        
        return result;
    }

    /**
     * Evaluate an ArrayLiteralExpression
     * 
     * @param expr - The ArrayLiteralExpression node
     * @param frameOverride - Optional frame override
     * @returns The evaluated array
     */
    async evaluateArrayLiteral(expr: import('../types/Ast.type').ArrayLiteralExpression, frameOverride?: Frame): Promise<Value[]> {
        const result: Value[] = [];
        
        for (const element of expr.elements) {
            const value = await this.evaluateExpression(element, frameOverride);
            result.push(value);
        }
        
        return result;
    }

    /**
     * Evaluate a BinaryExpression
     * 
     * @param expr - The BinaryExpression node
     * @param frameOverride - Optional frame override
     * @returns The evaluated value
     */
    async evaluateBinaryExpression(expr: import('../types/Ast.type').BinaryExpression, frameOverride?: Frame): Promise<Value> {
        const left = await this.evaluateExpression(expr.left, frameOverride);
        const right = await this.evaluateExpression(expr.right, frameOverride);
        
        switch (expr.operator) {
            case '==':
                return left === right;
            case '!=':
                return left !== right;
            case '<':
                return (left as number) < (right as number);
            case '<=':
                return (left as number) <= (right as number);
            case '>':
                return (left as number) > (right as number);
            case '>=':
                return (left as number) >= (right as number);
            case 'and':
                return isTruthy(left) && isTruthy(right);
            case 'or':
                return isTruthy(left) || isTruthy(right);
            case '+':
                return (left as number) + (right as number);
            case '-':
                return (left as number) - (right as number);
            case '*':
                return (left as number) * (right as number);
            case '/':
                return (left as number) / (right as number);
            case '%':
                return (left as number) % (right as number);
            default:
                throw new Error(`Unknown binary operator: ${(expr.operator as any)}`);
        }
    }

    /**
     * Evaluate a UnaryExpression
     * 
     * @param expr - The UnaryExpression node
     * @param frameOverride - Optional frame override
     * @returns The evaluated value
     */
    async evaluateUnaryExpression(expr: import('../types/Ast.type').UnaryExpression, frameOverride?: Frame): Promise<Value> {
        const arg = await this.evaluateExpression(expr.argument, frameOverride);
        
        switch (expr.operator) {
            case 'not':
                return !isTruthy(arg);
            case '-':
                return -(arg as number);
            case '+':
                return +(arg as number);
            default:
                throw new Error(`Unknown unary operator: ${(expr.operator as any)}`);
        }
    }

    /**
     * Evaluate a CallExpression
     * 
     * @param expr - The CallExpression node
     * @param frameOverride - Optional frame override
     * @returns The evaluated value
     */
    async evaluateCallExpression(expr: import('../types/Ast.type').CallExpression, frameOverride?: Frame): Promise<Value> {
        // Evaluate arguments
        const args: Value[] = [];
        for (const argExpr of expr.args) {
            args.push(await this.evaluateExpression(argExpr, frameOverride));
        }
        
        // Execute the function/command call
        // This is a simplified version - you may need to enhance it based on your command execution logic
        const frame = this.getCurrentFrame(frameOverride);
        const previousLastValue = frame.lastValue;
        
        // Create a CommandCall-like structure for execution
        // Note: We can pass Expression directly as Arg since evaluateArg handles both
        const cmd: CommandCall = {
            type: 'command',
            name: expr.callee,
            args: expr.args, // Pass Expression[] directly - evaluateArg will handle them
            codePos: expr.codePos || { startRow: 0, startCol: 0, endRow: 0, endCol: 0 }
        };
        
        await this.executeCommand(cmd, frameOverride);
        const result = frame.lastValue;
        frame.lastValue = previousLastValue; // Restore
        
        return result;
    }

    private resolveVariable(name: string, path?: AttributePathSegment[], frameOverride?: Frame): Value {
        // Use frameOverride directly if provided, otherwise get from call stack
        // This ensures we're reading from the correct frame
        const frame = frameOverride !== undefined ? frameOverride : this.getCurrentFrame();
        
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
        // 2. If not found, check parent frames' locals (lexical scoping)
        // 3. If not found in any parent frame, check globals (outer scope)
        // This allows functions to read global variables but ensures local variables
        // shadow globals with the same name.
        
        let baseValue: Value = null; // Initialize to satisfy TypeScript
        
        // If name is empty, it means last value ($) with attributes
        if (name === '') {
            baseValue = frame.lastValue;
        } else {
            // Check locals first (current frame)
            if (frame.locals.has(name)) {
                baseValue = frame.locals.get(name)!;
            } else {
                // Check parent frames (lexical scoping)
                // Traverse call stack backwards to find variable in parent scopes
                let found = false;
                // Start from the frame before the current one (parent frame)
                // Note: callStack[length - 1] is the current frame, so we start from length - 2
                for (let i = this.callStack.length - 2; i >= 0; i--) {
                    const parentFrame = this.callStack[i];
                    // Skip isolated scopes - they don't inherit from parents
                    if (parentFrame.isIsolatedScope) {
                        continue;
                    }
                    if (parentFrame.locals.has(name)) {
                        baseValue = parentFrame.locals.get(name)!;
                        found = true;
                        break;
                    }
                }
                
                // If not found in any parent frame, check globals
                if (!found) {
                    if (this.environment.variables.has(name)) {
                        baseValue = this.environment.variables.get(name)!;
                    } else {
                        return null;
                    }
                }
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

    private setVariable(name: string, value: Value, frameOverride?: Frame): void {
        // Check if this is a constant - constants cannot be reassigned
        if (this.environment.constants.has(name)) {
            throw new Error(`Cannot reassign constant $${name}. Constants are immutable.`);
        }
        
        const currentFrame = this.getCurrentFrame(frameOverride);
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
    private setVariableAtPath(name: string, path: AttributePathSegment[], value: Value, frameOverride?: Frame): void {
        // Check if this is a constant - constants cannot be reassigned
        // Note: We only check if the base variable is a constant (not path assignments)
        // Path assignments like $const.prop = value modify the object, not the constant itself
        if (!path || path.length === 0) {
            if (this.environment.constants.has(name)) {
                throw new Error(`Cannot reassign constant $${name}. Constants are immutable.`);
            }
        }
        
        const frame = this.getCurrentFrame(frameOverride);
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
                        const currentFrame = this.getCurrentFrame(frameOverride);
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
