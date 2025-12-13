/**
 * AST (Abstract Syntax Tree) Type Definitions for RobinPath
 * 
 * This file contains all type definitions related to the Abstract Syntax Tree
 * representation of RobinPath code. The AST is a structured representation
 * of the parsed source code that can be used for execution, analysis, and
 * code generation.
 */

import type { Value, AttributePathSegment } from '../utils/types';

// ============================================================================
// Code Position
// ============================================================================

/**
 * Represents the position of code in the source file
 */
export interface CodePosition {
    startRow: number; // 0-indexed row (line) number where statement starts
    startCol: number; // 0-indexed column number where statement starts
    endRow: number; // 0-indexed row (line) number where statement ends (inclusive)
    endCol: number; // 0-indexed column number where statement ends (inclusive)
}

// ============================================================================
// Comments
// ============================================================================

/**
 * Represents a comment with its position in the source code
 */
export interface CommentWithPosition {
    text: string; // Comment text without the #
    codePos: CodePosition; // Code position (row/col) in source code
    inline?: boolean; // true if this is an inline comment (on same line as code), false/undefined if above
}

/**
 * Represents a standalone comment statement in the AST
 */
export interface CommentStatement {
    type: 'comment';
    comments: CommentWithPosition[]; // Array of comment objects with position (always use this, never 'text')
    lineNumber: number; // Original line number for reference (deprecated, derive from comments[0].codePos.startRow)
    // codePos is derived from comments array - no need to store it separately
}

// ============================================================================
// Expressions
// ============================================================================

/**
 * Represents a variable reference expression
 */
export interface VarExpression {
    type: 'var';
    name: string;
    path?: AttributePathSegment[];
    codePos?: CodePosition;
}

/**
 * Represents the last value expression ($)
 */
export interface LastValueExpression {
    type: 'lastValue';
    codePos?: CodePosition;
}

/**
 * Represents a literal value expression
 */
export interface LiteralExpression {
    type: 'literal';
    value: Value;
    codePos?: CodePosition;
}

/**
 * Represents a number literal expression
 */
export interface NumberExpression {
    type: 'number';
    value: number;
    codePos?: CodePosition;
}

/**
 * Represents a string literal expression
 */
export interface StringExpression {
    type: 'string';
    value: string;
    codePos?: CodePosition;
}

/**
 * Represents a property in an object literal
 */
export interface ObjectProperty {
    key: string | Expression; // Simple string key or computed expression (e.g., [$var])
    value: Expression;
}

/**
 * Represents an object literal expression { ... }
 */
export interface ObjectLiteralExpression {
    type: 'objectLiteral';
    properties: ObjectProperty[];
    codePos?: CodePosition;
}

/**
 * Represents an array literal expression [ ... ]
 */
export interface ArrayLiteralExpression {
    type: 'arrayLiteral';
    elements: Expression[];
    codePos?: CodePosition;
}

/**
 * Represents $( ... ) – a subexpression that contains statements.
 * The result value is the lastValue after executing the body.
 */
export interface SubexpressionExpression {
    type: 'subexpression';
    body: Statement[];
    codePos: CodePosition;
}

/**
 * Binary operators for expressions
 */
export type BinaryOperator =
    | '==' | '!='
    | '<' | '<=' | '>' | '>='
    | 'and' | 'or'
    | '+' | '-' | '*' | '/' | '%';

/**
 * Represents a binary operation expression
 */
export interface BinaryExpression {
    type: 'binary';
    operator: BinaryOperator;
    left: Expression;
    right: Expression;
    codePos?: CodePosition;
}

/**
 * Unary operators for expressions
 */
export type UnaryOperator = 'not' | '-' | '+';

/**
 * Represents a unary operation expression
 */
export interface UnaryExpression {
    type: 'unary';
    operator: UnaryOperator;
    argument: Expression;
    codePos?: CodePosition;
}

/**
 * Represents a function/command call within an expression
 */
export interface CallExpression {
    type: 'call';
    callee: string;
    args: Expression[];
    codePos?: CodePosition;
}

/**
 * Union type representing all possible expression types
 */
export type Expression =
    | VarExpression
    | LastValueExpression
    | LiteralExpression
    | NumberExpression
    | StringExpression
    | ObjectLiteralExpression
    | ArrayLiteralExpression
    | SubexpressionExpression
    | BinaryExpression
    | UnaryExpression
    | CallExpression;

// Note: Statement is defined later in this file, but TypeScript allows forward references in types

// ============================================================================
// Arguments
// ============================================================================

/**
 * Represents named arguments (key=value pairs)
 */
export interface NamedArgsExpression {
    type: 'namedArgs';
    args: Record<string, Expression>;
}

/**
 * Represents an argument passed to a command or function
 * 
 * @deprecated The old Arg types with code strings are being phased out.
 * Use Expression nodes instead. For backward compatibility, we keep the old types
 * but they should be replaced with Expression nodes.
 */
export type Arg = 
    | Expression
    | NamedArgsExpression
    // Legacy types for backward compatibility (will be removed)
    | { type: 'subexpr'; code: string }   // @deprecated Use SubexpressionExpression instead
    | { type: 'object'; code: string }    // @deprecated Use ObjectLiteralExpression instead
    | { type: 'array'; code: string };    // @deprecated Use ArrayLiteralExpression instead

// ============================================================================
// Decorators
// ============================================================================

/**
 * Represents a decorator call (e.g., @desc "description")
 */
export interface DecoratorCall {
    name: string; // Decorator function name (without @)
    args: Arg[]; // Arguments passed to the decorator
    codePos: CodePosition; // Code position (row/col) in source code
}

// ============================================================================
// Commands and Assignments
// ============================================================================

/**
 * Represents a command/function call
 */
export interface CommandCall {
    type: 'command';
    name: string;
    args: Arg[];
    syntaxType?: 'space' | 'parentheses' | 'named-parentheses' | 'multiline-parentheses'; // Function call syntax style
    decorators?: DecoratorCall[]; // Decorators attached to this command (for var/const)
    into?: { targetName: string; targetPath?: AttributePathSegment[] }; // Optional "into $var" assignment
    callback?: ScopeBlock; // Optional callback do block (for module functions)
    comments?: CommentWithPosition[]; // Comments attached to this command (above and inline)
    codePos: CodePosition; // Code position (row/col) in source code
}

/**
 * Represents a variable assignment (e.g., $var = value)
 */
export interface Assignment {
    type: 'assignment';
    targetName: string;
    targetPath?: AttributePathSegment[]; // Path for attribute access assignment (e.g., $animal.cat)
    command?: CommandCall;
    literalValue?: Value;
    literalValueType?: 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array'; // Type of literalValue, deduced from the value
    isLastValue?: boolean; // True if assignment is from $ (last value)
    comments?: CommentWithPosition[]; // Comments attached to this assignment (above and inline)
    decorators?: DecoratorCall[]; // Decorators attached to this assignment
    codePos: CodePosition; // Code position (row/col) in source code
}

/**
 * Represents a shorthand assignment (e.g., $var = $)
 */
export interface ShorthandAssignment {
    type: 'shorthand';
    targetName: string;
    comments?: CommentWithPosition[]; // Comments attached to this shorthand assignment (above and inline)
    codePos: CodePosition; // Code position (row/col) in source code
}

// ============================================================================
// Conditionals
// ============================================================================

/**
 * Represents an inline if statement (e.g., if condition then command)
 */
export interface InlineIf {
    type: 'inlineIf';
    condition: Expression;
    command: Statement;
    comments?: CommentWithPosition[]; // Comments attached to this inline if (above and inline)
    codePos: CodePosition; // Code position (row/col) in source code
}

/**
 * Represents an if/elseif/else block
 */
export interface IfBlock {
    type: 'ifBlock';
    condition: Expression;
    thenBranch: Statement[];
    elseBranch?: Statement[];
    elseifBranches?: Array<{ condition: Expression; body: Statement[] }>;
    decorators?: DecoratorCall[]; // Decorators attached to this if block
    comments?: CommentWithPosition[]; // Comments attached to this if block (above and inline)
    codePos: CodePosition; // Code position (row/col) in source code
}

/**
 * Represents an iftrue statement (e.g., iftrue command)
 */
export interface IfTrue {
    type: 'ifTrue';
    command: Statement;
    comments?: CommentWithPosition[]; // Comments attached to this iftrue (above and inline)
    codePos: CodePosition; // Code position (row/col) in source code
}

/**
 * Represents an iffalse statement (e.g., iffalse command)
 */
export interface IfFalse {
    type: 'ifFalse';
    command: Statement;
    comments?: CommentWithPosition[]; // Comments attached to this iffalse (above and inline)
    codePos: CodePosition; // Code position (row/col) in source code
}

// ============================================================================
// Functions and Blocks
// ============================================================================

/**
 * Represents a function definition (def/enddef)
 */
export interface DefineFunction {
    type: 'define';
    name: string;
    paramNames: string[]; // Parameter names (e.g., ['a', 'b', 'c']) - aliases for $1, $2, $3
    body: Statement[];
    decorators?: DecoratorCall[]; // Decorators attached to this function (must be immediately before def)
    comments?: CommentWithPosition[]; // Comments attached to this function definition (above and inline)
    codePos: CodePosition; // Code position (row/col) in source code
}

/**
 * Represents a scope block (do/enddo)
 */
export interface ScopeBlock {
    type: 'do';
    paramNames?: string[]; // Optional parameter names (e.g., ['a', 'b'])
    body: Statement[];
    into?: { targetName: string; targetPath?: AttributePathSegment[] }; // Optional "into $var" assignment
    decorators?: DecoratorCall[]; // Decorators attached to this do block
    comments?: CommentWithPosition[]; // Comments attached to this scope block (above and inline)
    codePos: CodePosition; // Code position (row/col) in source code
}

/**
 * Represents a together block (together/endtogether)
 */
export interface TogetherBlock {
    type: 'together';
    blocks: ScopeBlock[]; // Only do blocks are allowed
    comments?: CommentWithPosition[]; // Comments attached to this together block (above and inline)
    codePos: CodePosition; // Code position (row/col) in source code
}

// ============================================================================
// Loops
// ============================================================================

/**
 * Represents a for loop (for/endfor)
 */
export interface ForLoop {
    type: 'forLoop';
    varName: string;
    iterable: Expression;
    body: Statement[];
    decorators?: DecoratorCall[]; // Decorators attached to this for loop
    comments?: CommentWithPosition[]; // Comments attached to this for loop (above and inline)
    codePos: CodePosition; // Code position (row/col) in source code
}

// ============================================================================
// Control Flow
// ============================================================================

/**
 * Represents a return statement
 */
export interface ReturnStatement {
    type: 'return';
    value?: Arg; // Optional value to return (if not provided, returns $)
    comments?: CommentWithPosition[]; // Comments attached to this return statement (above and inline)
    codePos: CodePosition; // Code position (row/col) in source code
}

/**
 * Represents a break statement
 */
export interface BreakStatement {
    type: 'break';
    comments?: CommentWithPosition[]; // Comments attached to this break statement (above and inline)
    codePos: CodePosition; // Code position (row/col) in source code
}

/**
 * Represents a continue statement
 */
export interface ContinueStatement {
    type: 'continue';
    comments?: CommentWithPosition[]; // Comments attached to this continue statement (above and inline)
    codePos: CodePosition; // Code position (row/col) in source code
}

// ============================================================================
// Events
// ============================================================================

/**
 * Represents an event handler block (on/endon)
 */
export interface OnBlock {
    type: 'onBlock';
    eventName: string; // Event name (e.g., "test1")
    body: Statement[]; // Body statements that execute when event is triggered
    decorators?: DecoratorCall[]; // Decorators attached to this on block
    comments?: CommentWithPosition[]; // Comments attached to this on block (above and inline)
    codePos: CodePosition; // Code position (row/col) in source code
}

// ============================================================================
// Statement Union Type
// ============================================================================

/**
 * Union type representing all possible statement types in the AST
 */
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
    | TogetherBlock
    | ForLoop
    | ReturnStatement
    | BreakStatement
    | ContinueStatement
    | OnBlock
    | CommentStatement;
