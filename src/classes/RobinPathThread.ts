/**
 * RobinPathThread class for managing execution threads
 */

import { type Value } from '../utils';
import { Parser } from './Parser';
import { Executor } from './Executor';
import { ExecutionStateTracker } from './ExecutionStateTracker';
import { ASTSerializer } from './ASTSerializer';
import type { 
    Environment, 
    Statement, 
    Arg,
    OnBlock
} from '../index';
import type { RobinPath } from '../index';

export class RobinPathThread {
    private environment: Environment;
    private executor: Executor;
    public readonly id: string;
    private parent: RobinPath | null = null;
    private serializer: ASTSerializer;

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
            decorators: baseEnvironment.decorators,   // shared (runtime decorators)
            parseDecorators: baseEnvironment.parseDecorators, // shared (parse-time decorators)
            metadata: baseEnvironment.metadata,       // shared
            moduleMetadata: baseEnvironment.moduleMetadata, // shared
            currentModule: null,                       // per-thread module context
            variableMetadata: new Map(),              // per-thread variable metadata
            functionMetadata: new Map(),              // per-thread function metadata
            constants: new Set(),                     // per-thread constants
            eventHandlers: new Map()                  // per-thread event handlers
        };

        this.executor = new Executor(this.environment, this);
        this.serializer = new ASTSerializer(this.environment);
    }

    /**
     * Check if a script needs more input (incomplete block)
     * Returns { needsMore: true, waitingFor: 'endif' | 'enddef' | 'endfor' | 'enddo' | 'subexpr' | 'paren' | 'object' | 'array' } if incomplete,
     * or { needsMore: false } if complete.
     */
    async needsMoreInput(script: string): Promise<{ needsMore: boolean; waitingFor?: 'endif' | 'enddef' | 'endfor' | 'enddo' | 'subexpr' | 'paren' | 'object' | 'array' }> {
        try {
            // Parser now handles the full source directly (including logical line splitting via tokenization)
            const parser = new Parser(script);
            await parser.parse();
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
        // Parser now handles source directly via TokenStream
        // Pass environment to parser so it can execute parse decorators
        const parser = new Parser(script, this.environment);
        const statements = await parser.parse();
        
        // Register extracted function definitions first (before executing other statements)
        const extractedFunctions = parser.getExtractedFunctions();
        for (const func of extractedFunctions) {
            this.environment.functions.set(func.name, func);
            // Parse decorators are already executed during parsing
            // Only execute runtime decorators here
            if (func.decorators && func.decorators.length > 0) {
                await this.executor.executeDecorators(func.decorators, func.name, func, []);
            }
        }
        
        // Register extracted event handlers first (before executing other statements)
        // This allows trigger commands to work anywhere in the script
        const extractedEventHandlers = parser.getExtractedEventHandlers();
        for (const handler of extractedEventHandlers) {
            const handlers = this.environment.eventHandlers.get(handler.eventName) || [];
            handlers.push(handler);
            this.environment.eventHandlers.set(handler.eventName, handlers);
            // Parse decorators are already executed during parsing
            // Only execute runtime decorators here
            if (handler.decorators && handler.decorators.length > 0) {
                await this.executor.executeDecorators(handler.decorators, handler.eventName, null, []);
            }
        }
        
        const result = await this.executor.execute(statements);
        return result;
    }

    /**
     * Execute a single line in this thread (for REPL)
     */
    async executeLine(line: string): Promise<Value> {
        // Parser now handles source directly via TokenStream
        const parser = new Parser(line);
        const statements = await parser.parse();
        
        // Register extracted function definitions first (before executing other statements)
        const extractedFunctions = parser.getExtractedFunctions();
        for (const func of extractedFunctions) {
            this.environment.functions.set(func.name, func);
        }
        
        // Register extracted event handlers first (before executing other statements)
        // This allows trigger commands to work anywhere in the script
        const extractedEventHandlers = parser.getExtractedEventHandlers();
        for (const handler of extractedEventHandlers) {
            const handlers = this.environment.eventHandlers.get(handler.eventName) || [];
            handlers.push(handler);
            this.environment.eventHandlers.set(handler.eventName, handlers);
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
    async getAST(script: string): Promise<any[]> {
        // Parse the script to get AST
        const parser = new Parser(script);
        const statements = await parser.parse();

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
            return this.serializer.serializeStatement(stmt, currentModuleContext);
        });

        return ast;
    }

    /**
     * Get extracted function definitions (def/enddef blocks) from a script
     * Returns a JSON-serializable array of function definitions
     * 
     * Note: This method only parses the script, it does not execute it.
     */
    async getExtractedFunctions(script: string): Promise<any[]> {
        // Parse the script to extract functions
        const parser = new Parser(script);
        await parser.parse(); // Parse to extract functions
        
        const extractedFunctions = parser.getExtractedFunctions();
        
        // Serialize functions
        return extractedFunctions.map((func) => {
            return {
                name: func.name,
                paramNames: func.paramNames,
                body: func.body.map((stmt) => this.serializer.serializeStatement(stmt, undefined))
            };
        });
    }

    /**
     * Get all event handlers as a flat array
     * @returns Array of all OnBlock handlers
     */
    getAllEventHandlers(): OnBlock[] {
        const allHandlers: OnBlock[] = [];
        for (const handlers of this.environment.eventHandlers.values()) {
            allHandlers.push(...handlers);
        }
        return allHandlers;
    }

    /**
     * Get event handlers as serialized AST
     * @returns Array of serialized event handler AST nodes
     */
    getEventAST(): any[] {
        const allHandlers = this.getAllEventHandlers();
        let currentModuleContext: string | null = null;

        // Serialize each event handler
        return allHandlers.map((handler) => {
            return this.serializer.serializeStatement(handler, currentModuleContext);
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
        const parser = new Parser(script);
        const statements = await parser.parse();

        // Execute with state tracking - track $ at each statement level
        const stateTracker = new ExecutionStateTracker();
        await this.executeWithStateTracking(statements, stateTracker);

        // Get current execution state
        const frame = this.executor.getCurrentFrame();
        const callStack = this.executor.getCallStack();

        // Serialize AST with execution state
        const ast = statements.map((stmt, index) => {
            const state = stateTracker.getState(index);
            return this.serializer.serializeStatement(stmt, undefined, state);
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
