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

import JSON5 from 'json5';

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

type Value = string | number | boolean | null | object;

interface Environment {
    variables: Map<string, Value>;
    functions: Map<string, DefineFunction>;
    builtins: Map<string, BuiltinHandler>;
    metadata: Map<string, FunctionMetadata>;
    moduleMetadata: Map<string, ModuleMetadata>;
    currentModule: string | null; // Current module context set by "use" command
    variableMetadata: Map<string, Map<string, Value>>; // variable name -> (meta key -> value)
    functionMetadata: Map<string, Map<string, Value>>; // function name -> (meta key -> value)
}

interface Frame {
    locals: Map<string, Value>;
    lastValue: Value;
    isFunctionFrame?: boolean; // True if this frame is from a function (def/enddef), false/undefined if from subexpression
    forgotten?: Set<string>; // Names of variables/functions forgotten in this scope
    isIsolatedScope?: boolean; // True if this frame is from a scope with parameters (isolated, no parent access)
}

export type BuiltinHandler = (args: Value[]) => Value | Promise<Value>;

/**
 * Utility function to extract named arguments from function call arguments.
 * Named arguments are passed as the last argument (an object with string keys).
 * 
 * @param args The arguments array passed to a BuiltinHandler
 * @returns An object with `positionalArgs` (Value[]) and `namedArgs` (Record<string, Value>)
 * 
 * @example
 * ```typescript
 * export const MyFunctions: Record<string, BuiltinHandler> = {
 *   myFunction: (args) => {
 *     const { positionalArgs, namedArgs } = extractNamedArgs(args);
 *     const url = namedArgs.url || positionalArgs[0];
 *     const body = namedArgs.body || positionalArgs[1];
 *     // ... use url and body
 *   }
 * };
 * ```
 */
export function extractNamedArgs(args: Value[]): { positionalArgs: Value[]; namedArgs: Record<string, Value> } {
    const positionalArgs: Value[] = [];
    let namedArgs: Record<string, Value> = {};
    
    if (args.length > 0) {
        const lastArg = args[args.length - 1];
        if (typeof lastArg === 'object' && lastArg !== null && !Array.isArray(lastArg)) {
            // Check if it looks like a named args object (has non-numeric keys)
            const keys = Object.keys(lastArg);
            const hasNonNumericKeys = keys.some(key => !/^\d+$/.test(key));
            if (hasNonNumericKeys && keys.length > 0) {
                // This is a named args object
                namedArgs = lastArg as Record<string, Value>;
                positionalArgs.push(...args.slice(0, -1));
            } else {
                // Regular object passed as positional arg (or empty object)
                positionalArgs.push(...args);
            }
        } else {
            positionalArgs.push(...args);
        }
    }
    
    return { positionalArgs, namedArgs };
}

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

// Attribute access path segment
type AttributePathSegment = 
    | { type: 'property'; name: string }      // .propertyName
    | { type: 'index'; index: number };        // [35]

type Arg = 
    | { type: 'subexpr'; code: string }   // $( ... ) inline subexpression
    | { type: 'var'; name: string; path?: AttributePathSegment[] }  // $var or $var.property or $var[0] or $var.property[0]
    | { type: 'lastValue' }
    | { type: 'literal'; value: Value }
    | { type: 'number'; value: number }
    | { type: 'string'; value: string }
    | { type: 'object'; code: string }    // { ... } object literal
    | { type: 'array'; code: string }     // [ ... ] array literal
    | { type: 'namedArgs'; args: Record<string, Arg> }; // Named arguments object (key=value pairs)

interface CommandCall {
    type: 'command';
    name: string;
    args: Arg[];
}

interface Assignment {
    type: 'assignment';
    targetName: string;
    targetPath?: AttributePathSegment[]; // Path for attribute access assignment (e.g., $animal.cat)
    command?: CommandCall;
    literalValue?: Value;
    isLastValue?: boolean; // True if assignment is from $ (last value)
}

interface ShorthandAssignment {
    type: 'shorthand';
    targetName: string;
}

interface InlineIf {
    type: 'inlineIf';
    conditionExpr: string;
    command: Statement;
}

interface IfBlock {
    type: 'ifBlock';
    conditionExpr: string;
    thenBranch: Statement[];
    elseBranch?: Statement[];
    elseifBranches?: Array<{ condition: string; body: Statement[] }>;
}

interface IfTrue {
    type: 'ifTrue';
    command: Statement;
}

interface IfFalse {
    type: 'ifFalse';
    command: Statement;
}

interface DefineFunction {
    type: 'define';
    name: string;
    paramNames: string[]; // Parameter names (e.g., ['a', 'b', 'c']) - aliases for $1, $2, $3
    body: Statement[];
}

interface ScopeBlock {
    type: 'scope';
    paramNames?: string[]; // Optional parameter names (e.g., ['a', 'b'])
    body: Statement[];
}

interface ForLoop {
    type: 'forLoop';
    varName: string;
    iterableExpr: string;
    body: Statement[];
}

interface ReturnStatement {
    type: 'return';
    value?: Arg; // Optional value to return (if not provided, returns $)
}

interface BreakStatement {
    type: 'break';
}

interface CommentStatement {
    type: 'comment';
    text: string; // Comment text without the #
    lineNumber: number; // Original line number for reference
}

type Statement = 
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

/**
 * Split a script into logical lines, respecting strings, $() subexpressions, and backslash continuation.
 * Treats ; and \n as line separators, but only at the top level (not inside strings or $()).
 * Handles backslash line continuation: lines ending with \ are joined with the next line.
 */
function splitIntoLogicalLines(script: string): string[] {
    // First pass: handle backslash continuation by joining lines
    const processedScript = handleBackslashContinuation(script);
    
    const lines: string[] = [];
    let current = '';
    let inString: false | '"' | "'" | '`' = false;
    let subexprDepth = 0;
    let i = 0;

    while (i < processedScript.length) {
        const char = processedScript[i];
        const nextChar = i + 1 < processedScript.length ? processedScript[i + 1] : '';
        const prevChar = i > 0 ? processedScript[i - 1] : '';

        // Handle strings
        if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
            if (!inString) {
                // Start of string
                inString = char;
                current += char;
            } else if (char === inString) {
                // End of string
                inString = false;
                current += char;
            } else {
                // Different quote type inside string
                current += char;
            }
            i++;
            continue;
        }

        if (inString) {
            // Inside string - just copy characters
            current += char;
            i++;
            continue;
        }

        // Handle $() subexpressions
        if (char === '$' && nextChar === '(') {
            subexprDepth++;
            current += char;
            i++;
            continue;
        }

        if (char === ')' && subexprDepth > 0) {
            subexprDepth--;
            current += char;
            i++;
            continue;
        }

        // Handle line separators (only at top level, not inside $())
        if ((char === '\n' && subexprDepth === 0) || (char === ';' && subexprDepth === 0)) {
            // End of logical line
            if (current.trim()) {
                lines.push(current.trim());
            }
            current = '';
            i++;
            continue;
        }
        
        // If we're inside a subexpression and encounter a newline, preserve it
        if (char === '\n' && subexprDepth > 0) {
            current += char;
            i++;
            continue;
        }

        // Regular character
        current += char;
        i++;
    }

    // Push remaining content
    if (current.trim()) {
        lines.push(current.trim());
    }

    return lines.filter(line => line.length > 0);
}

/**
 * Handle backslash line continuation.
 * Lines ending with \ are joined with the next line, removing the backslash
 * and replacing the newline + leading whitespace with a single space.
 */
function handleBackslashContinuation(script: string): string {
    const lines = script.split('\n');
    const result: string[] = [];
    let i = 0;

    while (i < lines.length) {
        let currentLine = lines[i];
        
        // Check if this line ends with a backslash (ignoring trailing whitespace)
        const trimmed = currentLine.trimEnd();
        if (trimmed.endsWith('\\')) {
            // Remove the trailing backslash and any trailing whitespace
            currentLine = trimmed.slice(0, -1).trimEnd();
            
            // Continue joining next lines until we find one that doesn't end in a backslash
            i++;
            while (i < lines.length) {
                const nextLine = lines[i];
                const nextTrimmed = nextLine.trimEnd();
                
                if (nextTrimmed.endsWith('\\')) {
                    // This line continues too - join it and continue
                    currentLine += ' ' + nextTrimmed.slice(0, -1).trimEnd();
                    i++;
                } else {
                    // This line doesn't end with backslash - join it and stop
                    currentLine += ' ' + nextLine.trimStart();
                    i++;
                    break;
                }
            }
            // i has already been incremented to point to the next unprocessed line
        } else {
            // Line doesn't end with backslash - just move to next line
            i++;
        }
        
        result.push(currentLine);
    }

    return result.join('\n');
}

// ============================================================================
// Lexer
// ============================================================================

class Lexer {
    static tokenize(line: string): string[] {
        const tokens: string[] = [];
        let current = '';
        let inString = false;
        let stringChar = '';
        let i = 0;

        while (i < line.length) {
            const char = line[i];
            const nextChar = i + 1 < line.length ? line[i + 1] : '';

            // Handle comments
            if (!inString && char === '#') {
                break; // Rest of line is comment
            }

            // Handle strings (", ', and `)
            if ((char === '"' || char === "'" || char === '`') && (i === 0 || line[i - 1] !== '\\')) {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                    if (current.trim()) {
                        tokens.push(current.trim());
                        current = '';
                    }
                    current += char;
                } else if (char === stringChar) {
                    inString = false;
                    current += char;
                    tokens.push(current);
                    current = '';
                    stringChar = '';
                } else {
                    current += char;
                }
                i++;
                continue;
            }

            if (inString) {
                current += char;
                i++;
                continue;
            }

            // Handle operators (==, !=, >=, <=, &&, ||)
            if (char === '=' && nextChar === '=') {
                if (current.trim()) {
                    tokens.push(current.trim());
                    current = '';
                }
                tokens.push('==');
                i += 2;
                continue;
            }
            if (char === '!' && nextChar === '=') {
                if (current.trim()) {
                    tokens.push(current.trim());
                    current = '';
                }
                tokens.push('!=');
                i += 2;
                continue;
            }
            if (char === '>' && nextChar === '=') {
                if (current.trim()) {
                    tokens.push(current.trim());
                    current = '';
                }
                tokens.push('>=');
                i += 2;
                continue;
            }
            if (char === '<' && nextChar === '=') {
                if (current.trim()) {
                    tokens.push(current.trim());
                    current = '';
                }
                tokens.push('<=');
                i += 2;
                continue;
            }
            if (char === '&' && nextChar === '&') {
                if (current.trim()) {
                    tokens.push(current.trim());
                    current = '';
                }
                tokens.push('&&');
                i += 2;
                continue;
            }
            if (char === '|' && nextChar === '|') {
                if (current.trim()) {
                    tokens.push(current.trim());
                    current = '';
                }
                tokens.push('||');
                i += 2;
                continue;
            }

            // Handle single character operators and delimiters
            // Note: '.' and '[' ']' are handled specially for attribute access and array indexing
            if (['=', '>', '<', '!', '(', ')', ']'].includes(char)) {
                // Special handling for ']' - it might be part of a variable like $arr[0]
                if (char === ']' && current.trim().startsWith('$')) {
                    // This is part of a variable - keep it in current
                    current += char;
                    i++;
                    continue;
                }
                if (current.trim()) {
                    tokens.push(current.trim());
                    current = '';
                }
                tokens.push(char);
                i++;
                continue;
            }

            // Handle '[' - might be part of variable or standalone
            if (char === '[') {
                // If current starts with $, it's part of a variable
                if (current.trim().startsWith('$')) {
                    current += char;
                    i++;
                    continue;
                }
                // Otherwise, it's a standalone token
                if (current.trim()) {
                    tokens.push(current.trim());
                    current = '';
                }
                tokens.push(char);
                i++;
                continue;
            }

            // Handle '.' - might be part of variable attribute access or decimal number
            if (char === '.') {
                // If current starts with $, it's part of a variable attribute access
                if (current.trim().startsWith('$')) {
                    current += char;
                    i++;
                    continue;
                }
                // If current is a number (starts with digit), check if next char is also a digit
                const currentTrimmed = current.trim();
                if (/^-?\d+$/.test(currentTrimmed)) {
                    // Check if next character is a digit (for decimal numbers)
                    if (i + 1 < line.length && /\d/.test(line[i + 1])) {
                        // This is a decimal number - keep the dot as part of the number
                        current += char;
                        i++;
                        continue;
                    }
                    // If next char is not a digit, this might be end of number (like "3.") or module.function
                    // Push the number and treat . as separate token
                    tokens.push(currentTrimmed);
                    current = '';
                    tokens.push(char);
                    i++;
                    continue;
                }
                // Otherwise, it's a standalone token (for module.function syntax)
                if (current.trim()) {
                    tokens.push(current.trim());
                    current = '';
                }
                tokens.push(char);
                i++;
                continue;
            }

            // Handle whitespace
            if (/\s/.test(char)) {
                if (current.trim()) {
                    tokens.push(current.trim());
                    current = '';
                }
                i++;
                continue;
            }

            current += char;
            i++;
        }

        if (current.trim()) {
            tokens.push(current.trim());
        }

        return tokens.filter(t => t.length > 0);
    }

    static parseString(token: string): string {
        if ((token.startsWith('"') && token.endsWith('"')) || 
            (token.startsWith("'") && token.endsWith("'")) ||
            (token.startsWith('`') && token.endsWith('`'))) {
            const quote = token[0];
            const unquoted = token.slice(1, -1);
            // Handle escape sequences based on quote type
            if (quote === '"') {
                return unquoted.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            } else if (quote === "'") {
                return unquoted.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
            } else if (quote === '`') {
                return unquoted.replace(/\\`/g, '`').replace(/\\\\/g, '\\');
            }
        }
        return token;
    }

    static isString(token: string): boolean {
        return (token.startsWith('"') && token.endsWith('"')) || 
               (token.startsWith("'") && token.endsWith("'")) ||
               (token.startsWith('`') && token.endsWith('`'));
    }

    static isNumber(token: string): boolean {
        // Match integers and decimal numbers
        return /^-?\d+(\.\d+)?$/.test(token);
    }

    static isInteger(token: string): boolean {
        // Match only integers (no decimal point)
        return /^-?\d+$/.test(token);
    }

    static isVariable(token: string): boolean {
        // Match: 
        // - $var, $var.property, $var[0], $var.property[0], $var.property.subproperty, etc.
        // - $.property, $[0], $.property[0] (last value with attributes)
        if (!token.startsWith('$')) return false;
        
        // Handle $.property or $[index] (last value with attributes)
        if (token.startsWith('$.') || token.startsWith('$[')) {
            // Validate the rest is valid attribute path
            const rest = token.slice(1); // Remove $
            return /^(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d+\])(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d+\])*$/.test(rest);
        }
        
        // Handle regular variables: $var with optional attributes
        return /^\$[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d+\])*$/.test(token);
    }

    /**
     * Parse attribute access path from a variable token
     * Returns the base variable name and path segments
     * If name is empty string, it means the last value ($) with attributes
     */
    static parseVariablePath(token: string): { name: string; path: AttributePathSegment[] } {
        if (!token.startsWith('$')) {
            throw new Error(`Invalid variable token: ${token}`);
        }

        const name = token.slice(1); // Remove $
        const path: AttributePathSegment[] = [];
        
        // Handle $.property or $[index] (last value with attributes)
        if (name.startsWith('.') || name.startsWith('[')) {
            // This is last value with attributes - base name is empty
            let remaining = name;
            
            // Parse path segments (.property or [index])
            while (remaining.length > 0) {
                if (remaining.startsWith('.')) {
                    // Property access: .propertyName
                    const propMatch = remaining.match(/^\.([A-Za-z_][A-Za-z0-9_]*)/);
                    if (!propMatch) {
                        throw new Error(`Invalid property access: ${remaining}`);
                    }
                    path.push({ type: 'property', name: propMatch[1] });
                    remaining = remaining.slice(propMatch[0].length);
                } else if (remaining.startsWith('[')) {
                    // Array index: [number]
                    const indexMatch = remaining.match(/^\[(\d+)\]/);
                    if (!indexMatch) {
                        throw new Error(`Invalid array index: ${remaining}`);
                    }
                    path.push({ type: 'index', index: parseInt(indexMatch[1], 10) });
                    remaining = remaining.slice(indexMatch[0].length);
                } else {
                    throw new Error(`Unexpected character in variable path: ${remaining}`);
                }
            }
            
            return { name: '', path }; // Empty name means last value
        }
        
        // Handle regular variables: $var with optional attributes
        // Extract base variable name (everything before first . or [)
        const baseMatch = name.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
        if (!baseMatch) {
            throw new Error(`Invalid variable name: ${name}`);
        }
        
        const baseName = baseMatch[1];
        let remaining = name.slice(baseName.length);
        
        // Parse path segments (.property or [index])
        while (remaining.length > 0) {
            if (remaining.startsWith('.')) {
                // Property access: .propertyName
                const propMatch = remaining.match(/^\.([A-Za-z_][A-Za-z0-9_]*)/);
                if (!propMatch) {
                    throw new Error(`Invalid property access: ${remaining}`);
                }
                path.push({ type: 'property', name: propMatch[1] });
                remaining = remaining.slice(propMatch[0].length);
            } else if (remaining.startsWith('[')) {
                // Array index: [number]
                const indexMatch = remaining.match(/^\[(\d+)\]/);
                if (!indexMatch) {
                    throw new Error(`Invalid array index: ${remaining}`);
                }
                path.push({ type: 'index', index: parseInt(indexMatch[1], 10) });
                remaining = remaining.slice(indexMatch[0].length);
            } else {
                throw new Error(`Unexpected character in variable path: ${remaining}`);
            }
        }
        
        return { name: baseName, path };
    }

    static isLastValue(token: string): boolean {
        // Match: $, $.property, $[index]
        return token === '$' || token.startsWith('$.') || token.startsWith('$[');
    }

    static isPositionalParam(token: string): boolean {
        return /^\$[0-9]+$/.test(token);
    }
}

// ============================================================================
// Parser
// ============================================================================

class Parser {
    private lines: string[];
    private currentLine: number = 0;

    constructor(lines: string[]) {
        this.lines = lines;
    }

    private getLineContent(lineNumber: number): string {
        if (lineNumber >= 0 && lineNumber < this.lines.length) {
            return this.lines[lineNumber].trim();
        }
        return '';
    }

    private createError(message: string, lineNumber: number): Error {
        const lineContent = this.getLineContent(lineNumber);
        const lineInfo = lineContent ? `\n  Line content: ${lineContent}` : '';
        return new Error(`Line ${lineNumber + 1}: ${message}${lineInfo}`);
    }

    parse(): Statement[] {
        // First pass: extract all def/enddef blocks and mark their line numbers
        const defBlockLines = new Set<number>();
        const extractedFunctions: DefineFunction[] = [];
        let scanLine = 0;
        
        while (scanLine < this.lines.length) {
            const line = this.lines[scanLine].trim();
            
            // Skip empty lines and comments when scanning for def blocks
            if (!line || line.startsWith('#')) {
                scanLine++;
                continue;
            }
            
            const tokens = Lexer.tokenize(line);
            if (tokens.length > 0 && tokens[0] === 'def') {
                // Found a def block - extract it
                const savedCurrentLine = this.currentLine;
                this.currentLine = scanLine;
                const func = this.parseDefine();
                extractedFunctions.push(func);
                
                // Mark all lines in this def block (from def to enddef)
                const startLine = scanLine;
                const endLine = this.currentLine - 1; // parseDefine advances past enddef
                for (let i = startLine; i <= endLine; i++) {
                    defBlockLines.add(i);
                }
                
                scanLine = this.currentLine;
                this.currentLine = savedCurrentLine;
            } else {
                scanLine++;
            }
        }
        
        // Extract nested def blocks from function bodies
        const allExtractedFunctions = [...extractedFunctions];
        const extractNestedDefs = (statements: Statement[]): void => {
            for (const stmt of statements) {
                if (stmt.type === 'define') {
                    // Found a nested def - extract it and remove from parent body
                    allExtractedFunctions.push(stmt);
                    // Note: We'll remove it from the parent body later
                } else if (stmt.type === 'ifBlock') {
                    // Check branches for nested defs
                    if (stmt.thenBranch) extractNestedDefs(stmt.thenBranch);
                    if (stmt.elseifBranches) {
                        for (const branch of stmt.elseifBranches) {
                            extractNestedDefs(branch.body);
                        }
                    }
                    if (stmt.elseBranch) extractNestedDefs(stmt.elseBranch);
                } else if (stmt.type === 'forLoop') {
                    if (stmt.body) extractNestedDefs(stmt.body);
                } else if (stmt.type === 'scope') {
                    if (stmt.body) extractNestedDefs(stmt.body);
                }
            }
        };
        
        // Extract nested defs from already-extracted functions
        for (const func of extractedFunctions) {
            extractNestedDefs(func.body);
        }
        
        // Remove nested def statements from function bodies
        const removeNestedDefs = (statements: Statement[]): Statement[] => {
            return statements.filter(stmt => stmt.type !== 'define');
        };
        
        for (const func of extractedFunctions) {
            func.body = removeNestedDefs(func.body);
            // Also remove nested defs from nested blocks
            func.body = func.body.map(stmt => {
                if (stmt.type === 'ifBlock') {
                    return {
                        ...stmt,
                        thenBranch: stmt.thenBranch ? removeNestedDefs(stmt.thenBranch) : undefined,
                        elseifBranches: stmt.elseifBranches?.map(branch => ({
                            ...branch,
                            body: removeNestedDefs(branch.body)
                        })),
                        elseBranch: stmt.elseBranch ? removeNestedDefs(stmt.elseBranch) : undefined
                    };
                } else if (stmt.type === 'forLoop') {
                    return {
                        ...stmt,
                        body: removeNestedDefs(stmt.body)
                    };
                } else if (stmt.type === 'scope') {
                    return {
                        ...stmt,
                        body: removeNestedDefs(stmt.body)
                    };
                }
                return stmt;
            }) as Statement[];
        }
        
        // Store all extracted functions (including nested ones) for later registration
        (this as any).extractedFunctions = allExtractedFunctions;
        
        // Second pass: parse remaining statements (excluding def blocks)
        this.currentLine = 0;
        const statements: Statement[] = [];
        
        while (this.currentLine < this.lines.length) {
            // Skip lines that are part of def blocks
            if (defBlockLines.has(this.currentLine)) {
                this.currentLine++;
                continue;
            }
            
            const line = this.lines[this.currentLine].trim();
            
            // Skip empty lines
            if (!line) {
                this.currentLine++;
                continue;
            }
            
            // Handle comments
            if (line.startsWith('#')) {
                const commentText = line.slice(1).trim(); // Remove # and trim
                statements.push({
                    type: 'comment',
                    text: commentText,
                    lineNumber: this.currentLine
                });
                this.currentLine++;
                continue;
            }

            const stmt = this.parseStatement();
            if (stmt) {
                statements.push(stmt);
            }
        }

        return statements;
    }
    
    /**
     * Get extracted function definitions (def/enddef blocks) that were parsed separately
     */
    getExtractedFunctions(): DefineFunction[] {
        return (this as any).extractedFunctions || [];
    }

    private parseStatement(): Statement | null {
        if (this.currentLine >= this.lines.length) return null;

        const line = this.lines[this.currentLine].trim();
        if (!line || line.startsWith('#')) {
            this.currentLine++;
            return null;
        }

        const tokens = Lexer.tokenize(line);

        if (tokens.length === 0) {
            this.currentLine++;
            return null;
        }

        // Check for define block
        if (tokens[0] === 'def') {
            return this.parseDefine();
        }

        // Check for scope block
        if (tokens[0] === 'scope') {
            return this.parseScope();
        }

        // Check for for loop
        if (tokens[0] === 'for') {
            return this.parseForLoop();
        }

        // Check for return statement
        if (tokens[0] === 'return') {
            return this.parseReturn();
        }

        // Check for break statement
        if (tokens[0] === 'break') {
            this.currentLine++;
            return { type: 'break' };
        }

        // Check for block if
        if (tokens[0] === 'if' && !tokens.includes('then')) {
            return this.parseIfBlock();
        }

        // Check for inline if
        if (tokens[0] === 'if' && tokens.includes('then')) {
            return this.parseInlineIf();
        }

        // Check for iftrue/iffalse
        if (tokens[0] === 'iftrue') {
            this.currentLine++;
            const restTokens = tokens.slice(1);
            const command = this.parseCommandFromTokens(restTokens);
            return { type: 'ifTrue', command };
        }

        if (tokens[0] === 'iffalse') {
            this.currentLine++;
            const restTokens = tokens.slice(1);
            const command = this.parseCommandFromTokens(restTokens);
            return { type: 'ifFalse', command };
        }

        // Check for assignment
        if (tokens.length >= 3 && Lexer.isVariable(tokens[0]) && tokens[1] === '=') {
            // Parse the target variable name (can include attribute paths like $animal.cat)
            const targetVar = tokens[0];
            const { name: targetName, path: targetPath } = Lexer.parseVariablePath(targetVar);
            const restTokens = tokens.slice(2);
            
            // Check if it's a literal value (number, string, boolean, null, or $)
            if (restTokens.length === 1) {
                const token = restTokens[0].trim(); // Ensure token is trimmed
                if (Lexer.isLastValue(token)) {
                    // Special case: $var = $ means assign last value
                    // This is handled by executeAssignment which will use frame.lastValue
                    this.currentLine++;
                    return { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: null, // Will be resolved at execution time from frame.lastValue
                        isLastValue: true
                    };
                } else if (token === 'true') {
                    // Check for boolean true BEFORE checking for variables
                    this.currentLine++;
                    return { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: true 
                    };
                } else if (token === 'false') {
                    // Check for boolean false BEFORE checking for variables
                    this.currentLine++;
                    return { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: false 
                    };
                } else if (token === 'null') {
                    // Check for null BEFORE checking for variables
                    this.currentLine++;
                    return { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: null 
                    };
                } else if (Lexer.isPositionalParam(token)) {
                    // Special case: $var1 = $1 means assign positional param value
                    const varName = token.slice(1);
                    this.currentLine++;
                    return {
                        type: 'assignment',
                        targetName,
                        targetPath,
                        command: {
                            type: 'command',
                            name: '_var', // Special internal command name
                            args: [{ type: 'var', name: varName }]
                        }
                    };
                } else if (Lexer.isVariable(token)) {
                    // Special case: $var1 = $var2 means assign variable value
                    // Create a command that just references the variable
                    const { name: varName, path } = Lexer.parseVariablePath(token);
                    this.currentLine++;
                    return {
                        type: 'assignment',
                        targetName,
                        targetPath,
                        command: {
                            type: 'command',
                            name: '_var', // Special internal command name
                            args: [{ type: 'var', name: varName, path }]
                        }
                    };
                } else if (Lexer.isNumber(token)) {
                    this.currentLine++;
                    return { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: parseFloat(token) 
                    };
                } else if (Lexer.isString(token)) {
                    this.currentLine++;
                    return { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: Lexer.parseString(token) 
                    };
                }
            }
            
            // Check if all remaining tokens are string literals (automatic concatenation)
            // This handles cases like: $var = "hello " "world " "from RobinPath"
            if (restTokens.length > 1 && restTokens.every(token => Lexer.isString(token))) {
                // Concatenate all string literals
                const concatenated = restTokens.map(token => Lexer.parseString(token)).join('');
                this.currentLine++;
                return {
                    type: 'assignment',
                    targetName,
                    targetPath,
                    literalValue: concatenated
                };
            }
            
            // Check if the assignment value is a subexpression $(...), object {...}, or array [...]
            // We need to check the original line because tokenization may have split these incorrectly
            const line = this.lines[this.currentLine];
            const equalsIndex = line.indexOf('=');
            if (equalsIndex !== -1) {
                let pos = equalsIndex + 1;
                // Skip whitespace after "="
                while (pos < line.length && /\s/.test(line[pos])) {
                    pos++;
                }
                // Check if we're at a $( subexpression
                if (pos < line.length - 1 && line[pos] === '$' && line[pos + 1] === '(') {
                    // Extract the subexpression code
                    const subexprCode = this.extractSubexpression(line, pos);
                    this.currentLine++;
                    return {
                        type: 'assignment',
                        targetName,
                        targetPath,
                        command: {
                            type: 'command',
                            name: '_subexpr', // Special internal command name for subexpressions
                            args: [{ type: 'subexpr', code: subexprCode.code }]
                        }
                    };
                }
                // Check if we're at an object literal {
                if (pos < line.length && line[pos] === '{') {
                    const objCode = this.extractObjectLiteral(line, pos);
                    this.currentLine++;
                    return {
                        type: 'assignment',
                        targetName,
                        targetPath,
                        command: {
                            type: 'command',
                            name: '_object',
                            args: [{ type: 'object', code: objCode.code }]
                        }
                    };
                }
                // Check if we're at an array literal [
                if (pos < line.length && line[pos] === '[') {
                    const arrCode = this.extractArrayLiteral(line, pos);
                    this.currentLine++;
                    return {
                        type: 'assignment',
                        targetName,
                        targetPath,
                        command: {
                            type: 'command',
                            name: '_array',
                            args: [{ type: 'array', code: arrCode.code }]
                        }
                    };
                }
            }
            
            // Otherwise, treat as command
            const command = this.parseCommandFromTokens(restTokens);
            this.currentLine++;
            return { type: 'assignment', targetName, targetPath, command };
        }

        // Check if line starts with object or array literal
        const currentLine = this.lines[this.currentLine].trim();
        if (currentLine.startsWith('{')) {
            const objCode = this.extractObjectLiteral(this.lines[this.currentLine], this.lines[this.currentLine].indexOf('{'));
            // extractObjectLiteral sets this.currentLine to the line containing the closing brace
            // We need to move past that line
            this.currentLine++;
            return {
                type: 'command',
                name: '_object', // Special internal command for object literals
                args: [{ type: 'object', code: objCode.code }]
            };
        }
        if (currentLine.startsWith('[')) {
            const arrCode = this.extractArrayLiteral(this.lines[this.currentLine], this.lines[this.currentLine].indexOf('['));
            // extractArrayLiteral sets this.currentLine to the line containing the closing bracket
            // We need to move past that line
            this.currentLine++;
            return {
                type: 'command',
                name: '_array', // Special internal command for array literals
                args: [{ type: 'array', code: arrCode.code }]
            };
        }

        // Check for shorthand assignment or positional param reference
        if (tokens.length === 1) {
            if (Lexer.isVariable(tokens[0])) {
                const targetVar = tokens[0];
                // For shorthand assignment, only allow simple variable names (reading attributes is allowed)
                // If it has a path, it's just a reference, not an assignment
                if (/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(targetVar)) {
                    // Simple variable - shorthand assignment
                    const targetName = targetVar.slice(1);
                this.currentLine++;
                return { type: 'shorthand', targetName };
                } else {
                    // Variable with path - just a reference, treat as no-op (or could be used in expressions)
                    // For now, we'll treat it as a no-op since we can't assign to attributes
                    this.currentLine++;
                    return null;
                }
            } else if (Lexer.isPositionalParam(tokens[0])) {
                // Positional params alone on a line are no-ops (just references)
                // They're used for documentation/clarity in function definitions
                this.currentLine++;
                return { type: 'shorthand', targetName: tokens[0].slice(1) };
            } else if (Lexer.isLastValue(tokens[0])) {
                // Just $ on a line is a no-op (just references the last value, doesn't assign)
                // This is useful in subexpressions or for clarity
                // We'll create a no-op statement by using a comment-like approach
                // Actually, we can just skip it - it's effectively a no-op
                this.currentLine++;
                return null; // No-op statement
            }
        }

        // Check if this is a parenthesized function call: fn(...) or module.fn(...)
        // Look for pattern: identifier followed by '(' OR module.identifier followed by '('
        if ((tokens.length >= 2 && tokens[1] === '(') || 
            (tokens.length >= 4 && tokens[1] === '.' && tokens[3] === '(')) {
            // This is a parenthesized call - parse it specially
            // Note: parseParenthesizedCall already updates this.currentLine via extractParenthesizedContent
            const command = this.parseParenthesizedCall(tokens);
            return command;
        }

        // Regular command
        const command = this.parseCommandFromTokens(tokens);
        this.currentLine++;
        return command;
    }

    /**
     * Parse a parenthesized function call: fn(...)
     * Supports both positional and named arguments (key=value)
     * Handles multi-line calls
     */
    private parseParenthesizedCall(tokens: string[]): CommandCall {
        // Get function name (handle module.function syntax)
        let name: string;
        if (tokens.length >= 4 && tokens[1] === '.' && tokens[3] === '(') {
            // Module function: math.add(...)
            name = `${tokens[0]}.${tokens[2]}`;
        } else if (tokens.length >= 2 && tokens[1] === '(') {
            // Regular function: fn(...)
            name = tokens[0];
        } else {
            throw this.createError('expected ( after function name', this.currentLine);
        }

        // Validate function name
        if (Lexer.isNumber(name)) {
            throw this.createError(`expected command name, got number: ${name}`, this.currentLine);
        }
        if (Lexer.isString(name)) {
            throw this.createError(`expected command name, got string literal: ${name}`, this.currentLine);
        }
        if (Lexer.isVariable(name) || Lexer.isPositionalParam(name)) {
            throw this.createError(`expected command name, got variable: ${name}`, this.currentLine);
        }
        if (Lexer.isLastValue(name)) {
            throw this.createError(`expected command name, got last value reference: ${name}`, this.currentLine);
        }

        // Extract content inside parentheses (handles multi-line)
        const parenContent = this.extractParenthesizedContent();
        
        // Parse arguments from the content
        const { positionalArgs, namedArgs } = this.parseParenthesizedArguments(parenContent);

        // Combine positional args and named args (named args as a special object)
        const args: Arg[] = [...positionalArgs];
        if (Object.keys(namedArgs).length > 0) {
            args.push({ type: 'namedArgs', args: namedArgs });
        }

        return { type: 'command', name, args };
    }

    /**
     * Extract content inside parentheses, handling multi-line calls
     * Returns the inner content (without the parentheses)
     */
    private extractParenthesizedContent(): string {
        const startLine = this.currentLine;
        const line = this.lines[startLine].trim();
        
        // Find the opening parenthesis position
        const openParenIndex = line.indexOf('(');
        if (openParenIndex === -1) {
            throw this.createError('expected (', startLine);
        }

        let pos = openParenIndex + 1;
        let depth = 1;
        let inString: false | '"' | "'" | '`' = false;
        const content: string[] = [];
        let currentLineIndex = startLine;

        while (currentLineIndex < this.lines.length && depth > 0) {
            const currentLine = this.lines[currentLineIndex];
            
            while (pos < currentLine.length && depth > 0) {
                const char = currentLine[pos];
                const prevChar = pos > 0 ? currentLine[pos - 1] : '';

                // Handle strings
                if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
                    if (!inString) {
                        inString = char;
                    } else if (char === inString) {
                        inString = false;
                    }
                    content.push(char);
                    pos++;
                    continue;
                }

                if (inString) {
                    content.push(char);
                    pos++;
                    continue;
                }

                // Handle nested parentheses
                if (char === '(') {
                    depth++;
                    content.push(char);
                } else if (char === ')') {
                    depth--;
                    if (depth > 0) {
                        // This is a closing paren for a nested call
                        content.push(char);
                    }
                    // If depth === 0, we're done - don't include this closing paren
                } else {
                    content.push(char);
                }
                pos++;
            }

            if (depth > 0) {
                // Need to continue on next line
                content.push('\n');
                currentLineIndex++;
                pos = 0;
            }
        }

        if (depth > 0) {
            throw this.createError('unclosed parenthesized function call', startLine);
        }

        // Update currentLine to skip past the line with the closing paren
        this.currentLine = currentLineIndex + 1;

        return content.join('').trim();
    }

    /**
     * Parse arguments from parenthesized content
     * Handles both positional and named arguments (key=value)
     */
    private parseParenthesizedArguments(content: string): { positionalArgs: Arg[]; namedArgs: Record<string, Arg> } {
        const positionalArgs: Arg[] = [];
        const namedArgs: Record<string, Arg> = {};

        if (!content.trim()) {
            return { positionalArgs, namedArgs };
        }

        // Split content into argument tokens
        // Arguments are separated by whitespace (spaces or newlines)
        // But we need to preserve strings and subexpressions
        const argTokens = this.tokenizeParenthesizedArguments(content);

        for (const token of argTokens) {
            // Check if it's a named argument: key=value
            const equalsIndex = token.indexOf('=');
            if (equalsIndex > 0 && equalsIndex < token.length - 1) {
                // Check if = is not inside a string or subexpression
                // Simple check: if token starts with identifier-like chars followed by =, it's named
                const beforeEquals = token.substring(0, equalsIndex).trim();
                const afterEquals = token.substring(equalsIndex + 1).trim();
                
                // Validate key name (must be identifier-like)
                if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(beforeEquals)) {
                    // This is a named argument: key=value
                    const key = beforeEquals;
                    const valueArg = this.parseArgumentValue(afterEquals);
                    namedArgs[key] = valueArg;
                    continue;
                }
            }

            // Positional argument
            const arg = this.parseArgumentValue(token);
            positionalArgs.push(arg);
        }

        return { positionalArgs, namedArgs };
    }

    /**
     * Tokenize arguments from parenthesized content
     * Handles strings, subexpressions, object/array literals, and whitespace separation
     */
    private tokenizeParenthesizedArguments(content: string): string[] {
        const tokens: string[] = [];
        let current = '';
        let inString: false | '"' | "'" | '`' = false;
        let subexprDepth = 0;
        let braceDepth = 0;
        let bracketDepth = 0;
        let i = 0;

        while (i < content.length) {
            const char = content[i];
            const nextChar = i + 1 < content.length ? content[i + 1] : '';
            const prevChar = i > 0 ? content[i - 1] : '';

            // Handle strings
            if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
                if (!inString) {
                    inString = char;
                } else if (char === inString) {
                    inString = false;
                }
                current += char;
                i++;
                continue;
            }

            if (inString) {
                current += char;
                i++;
                continue;
            }

            // Handle $() subexpressions
            if (char === '$' && nextChar === '(') {
                subexprDepth++;
                current += char;
                i++;
                continue;
            }

            if (char === ')' && subexprDepth > 0) {
                subexprDepth--;
                current += char;
                i++;
                continue;
            }

            // Handle object literals { }
            if (char === '{') {
                braceDepth++;
                current += char;
                i++;
                continue;
            }

            if (char === '}' && braceDepth > 0) {
                braceDepth--;
                current += char;
                i++;
                continue;
            }

            // Handle array literals [ ]
            if (char === '[') {
                bracketDepth++;
                current += char;
                i++;
                continue;
            }

            if (char === ']' && bracketDepth > 0) {
                bracketDepth--;
                current += char;
                i++;
                continue;
            }

            // Handle whitespace and commas (only at top level, not inside $(), {}, or [])
            // Commas are optional separators
            if (((char === ' ' || char === '\n' || char === '\t') || char === ',') && 
                subexprDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
                if (current.trim()) {
                    tokens.push(current.trim());
                }
                current = '';
                i++;
                continue;
            }

            current += char;
            i++;
        }

        if (current.trim()) {
            tokens.push(current.trim());
        }

        return tokens.filter(t => t.length > 0);
    }

    /**
     * Parse a single argument value (for both positional and named arguments)
     */
    private parseArgumentValue(token: string): Arg {
        // Check if it's exactly $ (last value without attributes)
        if (token === '$') {
            return { type: 'lastValue' };
        }
        
        // Check if it's a variable
        if (Lexer.isVariable(token)) {
            const { name, path } = Lexer.parseVariablePath(token);
            return { type: 'var', name, path };
        }
        
        // Check if it's a positional param
        if (Lexer.isPositionalParam(token)) {
            return { type: 'var', name: token.slice(1) };
        }
        
        // Check if it's a boolean
        if (token === 'true') {
            return { type: 'literal', value: true };
        }
        if (token === 'false') {
            return { type: 'literal', value: false };
        }
        if (token === 'null') {
            return { type: 'literal', value: null };
        }
        
        // Check if it's a string
        if (Lexer.isString(token)) {
            return { type: 'string', value: Lexer.parseString(token) };
        }
        
        // Check if it's a number
        if (Lexer.isNumber(token)) {
            return { type: 'number', value: parseFloat(token) };
        }
        
        // Check if it's a subexpression $(...)
        if (token.startsWith('$(') && token.endsWith(')')) {
            const code = token.slice(2, -1); // Remove $( and )
            return { type: 'subexpr', code };
        }
        
        // Check if it's an object literal {...}
        if (token.startsWith('{') && token.endsWith('}')) {
            const code = token.slice(1, -1); // Remove { and }
            return { type: 'object', code };
        }
        
        // Check if it's an array literal [...]
        if (token.startsWith('[') && token.endsWith(']')) {
            const code = token.slice(1, -1); // Remove [ and ]
            return { type: 'array', code };
        }
        
        // Treat as literal string
        return { type: 'literal', value: token };
    }

    private parseDefine(): DefineFunction {
        const line = this.lines[this.currentLine].trim();
        const tokens = Lexer.tokenize(line);
        
        if (tokens.length < 2) {
            throw this.createError('def requires a function name', this.currentLine);
        }

        const name = tokens[1];
        
        // Parse parameter names (optional): def fn $a $b $c
        const paramNames: string[] = [];
        for (let i = 2; i < tokens.length; i++) {
            const token = tokens[i];
            // Parameter names must be variables (e.g., $a, $b, $c)
            if (Lexer.isVariable(token) && !Lexer.isPositionalParam(token) && !Lexer.isLastValue(token)) {
                const { name: paramName } = Lexer.parseVariablePath(token);
                if (paramName && /^[A-Za-z_][A-Za-z0-9_]*$/.test(paramName)) {
                    paramNames.push(paramName);
                } else {
                    // Invalid parameter name - stop parsing parameters
                    break;
                }
            } else {
                // Not a valid parameter name - stop parsing parameters
                break;
            }
        }
        
        this.currentLine++;

        const body: Statement[] = [];
        let closed = false;

        while (this.currentLine < this.lines.length) {
            const line = this.lines[this.currentLine].trim();
            
            if (!line) {
                this.currentLine++;
                continue;
            }
            
            // Handle comments
            if (line.startsWith('#')) {
                const commentText = line.slice(1).trim();
                body.push({
                    type: 'comment',
                    text: commentText,
                    lineNumber: this.currentLine
                });
                this.currentLine++;
                continue;
            }

            const tokens = Lexer.tokenize(line);
            
            // If this is our closing enddef, consume it and stop
            if (tokens[0] === 'enddef') {
                this.currentLine++;
                closed = true;
                break;
            }

            // Otherwise, let parseStatement handle it (including nested blocks)
            const stmt = this.parseStatement();
            if (stmt) {
                body.push(stmt);
            }
        }

        if (!closed) {
            throw this.createError('missing enddef', this.currentLine);
        }

        return { type: 'define', name, paramNames, body };
    }

    private parseScope(): ScopeBlock {
        const line = this.lines[this.currentLine].trim();
        const tokens = Lexer.tokenize(line);
        
        // Parse parameter names (optional): scope $a $b
        const paramNames: string[] = [];
        
        // Start from token index 1 (after "scope")
        for (let i = 1; i < tokens.length; i++) {
            const token = tokens[i];
            
            // Parameter names must be variables (e.g., $a, $b, $c)
            if (Lexer.isVariable(token) && !Lexer.isPositionalParam(token) && !Lexer.isLastValue(token)) {
                const { name: paramName } = Lexer.parseVariablePath(token);
                if (paramName && /^[A-Za-z_][A-Za-z0-9_]*$/.test(paramName)) {
                    paramNames.push(paramName);
                } else {
                    // Invalid parameter name - stop parsing parameters
                    break;
                }
            } else {
                // Not a valid parameter name - stop parsing parameters
                break;
            }
        }
        
        this.currentLine++;

        const body: Statement[] = [];
        let closed = false;

        while (this.currentLine < this.lines.length) {
            const line = this.lines[this.currentLine].trim();
            
            if (!line) {
                this.currentLine++;
                continue;
            }
            
            // Handle comments
            if (line.startsWith('#')) {
                const commentText = line.slice(1).trim();
                body.push({
                    type: 'comment',
                    text: commentText,
                    lineNumber: this.currentLine
                });
                this.currentLine++;
                continue;
            }

            const tokens = Lexer.tokenize(line);
            
            // If this is our closing endscope, consume it and stop
            if (tokens[0] === 'endscope') {
                this.currentLine++;
                closed = true;
                break;
            }

            // Otherwise, let parseStatement handle it (including nested blocks)
            const stmt = this.parseStatement();
            if (stmt) {
                body.push(stmt);
            }
        }

        if (!closed) {
            throw this.createError('missing endscope', this.currentLine);
        }

        // If parameters are declared, include them in the scope block
        if (paramNames.length > 0) {
            return { type: 'scope', paramNames, body };
        }
        
        return { type: 'scope', body };
    }

    private parseForLoop(): ForLoop {
        const line = this.lines[this.currentLine].trim();
        const tokens = Lexer.tokenize(line);
        
        // Parse: for $var in <expr>
        if (tokens.length < 4) {
            throw this.createError('for loop requires: for $var in <expr>', this.currentLine);
        }
        
        if (tokens[0] !== 'for') {
            throw this.createError('expected for keyword', this.currentLine);
        }
        
        // Get loop variable
        if (!Lexer.isVariable(tokens[1])) {
            throw this.createError('for loop variable must be a variable (e.g., $i, $item)', this.currentLine);
        }
        const varName = tokens[1].slice(1); // Remove $
        
        if (tokens[2] !== 'in') {
            throw this.createError("for loop requires 'in' keyword", this.currentLine);
        }
        
        // Get iterable expression (everything after 'in')
        const exprTokens = tokens.slice(3);
        const iterableExpr = exprTokens.join(' ');
        
        this.currentLine++;

        const body: Statement[] = [];
        let closed = false;

        while (this.currentLine < this.lines.length) {
            const line = this.lines[this.currentLine].trim();
            
            if (!line) {
                this.currentLine++;
                continue;
            }
            
            // Handle comments
            if (line.startsWith('#')) {
                const commentText = line.slice(1).trim();
                body.push({
                    type: 'comment',
                    text: commentText,
                    lineNumber: this.currentLine
                });
                this.currentLine++;
                continue;
            }

            const tokens = Lexer.tokenize(line);
            
            // If this is our closing endfor, consume it and stop
            if (tokens[0] === 'endfor') {
                this.currentLine++;
                closed = true;
                break;
            }

            // Otherwise, let parseStatement handle it (including nested blocks)
            const stmt = this.parseStatement();
            if (stmt) {
                body.push(stmt);
            }
        }

        if (!closed) {
            throw this.createError('missing endfor', this.currentLine);
        }

        return { type: 'forLoop', varName, iterableExpr, body };
    }

    private parseReturn(): ReturnStatement {
        const line = this.lines[this.currentLine].trim();
        const tokens = Lexer.tokenize(line);
        
        this.currentLine++;
        
        // If there's a value after "return", parse it as an argument
        if (tokens.length > 1) {
            const valueTokens = tokens.slice(1);
            // Parse the value as a single argument
            const arg = this.parseReturnValue(valueTokens);
            return { type: 'return', value: arg };
        }
        
        // No value specified - returns $ (last value)
        return { type: 'return' };
    }

    private parseReturnValue(tokens: string[]): Arg {
        if (tokens.length === 0) {
            return { type: 'lastValue' };
        }
        
        const line = this.lines[this.currentLine - 1]; // Get the original line
        const returnIndex = line.indexOf('return');
        
        // Find the position after "return" in the original line
        const afterReturnStart = returnIndex + 6; // "return" is 6 chars
        let pos = afterReturnStart;
        
        // Skip whitespace after "return"
        while (pos < line.length && /\s/.test(line[pos])) {
            pos++;
        }
        
        // Check if we're at a $( subexpression
        if (pos < line.length - 1 && line[pos] === '$' && line[pos + 1] === '(') {
            const subexprCode = this.extractSubexpression(line, pos);
            return { type: 'subexpr', code: subexprCode.code };
        }
        
        // Otherwise, parse the first token
        const token = tokens[0].trim(); // Ensure token is trimmed
        
        // Check if it's exactly $ (last value without attributes)
        if (token === '$') {
            return { type: 'lastValue' };
        } else if (Lexer.isVariable(token)) {
            // This includes $.property, $[index], $var, $var.property, etc.
            const { name, path } = Lexer.parseVariablePath(token);
            // If name is empty, it means last value with attributes (e.g., $.name)
            if (name === '') {
                return { type: 'var', name: '', path };
            }
            return { type: 'var', name, path };
        } else if (token === 'true') {
            return { type: 'literal', value: true };
        } else if (token === 'false') {
            return { type: 'literal', value: false };
        } else if (token === 'null') {
            return { type: 'literal', value: null };
        } else if (Lexer.isPositionalParam(token)) {
            return { type: 'var', name: token.slice(1) };
        } else if (Lexer.isString(token)) {
            return { type: 'string', value: Lexer.parseString(token) };
        } else if (Lexer.isNumber(token)) {
            return { type: 'number', value: parseFloat(token) };
        } else {
            // Treat as literal
            return { type: 'literal', value: token };
        }
    }

    private parseIfBlock(): IfBlock {
        const line = this.lines[this.currentLine].trim();
        
        // Extract condition (everything after 'if')
        // Use the original line string to preserve subexpressions $(...)
        const ifIndex = line.indexOf('if');
        if (ifIndex === -1) {
            throw this.createError('if statement must start with "if"', this.currentLine);
        }
        // Find the position after "if" and any whitespace
        let conditionStart = ifIndex + 2; // "if" is 2 characters
        while (conditionStart < line.length && /\s/.test(line[conditionStart])) {
            conditionStart++;
        }
        const conditionExpr = line.slice(conditionStart).trim();

        this.currentLine++;

        const thenBranch: Statement[] = [];
        const elseifBranches: Array<{ condition: string; body: Statement[] }> = [];
        let elseBranch: Statement[] | undefined;
        let currentBranch: Statement[] = thenBranch;
        let closed = false;

        while (this.currentLine < this.lines.length) {
            const line = this.lines[this.currentLine].trim();
            
            if (!line) {
                this.currentLine++;
                continue;
            }
            
            // Handle comments
            if (line.startsWith('#')) {
                const commentText = line.slice(1).trim();
                currentBranch.push({
                    type: 'comment',
                    text: commentText,
                    lineNumber: this.currentLine
                });
                this.currentLine++;
                continue;
            }

            const tokens = Lexer.tokenize(line);

            // Handle elseif - switch to new branch
            if (tokens[0] === 'elseif') {
                // Extract condition from original line string to preserve subexpressions $(...)
                const elseifIndex = line.indexOf('elseif');
                if (elseifIndex === -1) {
                    throw this.createError('elseif statement must contain "elseif"', this.currentLine);
                }
                // Find the position after "elseif" and any whitespace
                let conditionStart = elseifIndex + 6; // "elseif" is 6 characters
                while (conditionStart < line.length && /\s/.test(line[conditionStart])) {
                    conditionStart++;
                }
                const condition = line.slice(conditionStart).trim();
                
                elseifBranches.push({ condition, body: [] });
                currentBranch = elseifBranches[elseifBranches.length - 1].body;
                this.currentLine++;
                continue;
            }

            // Handle else - switch to else branch
            if (tokens[0] === 'else') {
                elseBranch = [];
                currentBranch = elseBranch;
                this.currentLine++;
                continue;
            }

            // If this is our closing endif, consume it and stop
            if (tokens[0] === 'endif') {
                this.currentLine++;
                closed = true;
                break;
            }

            // Otherwise, let parseStatement handle it (including nested blocks)
            const stmt = this.parseStatement();
            if (stmt) {
                currentBranch.push(stmt);
            }
        }

        if (!closed) {
            throw this.createError('missing endif', this.currentLine);
        }

        return {
            type: 'ifBlock',
            conditionExpr,
            thenBranch,
            elseifBranches: elseifBranches.length > 0 ? elseifBranches : undefined,
            elseBranch
        };
    }

    private parseInlineIf(): InlineIf {
        const line = this.lines[this.currentLine].trim();
        const tokens = Lexer.tokenize(line);
        
        const thenIndex = tokens.indexOf('then');
        if (thenIndex === -1) {
            throw this.createError("inline if requires 'then'", this.currentLine);
        }

        const conditionTokens = tokens.slice(1, thenIndex);
        const conditionExpr = conditionTokens.join(' ');
        
        const commandTokens = tokens.slice(thenIndex + 1);
        
        // Check if this is an assignment FIRST, before trying to parse as command
        let finalCommand: Statement;
        if (commandTokens.length >= 3 && Lexer.isVariable(commandTokens[0]) && commandTokens[1] === '=') {
            // This is an assignment - parse target with possible attribute path
            const targetVar = commandTokens[0];
            const { name: targetName, path: targetPath } = Lexer.parseVariablePath(targetVar);
            const restTokens = commandTokens.slice(2);
            
            // Check if it's a literal value
            if (restTokens.length === 1) {
                const token = restTokens[0];
                if (Lexer.isNumber(token)) {
                    finalCommand = { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: parseFloat(token) 
                    };
                } else if (Lexer.isString(token)) {
                    finalCommand = { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: Lexer.parseString(token) 
                    };
                } else if (token === 'true') {
                    finalCommand = { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: true 
                    };
                } else if (token === 'false') {
                    finalCommand = { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: false 
                    };
                } else if (token === 'null') {
                    finalCommand = { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: null 
                    };
                } else {
                    const cmd = this.parseCommandFromTokens(restTokens);
                    finalCommand = { type: 'assignment', targetName, targetPath, command: cmd };
                }
            } else {
                const cmd = this.parseCommandFromTokens(restTokens);
                finalCommand = { type: 'assignment', targetName, targetPath, command: cmd };
            }
        } else {
            // Check if it's a break or return statement
            if (commandTokens.length === 1 && commandTokens[0] === 'break') {
                finalCommand = { type: 'break' };
            } else if (commandTokens.length >= 1 && commandTokens[0] === 'return') {
                // Parse return statement
                const returnValueTokens = commandTokens.slice(1);
                if (returnValueTokens.length === 0) {
                    finalCommand = { type: 'return' };
                } else {
                    const returnValue = this.parseReturnValue(returnValueTokens);
                    finalCommand = { type: 'return', value: returnValue };
            }
        } else {
            // Not an assignment, parse as regular command
            finalCommand = this.parseCommandFromTokens(commandTokens);
            }
        }

        this.currentLine++;
        return { type: 'inlineIf', conditionExpr, command: finalCommand };
    }

    private parseCommandFromTokens(tokens: string[]): CommandCall {
        if (tokens.length === 0) {
            throw this.createError('empty command', this.currentLine);
        }

        // Handle module function calls: math.add -> tokens: ["math", ".", "add"]
        // Combine module name and function name if second token is "."
        let name: string;
        let argStartIndex = 1;
        if (tokens.length >= 3 && tokens[1] === '.') {
            // Validate module name doesn't start with a number
            if (/^\d/.test(tokens[0])) {
                throw this.createError(`module name cannot start with a number: ${tokens[0]}`, this.currentLine);
            }
            // Validate function name doesn't start with a number
            if (/^\d/.test(tokens[2])) {
                throw this.createError(`function name cannot start with a number: ${tokens[2]}`, this.currentLine);
            }
            name = `${tokens[0]}.${tokens[2]}`;
            argStartIndex = 3;
        } else {
            name = tokens[0];
            // Validate function name doesn't start with a number
            if (/^\d/.test(name)) {
                throw this.createError(`function name cannot start with a number: ${name}`, this.currentLine);
            }
        }
        
        // Validate that the first token is not a literal number, string, variable, or last value reference
        // (strings should be quoted, numbers should not be command names, variables are not commands, $ is not a command)
        if (Lexer.isNumber(name)) {
            throw this.createError(`expected command name, got number: ${name}`, this.currentLine);
        }
        if (Lexer.isString(name)) {
            throw this.createError(`expected command name, got string literal: ${name}`, this.currentLine);
        }
        if (Lexer.isVariable(name) || Lexer.isPositionalParam(name)) {
            throw this.createError(`expected command name, got variable: ${name}`, this.currentLine);
        }
        if (Lexer.isLastValue(name)) {
            throw this.createError(`expected command name, got last value reference: ${name}`, this.currentLine);
        }
        
        const positionalArgs: Arg[] = [];
        const namedArgs: Record<string, Arg> = {};
        let currentLineIndex = this.currentLine;
        let line = this.lines[currentLineIndex];

        // We need to scan the original line to find $(...) subexpressions
        // because tokenization may have split them incorrectly
        let i = argStartIndex;
        
        // Find the position after the command name in the original line
        // For module functions like "math.add", we need to find the position after the full name
        let nameEndPos: number;
        if (argStartIndex === 3) {
            // Module function: tokens[0] + "." + tokens[2]
            // Find where tokens[0] starts, then calculate end position
            const moduleToken = tokens[0];
            const modulePos = line.indexOf(moduleToken);
            // Calculate end: module name + "." + function name
            nameEndPos = modulePos + moduleToken.length + 1 + tokens[2].length;
        } else {
            // Regular function: just tokens[0]
            nameEndPos = line.indexOf(name) + name.length;
        }
        let pos = nameEndPos;
        
        // Skip whitespace after command name
        while (pos < line.length && /\s/.test(line[pos])) {
            pos++;
        }

        while (i < tokens.length || pos < line.length || currentLineIndex < this.lines.length) {
            // Update line if we've moved to a new line
            if (currentLineIndex !== this.currentLine) {
                currentLineIndex = this.currentLine;
                line = this.lines[currentLineIndex];
                pos = 0;
                // Skip whitespace at start of new line
                while (pos < line.length && /\s/.test(line[pos])) {
                    pos++;
                }
            }
            
            // Check if we're at a $( subexpression in the current line
            if (pos < line.length - 1 && line[pos] === '$' && line[pos + 1] === '(') {
                // Extract the subexpression code
                const subexprCode = this.extractSubexpression(line, pos);
                positionalArgs.push({ type: 'subexpr', code: subexprCode.code });
                
                // Skip past the $() in the current line
                pos = subexprCode.endPos;
                
                // Skip any tokens that were part of this subexpression
                // We'll skip tokens until we find one that starts after our end position
                while (i < tokens.length) {
                    const tokenStart = line.indexOf(tokens[i], pos - 100); // Search from a bit before
                    if (tokenStart === -1 || tokenStart >= pos) {
                        break;
                    }
                    i++;
                }
                
                // Skip whitespace
                while (pos < line.length && /\s/.test(line[pos])) {
                    pos++;
                }
                continue;
            }

            // Check if we're at an object literal { ... }
            if (pos < line.length && line[pos] === '{') {
                const startLineIndex = this.currentLine;
                const objCode = this.extractObjectLiteral(line, pos);
                positionalArgs.push({ type: 'object', code: objCode.code });
                
                // extractObjectLiteral may have advanced this.currentLine if it was multi-line
                // Update our tracking variables
                if (this.currentLine > startLineIndex) {
                    // We've moved to a new line - continue parsing from that line
                    currentLineIndex = this.currentLine;
                    line = this.lines[currentLineIndex];
                    pos = objCode.endPos;
                    // Skip past the closing brace
                    if (pos < line.length && line[pos] === '}') {
                        pos++;
                    }
                    // Re-tokenize the remaining part of this line to get any remaining arguments
                    const remainingLine = line.substring(pos).trim();
                    if (remainingLine) {
                        const remainingTokens = Lexer.tokenize(remainingLine);
                        // Insert remaining tokens at current position
                        tokens.splice(i, 0, ...remainingTokens);
                    }
                } else {
                    pos = objCode.endPos;
                }
                
                // Skip any tokens that were part of this object
                while (i < tokens.length) {
                    const tokenStart = line.indexOf(tokens[i], Math.max(0, pos - 100));
                    if (tokenStart === -1 || tokenStart >= pos) {
                        break;
                    }
                    i++;
                }
                
                // Skip whitespace
                while (pos < line.length && /\s/.test(line[pos])) {
                    pos++;
                }
                continue;
            }

            // Check if we're at an array literal [ ... ]
            if (pos < line.length && line[pos] === '[') {
                const startLineIndex = this.currentLine;
                const arrCode = this.extractArrayLiteral(line, pos);
                positionalArgs.push({ type: 'array', code: arrCode.code });
                
                // extractArrayLiteral may have advanced this.currentLine if it was multi-line
                // Update our tracking variables
                if (this.currentLine > startLineIndex) {
                    // We've moved to a new line - continue parsing from that line
                    currentLineIndex = this.currentLine;
                    line = this.lines[currentLineIndex];
                    pos = arrCode.endPos;
                    // Skip past the closing bracket
                    if (pos < line.length && line[pos] === ']') {
                        pos++;
                    }
                    // Re-tokenize the remaining part of this line to get any remaining arguments
                    const remainingLine = line.substring(pos).trim();
                    if (remainingLine) {
                        const remainingTokens = Lexer.tokenize(remainingLine);
                        // Insert remaining tokens at current position
                        tokens.splice(i, 0, ...remainingTokens);
                    }
                } else {
                    pos = arrCode.endPos;
                }
                
                // Skip any tokens that were part of this array
                while (i < tokens.length) {
                    const tokenStart = line.indexOf(tokens[i], Math.max(0, pos - 100));
                    if (tokenStart === -1 || tokenStart >= pos) {
                        break;
                    }
                    i++;
                }
                
                // Skip whitespace
                while (pos < line.length && /\s/.test(line[pos])) {
                    pos++;
                }
                continue;
            }
            
            // If we've processed all tokens and we're at the end of the current line,
            // check if there are more lines to process (for multi-line commands)
            if (i >= tokens.length && pos >= line.length) {
                // Check if we've moved to a new line due to multi-line literal extraction
                if (currentLineIndex < this.currentLine) {
                    // We've moved ahead, continue from the new line
                    currentLineIndex = this.currentLine;
                    line = this.lines[currentLineIndex];
                    pos = 0;
                    // Re-tokenize the new line to get remaining arguments
                    const remainingTokens = Lexer.tokenize(line);
                    // Add remaining tokens to our processing queue
                    tokens.push(...remainingTokens);
                    // Skip whitespace
                    while (pos < line.length && /\s/.test(line[pos])) {
                        pos++;
                    }
                    continue;
                } else {
                    // No more lines to process
                    break;
                }
            }
            
            // If we've processed all tokens from the original line but there's more content on current line
            if (i >= tokens.length && pos < line.length) {
                // Re-tokenize remaining part of current line
                const remainingLine = line.substring(pos).trim();
                if (remainingLine) {
                    const remainingTokens = Lexer.tokenize(remainingLine);
                    tokens.push(...remainingTokens);
                    // Update pos to end of line to avoid re-processing
                    pos = line.length;
                }
            }
            
            // If we still have no tokens, break
            if (i >= tokens.length) {
                break;
            }
            
            const token = tokens[i];
            
            // Check if this is a named argument: key=value
            const equalsIndex = token.indexOf('=');
            if (equalsIndex > 0 && equalsIndex < token.length - 1 && 
                !token.startsWith('"') && !token.startsWith("'") && !token.startsWith('`')) {
                const key = token.substring(0, equalsIndex).trim();
                const valueStr = token.substring(equalsIndex + 1).trim();
                
                // Validate key name (must be identifier-like)
                if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
                    // This is a named argument: key=value
                    const valueArg = this.parseArgumentValue(valueStr);
                    namedArgs[key] = valueArg;
                    
                    // Advance position
                    const tokenPos = line.indexOf(token, pos);
                    if (tokenPos !== -1) {
                        pos = tokenPos + token.length;
                        while (pos < line.length && /\s/.test(line[pos])) {
                            pos++;
                        }
                    }
                    i++;
                    continue;
                }
            }
            
            // Parse as positional argument
            let arg: Arg;
            if (token === '$') {
                arg = { type: 'lastValue' };
            } else if (Lexer.isVariable(token)) {
                // This includes $.property, $[index], $var, $var.property, etc.
                const { name: varName, path } = Lexer.parseVariablePath(token);
                arg = { type: 'var', name: varName, path };
            } else if (token === 'true') {
                arg = { type: 'literal', value: true };
            } else if (token === 'false') {
                arg = { type: 'literal', value: false };
            } else if (token === 'null') {
                arg = { type: 'literal', value: null };
            } else if (Lexer.isPositionalParam(token)) {
                arg = { type: 'var', name: token.slice(1) };
            } else if (Lexer.isString(token)) {
                arg = { type: 'string', value: Lexer.parseString(token) };
            } else if (Lexer.isNumber(token)) {
                arg = { type: 'number', value: parseFloat(token) };
            } else {
                // Treat as literal string
                arg = { type: 'literal', value: token };
            }
            
            positionalArgs.push(arg);
            
            // Advance position in line (approximate)
            const tokenPos = line.indexOf(token, pos);
            if (tokenPos !== -1) {
                pos = tokenPos + token.length;
                while (pos < line.length && /\s/.test(line[pos])) {
                    pos++;
                }
            }
            
            i++;
        }

        // Combine positional args and named args (named args as a special object)
        const args: Arg[] = [...positionalArgs];
        if (Object.keys(namedArgs).length > 0) {
            args.push({ type: 'namedArgs', args: namedArgs });
        }

        return { type: 'command', name, args };
    }

    /**
     * Extract a $(...) subexpression from a line, starting at the given position.
     * Returns the inner code and the end position.
     * Handles multi-line subexpressions (newlines are preserved in the code).
     */
    private extractSubexpression(line: string, startPos: number): { code: string; endPos: number } {
        // Skip past "$("
        let pos = startPos + 2;
        let depth = 1;
        let inString: false | '"' | "'" | '`' = false;
        const code: string[] = [];
        
        while (pos < line.length && depth > 0) {
            const char = line[pos];
            const prevChar = pos > 0 ? line[pos - 1] : '';
            
            // Handle strings
            if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
                if (!inString) {
                    inString = char;
                } else if (char === inString) {
                    inString = false;
                }
                code.push(char);
                pos++;
                continue;
            }
            
            if (inString) {
                code.push(char);
                pos++;
                continue;
            }
            
            // Handle nested $() subexpressions
            if (char === '$' && pos + 1 < line.length && line[pos + 1] === '(') {
                depth++;
                code.push(char);
                pos++;
                continue;
            }
            
            if (char === ')') {
                depth--;
                if (depth > 0) {
                    // This is a closing paren for a nested subexpr
                    code.push(char);
                }
                // If depth === 0, we're done - don't include this closing paren
                pos++;
                continue;
            }
            
            // Preserve all characters including newlines, spaces, tabs, etc.
            code.push(char);
            pos++;
        }
        
        // If we exited because we reached the end of the line but depth > 0,
        // that means the subexpression spans multiple lines (which should be handled by splitIntoLogicalLines)
        // But if it somehow didn't, we should still return what we have
        if (depth > 0 && pos >= line.length) {
            // This shouldn't happen if splitIntoLogicalLines is working correctly,
            // but we'll handle it gracefully
            throw this.createError(`unclosed subexpression starting at position ${startPos}`, this.currentLine);
        }
        
        return {
            code: code.join(''),
            endPos: pos
        };
    }

    /**
     * Extract object literal { ... } from a line, starting at the given position.
     * Handles nested objects, arrays, and strings.
     * Supports multi-line objects.
     */
    private extractObjectLiteral(line: string, startPos: number): { code: string; endPos: number } {
        // Skip past "{"
        let pos = startPos + 1;
        let braceDepth = 1;
        let bracketDepth = 0; // Track array depth inside object
        let inString: false | '"' | "'" | '`' = false;
        const code: string[] = [];
        let currentLineIndex = this.currentLine;
        
        while (currentLineIndex < this.lines.length && braceDepth > 0) {
            const currentLine = currentLineIndex === this.currentLine ? line : this.lines[currentLineIndex];
            
            while (pos < currentLine.length && braceDepth > 0) {
                const char = currentLine[pos];
                const prevChar = pos > 0 ? currentLine[pos - 1] : '';
                
                // Handle strings
                if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
                    if (!inString) {
                        inString = char;
                    } else if (char === inString) {
                        inString = false;
                    }
                    code.push(char);
                    pos++;
                    continue;
                }
                
                if (inString) {
                    code.push(char);
                    pos++;
                    continue;
                }
                
                // Handle nested objects and arrays
                if (char === '{') {
                    braceDepth++;
                    code.push(char);
                } else if (char === '}') {
                    braceDepth--;
                    if (braceDepth > 0) {
                        code.push(char);
                    }
                    // If braceDepth === 0, we're done - don't include this closing brace
                } else if (char === '[') {
                    bracketDepth++;
                    code.push(char);
                } else if (char === ']') {
                    bracketDepth--;
                    code.push(char);
                } else {
                    code.push(char);
                }
                pos++;
            }
            
            if (braceDepth > 0) {
                // Need to continue on next line
                code.push('\n');
                currentLineIndex++;
                pos = 0;
            }
        }
        
        if (braceDepth > 0) {
            throw this.createError('unclosed object literal', this.currentLine);
        }
        
        // Update currentLine if we moved to a new line
        if (currentLineIndex > this.currentLine) {
            this.currentLine = currentLineIndex;
        }
        
        return {
            code: code.join('').trim(),
            endPos: pos
        };
    }

    /**
     * Extract array literal [ ... ] from a line, starting at the given position.
     * Handles nested arrays, objects, and strings.
     * Supports multi-line arrays.
     */
    private extractArrayLiteral(line: string, startPos: number): { code: string; endPos: number } {
        // Skip past "["
        let pos = startPos + 1;
        let bracketDepth = 1;
        let braceDepth = 0; // Track object depth inside array
        let inString: false | '"' | "'" | '`' = false;
        const code: string[] = [];
        let currentLineIndex = this.currentLine;
        
        while (currentLineIndex < this.lines.length && bracketDepth > 0) {
            const currentLine = currentLineIndex === this.currentLine ? line : this.lines[currentLineIndex];
            
            while (pos < currentLine.length && bracketDepth > 0) {
                const char = currentLine[pos];
                const prevChar = pos > 0 ? currentLine[pos - 1] : '';
                
                // Handle strings
                if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
                    if (!inString) {
                        inString = char;
                    } else if (char === inString) {
                        inString = false;
                    }
                    code.push(char);
                    pos++;
                    continue;
                }
                
                if (inString) {
                    code.push(char);
                    pos++;
                    continue;
                }
                
                // Handle nested arrays and objects
                if (char === '[') {
                    bracketDepth++;
                    code.push(char);
                } else if (char === ']') {
                    bracketDepth--;
                    if (bracketDepth > 0) {
                        code.push(char);
                    }
                    // If bracketDepth === 0, we're done - don't include this closing bracket
                } else if (char === '{') {
                    braceDepth++;
                    code.push(char);
                } else if (char === '}') {
                    braceDepth--;
                    code.push(char);
                } else {
                    code.push(char);
                }
                pos++;
            }
            
            if (bracketDepth > 0) {
                // Need to continue on next line
                code.push('\n');
                currentLineIndex++;
                pos = 0;
            }
        }
        
        if (bracketDepth > 0) {
            throw this.createError('unclosed array literal', this.currentLine);
        }
        
        // Update currentLine if we moved to a new line
        if (currentLineIndex > this.currentLine) {
            this.currentLine = currentLineIndex;
        }
        
        return {
            code: code.join('').trim(),
            endPos: pos
        };
    }
}

// ============================================================================
// Expression Evaluator
// ============================================================================

class ExpressionEvaluator {
    private frame: Frame;
    private globals: Environment;
    private executor: Executor | null;

    constructor(frame: Frame, globals: Environment, executor?: Executor | null) {
        this.frame = frame;
        this.globals = globals;
        this.executor = executor || null;
    }

    async evaluate(expr: string): Promise<boolean> {
        // Simple expression evaluator using JS delegation
        // Replace $ and $var references with actual values
        let jsExpr = expr.trim();

        // First, check if the entire expression is a function call (like "isBigger $value 5" or "test.isBigger $value 5")
        // This handles simple cases where the expression is just a function call
        if (this.executor) {
            const trimmedExpr = expr.trim();
            // Match function names with optional module prefix: "functionName" or "module.functionName"
            const funcCallMatch = trimmedExpr.match(/^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)\s+(.+)$/);
            
            if (funcCallMatch) {
                const funcName = funcCallMatch[1];
                const argsStr = funcCallMatch[2];
                
                // Check if this is a known function (builtin or user-defined)
                if (this.globals.builtins.has(funcName) || this.globals.functions.has(funcName)) {
                    // Execute the function call and return its truthiness
                    const funcResult = await this.executeFunctionCall(funcName, argsStr);
                    return this.isTruthy(funcResult);
                }
            }
        }

        // Evaluate and replace subexpressions $(...) first
        if (this.executor) {
            jsExpr = await this.replaceSubexpressions(jsExpr);
        }

        // Replace $name variables with attribute access (before bare $)
        // Match: $var, $var.property, $var[0], $var.property[0], etc.
        jsExpr = jsExpr.replace(/\$([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d+\])*)/g, (_match, varPath) => {
            try {
                const { name, path } = Lexer.parseVariablePath('$' + varPath);
                const val = this.resolveVariable(name, path);
            return this.valueToJS(val);
            } catch {
                // If parsing fails, return the original match
                return _match;
            }
        });

        // Replace $1, $2, etc. (positional params)
        jsExpr = jsExpr.replace(/\$([0-9]+)/g, (_match, num) => {
            const val = this.frame.locals.get(num) ?? null;
            return this.valueToJS(val);
        });

        // Replace $ (last value) - must be last, and only when not followed by word character
        // Match $ at word boundary but not if followed by letter/digit (which would be a variable)
        jsExpr = jsExpr.replace(/(^|\W)\$(?=\W|$)/g, (_match, prefix) => {
            const val = this.frame.lastValue;
            return prefix + this.valueToJS(val);
        });

        try {
            // Evaluate in a safe context
            const result = this.evalExpression(jsExpr);
            return this.isTruthy(result);
        } catch (error) {
            throw new Error(`Expression evaluation error: ${expr} - ${error}`);
        }
    }

    /**
     * Replace all subexpressions $(...) in an expression string with their evaluated values
     */
    private async replaceSubexpressions(expr: string): Promise<string> {
        if (!this.executor) {
            return expr;
        }

        let result = expr;
        let pos = 0;
        
        while (pos < result.length - 1) {
            // Look for $( pattern
            if (result[pos] === '$' && result[pos + 1] === '(') {
                // Extract the subexpression
                const subexprInfo = this.extractSubexpressionFromString(result, pos);
                if (subexprInfo) {
                    // Evaluate the subexpression
                    const subexprValue = await this.executor.executeSubexpression(subexprInfo.code);
                    const jsValue = this.valueToJS(subexprValue);
                    
                    // Replace the subexpression with its evaluated value
                    result = result.slice(0, pos) + jsValue + result.slice(subexprInfo.endPos);
                    // Continue from after the replacement
                    pos += jsValue.length;
                } else {
                    pos++;
                }
            } else {
                pos++;
            }
        }
        
        return result;
    }

    /**
     * Extract a subexpression $(...) from a string, starting at the given position
     * Returns null if no valid subexpression is found
     */
    private extractSubexpressionFromString(str: string, startPos: number): { code: string; endPos: number } | null {
        if (startPos >= str.length - 1 || str[startPos] !== '$' || str[startPos + 1] !== '(') {
            return null;
        }

        let depth = 0;
        let i = startPos + 2; // Start after "$("
        const code: string[] = [];
        let inString: false | '"' | "'" | '`' = false;
        let escapeNext = false;

        while (i < str.length) {
            const char = str[i];
            
            if (escapeNext) {
                code.push(char);
                escapeNext = false;
                i++;
                continue;
            }

            if (char === '\\' && inString) {
                escapeNext = true;
                code.push(char);
                i++;
                continue;
            }

            // Handle string literals
            if (!inString && (char === '"' || char === "'" || char === '`')) {
                inString = char;
                code.push(char);
                i++;
                continue;
            }

            if (inString && char === inString) {
                inString = false;
                code.push(char);
                i++;
                continue;
            }

            if (inString) {
                code.push(char);
                i++;
                continue;
            }

            // Handle nested $(
            if (char === '$' && i + 1 < str.length && str[i + 1] === '(') {
                depth++;
                code.push(char);
                i++;
                continue;
            }

            // Handle closing )
            if (char === ')') {
                if (depth > 0) {
                    // This is a closing paren for a nested subexpr
                    depth--;
                    code.push(char);
                    i++;
                    continue;
                } else {
                    // This is the closing paren for our subexpression
                    return {
                        code: code.join(''),
                        endPos: i + 1
                    };
                }
            }

            code.push(char);
            i++;
        }

        // If we reach here, the subexpression is unclosed
        return null;
    }

    private async executeFunctionCall(funcName: string, argsStr: string): Promise<Value> {
        if (!this.executor) {
            throw new Error('Executor not available for function call evaluation');
        }
        
        // Parse arguments from the string
        const argTokens = argsStr.trim().split(/\s+/);
        const args: Arg[] = [];
        
        for (const token of argTokens) {
            if (token === '$') {
                args.push({ type: 'lastValue' });
            } else if (Lexer.isPositionalParam(token)) {
                args.push({ type: 'var', name: token.slice(1) });
            } else if (Lexer.isVariable(token)) {
                const { name, path } = Lexer.parseVariablePath(token);
                args.push({ type: 'var', name, path });
            } else if (token === 'true') {
                args.push({ type: 'literal', value: true });
            } else if (token === 'false') {
                args.push({ type: 'literal', value: false });
            } else if (token === 'null') {
                args.push({ type: 'literal', value: null });
            } else if (/^-?\d+$/.test(token)) {
                args.push({ type: 'number', value: parseFloat(token) });
            } else if ((token.startsWith('"') && token.endsWith('"')) || 
                       (token.startsWith("'") && token.endsWith("'"))) {
                args.push({ type: 'string', value: token.slice(1, -1) });
            } else {
                args.push({ type: 'literal', value: token });
            }
        }
        
        // Execute the function call using the executor's public method
        return await this.executor.executeFunctionCall(funcName, args);
    }

    private resolveVariable(name: string, path?: AttributePathSegment[]): Value {
        // Check if variable is forgotten in current scope
        if (this.frame.forgotten && this.frame.forgotten.has(name)) {
            // Variable is forgotten in this scope - return null (as if it doesn't exist)
            return null;
        }
        
        // If this is an isolated scope (has parameters), only check locals
        // Don't access parent scopes or globals
        if (this.frame.isIsolatedScope) {
            let baseValue: Value;
            
            // If name is empty, it means last value ($) with attributes
            if (name === '') {
                baseValue = this.frame.lastValue;
            } else {
                // Only check locals in isolated scope
                if (this.frame.locals.has(name)) {
                    baseValue = this.frame.locals.get(name)!;
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
        
        // If name is empty, it means last value ($) with attributes
        let baseValue: Value;
        if (name === '') {
            baseValue = this.frame.lastValue;
        } else {
        // Check locals first
        if (this.frame.locals.has(name)) {
                baseValue = this.frame.locals.get(name)!;
            } else if (this.globals.variables.has(name)) {
        // Check globals
                baseValue = this.globals.variables.get(name)!;
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

    private valueToJS(val: Value): string {
        if (val === null || val === undefined) {
            return 'null';
        }
        if (typeof val === 'string') {
            return JSON.stringify(val);
        }
        if (typeof val === 'number') {
            return val.toString();
        }
        if (typeof val === 'boolean') {
            return val.toString();
        }
        return JSON.stringify(val);
    }

    private evalExpression(expr: string): any {
        // Simple expression evaluator
        // This is a basic implementation - in production you'd want a proper parser
        try {
            // eslint-disable-next-line no-eval
            return eval(expr);
        } catch {
            // Fallback: try to parse as boolean
            return expr === 'true' || expr === '1';
        }
    }

    private isTruthy(val: any): boolean {
        if (val === null || val === undefined) {
            return false;
        }
        if (typeof val === 'number') {
            return val !== 0;
        }
        if (typeof val === 'string') {
            return val.length > 0;
        }
        if (typeof val === 'boolean') {
            return val;
        }
        return true;
    }
}

// ============================================================================
// Executor
// ============================================================================

/**
 * Special exception used to signal early return from functions or global scope
 */
class ReturnException extends Error {
    value: Value;
    constructor(value: Value) {
        super('Return');
        this.value = value;
        this.name = 'ReturnException';
    }
}

/**
 * Special exception used to signal break from loops
 */
class BreakException extends Error {
    constructor() {
        super('Break');
        this.name = 'BreakException';
    }
}

/**
 * Special exception used to signal end of script execution
 */
class EndException extends Error {
    constructor() {
        super('End');
        this.name = 'EndException';
    }
}

class Executor {
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

    getCurrentFrame(): Frame {
        return this.callStack[this.callStack.length - 1];
    }

    getEnvironment(): Environment {
        return this.environment;
    }

    getCallStack(): Frame[] {
        return this.callStack;
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
        
        // Check if it's a builtin function
        if (this.environment.builtins.has(funcName)) {
            const handler = this.environment.builtins.get(funcName)!;
            const result = await Promise.resolve(async () => {
                return await handler(evaluatedArgs)
            });
            return result !== undefined ? result : null;
        }
        
        // Check if it's a user-defined function
        if (this.environment.functions.has(funcName)) {
            const func = this.environment.functions.get(funcName)!;
            return await this.callFunction(func, evaluatedArgs);
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

    private async executeStatement(stmt: Statement): Promise<void> {
        switch (stmt.type) {
            case 'command':
                await this.executeCommand(stmt);
                break;
            case 'assignment':
                await this.executeAssignment(stmt);
                break;
            case 'shorthand':
                this.executeShorthandAssignment(stmt);
                break;
            case 'inlineIf':
                await this.executeInlineIf(stmt);
                break;
            case 'ifBlock':
                await this.executeIfBlock(stmt);
                break;
            case 'ifTrue':
                await this.executeIfTrue(stmt);
                break;
            case 'ifFalse':
                await this.executeIfFalse(stmt);
                break;
            case 'define':
                this.registerFunction(stmt);
                break;
            case 'scope':
                await this.executeScope(stmt);
                break;
            case 'forLoop':
                await this.executeForLoop(stmt);
                break;
            case 'return':
                await this.executeReturn(stmt);
                break;
            case 'break':
                await this.executeBreak(stmt);
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

    private async executeCommand(cmd: CommandCall): Promise<void> {
        const frame = this.getCurrentFrame();
        
        // Separate positional args and named args
        const positionalArgs: Value[] = [];
        let namedArgsObj: Record<string, Value> | null = null;
        
        for (const arg of cmd.args) {
            if (arg.type === 'namedArgs') {
                // Evaluate named arguments into an object
                namedArgsObj = await this.evaluateArg(arg) as Record<string, Value>;
            } else {
                // Positional argument
                const value = await this.evaluateArg(arg);
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
            const hasMetadata = this.environment.moduleMetadata.has(name);
            const hasFunctions = Array.from(this.environment.builtins.keys()).some(
                key => key.startsWith(`${name}.`)
            );
            
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
                    if (!parent.currentThread) {
                        const errorMsg = 'Error: No current thread to close';
                        console.log(errorMsg);
                        frame.lastValue = errorMsg;
                    } else {
                        const threadId = parent.currentThread.id;
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

        // Special handling for "assign" command - assigns a value to a variable
        if (cmd.name === 'assign') {
            if (cmd.args.length < 2) {
                throw new Error('assign requires at least 2 arguments: variable name and value (optional fallback as 3rd arg)');
            }
            
            // Preserve the last value - assign should not affect $
            const previousLastValue = frame.lastValue;
            
            // Get variable name from first arg (must be a variable reference)
            const varArg = cmd.args[0];
            if (varArg.type !== 'var') {
                throw new Error('assign first argument must be a variable (e.g., $myVar)');
            }
            const varName = varArg.name;
            const varPath = varArg.path; // Support attribute paths (e.g., $user.city)
            
            // Evaluate the second arg as the value to assign
            let value = await this.evaluateArg(cmd.args[1]);
            
            // Check if value is empty or null, and if so, use fallback (3rd arg) if provided
            const isEmpty = value === null || value === undefined || 
                          (typeof value === 'string' && value.trim() === '') ||
                          (Array.isArray(value) && value.length === 0) ||
                          (typeof value === 'object' && Object.keys(value).length === 0);
            
            if (isEmpty && cmd.args.length >= 3) {
                // Use fallback value (3rd argument)
                value = await this.evaluateArg(cmd.args[2]);
            }
            
            // Set the variable (with path support)
            if (varPath && varPath.length > 0) {
                this.setVariableAtPath(varName, varPath, value);
            } else {
            this.setVariable(varName, value);
            }
            
            // Restore the last value - assign command should not affect $
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
            const metaKey = String(await this.evaluateArg(cmd.args[1]));
            
            // Evaluate metaValue (this should be evaluated)
            const metaValue = await this.evaluateArg(cmd.args[2]);

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
                    // Return empty object if no metadata
                    frame.lastValue = {};
                    return;
                }
                
                // If second argument provided, return specific key value
                if (cmd.args.length >= 2) {
                    const metaKey = String(await this.evaluateArg(cmd.args[1]));
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
                    // Return empty object if no metadata
                    frame.lastValue = {};
                    return;
                }
                
                // If second argument provided, return specific key value
                if (cmd.args.length >= 2) {
                    const metaKey = String(await this.evaluateArg(cmd.args[1]));
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
            const value = await this.evaluateArg(varArg);
            
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
                name = String(await this.evaluateArg(nameArg));
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
            const varValue = await this.evaluateArg(varArg);
            
            // Check if value is empty or null
            const isEmpty = varValue === null || varValue === undefined || 
                          (typeof varValue === 'string' && varValue.trim() === '') ||
                          (Array.isArray(varValue) && varValue.length === 0) ||
                          (typeof varValue === 'object' && Object.keys(varValue).length === 0);
            
            // If empty and fallback is provided, use fallback; otherwise use variable value
            if (isEmpty && cmd.args.length >= 2) {
                const fallbackValue = await this.evaluateArg(cmd.args[1]);
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
        let functionName = cmd.name;
        if (!functionName.includes('.') && this.environment.currentModule) {
            functionName = `${this.environment.currentModule}.${functionName}`;
        }

        // Check if function is forgotten in current scope
        // Check both the original name and the module-prefixed name
        if (frame.forgotten) {
            if (frame.forgotten.has(cmd.name) || frame.forgotten.has(functionName)) {
                // Function is forgotten in this scope - throw error (as if it doesn't exist)
                throw new Error(`Unknown function: ${cmd.name}`);
            }
        }

        // Check if it's a user-defined function (check original name first, then module-prefixed)
        if (this.environment.functions.has(cmd.name)) {
            const func = this.environment.functions.get(cmd.name)!;
            const result = await this.callFunction(func, args);
            // Ensure lastValue is set (even if result is undefined, preserve it)
            frame.lastValue = result !== undefined ? result : null;
            return;
        }

        // Handle function name conflicts by checking argument types
        // For example, "length" exists in both string and array modules
        if (cmd.name === 'length' && args.length > 0) {
            const firstArg = args[0];
            if (Array.isArray(firstArg)) {
                // Call array.length
                if (this.environment.builtins.has('array.length')) {
                    const handler = this.environment.builtins.get('array.length')!;
                    const result = await Promise.resolve(handler(args));
                    frame.lastValue = result !== undefined ? result : null;
                    return;
                }
            } else {
                // Call string.length
                if (this.environment.builtins.has('string.length')) {
                    const handler = this.environment.builtins.get('string.length')!;
                    const result = await Promise.resolve(handler(args));
                    frame.lastValue = result !== undefined ? result : null;
                    return;
                }
            }
        }

        // Check if it's a builtin (try module-prefixed name first, then original)
        if (this.environment.builtins.has(functionName)) {
            const handler = this.environment.builtins.get(functionName)!;
            const previousLastValue = frame.lastValue; // Preserve last value for log
            const result = await Promise.resolve(handler(args));
            // log function should not affect the last value
            if (functionName === 'log') {
                frame.lastValue = previousLastValue;
            } else {
            // Ensure lastValue is set (even if result is undefined, preserve it)
            frame.lastValue = result !== undefined ? result : null;
            }
            return;
        }

        // If module-prefixed lookup failed, try original name as fallback
        if (functionName !== cmd.name && this.environment.builtins.has(cmd.name)) {
            const handler = this.environment.builtins.get(cmd.name)!;
            const previousLastValue = frame.lastValue; // Preserve last value for log
            const result = await Promise.resolve(handler(args));
            // log function should not affect the last value
            if (cmd.name === 'log') {
                frame.lastValue = previousLastValue;
            } else {
            frame.lastValue = result !== undefined ? result : null;
            }
            return;
        }

        throw new Error(`Unknown function: ${cmd.name}`);
    }

    private async callFunction(func: DefineFunction, args: Value[]): Promise<Value> {
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
        if (args.length > 0) {
            const lastArg = args[args.length - 1];
            if (typeof lastArg === 'object' && lastArg !== null && !Array.isArray(lastArg)) {
                // Check if it looks like a named args object (has non-numeric keys)
                const keys = Object.keys(lastArg);
                const hasNonNumericKeys = keys.some(key => !/^\d+$/.test(key));
                if (hasNonNumericKeys && keys.length > 0) {
                    // This is likely a named args object
                    namedArgsObj = lastArg as Record<string, Value>;
                    positionalArgs = args.slice(0, -1);
                } else {
                    // Regular object passed as positional arg (or empty object)
                    positionalArgs = args;
                }
            } else {
                positionalArgs = args;
            }
        }

        // Set positional parameters ($1, $2, $3, ...)
        for (let i = 0; i < positionalArgs.length; i++) {
            frame.locals.set(String(i + 1), positionalArgs[i]);
        }

        // Set parameter name aliases ($a = $1, $b = $2, etc.)
        for (let i = 0; i < func.paramNames.length; i++) {
            const paramName = func.paramNames[i];
            const paramValue = i < positionalArgs.length ? positionalArgs[i] : null;
            frame.locals.set(paramName, paramValue);
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

    private async executeAssignment(assign: Assignment): Promise<void> {
        const frame = this.getCurrentFrame();
        
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
            await this.executeCommand(assign.command);
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

    private executeShorthandAssignment(assign: ShorthandAssignment): void {
        const frame = this.getCurrentFrame();
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

    private async executeInlineIf(ifStmt: InlineIf): Promise<void> {
        const frame = this.getCurrentFrame();
        const evaluator = new ExpressionEvaluator(frame, this.environment, this);
        const condition = await evaluator.evaluate(ifStmt.conditionExpr);
        
        if (condition) {
            await this.executeStatement(ifStmt.command);
        }
    }

    private async executeIfBlock(ifStmt: IfBlock): Promise<void> {
        const frame = this.getCurrentFrame();
        const evaluator = new ExpressionEvaluator(frame, this.environment, this);
        
        // Check main condition
        if (await evaluator.evaluate(ifStmt.conditionExpr)) {
            for (const stmt of ifStmt.thenBranch) {
                await this.executeStatement(stmt);
            }
            return;
        }

        // Check elseif branches
        if (ifStmt.elseifBranches) {
            for (const branch of ifStmt.elseifBranches) {
                if (await evaluator.evaluate(branch.condition)) {
                    for (const stmt of branch.body) {
                        await this.executeStatement(stmt);
                    }
                    return;
                }
            }
        }

        // Execute else branch if present
        if (ifStmt.elseBranch) {
            for (const stmt of ifStmt.elseBranch) {
                await this.executeStatement(stmt);
            }
        }
    }

    private async executeIfTrue(ifStmt: IfTrue): Promise<void> {
        const frame = this.getCurrentFrame();
        if (this.isTruthy(frame.lastValue)) {
            await this.executeStatement(ifStmt.command);
        }
    }

    private async executeIfFalse(ifStmt: IfFalse): Promise<void> {
        const frame = this.getCurrentFrame();
        if (!this.isTruthy(frame.lastValue)) {
            await this.executeStatement(ifStmt.command);
        }
    }

    private async executeReturn(returnStmt: ReturnStatement): Promise<void> {
        const frame = this.getCurrentFrame();
        
        // If a value is specified, evaluate it; otherwise use lastValue ($)
        if (returnStmt.value !== undefined) {
            const value = await this.evaluateArg(returnStmt.value);
            throw new ReturnException(value);
        } else {
            // No value specified - return $ (last value)
            throw new ReturnException(frame.lastValue);
        }
    }

    private async executeBreak(_breakStmt: BreakStatement): Promise<void> {
        // Throw BreakException to exit the current loop
        // This will be caught by executeForLoop
        throw new BreakException();
    }

    private registerFunction(func: DefineFunction): void {
        this.environment.functions.set(func.name, func);
    }

    private async executeScope(scope: ScopeBlock): Promise<void> {
        const parentFrame = this.getCurrentFrame();
        const originalLastValue = parentFrame.lastValue; // Preserve parent's $
        
        // If parameters are declared, create an isolated scope (no parent variable access)
        // Otherwise, create a scope that inherits from parent (current behavior)
        const isIsolated = scope.paramNames && scope.paramNames.length > 0;
        
        const frame: Frame = {
            locals: new Map(),
            lastValue: parentFrame.lastValue, // Start with parent's $ (will be overwritten)
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

        try {
            // Execute scope body
            for (const stmt of scope.body) {
                await this.executeStatement(stmt);
            }

            // Scope's lastValue should not affect parent's $ - restore original value
            parentFrame.lastValue = originalLastValue;
        } finally {
            // Pop the scope frame
            this.callStack.pop();
        }
    }

    private async executeForLoop(forLoop: ForLoop): Promise<void> {
        const frame = this.getCurrentFrame();
        
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
            
            // Execute body
            try {
            for (const stmt of forLoop.body) {
                await this.executeStatement(stmt);
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
        if (Lexer.isVariable(exprTrimmed)) {
            const { name, path } = Lexer.parseVariablePath(exprTrimmed);
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

    private async evaluateArg(arg: Arg): Promise<Value> {
        const frame = this.getCurrentFrame();

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
                    obj[key] = await this.evaluateArg(valueArg);
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
            const { name, path } = Lexer.parseVariablePath(varPath);
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
        for (let i = computedPropReplacements.length - 1; i >= 0; i--) {
            const { match, replacement } = computedPropReplacements[i];
            result = result.replace(match, replacement);
        }
        
        // Replace variable references in values (not in strings or keys)
        // This is tricky - we need to identify where variables can appear
        // Variables can appear after : (in values) or after , (in array elements)
        // We'll use a more sophisticated approach: parse the structure and replace values
        
        // Simple approach: replace $var patterns that are not inside strings
        // We'll track string boundaries
        let inString: false | '"' | "'" | '`' = false;
        let escaped = false;
        let i = 0;
        let output = '';
        
        while (i < result.length) {
            const char = result[i];
            
            // Handle string boundaries
            if (!escaped && (char === '"' || char === "'" || char === '`')) {
                if (!inString) {
                    inString = char;
                } else if (char === inString) {
                    inString = false;
                }
                output += char;
                escaped = false;
                i++;
                continue;
            }
            
            if (inString) {
                escaped = char === '\\' && !escaped;
                output += char;
                i++;
                continue;
            }
            
            // Check for variable reference $var
            if (char === '$' && i + 1 < result.length) {
                const nextChar = result[i + 1];
                
                // Check if it's a variable: $var, $var.property, etc.
                if (/[A-Za-z_]/.test(nextChar)) {
                    // Extract the variable path
                    let varPath = '$';
                    let j = i + 1;
                    while (j < result.length && /[A-Za-z0-9_.\[\]]/.test(result[j])) {
                        varPath += result[j];
                        j++;
                    }
                    
                    // Parse and resolve the variable
                    try {
                        const { name, path } = Lexer.parseVariablePath(varPath);
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
                        
                        output += replacement;
                        i = j;
                        continue;
                    } catch {
                        // If parsing fails, keep the original
                        output += char;
                        i++;
                        continue;
                    }
                }
            }
            
            output += char;
            escaped = false;
            i++;
        }
        
        return output;
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

    private isTruthy(val: Value): boolean {
        if (val === null || val === undefined) {
            return false;
        }
        if (typeof val === 'number') {
            return val !== 0;
        }
        if (typeof val === 'string') {
            return val.length > 0;
        }
        if (typeof val === 'boolean') {
            return val;
        }
        return true;
    }
}

// ============================================================================
// Execution State Tracker
// ============================================================================

/**
 * Tracks execution state for each statement in the AST
 */
class ExecutionStateTracker {
    private state: Map<number, { lastValue: Value; beforeValue: Value }> = new Map();

    setState(index: number, state: { lastValue: Value; beforeValue: Value }): void {
        this.state.set(index, state);
    }

    getState(index: number): { lastValue: Value; beforeValue: Value } | undefined {
        return this.state.get(index);
    }
}

// ============================================================================
// RobinPath Thread
// ============================================================================

/**
 * A thread/session for RobinPath execution.
 * Each thread has its own variables, functions, and $ (lastValue),
 * but shares builtins and metadata with the root interpreter.
 */
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
            metadata: baseEnvironment.metadata,       // shared
            moduleMetadata: baseEnvironment.moduleMetadata, // shared
            currentModule: null,                       // per-thread module context
            variableMetadata: new Map(),              // per-thread variable metadata
            functionMetadata: new Map()               // per-thread function metadata
        };

        this.executor = new Executor(this.environment, this);
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

        // Serialize AST without execution state
        const ast = statements.map((stmt) => {
            return this.serializeStatement(stmt);
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
            return this.serializeStatement(stmt, state);
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
    private findModuleName(functionName: string): string | null {
        // If the function name contains a dot, extract the module name
        if (functionName.includes('.')) {
            const parts = functionName.split('.');
            return parts[0] || null;
        }

        // Check if currentModule is set
        if (this.environment.currentModule) {
            // Verify that the function exists in this module
            const fullName = `${this.environment.currentModule}.${functionName}`;
            if (this.environment.builtins.has(fullName) || this.environment.metadata.has(fullName)) {
                return this.environment.currentModule;
            }
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

        // Check if it's a global builtin (no module)
        if (this.environment.builtins.has(functionName) || this.environment.metadata.has(functionName)) {
            return null; // Global function, no module
        }

        return null;
    }

    private serializeStatement(stmt: Statement, state?: { lastValue: Value; beforeValue: Value }): any {
        const base: any = {
            type: stmt.type,
            lastValue: state?.lastValue ?? null
        };

        switch (stmt.type) {
            case 'command':
                const moduleName = this.findModuleName(stmt.name);
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
                    command: stmt.command ? this.serializeStatement(stmt.command) : undefined,
                    literalValue: stmt.literalValue,
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
                    command: this.serializeStatement(stmt.command)
                };
            case 'ifBlock':
                return {
                    ...base,
                    conditionExpr: stmt.conditionExpr,
                    thenBranch: stmt.thenBranch.map(s => this.serializeStatement(s)),
                    elseifBranches: stmt.elseifBranches?.map(branch => ({
                        condition: branch.condition,
                        body: branch.body.map(s => this.serializeStatement(s))
                    })),
                    elseBranch: stmt.elseBranch?.map(s => this.serializeStatement(s))
                };
            case 'ifTrue':
                return {
                    ...base,
                    command: this.serializeStatement(stmt.command)
                };
            case 'ifFalse':
                return {
                    ...base,
                    command: this.serializeStatement(stmt.command)
                };
            case 'define':
                return {
                    ...base,
                    name: stmt.name,
                    paramNames: stmt.paramNames,
                    body: stmt.body.map(s => this.serializeStatement(s))
                };
            case 'scope':
                return {
                    ...base,
                    body: stmt.body.map(s => this.serializeStatement(s))
                };
            case 'forLoop':
                return {
                    ...base,
                    varName: stmt.varName,
                    iterableExpr: stmt.iterableExpr,
                    body: stmt.body.map(s => this.serializeStatement(s))
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
                    text: stmt.text,
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
                filteredNative.push(...allNative.filter(n => n.name === 'if' || n.name === 'def' || n.name === 'scope'));
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
                // Note: endscope is handled by checking if we're in a scope block
                // For now, we'll include it if we can use end keywords
                filteredNative.push(...allNative.filter(n => n.name === 'endscope'));
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

// ============================================================================
// RobinPath Interpreter
// ============================================================================

export class RobinPath {
    private environment: Environment;
    private lastExecutor: Executor | null = null;
    private persistentExecutor: Executor | null = null;
    private threads: Map<string, RobinPathThread> = new Map();
    public currentThread: RobinPathThread | null = null;
    private threadControl: boolean;
    
    // REPL multi-line input buffer
    private replBuffer: string = '';

    constructor(options?: { threadControl?: boolean }) {
        this.threadControl = options?.threadControl ?? false;
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

        // Serialize AST without execution state
        const ast = statements.map((stmt) => {
            return this.serializeStatement(stmt);
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
     */
    private findModuleName(functionName: string): string | null {
        // If the function name contains a dot, extract the module name
        if (functionName.includes('.')) {
            const parts = functionName.split('.');
            return parts[0] || null;
        }

        // Check if currentModule is set
        if (this.environment.currentModule) {
            // Verify that the function exists in this module
            const fullName = `${this.environment.currentModule}.${functionName}`;
            if (this.environment.builtins.has(fullName) || this.environment.metadata.has(fullName)) {
                return this.environment.currentModule;
            }
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

        // Check if it's a global builtin (no module)
        if (this.environment.builtins.has(functionName) || this.environment.metadata.has(functionName)) {
            return null; // Global function, no module
        }

        return null;
    }

    /**
     * Serialize a statement to JSON without execution state
     */
    private serializeStatement(stmt: Statement): any {
        const base: any = {
            type: stmt.type,
            lastValue: null
        };

        switch (stmt.type) {
            case 'command':
                const moduleName = this.findModuleName(stmt.name);
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
                    command: stmt.command ? this.serializeStatement(stmt.command) : undefined,
                    literalValue: stmt.literalValue,
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
                    command: this.serializeStatement(stmt.command)
                };
            case 'ifBlock':
                return {
                    ...base,
                    conditionExpr: stmt.conditionExpr,
                    thenBranch: stmt.thenBranch.map(s => this.serializeStatement(s)),
                    elseifBranches: stmt.elseifBranches?.map(branch => ({
                        condition: branch.condition,
                        body: branch.body.map(s => this.serializeStatement(s))
                    })),
                    elseBranch: stmt.elseBranch?.map(s => this.serializeStatement(s))
                };
            case 'ifTrue':
                return {
                    ...base,
                    command: this.serializeStatement(stmt.command)
                };
            case 'ifFalse':
                return {
                    ...base,
                    command: this.serializeStatement(stmt.command)
                };
            case 'define':
                return {
                    ...base,
                    name: stmt.name,
                    paramNames: stmt.paramNames,
                    body: stmt.body.map(s => this.serializeStatement(s))
                };
            case 'scope':
                return {
                    ...base,
                    body: stmt.body.map(s => this.serializeStatement(s))
                };
            case 'forLoop':
                return {
                    ...base,
                    varName: stmt.varName,
                    iterableExpr: stmt.iterableExpr,
                    body: stmt.body.map(s => this.serializeStatement(s))
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
                    text: stmt.text,
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
