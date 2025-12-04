/**
 * RobinPath Interpreter
 * 
 * See README.md for full documentation and usage examples.
 */

// RobinPath Interpreter Implementation

// Module adapter interface
export interface ModuleAdapter {
    name: string;
    functions: Record<string, BuiltinHandler>;
    functionMetadata: Record<string, FunctionMetadata>;
    moduleMetadata: ModuleMetadata;
    global?: boolean; // If true, register functions globally (without module prefix)
}

// Import utilities
import { 
    splitIntoLogicalLines, 
    extractNamedArgs,
    type Value,
    type AttributePathSegment
} from './utils';

// Import classes
import {
    Parser,
    Executor,
    RobinPathThread
} from './classes';

// Re-export types for external use
export type { Value, AttributePathSegment };

// Import core modules
import CoreModule from './modules/Core';
import MathModule from './modules/Math';
import StringModule from './modules/String';
import JsonModule from './modules/Json';
import ObjectModule from './modules/Object';
import TimeModule from './modules/Time';
import RandomModule from './modules/Random';
import ArrayModule from './modules/Array';
import FetchModule from './modules/Fetch';
import TestModule from './modules/Test';

// ============================================================================
// Types
// ============================================================================

// Value type is imported from utils

export interface Environment {
    variables: Map<string, Value>;
    functions: Map<string, DefineFunction>;
    builtins: Map<string, BuiltinHandler>;
    metadata: Map<string, FunctionMetadata>;
    moduleMetadata: Map<string, ModuleMetadata>;
    currentModule: string | null; // Current module context set by "use" command
    variableMetadata: Map<string, Map<string, Value>>; // variable name -> (meta key -> value)
    functionMetadata: Map<string, Map<string, Value>>; // function name -> (meta key -> value)
}

export interface Frame {
    locals: Map<string, Value>;
    lastValue: Value;
    isFunctionFrame?: boolean; // True if this frame is from a function (def/enddef), false/undefined if from subexpression
    forgotten?: Set<string>; // Names of variables/functions forgotten in this scope
    isIsolatedScope?: boolean; // True if this frame is from a scope with parameters (isolated, no parent access)
}

export type BuiltinHandler = (args: Value[]) => Value | Promise<Value>;

// extractNamedArgs is imported from utils
export { extractNamedArgs };

// ============================================================================
// Metadata Types
// ============================================================================

export type DataType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null' | 'any';

export type FormInputType = 
    | 'text' 
    | 'number' 
    | 'textarea' 
    | 'select' 
    | 'checkbox' 
    | 'radio' 
    | 'date' 
    | 'datetime' 
    | 'file' 
    | 'json'
    | 'code';

export interface ParameterMetadata {
    name: string;
    label?: string; // Display label for the parameter (e.g., "Arguments" for variadic parameters)
    dataType: DataType;
    description: string;
    formInputType: FormInputType;
    required?: boolean;
    defaultValue?: Value;
    children?: ParameterMetadata; // Schema for array/list items (for variable arguments)
}

export interface FunctionMetadata {
    description: string;
    parameters: ParameterMetadata[];
    returnType: DataType;
    returnDescription: string;
    example?: string; // Optional example usage
}

export interface ModuleMetadata {
    description: string;
    methods: string[];
}

// AttributePathSegment type is imported from utils

export type Arg = 
    | { type: 'subexpr'; code: string }   // $( ... ) inline subexpression
    | { type: 'var'; name: string; path?: AttributePathSegment[] }  // $var or $var.property or $var[0] or $var.property[0]
    | { type: 'lastValue' }
    | { type: 'literal'; value: Value }
    | { type: 'number'; value: number }
    | { type: 'string'; value: string }
    | { type: 'object'; code: string }    // { ... } object literal
    | { type: 'array'; code: string }     // [ ... ] array literal
    | { type: 'namedArgs'; args: Record<string, Arg> }; // Named arguments object (key=value pairs)

export interface CodePosition {
    startRow: number; // 0-indexed row (line) number where statement starts
    startCol: number; // 0-indexed column number where statement starts
    endRow: number; // 0-indexed row (line) number where statement ends (inclusive)
    endCol: number; // 0-indexed column number where statement ends (inclusive)
}

export interface CommandCall {
    type: 'command';
    name: string;
    args: Arg[];
    comments?: CommentWithPosition[]; // Comments attached to this command (above and inline)
    codePos: CodePosition; // Code position (row/col) in source code
}

export interface Assignment {
    type: 'assignment';
    targetName: string;
    targetPath?: AttributePathSegment[]; // Path for attribute access assignment (e.g., $animal.cat)
    command?: CommandCall;
    literalValue?: Value;
    literalValueType?: 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array'; // Type of literalValue, deduced from the value
    isLastValue?: boolean; // True if assignment is from $ (last value)
    comments?: CommentWithPosition[]; // Comments attached to this assignment (above and inline)
    codePos: CodePosition; // Code position (row/col) in source code
}

export interface ShorthandAssignment {
    type: 'shorthand';
    targetName: string;
    comments?: CommentWithPosition[]; // Comments attached to this shorthand assignment (above and inline)
    codePos: CodePosition; // Code position (row/col) in source code
}

export interface InlineIf {
    type: 'inlineIf';
    conditionExpr: string;
    command: Statement;
    comments?: CommentWithPosition[]; // Comments attached to this inline if (above and inline)
    codePos: CodePosition; // Code position (row/col) in source code
}

export interface IfBlock {
    type: 'ifBlock';
    conditionExpr: string;
    thenBranch: Statement[];
    elseBranch?: Statement[];
    elseifBranches?: Array<{ condition: string; body: Statement[] }>;
    comments?: CommentWithPosition[]; // Comments attached to this if block (above and inline)
    codePos: CodePosition; // Code position (row/col) in source code
}

export interface IfTrue {
    type: 'ifTrue';
    command: Statement;
    comments?: CommentWithPosition[]; // Comments attached to this iftrue (above and inline)
    codePos: CodePosition; // Code position (row/col) in source code
}

export interface IfFalse {
    type: 'ifFalse';
    command: Statement;
    comments?: CommentWithPosition[]; // Comments attached to this iffalse (above and inline)
    codePos: CodePosition; // Code position (row/col) in source code
}

export interface DefineFunction {
    type: 'define';
    name: string;
    paramNames: string[]; // Parameter names (e.g., ['a', 'b', 'c']) - aliases for $1, $2, $3
    body: Statement[];
    comments?: CommentWithPosition[]; // Comments attached to this function definition (above and inline)
    codePos: CodePosition; // Code position (row/col) in source code
}

export interface ScopeBlock {
    type: 'scope';
    paramNames?: string[]; // Optional parameter names (e.g., ['a', 'b'])
    body: Statement[];
    comments?: CommentWithPosition[]; // Comments attached to this scope block (above and inline)
    codePos: CodePosition; // Code position (row/col) in source code
}

export interface ForLoop {
    type: 'forLoop';
    varName: string;
    iterableExpr: string;
    body: Statement[];
    comments?: CommentWithPosition[]; // Comments attached to this for loop (above and inline)
    codePos: CodePosition; // Code position (row/col) in source code
}

export interface ReturnStatement {
    type: 'return';
    value?: Arg; // Optional value to return (if not provided, returns $)
    comments?: CommentWithPosition[]; // Comments attached to this return statement (above and inline)
    codePos: CodePosition; // Code position (row/col) in source code
}

export interface BreakStatement {
    type: 'break';
    comments?: CommentWithPosition[]; // Comments attached to this break statement (above and inline)
    codePos: CodePosition; // Code position (row/col) in source code
}

export interface CommentWithPosition {
    text: string; // Comment text without the #
    codePos: CodePosition; // Code position (row/col) in source code
    inline?: boolean; // true if this is an inline comment (on same line as code), false/undefined if above
}

export interface CommentStatement {
    type: 'comment';
    comments: CommentWithPosition[]; // Array of comment objects with position (always use this, never 'text')
    lineNumber: number; // Original line number for reference (deprecated, derive from comments[0].codePos.startRow)
    // codePos is derived from comments array - no need to store it separately
}

export type Statement = 
    | CommandCall 
    | Assignment 
    | ShorthandAssignment 
    | InlineIf 
    | IfBlock 
    | IfTrue 
    | IfFalse 
    | DefineFunction
    | ScopeBlock
    | ForLoop
    | ReturnStatement
    | BreakStatement
    | CommentStatement;

// ============================================================================
// Logical Line Splitter
// ============================================================================

// splitIntoLogicalLines and handleBackslashContinuation are imported from utils

// ============================================================================
// Lexer
// ============================================================================

// Lexer is imported from classes

// ============================================================================
// Parser
// ============================================================================

// Parser is imported from classes

// ============================================================================
// Expression Evaluator
// ============================================================================

// ExpressionEvaluator is imported from classes

// ============================================================================
// Executor
// ============================================================================

// Exceptions and Executor are imported from classes

// ============================================================================
// Execution State Tracker
// ============================================================================

// ExecutionStateTracker is imported from classes

// ============================================================================
// RobinPath Thread
// ============================================================================

// RobinPathThread is imported from classes

// ============================================================================
// RobinPath Interpreter
// ============================================================================

export class RobinPath {
    private environment: Environment;
    private persistentExecutor: Executor | null = null;
    private lastExecutor: Executor | null = null;
    private threads: Map<string, RobinPathThread> = new Map();
    private currentThread: RobinPathThread | null = null;
    private threadControl: boolean = false;
    private replBuffer: string = '';

    constructor(options?: { threadControl?: boolean }) {
        this.threadControl = options?.threadControl ?? false;
        // Initialize environment
        this.environment = {
            variables: new Map(),
            functions: new Map(),
            builtins: new Map(),
            metadata: new Map(),
            moduleMetadata: new Map(),
            currentModule: null,
            variableMetadata: new Map(),
            functionMetadata: new Map()
        };

        // Create persistent executor for REPL mode
        this.persistentExecutor = new Executor(this.environment, null);

        // Load native modules (includes Core module with built-in functions)
        this.loadNativeModules();

        // Note: "use" command is handled specially in executeCommand to access the executor's environment

        this.registerBuiltin('explain', (args) => {
            const nameArg = args[0];
            if (!nameArg) {
                const errorMsg = 'Error: explain requires a module or function name';
                console.log(errorMsg);
                return errorMsg;
            }
            
            // Convert to string (handles both quoted strings and unquoted literals)
            const name = String(nameArg);

            // Check if it's a module name (no dot) or module.function (has dot)
            if (name.includes('.')) {
                // It's a module.function - show function metadata
                const functionMetadata = this.environment.metadata.get(name);
                if (!functionMetadata) {
                    const errorMsg = `No documentation available for function: ${name}`;
                    console.log(errorMsg);
                    return errorMsg;
                }

                // Format the function metadata as a readable string
                let result = `Function: ${name}\n\n`;
                result += `Description: ${functionMetadata.description}\n\n`;

                if (functionMetadata.parameters && functionMetadata.parameters.length > 0) {
                    result += `Parameters:\n`;
                    for (const param of functionMetadata.parameters) {
                        result += `  - ${param.name} (${param.dataType})`;
                        if (param.required) {
                            result += ' [required]';
                        }
                        result += `\n    ${param.description}`;
                        if (param.formInputType) {
                            result += `\n    Input type: ${param.formInputType}`;
                        }
                        if (param.defaultValue !== undefined) {
                            result += `\n    Default: ${JSON.stringify(param.defaultValue)}`;
                        }
                        result += '\n';
                    }
                } else {
                    result += `Parameters: None\n`;
                }

                result += `\nReturns: ${functionMetadata.returnType}`;
                if (functionMetadata.returnDescription) {
                    result += `\n  ${functionMetadata.returnDescription}`;
                }

                if (functionMetadata.example) {
                    result += `\n\nExample:\n  ${functionMetadata.example}`;
                }

                // Automatically print the result
                console.log(result);
                return result;
            } else {
                // It's a module name - show module metadata
                const moduleMetadata = this.environment.moduleMetadata.get(name);
                if (!moduleMetadata) {
                    const errorMsg = `No documentation available for module: ${name}`;
                    console.log(errorMsg);
                    return errorMsg;
                }

                // Format the module metadata as a readable string
                let result = `Module: ${name}\n\n`;
                result += `Description: ${moduleMetadata.description}\n\n`;
                
                if (moduleMetadata.methods && moduleMetadata.methods.length > 0) {
                    result += `Available Methods:\n`;
                    for (const method of moduleMetadata.methods) {
                        result += `  - ${method}\n`;
                    }
                } else {
                    result += `Available Methods: None\n`;
                }

                // Automatically print the result
                console.log(result);
                return result;
            }
        });
    }

    /**
     * Native modules registry
     * Add new modules here to auto-load them
     */
    private static readonly NATIVE_MODULES: ModuleAdapter[] = [
        CoreModule,
        MathModule,
        StringModule,
        JsonModule,
        ObjectModule,
        TimeModule,
        RandomModule,
        ArrayModule,
        FetchModule,
        TestModule
    ];

    /**
     * Load a single module using the adapter pattern
     */
    private loadModule(module: ModuleAdapter): void {
        // Register all module functions
        this.registerModule(module.name, module.functions);
        
        // Register function metadata
        this.registerModuleMeta(module.name, module.functionMetadata);
        
        // Register module-level metadata
        this.registerModuleInfo(module.name, module.moduleMetadata);
        
        // If global is true, also register functions as builtins (without module prefix)
        // This allows calling them directly: add 5 5 instead of math.add 5 5
        if (module.global === true) {
            for (const [funcName, funcHandler] of Object.entries(module.functions)) {
                // Only register if not already registered (avoid conflicts with existing builtins)
                if (!this.environment.builtins.has(funcName)) {
                    this.environment.builtins.set(funcName, funcHandler);
                }
            }
            
            // Also register metadata for global functions without module prefix
            // This allows getFunctionMetadata('add') to work, not just getFunctionMetadata('math.add')
            for (const [funcName, metadata] of Object.entries(module.functionMetadata || {})) {
                // Only register if not already registered (avoid conflicts with existing metadata)
                if (!this.environment.metadata.has(funcName)) {
                    this.environment.metadata.set(funcName, metadata);
                }
            }
        }
    }

    /**
     * Load all native modules
     */
    private loadNativeModules(): void {
        for (const module of RobinPath.NATIVE_MODULES) {
            this.loadModule(module);
        }
    }

    /**
     * Register a builtin function
     */
    registerBuiltin(name: string, handler: BuiltinHandler): void {
        this.environment.builtins.set(name, handler);
    }

    /**
     * Register a module with multiple functions
     * @example
     * rp.registerModule('fs', {
     *   read: (args) => { ... },
     *   write: (args) => { ... }
     * });
     */
    registerModule(moduleName: string, functions: Record<string, BuiltinHandler>): void {
        for (const [funcName, handler] of Object.entries(functions)) {
            this.environment.builtins.set(`${moduleName}.${funcName}`, handler);
        }
    }

    /**
     * Register a module function (e.g., 'fs.read')
     */
    registerModuleFunction(module: string, func: string, handler: BuiltinHandler): void {
        this.environment.builtins.set(`${module}.${func}`, handler);
    }

    /**
     * Register an external class constructor (e.g., 'Client', 'Database')
     */
    registerConstructor(name: string, handler: BuiltinHandler): void {
        this.environment.builtins.set(name, handler);
    }

    /**
     * Register metadata for a module with multiple functions
     * @example
     * rp.registerModuleMeta('fs', {
     *   read: {
     *     description: 'Reads a file from the filesystem',
     *     parameters: [
     *       {
     *         name: 'filename',
     *         dataType: 'string',
     *         description: 'Path to the file to read',
     *         formInputType: 'text',
     *         required: true
     *       }
     *     ],
     *     returnType: 'string',
     *     returnDescription: 'Contents of the file'
     *   },
     *   write: {
     *     description: 'Writes content to a file',
     *     parameters: [
     *       {
     *         name: 'filename',
     *         dataType: 'string',
     *         description: 'Path to the file to write',
     *         formInputType: 'text',
     *         required: true
     *       },
     *       {
     *         name: 'content',
     *         dataType: 'string',
     *         description: 'Content to write to the file',
     *         formInputType: 'textarea',
     *         required: true
     *       }
     *     ],
     *     returnType: 'boolean',
     *     returnDescription: 'True if write was successful'
     *   }
     * });
     */
    registerModuleMeta(moduleName: string, functions: Record<string, FunctionMetadata>): void {
        for (const [funcName, metadata] of Object.entries(functions)) {
            this.environment.metadata.set(`${moduleName}.${funcName}`, metadata);
        }
    }

    /**
     * Register metadata for a single module function (e.g., 'fs.read')
     * @example
     * rp.registerModuleFunctionMeta('fs', 'read', {
     *   description: 'Reads a file from the filesystem',
     *   parameters: [
     *     {
     *       name: 'filename',
     *       dataType: 'string',
     *       description: 'Path to the file to read',
     *       formInputType: 'text',
     *       required: true
     *     }
     *   ],
     *   returnType: 'string',
     *   returnDescription: 'Contents of the file'
     * });
     */
    registerModuleFunctionMeta(module: string, func: string, metadata: FunctionMetadata): void {
        this.environment.metadata.set(`${module}.${func}`, metadata);
    }

    /**
     * Get metadata for a function (builtin or module function)
     * Returns null if no metadata is registered
     */
    getFunctionMetadata(functionName: string): FunctionMetadata | null {
        return this.environment.metadata.get(functionName) ?? null;
    }

    /**
     * Get all registered function metadata
     */
    getAllFunctionMetadata(): Map<string, FunctionMetadata> {
        return new Map(this.environment.metadata);
    }

    /**
     * Register module-level metadata (description and list of methods)
     * @example
     * rp.registerModuleInfo('fs', {
     *   description: 'File system operations for reading and writing files',
     *   methods: ['read', 'write', 'exists', 'delete']
     * });
     */
    registerModuleInfo(moduleName: string, metadata: ModuleMetadata): void {
        this.environment.moduleMetadata.set(moduleName, metadata);
    }

    /**
     * Get module metadata (description and methods list)
     * Returns null if no metadata is registered
     */
    getModuleInfo(moduleName: string): ModuleMetadata | null {
        return this.environment.moduleMetadata.get(moduleName) ?? null;
    }

    /**
     * Get all registered module metadata
     */
    getAllModuleInfo(): Map<string, ModuleMetadata> {
        return new Map(this.environment.moduleMetadata);
    }

    /**
     * Get syntax context for available commands
     * Determines what commands are valid based on the current syntax position
     */
    private getSyntaxContext(context?: {
        inIfBlock?: boolean;
        inDefBlock?: boolean;
        afterIf?: boolean;
        afterDef?: boolean;
        afterElseif?: boolean;
    }): {
        canStartStatement: boolean;
        canUseBlockKeywords: boolean;
        canUseEndKeywords: boolean;
        canUseConditionalKeywords: boolean;
    } {
        const ctx = context || {};
        
        return {
            // Can start a new statement (commands, assignments, etc.)
            canStartStatement: !ctx.afterIf && !ctx.afterDef && !ctx.afterElseif,
            
            // Can use block keywords (if, def)
            canUseBlockKeywords: !ctx.inIfBlock && !ctx.inDefBlock,
            
            // Can use end keywords (endif, enddef)
            canUseEndKeywords: !!(ctx.inIfBlock || ctx.inDefBlock),
            
            // Can use conditional keywords (elseif, else)
            canUseConditionalKeywords: !!ctx.inIfBlock
        };
    }

    /**
     * Get all available commands, modules, and functions
     * Returns a structured object with categories, each containing objects with:
     * - name: The command/function name
     * - type: The type (native, builtin, module, moduleFunction, userFunction)
     * - description: Description if available
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
        const syntaxCtx = this.getSyntaxContext(context);
        // Native commands (language keywords) - filtered by syntax context
        const allNativeCommands: { [key: string]: string } = {
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
        
        const native: Array<{ name: string; type: string; description: string }> = [];
        
        // Add block-starting keywords if allowed
        if (syntaxCtx.canUseBlockKeywords) {
            if (allNativeCommands['if']) {
                native.push({ name: 'if', type: 'native', description: allNativeCommands['if'] });
            }
            if (allNativeCommands['def']) {
                native.push({ name: 'def', type: 'native', description: allNativeCommands['def'] });
            }
            if (allNativeCommands['scope']) {
                native.push({ name: 'scope', type: 'native', description: allNativeCommands['scope'] });
            }
        }
        
        // Add conditional keywords if in if block
        if (syntaxCtx.canUseConditionalKeywords) {
            if (allNativeCommands['elseif']) {
                native.push({ name: 'elseif', type: 'native', description: allNativeCommands['elseif'] });
            }
            if (allNativeCommands['else']) {
                native.push({ name: 'else', type: 'native', description: allNativeCommands['else'] });
            }
        }
        
        // Add end keywords if in a block
        if (syntaxCtx.canUseEndKeywords) {
            if (context?.inIfBlock && allNativeCommands['endif']) {
                native.push({ name: 'endif', type: 'native', description: allNativeCommands['endif'] });
            }
            if (context?.inDefBlock && allNativeCommands['enddef']) {
                native.push({ name: 'enddef', type: 'native', description: allNativeCommands['enddef'] });
            }
            // endscope can be used to close a scope block
            if (allNativeCommands['endscope']) {
                native.push({ name: 'endscope', type: 'native', description: allNativeCommands['endscope'] });
            }
        }
        
        // Add iftrue/iffalse if we can start statements
        if (syntaxCtx.canStartStatement) {
            if (allNativeCommands['iftrue']) {
                native.push({ name: 'iftrue', type: 'native', description: allNativeCommands['iftrue'] });
            }
            if (allNativeCommands['iffalse']) {
                native.push({ name: 'iffalse', type: 'native', description: allNativeCommands['iffalse'] });
            }
        }
        
        // Builtin commands (root level commands, excluding module functions)
        // Only include if we can start statements
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
        
        // Available modules - only show if we can start statements (for "use" command context)
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
        
        // Module functions (module.function format) - only if we can start statements
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
        
        // User-defined functions - only if we can start statements
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
            native,
            builtin,
            modules,
            moduleFunctions,
            userFunctions
        };
    }

    /**
     * Check if a script needs more input (incomplete block)
     * Returns { needsMore: true, waitingFor: 'endif' | 'enddef' | 'endfor' | 'endscope' | 'subexpr' | 'paren' | 'object' | 'array' } if incomplete,
     * or { needsMore: false } if complete.
     */
    needsMoreInput(script: string): { needsMore: boolean; waitingFor?: 'endif' | 'enddef' | 'endfor' | 'endscope' | 'subexpr' | 'paren' | 'object' | 'array' } {
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
            if (errorMessage.includes('missing endscope')) {
                return { needsMore: true, waitingFor: 'endscope' };
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
            return this.serializeStatement(stmt, currentModuleContext);
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
                body: func.body.map((stmt) => this.serializeStatement(stmt))
            };
        });
    }

    /**
     * Find the module name for a given function name
     * Returns the module name if found, null otherwise
     * @param functionName The function name to look up
     * @param currentModuleContext Optional module context from "use" command (for getAST)
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
     * Serialize a statement to JSON without execution state
     * @param stmt The statement to serialize
     * @param currentModuleContext Optional module context from "use" command (for getAST)
     */
    private serializeStatement(stmt: Statement, currentModuleContext?: string | null): any {
        // For comment nodes, don't include codePos - derive from comments array when needed
        const base: any = {
            type: stmt.type,
            lastValue: null
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
                    args: stmt.args.map(arg => this.serializeArg(arg))
                };
            case 'assignment':
                return {
                    ...base,
                    targetName: stmt.targetName,
                    targetPath: stmt.targetPath,
                    command: stmt.command ? this.serializeStatement(stmt.command, currentModuleContext) : undefined,
                    literalValue: stmt.literalValue,
                    literalValueType: stmt.literalValue !== undefined ? this.getValueType(stmt.literalValue) : undefined,
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
                    command: this.serializeStatement(stmt.command, currentModuleContext)
                };
            case 'ifBlock':
                return {
                    ...base,
                    conditionExpr: stmt.conditionExpr,
                    thenBranch: stmt.thenBranch.map(s => this.serializeStatement(s, currentModuleContext)),
                    elseifBranches: stmt.elseifBranches?.map(branch => ({
                        condition: branch.condition,
                        body: branch.body.map(s => this.serializeStatement(s, currentModuleContext))
                    })),
                    elseBranch: stmt.elseBranch?.map(s => this.serializeStatement(s, currentModuleContext))
                };
            case 'ifTrue':
                return {
                    ...base,
                    command: this.serializeStatement(stmt.command, currentModuleContext)
                };
            case 'ifFalse':
                return {
                    ...base,
                    command: this.serializeStatement(stmt.command, currentModuleContext)
                };
            case 'define':
                return {
                    ...base,
                    name: stmt.name,
                    paramNames: stmt.paramNames,
                    body: stmt.body.map(s => this.serializeStatement(s, currentModuleContext))
                };
            case 'scope':
                return {
                    ...base,
                    body: stmt.body.map(s => this.serializeStatement(s, currentModuleContext))
                };
            case 'forLoop':
                return {
                    ...base,
                    varName: stmt.varName,
                    iterableExpr: stmt.iterableExpr,
                    body: stmt.body.map(s => this.serializeStatement(s, currentModuleContext))
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

    /**
     * Attempt to convert a value to a different type
     * @param value The value to convert
     * @param targetType The target type to convert to
     * @returns The converted value, or null if conversion fails
     */
    private convertValueType(value: Value, targetType: 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array'): Value | null {
        // If already the correct type, return as-is
        const currentType = this.getValueType(value);
        if (currentType === targetType) {
            return value;
        }

        try {
            switch (targetType) {
                case 'string':
                    if (value === null) return 'null';
                    if (typeof value === 'object' || Array.isArray(value)) {
                        return JSON.stringify(value);
                    }
                    return String(value);

                case 'number':
                    if (value === null) return null; // null cannot be converted to number
                    if (typeof value === 'boolean') {
                        return value ? 1 : 0;
                    }
                    if (typeof value === 'string') {
                        const parsed = parseFloat(value);
                        if (isNaN(parsed)) {
                            return null; // Conversion failed
                        }
                        return parsed;
                    }
                    if (typeof value === 'number') {
                        return value;
                    }
                    return null; // Cannot convert object/array to number

                case 'boolean':
                    if (value === null) return false;
                    if (typeof value === 'string') {
                        const lower = value.toLowerCase().trim();
                        if (lower === 'true' || lower === '1' || lower === 'yes') return true;
                        if (lower === 'false' || lower === '0' || lower === 'no' || lower === '') return false;
                        return null; // Ambiguous string, conversion failed
                    }
                    if (typeof value === 'number') {
                        return value !== 0 && !isNaN(value);
                    }
                    if (typeof value === 'boolean') {
                        return value;
                    }
                    if (Array.isArray(value)) {
                        return value.length > 0;
                    }
                    if (typeof value === 'object') {
                        return Object.keys(value).length > 0;
                    }
                    return false;

                case 'null':
                    return null;

                case 'array':
                    if (value === null) return [];
                    if (Array.isArray(value)) {
                        return value;
                    }
                    if (typeof value === 'string') {
                        try {
                            const parsed = JSON.parse(value);
                            if (Array.isArray(parsed)) {
                                return parsed;
                            }
                        } catch {
                            // Not valid JSON array, convert string to array of characters
                            return value.split('');
                        }
                    }
                    if (typeof value === 'object') {
                        return Object.values(value);
                    }
                    return [value]; // Wrap primitive in array

                case 'object':
                    if (value === null) return {};
                    if (typeof value === 'object' && !Array.isArray(value)) {
                        return value;
                    }
                    if (typeof value === 'string') {
                        try {
                            const parsed = JSON.parse(value);
                            if (typeof parsed === 'object' && !Array.isArray(parsed)) {
                                return parsed;
                            }
                        } catch {
                            // Not valid JSON object, create object with single property
                            return { value: value };
                        }
                    }
                    if (Array.isArray(value)) {
                        // Convert array to object with numeric keys
                        const obj: Record<string, Value> = {};
                        value.forEach((item, index) => {
                            obj[String(index)] = item;
                        });
                        return obj;
                    }
                    return { value: value }; // Wrap primitive in object

                default:
                    return null;
            }
        } catch {
            return null; // Conversion failed
        }
    }

    /**
     * Convert row/column position to character offset in the script
     * @param script The original script string
     * @param row 0-indexed row number
     * @param col 0-indexed column number (inclusive)
     * @param exclusive If true, returns offset one past the column (for slice end). Default false.
     * @returns Character offset in the script
     */
    private rowColToCharOffset(script: string, row: number, col: number, exclusive: boolean = false): number {
        const lines = script.split('\n');
        let offset = 0;
        
        // Sum up the lengths of all lines before the target row
        for (let i = 0; i < row && i < lines.length; i++) {
            offset += lines[i].length + 1; // +1 for the newline character
        }
        
        // Add the column offset within the target row
        if (row < lines.length) {
            const colOffset = Math.min(col, lines[row].length);
            offset += colOffset;
            // If exclusive, add 1 to point one past the column
            if (exclusive) {
                offset += 1;
            }
        } else {
            // Row doesn't exist, but if exclusive, still add 1
            if (exclusive) {
                offset += 1;
            }
        }
        
        return offset;
    }

    /**
     * Update source code based on AST changes
     * Uses precise character-level positions (codePos.startRow/startCol/endRow/endCol) to update code
     * Nested nodes are reconstructed as part of their parent's code
     * @param originalScript The original source code
     * @param ast The modified AST array (top-level nodes only)
     * @returns Updated source code
     */
    /**
     * Reconstruct comment code from a CommentWithPosition object
     */
    private reconstructCommentCode(comment: CommentWithPosition, indentLevel: number = 0): string {
        // Return empty string if comment text is empty
        if (!comment.text || comment.text.trim() === '') {
            return '';
        }
        const indent = '  '.repeat(indentLevel);
        // Split by \n to handle consecutive comments, add # prefix to each line
        return comment.text.split('\n').map(line => `${indent}# ${line}`).join('\n');
    }

    updateCodeFromAST(originalScript: string, ast: any[]): string {
        const codePositions: Array<{ startOffset: number; endOffset: number; code: string }> = [];

        // Collect all code positions to update
        for (const node of ast) {
            // Handle comment nodes separately - derive codePos from comments array
            if (node.type === 'comment') {
                if (node.comments && Array.isArray(node.comments) && node.comments.length > 0) {
                    // Get the range from first to last comment (including empty comments for deletion)
                    const firstComment = node.comments[0];
                    const lastComment = node.comments[node.comments.length - 1];
                    
                    if (firstComment.codePos && lastComment.codePos) {
                        const commentCode = this.reconstructCodeFromASTNode(node, 0);
                        // Process even if commentCode is empty string (for deletion)
                        if (commentCode !== null) {
                            const startOffset = this.rowColToCharOffset(
                                originalScript,
                                firstComment.codePos.startRow,
                                firstComment.codePos.startCol,
                                false // inclusive
                            );
                            const endOffset = this.rowColToCharOffset(
                                originalScript,
                                lastComment.codePos.endRow,
                                lastComment.codePos.endCol,
                                true // exclusive (one past the end)
                            );

                            codePositions.push({
                                startOffset,
                                endOffset,
                                code: commentCode
                            });
                        }
                    }
                }
                continue; // Skip to next node
            }
            
            // Check if node has comments attached
            // Note: comments can be undefined, empty array [], or array with items
            // Empty array [] explicitly means "remove all comments"
            const hasComments = node.comments && Array.isArray(node.comments) && node.comments.length > 0;
            const commentsExplicitlyEmpty = node.comments && Array.isArray(node.comments) && node.comments.length === 0;
            
            // Separate comments above from inline comments
            const commentsAbove: CommentWithPosition[] = [];
            const inlineComments: CommentWithPosition[] = [];
            
            if (hasComments) {
                for (const comment of node.comments) {
                    // Skip empty comments (they should be removed, not processed)
                    if (!comment.text || comment.text.trim() === '') {
                        continue;
                    }
                    // Use inline property if available, otherwise fall back to codePos check
                    if (comment.inline === true) {
                        inlineComments.push(comment);
                    } else {
                        // Comments above are not inline
                        commentsAbove.push(comment);
                    }
                }
            } else if (commentsExplicitlyEmpty) {
                // comments: [] was explicitly set - need to remove existing comments
                // We need to find comments in the original script that are associated with this node
                // Check if there are comments before this node's startRow (comments above)
                const nodeStartRow = node.codePos?.startRow;
                const nodeStartCol = node.codePos?.startCol;
                if (nodeStartRow !== undefined && nodeStartRow >= 0) {
                    const lines = originalScript.split('\n');
                    // Look for comment lines immediately before this node
                    let commentStartRow = -1;
                    let commentEndRow = -1;
                    
                    // Check lines before the node for comments (only check up to 10 lines to avoid removing wrong comments)
                    for (let row = nodeStartRow - 1; row >= Math.max(0, nodeStartRow - 10); row--) {
                        const line = lines[row];
                        const trimmed = line.trim();
                        if (trimmed.startsWith('#')) {
                            if (commentEndRow === -1) {
                                commentEndRow = row;
                            }
                            commentStartRow = row;
                        } else if (trimmed === '') {
                            // Blank line - continue checking (comments can have blank lines between them)
                            continue;
                        } else {
                            // Non-comment, non-blank line - stop looking
                            break;
                        }
                    }
                    
                    // If we found comments above, remove them
                    if (commentStartRow >= 0 && commentEndRow >= 0) {
                        const firstLine = lines[commentStartRow];
                        const lastLine = lines[commentEndRow];
                        const startCol = firstLine.indexOf('#');
                        const endCol = lastLine.length - 1;
                        
                        const startOffset = this.rowColToCharOffset(
                            originalScript,
                            commentStartRow,
                            startCol,
                            false
                        );
                        const endOffset = this.rowColToCharOffset(
                            originalScript,
                            commentEndRow,
                            endCol,
                            true
                        );
                        
                        codePositions.push({
                            startOffset,
                            endOffset,
                            code: '' // Remove the comments
                        });
                    }
                    
                    // Also check for inline comments on the same line as the node
                    // Note: Inline comments are handled in reconstructCodeFromASTNode which won't include them
                    // when comments is empty, but we need to remove them from the original script
                    if (nodeStartRow < lines.length && nodeStartCol !== undefined) {
                        const nodeLine = lines[nodeStartRow];
                        // Look for inline comment pattern: spaces + # + comment text
                        const inlineCommentMatch = nodeLine.match(/(\s+#\s*.+)$/);
                        if (inlineCommentMatch) {
                            const commentStartCol = nodeLine.indexOf('#', nodeStartCol);
                            if (commentStartCol >= 0) {
                                // Remove the inline comment (including leading space before #)
                                const beforeComment = nodeLine.substring(0, commentStartCol).replace(/\s+$/, '');
                                const startOffset = this.rowColToCharOffset(
                                    originalScript,
                                    nodeStartRow,
                                    beforeComment.length,
                                    false
                                );
                                const endOffset = this.rowColToCharOffset(
                                    originalScript,
                                    nodeStartRow,
                                    nodeLine.length,
                                    true
                                );
                                
                                codePositions.push({
                                    startOffset,
                                    endOffset,
                                    code: '' // Remove the inline comment and trailing space
                                });
                            }
                        }
                    }
                }
            }
            
            // Check if comments above would overlap with the statement
            // Note: commentsAbove has already been filtered to exclude empty comments
            let commentsOverlapStatement = false;
            let combinedStartRow = node.codePos.startRow;
            let combinedStartCol = node.codePos.startCol;
            let combinedEndRow = node.codePos.endRow;
            let combinedEndCol = node.codePos.endCol;
            
            if (commentsAbove.length > 0) {
                const firstCommentAbove = commentsAbove[0];
                const lastCommentAbove = commentsAbove[commentsAbove.length - 1];
                
                // Check if comments overlap or are adjacent to the statement
                if (lastCommentAbove.codePos.endRow >= node.codePos.startRow) {
                    commentsOverlapStatement = true;
                    // Merge ranges: from first comment to end of statement (including inline comments)
                    combinedStartRow = firstCommentAbove.codePos.startRow;
                    combinedStartCol = firstCommentAbove.codePos.startCol;
                    combinedEndRow = node.codePos.endRow;
                    combinedEndCol = node.codePos.endCol;
                    
                    // Extend to include inline comments
                    for (const inlineComment of inlineComments) {
                        if (inlineComment.codePos.endCol > combinedEndCol) {
                            combinedEndCol = inlineComment.codePos.endCol;
                        }
                    }
                }
            }
            
            if (commentsOverlapStatement) {
                // Merge comment and statement into a single update
                const reconstructed = this.reconstructCodeFromASTNode(node, 0);
                if (reconstructed !== null) {
                    // Build combined code: comments above + statement
                    // Filter out empty comments before reconstructing
                    const commentCodes = commentsAbove
                        .map(c => this.reconstructCommentCode(c, 0))
                        .filter(code => code !== '');
                    const combinedCode = commentCodes.length > 0 
                        ? [...commentCodes, reconstructed].join('\n')
                        : reconstructed;
                    
                    const startOffset = this.rowColToCharOffset(
                        originalScript,
                        combinedStartRow,
                        combinedStartCol,
                        false // inclusive
                    );
                    const endOffset = this.rowColToCharOffset(
                        originalScript,
                        combinedEndRow,
                        combinedEndCol,
                        true // exclusive (one past the end)
                    );

                    codePositions.push({
                        startOffset,
                        endOffset,
                        code: combinedCode
                    });
                }
            } else {
                // Process comments above separately (no overlap)
                // First, handle empty comments by removing them from the code
                if (hasComments) {
                    for (const comment of node.comments) {
                        // Check if comment is empty (should be removed)
                    if (!comment.text || comment.text.trim() === '') {
                            // This is an empty comment - remove it by replacing with empty string
                            // Only process if it's not inline (inline comments are handled in node reconstruction)
                            if (comment.inline !== true) {
                                const startOffset = this.rowColToCharOffset(
                                    originalScript,
                                    comment.codePos.startRow,
                                    comment.codePos.startCol,
                                    false // inclusive
                                );
                                const endOffset = this.rowColToCharOffset(
                                    originalScript,
                                    comment.codePos.endRow,
                                    comment.codePos.endCol,
                                    true // exclusive (one past the end)
                                );

                                codePositions.push({
                                    startOffset,
                                    endOffset,
                                    code: '' // Empty string removes the comment
                                });
                            }
                        }
                    }
                }
                
                // Now process non-empty comments above
                for (const comment of commentsAbove) {
                    const commentCode = this.reconstructCommentCode(comment, 0);
                    // Skip empty comments (defensive check)
                    if (commentCode === '') {
                        continue;
                    }
                    const startOffset = this.rowColToCharOffset(
                        originalScript,
                        comment.codePos.startRow,
                        comment.codePos.startCol,
                        false // inclusive
                    );
                    const endOffset = this.rowColToCharOffset(
                        originalScript,
                        comment.codePos.endRow,
                        comment.codePos.endCol,
                        true // exclusive (one past the end)
                    );

                    codePositions.push({
                        startOffset,
                        endOffset,
                        code: commentCode
                    });
                }
                
                // Process the node itself (includes inline comments in reconstruction)
                const reconstructed = this.reconstructCodeFromASTNode(node, 0);
                if (reconstructed !== null) {
                    // Calculate the effective range that includes inline comments
                    let effectiveStartRow = node.codePos.startRow;
                    let effectiveStartCol = node.codePos.startCol;
                    let effectiveEndRow = node.codePos.endRow;
                    let effectiveEndCol = node.codePos.endCol;
                    
                    // Extend range to include inline comments
                    for (const comment of inlineComments) {
                        if (comment.codePos.endCol > effectiveEndCol) {
                            effectiveEndCol = comment.codePos.endCol;
                        }
                    }
                    
                    const startOffset = this.rowColToCharOffset(
                        originalScript,
                        effectiveStartRow,
                        effectiveStartCol,
                        false // inclusive
                    );
                    const endOffset = this.rowColToCharOffset(
                        originalScript,
                        effectiveEndRow,
                        effectiveEndCol,
                        true // exclusive (one past the end)
                    );

                    codePositions.push({
                        startOffset,
                        endOffset,
                        code: reconstructed
                    });
                }
            }
        }

        // Sort by start offset (descending) to replace from end to start
        // This prevents character position shifts from affecting subsequent replacements
        codePositions.sort((a, b) => b.startOffset - a.startOffset);

        // Build updated script by replacing from end to start
        let updatedScript = originalScript;
        for (const pos of codePositions) {
            // Replace the exact character range
            updatedScript = 
                updatedScript.slice(0, pos.startOffset) + 
                pos.code + 
                updatedScript.slice(pos.endOffset);
        }

        return updatedScript;
    }

    /**
     * Reconstruct code string from an AST node
     * @param node The AST node (serialized)
     * @param indentLevel Indentation level for nested code
     * @returns Reconstructed code string, or null if cannot be reconstructed
     */
    private reconstructCodeFromASTNode(node: any, indentLevel: number = 0): string | null {
        const indent = '  '.repeat(indentLevel);

        switch (node.type) {
            case 'command': {
                // Special handling for _var command - just output the variable (used for $a = $b assignments)
                if (node.name === '_var' && node.args && node.args.length === 1 && node.args[0].type === 'var') {
                    const varArg = node.args[0];
                    let varCode = '$' + varArg.name;
                    if (varArg.path) {
                        for (const seg of varArg.path) {
                            if (seg.type === 'property') {
                                varCode += '.' + seg.name;
                            } else if (seg.type === 'index') {
                                varCode += '[' + seg.index + ']';
                            }
                        }
                    }
                    return varCode;
                }
                
                // If node.name contains a dot, it already has a module prefix
                // Extract just the command name (after the last dot) if module is set
                let commandName = node.name;
                if (node.module && node.name.includes('.')) {
                    // Remove existing module prefix from name
                    const parts = node.name.split('.');
                    commandName = parts[parts.length - 1];
                }
                const modulePrefix = node.module ? `${node.module}.` : '';
                const argsStr = node.args.map((arg: any) => this.reconstructArgCode(arg)).filter((s: string | null) => s !== null).join(' ');
                let commandCode = `${indent}${modulePrefix}${commandName}${argsStr ? ' ' + argsStr : ''}`;
                
                // Add inline comment if present (comments above are handled separately in updateCodeFromAST)
                if (node.comments && Array.isArray(node.comments)) {
                    const inlineComment = node.comments.find((c: CommentWithPosition) => c.inline === true && c.text && c.text.trim() !== '');
                    if (inlineComment) {
                        commandCode += `  # ${inlineComment.text}`;
                    }
                }
                
                return commandCode;
            }
            case 'assignment': {
                const target = '$' + node.targetName + (node.targetPath?.map((seg: any) => 
                    seg.type === 'property' ? '.' + seg.name : `[${seg.index}]`
                ).join('') || '');
                
                let assignmentCode: string | null = null;
                if (node.command) {
                    const cmdCode = this.reconstructCodeFromASTNode(node.command, 0);
                    assignmentCode = `${indent}${target} = ${cmdCode?.trim() || ''}`;
                } else if (node.literalValue !== undefined) {
                    // Handle type conversion if literalValueType is specified and different from current type
                    let valueToUse: Value = node.literalValue;
                    let typeToUse: 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';
                    const currentType = this.getValueType(node.literalValue);
                    
                    if (node.literalValueType) {
                        if (currentType !== node.literalValueType) {
                            // Attempt type conversion
                            const converted = this.convertValueType(node.literalValue, node.literalValueType);
                            if (converted !== null) {
                                // Conversion successful, use converted value and target type
                                valueToUse = converted;
                                typeToUse = node.literalValueType;
                            } else {
                                // Conversion failed, keep original value and use original type
                                typeToUse = currentType;
                            }
                        } else {
                            // Types match, use target type
                            typeToUse = node.literalValueType;
                        }
                    } else {
                        // No target type specified, use current type
                        typeToUse = currentType;
                    }
                    
                    // Format the value for code output based on the type to use
                    let valueStr: string;
                    if (typeToUse === 'string') {
                        valueStr = `"${String(valueToUse).replace(/"/g, '\\"')}"`;
                    } else if (typeToUse === 'null') {
                        valueStr = 'null';
                    } else if (typeToUse === 'boolean') {
                        valueStr = String(valueToUse);
                    } else if (typeToUse === 'number') {
                        valueStr = String(valueToUse);
                    } else if (typeToUse === 'array' || typeToUse === 'object') {
                        // For arrays and objects, use JSON.stringify
                        valueStr = JSON.stringify(valueToUse);
                    } else {
                        // Fallback
                        valueStr = typeof valueToUse === 'string' ? `"${valueToUse}"` : String(valueToUse);
                    }
                    
                    assignmentCode = `${indent}${target} = ${valueStr}`;
                } else if (node.isLastValue) {
                    assignmentCode = `${indent}${target} = $`;
                }
                
                // Add inline comment if present (comments above are handled separately in updateCodeFromAST)
                if (assignmentCode && node.comments && Array.isArray(node.comments)) {
                    const inlineComment = node.comments.find((c: CommentWithPosition) => c.inline === true && c.text && c.text.trim() !== '');
                    if (inlineComment) {
                        assignmentCode += `  # ${inlineComment.text}`;
                    }
                }
                
                return assignmentCode;
            }
            case 'shorthand':
                return `${indent}$${node.targetName} = $`;
            case 'inlineIf': {
                const cmdCode = this.reconstructCodeFromASTNode(node.command, 0);
                return `${indent}if ${node.conditionExpr} ${cmdCode?.trim() || ''}`;
            }
            case 'ifBlock': {
                const parts: string[] = [];
                parts.push(`${indent}if ${node.conditionExpr}`);
                
                if (node.thenBranch) {
                    for (const stmt of node.thenBranch) {
                        const stmtCode = this.reconstructCodeFromASTNode(stmt, indentLevel + 1);
                        if (stmtCode) parts.push(stmtCode);
                    }
                }
                
                if (node.elseifBranches) {
                    for (const branch of node.elseifBranches) {
                        parts.push(`${indent}elseif ${branch.condition}`);
                        for (const stmt of branch.body) {
                            const stmtCode = this.reconstructCodeFromASTNode(stmt, indentLevel + 1);
                            if (stmtCode) parts.push(stmtCode);
                        }
                    }
                }
                
                if (node.elseBranch) {
                    parts.push(`${indent}else`);
                    for (const stmt of node.elseBranch) {
                        const stmtCode = this.reconstructCodeFromASTNode(stmt, indentLevel + 1);
                        if (stmtCode) parts.push(stmtCode);
                    }
                }
                
                parts.push(`${indent}endif`);
                return parts.join('\n');
            }
            case 'ifTrue': {
                const cmdCode = this.reconstructCodeFromASTNode(node.command, 0);
                return `${indent}iftrue ${cmdCode?.trim() || ''}`;
            }
            case 'ifFalse': {
                const cmdCode = this.reconstructCodeFromASTNode(node.command, 0);
                return `${indent}iffalse ${cmdCode?.trim() || ''}`;
            }
            case 'define': {
                const params = node.paramNames.join(' ');
                const parts: string[] = [`${indent}def ${node.name}${params ? ' ' + params : ''}`];
                
                if (node.body) {
                    for (const stmt of node.body) {
                        const stmtCode = this.reconstructCodeFromASTNode(stmt, indentLevel + 1);
                        if (stmtCode) parts.push(stmtCode);
                    }
                }
                
                parts.push(`${indent}enddef`);
                return parts.join('\n');
            }
            case 'scope': {
                const parts: string[] = [`${indent}scope`];
                
                if (node.body) {
                    for (const stmt of node.body) {
                        const stmtCode = this.reconstructCodeFromASTNode(stmt, indentLevel + 1);
                        if (stmtCode) parts.push(stmtCode);
                    }
                }
                
                parts.push(`${indent}endscope`);
                return parts.join('\n');
            }
            case 'forLoop': {
                const parts: string[] = [`${indent}for $${node.varName} in ${node.iterableExpr}`];
                
                if (node.body) {
                    for (const stmt of node.body) {
                        const stmtCode = this.reconstructCodeFromASTNode(stmt, indentLevel + 1);
                        if (stmtCode) parts.push(stmtCode);
                    }
                }
                
                parts.push(`${indent}endfor`);
                return parts.join('\n');
            }
            case 'return': {
                if (node.value) {
                    const valueCode = this.reconstructArgCode(node.value);
                    return `${indent}return ${valueCode || ''}`;
                }
                return `${indent}return`;
            }
            case 'break':
                return `${indent}break`;
            case 'comment': {
                if (node.comments && Array.isArray(node.comments)) {
                    // Filter out empty comments and process non-empty ones
                    const nonEmptyComments = node.comments.filter((c: CommentWithPosition) => c.text && c.text.trim() !== '');
                    if (nonEmptyComments.length === 0) {
                        // All comments are empty - return empty string to remove the comment
                        return '';
                    }
                    // Each comment may contain \n for consecutive comments
                    return nonEmptyComments.map((c: CommentWithPosition) => {
                        // Split by \n and add # prefix to each line
                        return c.text.split('\n').map(line => `${indent}# ${line}`).join('\n');
                    }).join('\n');
                }
                return null;
            }
            default:
                return null;
        }
    }

    /**
     * Reconstruct code string from an Arg object
     */
    private reconstructArgCode(arg: any): string | null {
        if (!arg) return null;

        switch (arg.type) {
            case 'var': {
                let result = '$' + arg.name;
                if (arg.path) {
                    for (const seg of arg.path) {
                        if (seg.type === 'property') {
                            result += '.' + seg.name;
                        } else if (seg.type === 'index') {
                            result += '[' + seg.index + ']';
                        }
                    }
                }
                return result;
            }
            case 'string':
                return `"${arg.value}"`;
            case 'number':
                return String(arg.value);
            case 'literal':
                return String(arg.value);
            case 'lastValue':
                return '$';
            case 'subexpr':
                return `$(${arg.code || ''})`;
            case 'object':
                return `{${arg.code || ''}}`;
            case 'array':
                return `[${arg.code || ''}]`;
            case 'namedArgs': {
                const pairs: string[] = [];
                for (const [key, valueArg] of Object.entries(arg.args || {})) {
                    const valueCode = this.reconstructArgCode(valueArg as any);
                    if (valueCode !== null) {
                        pairs.push(`${key}=${valueCode}`);
                    }
                }
                return pairs.join(' ');
            }
            default:
                return null;
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
     * Execute a RobinPath script
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
        
        const executor = new Executor(this.environment, null);
        this.lastExecutor = executor;
        const result = await executor.execute(statements);
        return result;
    }

    /**
     * Execute a single line (for REPL)
     * Uses a persistent executor to maintain state ($, variables) between calls.
     * Functions and builtins persist across calls.
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
        
        if (!this.persistentExecutor) {
            this.persistentExecutor = new Executor(this.environment, null);
        }
        
        this.lastExecutor = this.persistentExecutor;
        const result = await this.persistentExecutor.execute(statements);
        return result;
    }

    /**
     * Get the last value ($)
     * Returns the value from the most recent execution (script or REPL line).
     */
    getLastValue(): Value {
        if (this.lastExecutor) {
            return this.lastExecutor.getCurrentFrame().lastValue;
        }
        return null;
    }

    /**
     * REPL-friendly execution that supports multi-line blocks (if/def/for and $( ... )).
     * 
     * Usage pattern:
     *  - Call this for every user-entered line.
     *  - If done === false, keep collecting lines.
     *  - When done === true, value is the execution result and the buffer is cleared.
     */
    async executeReplLine(line: string): Promise<{ done: boolean; value: Value | null; waitingFor?: string }> {
        // Append the new line to the buffer (with newline if needed)
        this.replBuffer = this.replBuffer
            ? this.replBuffer + '\n' + line
            : line;

        // Ask if the accumulated buffer is syntactically complete
        const more = this.needsMoreInput(this.replBuffer);

        if (more.needsMore) {
            // Not ready yet – tell caller to keep reading input
            return { done: false, value: null, waitingFor: more.waitingFor };
        }

        // The block is complete – execute it as a script
        const result = await this.executeScript(this.replBuffer);

        // Clear buffer for the next block
        this.replBuffer = '';

        return { done: true, value: result };
    }

    /**
     * Generate a UUID v4
     */
    private generateUUID(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Create a new thread/session.
     * Each thread has its own variables, functions, and $,
     * but shares builtins and metadata with the root interpreter.
     * 
     * @param id Optional thread ID. If not provided, a UUID will be generated.
     * @returns The created thread
     * 
     * @example
     * const rp = new RobinPath();
     * const thread = rp.createThread('my-thread');
     * await thread.executeScript('math.add 5 5');
     * console.log(thread.getLastValue()); // 10
     */
    createThread(id?: string): RobinPathThread {
        const threadId = id || this.generateUUID();
        
        // Check if thread with this ID already exists
        if (this.threads.has(threadId)) {
            throw new Error(`Thread with ID "${threadId}" already exists`);
        }
        
        const thread = new RobinPathThread(this.environment, threadId, this);
        this.threads.set(threadId, thread);
        
        // Set as current thread if no current thread exists
        if (!this.currentThread) {
            this.currentThread = thread;
        }
        
        return thread;
    }

    /**
     * Get a thread by ID
     */
    getThread(id: string): RobinPathThread | null {
        return this.threads.get(id) ?? null;
    }

    /**
     * List all threads with their IDs
     */
    listThreads(): Array<{ id: string; isCurrent: boolean }> {
        const threads: Array<{ id: string; isCurrent: boolean }> = [];
        for (const [id, thread] of this.threads.entries()) {
            threads.push({
                id,
                isCurrent: thread === this.currentThread
            });
        }
        return threads;
    }

    /**
     * Switch to a different thread
     */
    useThread(id: string): void {
        const thread = this.threads.get(id);
        if (!thread) {
            throw new Error(`Thread with ID "${id}" not found`);
        }
        this.currentThread = thread;
    }

    /**
     * Get the current thread
     */
    getCurrentThread(): RobinPathThread | null {
        return this.currentThread;
    }

    /**
     * Check if thread control is enabled
     */
    isThreadControlEnabled(): boolean {
        return this.threadControl;
    }

    /**
     * Close a thread by ID
     * If the closed thread is the current thread, currentThread is set to null
     */
    closeThread(id: string): void {
        const thread = this.threads.get(id);
        if (!thread) {
            throw new Error(`Thread with ID "${id}" not found`);
        }
        
        // If this is the current thread, clear currentThread
        if (this.currentThread === thread) {
            this.currentThread = null;
        }
        
        // Remove from threads map
        this.threads.delete(id);
    }

    /**
     * Get a variable value
     */
    getVariable(name: string): Value {
        return this.environment.variables.get(name) ?? null;
    }

    /**
     * Set a variable value (for external use)
     */
    setVariable(name: string, value: Value): void {
        this.environment.variables.set(name, value);
    }

    /**
     * Get the next statement index that would execute after a given statement.
     * This method analyzes the AST structure to determine execution flow.
     * 
     * @param statements The array of all statements
     * @param currentIndex The index of the current statement
     * @param context Optional context for conditional branches (which branch was taken)
     * @returns The index of the next statement to execute, or -1 if execution ends
     */
    getNextStatementIndex(
        statements: Statement[],
        currentIndex: number,
        context?: { ifBlockBranch?: 'then' | 'elseif' | 'else' | null; forLoopIteration?: number }
    ): number {
        if (currentIndex < 0 || currentIndex >= statements.length) {
            return -1;
        }

        const currentStmt = statements[currentIndex];

        // Handle return statements - execution stops
        if (currentStmt.type === 'return') {
            return -1;
        }

        // Handle comments - next is the next statement
        if (currentStmt.type === 'comment') {
            return currentIndex + 1 < statements.length ? currentIndex + 1 : -1;
        }

        // Handle ifBlock - next depends on which branch executes
        if (currentStmt.type === 'ifBlock') {
            const branch = context?.ifBlockBranch;
            
            // If we know which branch was taken, find the last statement in that branch
            if (branch === 'then' && currentStmt.thenBranch && currentStmt.thenBranch.length > 0) {
                // After then branch, next is the statement after the ifBlock
                return currentIndex + 1 < statements.length ? currentIndex + 1 : -1;
            }
            
            if (branch === 'elseif' && currentStmt.elseifBranches) {
                // After elseif branch, next is the statement after the ifBlock
                return currentIndex + 1 < statements.length ? currentIndex + 1 : -1;
            }
            
            if (branch === 'else' && currentStmt.elseBranch && currentStmt.elseBranch.length > 0) {
                // After else branch, next is the statement after the ifBlock
                return currentIndex + 1 < statements.length ? currentIndex + 1 : -1;
            }
            
            // If no branch was taken (condition was false and no else), next is after ifBlock
            if (branch === null) {
                return currentIndex + 1 < statements.length ? currentIndex + 1 : -1;
            }
            
            // Default: if we don't know which branch, assume then branch
            if (currentStmt.thenBranch && currentStmt.thenBranch.length > 0) {
                return currentIndex + 1 < statements.length ? currentIndex + 1 : -1;
            }
            
            // No then branch, check elseif or else
            if (currentStmt.elseifBranches && currentStmt.elseifBranches.length > 0) {
                return currentIndex + 1 < statements.length ? currentIndex + 1 : -1;
            }
            
            if (currentStmt.elseBranch && currentStmt.elseBranch.length > 0) {
                return currentIndex + 1 < statements.length ? currentIndex + 1 : -1;
            }
            
            // No branches, next is after ifBlock
            return currentIndex + 1 < statements.length ? currentIndex + 1 : -1;
        }

        // Handle forLoop - next is first statement in body, then after loop completes, next is after the loop
        if (currentStmt.type === 'forLoop') {
            // If we're at the start of the loop, next is first statement in body
            if (currentStmt.body && currentStmt.body.length > 0) {
                // The body statements are nested, so we need to handle them differently
                // For now, after loop completes, next is after the loop
                return currentIndex + 1 < statements.length ? currentIndex + 1 : -1;
            }
            return currentIndex + 1 < statements.length ? currentIndex + 1 : -1;
        }

        // Handle define - next is after the define (define doesn't execute, just registers)
        if (currentStmt.type === 'define') {
            return currentIndex + 1 < statements.length ? currentIndex + 1 : -1;
        }

        // Handle scope - next is after the scope (scope executes immediately)
        if (currentStmt.type === 'scope') {
            return currentIndex + 1 < statements.length ? currentIndex + 1 : -1;
        }

        // Handle inlineIf - next is after the inlineIf
        if (currentStmt.type === 'inlineIf') {
            return currentIndex + 1 < statements.length ? currentIndex + 1 : -1;
        }

        // Handle ifTrue/ifFalse - next is after the statement
        if (currentStmt.type === 'ifTrue' || currentStmt.type === 'ifFalse') {
            return currentIndex + 1 < statements.length ? currentIndex + 1 : -1;
        }

        // Default: next statement in sequence
        return currentIndex + 1 < statements.length ? currentIndex + 1 : -1;
    }
}
