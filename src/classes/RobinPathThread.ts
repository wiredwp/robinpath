/**
 * RobinPathThread class for managing execution threads
 */

import { splitIntoLogicalLines, type Value } from '../utils';
import { Parser } from './Parser';
import { Executor } from './Executor';
import { ExecutionStateTracker } from './ExecutionStateTracker';
import type { 
    Environment, 
    Statement, 
    Arg
} from '../index';
import type { RobinPath } from '../index';

export class RobinPathThread {
    private environment: Environment;
    private executor: Executor;
    public readonly id: string;
    private parent: RobinPath | null = null;

    constructor(baseEnvironment: Environment, id: string, parent?: RobinPath) {
        this.id = id;
        this.parent = parent || null;
        // Create a thread-local environment:
        // - new variables map
        // - new functions map (user-defined)
        // - shared builtins + metadata
        // - per-thread currentModule context
        this.environment = {
            variables: new Map(),                     // per-thread vars
            functions: new Map(),                     // per-thread def/enddef
            builtins: baseEnvironment.builtins,       // shared
            decorators: baseEnvironment.decorators,   // shared
            metadata: baseEnvironment.metadata,       // shared
            moduleMetadata: baseEnvironment.moduleMetadata, // shared
            currentModule: null,                       // per-thread module context
            variableMetadata: new Map(),              // per-thread variable metadata
            functionMetadata: new Map(),              // per-thread function metadata
            constants: new Set()                      // per-thread constants
        };

        this.executor = new Executor(this.environment, this);
    }

    /**
     * Check if a script needs more input (incomplete block)
     * Returns { needsMore: true, waitingFor: 'endif' | 'enddef' | 'endfor' | 'enddo' | 'subexpr' | 'paren' | 'object' | 'array' } if incomplete,
     * or { needsMore: false } if complete.
     */
    needsMoreInput(script: string): { needsMore: boolean; waitingFor?: 'endif' | 'enddef' | 'endfor' | 'enddo' | 'subexpr' | 'paren' | 'object' | 'array' } {
        try {
            const lines = splitIntoLogicalLines(script);
            const parser = new Parser(lines);
            parser.parse();
            return { needsMore: false };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // Check for missing block closers
            if (errorMessage.includes('missing endif')) {
                return { needsMore: true, waitingFor: 'endif' };
            }
            if (errorMessage.includes('missing enddef')) {
                return { needsMore: true, waitingFor: 'enddef' };
            }
            if (errorMessage.includes('missing endfor')) {
                return { needsMore: true, waitingFor: 'endfor' };
            }
            if (errorMessage.includes('missing enddo')) {
                return { needsMore: true, waitingFor: 'enddo' };
            }
            
            // NEW: unclosed $( ... ) subexpression – keep reading lines
            if (errorMessage.includes('unclosed subexpression')) {
                return { needsMore: true, waitingFor: 'subexpr' };
            }
            
            // NEW: unclosed parenthesized function call fn(...) – keep reading lines
            if (errorMessage.includes('unclosed parenthesized function call')) {
                return { needsMore: true, waitingFor: 'paren' };
            }
            
            // NEW: unclosed object literal { ... } – keep reading lines
            if (errorMessage.includes('unclosed object literal')) {
                return { needsMore: true, waitingFor: 'object' };
            }
            
            // NEW: unclosed array literal [ ... ] – keep reading lines
            if (errorMessage.includes('unclosed array literal')) {
                return { needsMore: true, waitingFor: 'array' };
            }
            
            // If it's a different error, the script is malformed but complete
            // (we'll let executeScript handle the actual error)
            return { needsMore: false };
        }
    }

    /**
     * Execute a RobinPath script in this thread
     */
    async executeScript(script: string): Promise<Value> {
        // Split into logical lines (handles ; separator)
        const lines = splitIntoLogicalLines(script);
        const parser = new Parser(lines);
        const statements = parser.parse();
        
        // Register extracted function definitions first (before executing other statements)
        const extractedFunctions = parser.getExtractedFunctions();
        for (const func of extractedFunctions) {
            this.environment.functions.set(func.name, func);
        }
        
        const result = await this.executor.execute(statements);
        return result;
    }

    /**
     * Execute a single line in this thread (for REPL)
     */
    async executeLine(line: string): Promise<Value> {
        // Split into logical lines (handles ; separator)
        const lines = splitIntoLogicalLines(line);
        const parser = new Parser(lines);
        const statements = parser.parse();
        
        // Register extracted function definitions first (before executing other statements)
        const extractedFunctions = parser.getExtractedFunctions();
        for (const func of extractedFunctions) {
            this.environment.functions.set(func.name, func);
        }
        
        const result = await this.executor.execute(statements);
        return result;
    }

    /**
     * Get the last value ($) from this thread
     */
    getLastValue(): Value {
        return this.executor.getCurrentFrame().lastValue;
    }

    /**
     * Get a variable value from this thread
     */
    getVariable(name: string): Value {
        return this.environment.variables.get(name) ?? null;
    }

    /**
     * Set a variable value in this thread
     */
    setVariable(name: string, value: Value): void {
        this.environment.variables.set(name, value);
    }

    /**
     * Get the current module name (set by "use" command)
     * Returns null if no module is currently in use
     */
    getCurrentModule(): string | null {
        return this.environment.currentModule;
    }

    /**
     * Get the parent RobinPath instance
     */
    getParent(): RobinPath | null {
        return this.parent;
    }

    /**
     * Get the environment for this thread (for CLI access to metadata)
     */
    getEnvironment(): Environment {
        return this.environment;
    }

    /**
     * Get the AST without execution state
     * Returns a JSON-serializable AST array
     * 
     * Note: This method only parses the script, it does not execute it.
     */
    getAST(script: string): any[] {
        // Parse the script to get AST
        const lines = splitIntoLogicalLines(script);
        const parser = new Parser(lines);
        const statements = parser.parse();

        // Track "use" command context to determine module names
        let currentModuleContext: string | null = null;

        // Serialize AST without execution state, tracking "use" commands
        const ast = statements.map((stmt) => {
            // Handle "use" command to track module context
            if (stmt.type === 'command' && stmt.name === 'use' && stmt.args.length > 0) {
                const moduleArg = stmt.args[0];
                if (moduleArg.type === 'literal' || moduleArg.type === 'string') {
                    const moduleName = String(moduleArg.value);
                    if (moduleName === 'clear' || moduleName === '' || moduleName === null) {
                        currentModuleContext = null;
                    } else {
                        currentModuleContext = moduleName;
                    }
                }
            }

            // Serialize statement with current module context
            return this.serializeStatement(stmt, undefined, currentModuleContext);
        });

        return ast;
    }

    /**
     * Get extracted function definitions (def/enddef blocks) from a script
     * Returns a JSON-serializable array of function definitions
     * 
     * Note: This method only parses the script, it does not execute it.
     */
    getExtractedFunctions(script: string): any[] {
        // Parse the script to extract functions
        const lines = splitIntoLogicalLines(script);
        const parser = new Parser(lines);
        parser.parse(); // Parse to extract functions
        
        const extractedFunctions = parser.getExtractedFunctions();
        
        // Serialize functions
        return extractedFunctions.map((func) => {
            return {
                name: func.name,
                paramNames: func.paramNames,
                body: func.body.map((stmt) => this.serializeStatement(stmt, undefined, undefined))
            };
        });
    }

    /**
     * Get the AST with execution state for the current thread
     * Returns a JSON-serializable object with:
     * - AST nodes with execution state ($ lastValue at each node)
     * - Available variables (thread-local and global)
     * - Organized for UI representation
     * 
     * Note: This method executes the script to capture execution state at each node.
     */
    async getASTWithState(script: string): Promise<{
        ast: any[];
        variables: {
            thread: Record<string, Value>;
            global: Record<string, Value>;
        };
        lastValue: Value;
        callStack: Array<{
            locals: Record<string, Value>;
            lastValue: Value;
        }>;
    }> {
        // Parse the script to get AST
        const lines = splitIntoLogicalLines(script);
        const parser = new Parser(lines);
        const statements = parser.parse();

        // Execute with state tracking - track $ at each statement level
        const stateTracker = new ExecutionStateTracker();
        await this.executeWithStateTracking(statements, stateTracker);

        // Get current execution state
        const frame = this.executor.getCurrentFrame();
        const callStack = this.executor.getCallStack();

        // Serialize AST with execution state
        const ast = statements.map((stmt, index) => {
            const state = stateTracker.getState(index);
            return this.serializeStatement(stmt, state, undefined);
        });

        // Get variables
        const threadVars: Record<string, Value> = {};
        for (const [name, value] of this.environment.variables.entries()) {
            threadVars[name] = value;
        }

        const globalVars: Record<string, Value> = {};
        if (this.parent) {
            const parentEnv = (this.parent as any).environment as Environment;
            for (const [name, value] of parentEnv.variables.entries()) {
                globalVars[name] = value;
            }
        }

        // Get call stack information
        const callStackInfo = callStack.map(frame => ({
            locals: Object.fromEntries(frame.locals.entries()),
            lastValue: frame.lastValue
        }));

        return {
            ast,
            variables: {
                thread: threadVars,
                global: globalVars
            },
            lastValue: frame.lastValue,
            callStack: callStackInfo
        };
    }

    /**
     * Execute statements with state tracking
     */
    private async executeWithStateTracking(statements: Statement[], tracker: ExecutionStateTracker): Promise<void> {
        for (let i = 0; i < statements.length; i++) {
            const stmt = statements[i];
            const beforeState = this.executor.getCurrentFrame().lastValue;
            
            // Comments don't execute, so skip them but still track state
            if (stmt.type === 'comment') {
                tracker.setState(i, {
                    lastValue: beforeState, // Comments preserve the last value
                    beforeValue: beforeState
                });
                continue;
            }
            
            await this.executor.executeStatementPublic(stmt);
            
            const afterState = this.executor.getCurrentFrame().lastValue;
            tracker.setState(i, {
                lastValue: afterState,
                beforeValue: beforeState
            });
        }
    }

    /**
     * Find the module name for a given function name
     * Returns the module name if found, null otherwise
     */
    private findModuleName(functionName: string, currentModuleContext?: string | null): string | null {
        // If the function name contains a dot, extract the module name
        if (functionName.includes('.')) {
            const parts = functionName.split('.');
            return parts[0] || null;
        }

        // Use provided context or environment's currentModule
        const moduleContext = currentModuleContext !== undefined ? currentModuleContext : this.environment.currentModule;

        // If there's a module context, check that module first
        if (moduleContext) {
            const fullName = `${moduleContext}.${functionName}`;
            if (this.environment.builtins.has(fullName) || this.environment.metadata.has(fullName)) {
                return moduleContext;
            }
        }

        // Check if it's a global builtin BEFORE searching modules
        // This ensures global functions are preferred over module functions
        // (e.g., "log" should be global, not "core.log")
        if (this.environment.builtins.has(functionName) || this.environment.metadata.has(functionName)) {
            return null; // Global function, no module
        }

        // Search through builtins and metadata to find which module this function belongs to
        for (const [name] of this.environment.builtins.entries()) {
            if (name.includes('.') && name.endsWith(`.${functionName}`)) {
                const parts = name.split('.');
                return parts[0] || null;
            }
        }

        for (const [name] of this.environment.metadata.entries()) {
            if (name.includes('.') && name.endsWith(`.${functionName}`)) {
                const parts = name.split('.');
                return parts[0] || null;
            }
        }

        return null;
    }

    /**
     * Determine the type of a value
     * @param value The value to check
     * @returns The type string: 'string', 'number', 'boolean', 'null', 'object', or 'array'
     */
    private getValueType(value: Value): 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array' {
        if (value === null) {
            return 'null';
        }
        if (typeof value === 'string') {
            return 'string';
        }
        if (typeof value === 'number') {
            return 'number';
        }
        if (typeof value === 'boolean') {
            return 'boolean';
        }
        if (Array.isArray(value)) {
            return 'array';
        }
        if (typeof value === 'object') {
            return 'object';
        }
        return 'string'; // Fallback
    }

    private serializeStatement(stmt: Statement, state?: { lastValue: Value; beforeValue: Value }, currentModuleContext?: string | null): any {
        // For comment nodes, don't include codePos - derive from comments array when needed
        const base: any = {
            type: stmt.type,
            lastValue: state?.lastValue ?? null
        };
        
        // Only add codePos for non-comment nodes
        if (stmt.type !== 'comment') {
            base.codePos = (stmt as any).codePos;
        }

        // Add comments if present
        const comments = (stmt as any).comments;
        if (comments && comments.length > 0) {
            base.comments = comments;
        }

        switch (stmt.type) {
            case 'command':
                const moduleName = this.findModuleName(stmt.name, currentModuleContext);
                return {
                    ...base,
                    name: stmt.name,
                    module: moduleName,
                    args: stmt.args.map(arg => this.serializeArg(arg)),
                    syntaxType: (stmt as any).syntaxType
                };
            case 'assignment':
                return {
                    ...base,
                    targetName: stmt.targetName,
                    targetPath: stmt.targetPath,
                    command: stmt.command ? this.serializeStatement(stmt.command, undefined, currentModuleContext) : undefined,
                    literalValue: stmt.literalValue,
                    literalValueType: stmt.literalValue !== undefined ? this.getValueType(stmt.literalValue) : (stmt.literalValueType || undefined),
                    isLastValue: stmt.isLastValue
                };
            case 'shorthand':
                return {
                    ...base,
                    targetName: stmt.targetName
                };
            case 'inlineIf':
                return {
                    ...base,
                    conditionExpr: stmt.conditionExpr,
                    command: this.serializeStatement(stmt.command, undefined, currentModuleContext)
                };
            case 'ifBlock':
                return {
                    ...base,
                    conditionExpr: stmt.conditionExpr,
                    thenBranch: stmt.thenBranch.map(s => this.serializeStatement(s, undefined, currentModuleContext)),
                    elseifBranches: stmt.elseifBranches?.map(branch => ({
                        condition: branch.condition,
                        body: branch.body.map(s => this.serializeStatement(s, undefined, currentModuleContext))
                    })),
                    elseBranch: stmt.elseBranch?.map(s => this.serializeStatement(s, undefined, currentModuleContext))
                };
            case 'ifTrue':
                return {
                    ...base,
                    command: this.serializeStatement(stmt.command, undefined, currentModuleContext)
                };
            case 'ifFalse':
                return {
                    ...base,
                    command: this.serializeStatement(stmt.command, undefined, currentModuleContext)
                };
            case 'define':
                return {
                    ...base,
                    name: stmt.name,
                    paramNames: stmt.paramNames,
                    body: stmt.body.map(s => this.serializeStatement(s, undefined, currentModuleContext))
                };
            case 'do':
                return {
                    ...base,
                    body: stmt.body.map(s => this.serializeStatement(s, undefined, currentModuleContext))
                };
            case 'forLoop':
                return {
                    ...base,
                    varName: stmt.varName,
                    iterableExpr: stmt.iterableExpr,
                    body: stmt.body.map(s => this.serializeStatement(s, undefined, currentModuleContext))
                };
            case 'return':
                return {
                    ...base,
                    value: stmt.value ? this.serializeArg(stmt.value) : undefined
                };
            case 'break':
                return {
                    ...base
                };
            case 'comment':
                return {
                    ...base,
                    comments: stmt.comments || [],
                    lineNumber: stmt.lineNumber
                };
        }
    }

    /**
     * Serialize an argument to JSON
     */
    private serializeArg(arg: Arg): any {
        switch (arg.type) {
            case 'subexpr':
                return { type: 'subexpr', code: arg.code };
            case 'var':
                return { type: 'var', name: arg.name, path: arg.path };
            case 'lastValue':
                return { type: 'lastValue' };
            case 'number':
                return { type: 'number', value: arg.value };
            case 'string':
                return { type: 'string', value: arg.value };
            case 'literal':
                return { type: 'literal', value: arg.value };
            case 'namedArgs':
                const serialized: Record<string, any> = {};
                for (const [key, valueArg] of Object.entries(arg.args)) {
                    serialized[key] = this.serializeArg(valueArg);
                }
                return { type: 'namedArgs', args: serialized };
        }
    }

    /**
     * Get all available commands, modules, and functions for this thread
     * Includes thread-local user-defined functions in addition to shared builtins and modules
     * 
     * @param context Optional syntax context to filter commands based on what's valid next
     */
    getAvailableCommands(context?: {
        inIfBlock?: boolean;
        inDefBlock?: boolean;
        afterIf?: boolean;
        afterDef?: boolean;
        afterElseif?: boolean;
    }): {
        native: Array<{ name: string; type: string; description: string }>;
        builtin: Array<{ name: string; type: string; description: string }>;
        modules: Array<{ name: string; type: string; description: string }>;
        moduleFunctions: Array<{ name: string; type: string; description: string }>;
        userFunctions: Array<{ name: string; type: string; description: string }>;
    } {
        const parent = this.getParent();
        
        // Get base commands from parent or environment
        let baseCommands: {
            native: Array<{ name: string; type: string; description: string }>;
            builtin: Array<{ name: string; type: string; description: string }>;
            modules: Array<{ name: string; type: string; description: string }>;
            moduleFunctions: Array<{ name: string; type: string; description: string }>;
            userFunctions: Array<{ name: string; type: string; description: string }>;
        };
        
        if (parent) {
            baseCommands = parent.getAvailableCommands();
        } else {
            // Fallback: get from environment directly
            const nativeCommands: { [key: string]: string } = {
                'if': 'Conditional statement - starts a conditional block',
                'then': 'Used with inline if statements',
                'else': 'Alternative branch in conditional blocks',
                'elseif': 'Additional condition in conditional blocks',
                'endif': 'Ends a conditional block',
                'def': 'Defines a user function - starts function definition',
                'enddef': 'Ends a function definition',
                'iftrue': 'Executes command if last value is truthy',
                'iffalse': 'Executes command if last value is falsy'
            };
            
            // Apply syntax context filtering
            const ctx = context || {};
            const syntaxCtx = {
                canStartStatement: !ctx.afterIf && !ctx.afterDef && !ctx.afterElseif,
                canUseBlockKeywords: !ctx.inIfBlock && !ctx.inDefBlock,
                canUseEndKeywords: !!(ctx.inIfBlock || ctx.inDefBlock),
                canUseConditionalKeywords: !!ctx.inIfBlock
            };
            
            const filteredNative: Array<{ name: string; type: string; description: string }> = [];
            const allNative = Object.keys(nativeCommands).map(name => ({
                name,
                type: 'native',
                description: nativeCommands[name]
            }));
            
            if (syntaxCtx.canUseBlockKeywords) {
                filteredNative.push(...allNative.filter(n => n.name === 'if' || n.name === 'def' || n.name === 'do'));
            }
            if (syntaxCtx.canUseConditionalKeywords) {
                filteredNative.push(...allNative.filter(n => n.name === 'elseif' || n.name === 'else'));
            }
            if (syntaxCtx.canUseEndKeywords) {
                if (ctx.inIfBlock) {
                    filteredNative.push(...allNative.filter(n => n.name === 'endif'));
                }
                if (ctx.inDefBlock) {
                    filteredNative.push(...allNative.filter(n => n.name === 'enddef'));
                }
                // Note: enddo is handled by checking if we're in a do block
                // For now, we'll include it if we can use end keywords
                filteredNative.push(...allNative.filter(n => n.name === 'enddo'));
            }
            if (syntaxCtx.canStartStatement) {
                filteredNative.push(...allNative.filter(n => n.name === 'iftrue' || n.name === 'iffalse'));
            }
            
            const builtin: Array<{ name: string; type: string; description: string }> = [];
            if (syntaxCtx.canStartStatement) {
                for (const [name] of this.environment.builtins.entries()) {
                    if (!name.includes('.')) {
                        const metadata = this.environment.metadata.get(name);
                        builtin.push({
                            name,
                            type: 'builtin',
                            description: metadata?.description || 'Builtin command'
                        });
                    }
                }
                builtin.sort((a, b) => a.name.localeCompare(b.name));
            }
            
            const modules: Array<{ name: string; type: string; description: string }> = [];
            if (syntaxCtx.canStartStatement) {
                for (const [name, metadata] of this.environment.moduleMetadata.entries()) {
                    modules.push({
                        name,
                        type: 'module',
                        description: metadata.description || 'Module'
                    });
                }
                modules.sort((a, b) => a.name.localeCompare(b.name));
            }
            
            const moduleFunctions: Array<{ name: string; type: string; description: string }> = [];
            if (syntaxCtx.canStartStatement) {
                for (const [name] of this.environment.builtins.entries()) {
                    if (name.includes('.')) {
                        const metadata = this.environment.metadata.get(name);
                        moduleFunctions.push({
                            name,
                            type: 'moduleFunction',
                            description: metadata?.description || 'Module function'
                        });
                    }
                }
                moduleFunctions.sort((a, b) => a.name.localeCompare(b.name));
            }
            
            baseCommands = {
                native: filteredNative,
                builtin,
                modules,
                moduleFunctions,
                userFunctions: []
            };
        }
        
        // Replace user-defined functions with thread-local ones (only if we can start statements)
        const ctx = context || {};
        const syntaxCtx = {
            canStartStatement: !ctx.afterIf && !ctx.afterDef && !ctx.afterElseif,
            canUseBlockKeywords: !ctx.inIfBlock && !ctx.inDefBlock,
            canUseEndKeywords: !!(ctx.inIfBlock || ctx.inDefBlock),
            canUseConditionalKeywords: !!ctx.inIfBlock
        };
        
        const userFunctions: Array<{ name: string; type: string; description: string }> = [];
        if (syntaxCtx.canStartStatement) {
            for (const name of this.environment.functions.keys()) {
                userFunctions.push({
                    name,
                    type: 'userFunction',
                    description: 'User-defined function'
                });
            }
            userFunctions.sort((a, b) => a.name.localeCompare(b.name));
        }
        
        return {
            native: baseCommands.native,
            builtin: baseCommands.builtin,
            modules: baseCommands.modules,
            moduleFunctions: baseCommands.moduleFunctions,
            userFunctions
        };
    }
}
