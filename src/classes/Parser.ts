
import { Lexer, TokenKind } from './Lexer';
import type { Token } from './Lexer';
import { TokenStream } from './TokenStream';
import { AssignmentParser } from '../parsers/AssignmentParser';
import { CommandParser } from '../parsers/CommandParser';
import { DefineParser } from '../parsers/DefineParser';
import { EventParser } from '../parsers/EventParser';
import { ScopeParser } from '../parsers/ScopeParser';
import { WithScopeParser } from '../parsers/WithScopeParser';
import { parseForLoop } from '../parsers/ForLoopParser';
import { parseIf } from '../parsers/IfBlockParser';
import { parseReturn } from '../parsers/ReturnParser';
import { parseBreak } from '../parsers/BreakParser';
import { parseContinue } from '../parsers/ContinueParser';
import { parseTogether } from '../parsers/TogetherBlockParser';
import { parseDecorators } from '../parsers/DecoratorParser';
import { ObjectLiteralParser } from '../parsers/ObjectLiteralParser';
import { ArrayLiteralParser } from '../parsers/ArrayLiteralParser';
import { SubexpressionParser } from '../parsers/SubexpressionParser';
import { CommentParser } from '../parsers/CommentParser';
import { LexerUtils } from '../utils';
import type { Statement, CommentWithPosition, CodePosition, DefineFunction, OnBlock, DecoratorCall } from '../types/Ast.type';
import type { Environment } from '../index';

export class Parser {
    private tokens: Token[];
    private stream: TokenStream;
    private extractedFunctions: DefineFunction[] = [];
    private extractedEventHandlers: OnBlock[] = [];
    private environment: Environment | null = null; // Optional environment for parse decorators
    private decoratorBuffer: DecoratorCall[] = []; // Buffer for unclaimed decorators
    private pendingComments: CommentWithPosition[] = []; // Comments to attach to next statement

    /**
     * Maximum number of iterations allowed before detecting an infinite loop
     */
    static readonly MAX_STUCK_ITERATIONS = 100;
    
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

    /**
     * Create a new Parser
     * @param source - Full source code as a single string
     * @param environment - Optional environment for executing parse decorators
     */
    constructor(source: string, environment?: Environment | null) {
        this.tokens = Lexer.tokenizeFull(source);
        this.stream = new TokenStream(this.tokens);
        this.environment = environment || null;
    }

    /**
     * Parse the source code into an AST
     * @returns Array of statements
     */
    async parse(): Promise<Statement[]> {
        // Single pass: parse all statements including def/on blocks
        this.stream = new TokenStream(this.tokens); // Reset stream
        this.decoratorBuffer = []; // Reset decorator buffer
        const statements: Statement[] = [];

        let parseIteration = 0;
        let lastPosition = -1;
        let stuckCount = 0;

        while (!this.stream.isAtEnd()) {
            parseIteration++;
            const currentIndex = this.stream.getPosition();
            const token = this.stream.current();
            
            if (Parser.debug) {
                const timestamp = new Date().toISOString();
                console.log(`[Parser.parse] [${timestamp}] Iteration ${parseIteration}, position: ${currentIndex}, token: ${token?.text || 'null'} (${token?.kind || 'EOF'}), line: ${token?.line || 'N/A'}`);
            }
            
            // Detect if we're stuck (position not advancing)
            // TokenStream now has its own stuck detection, but we keep this as a backup
            if (currentIndex === lastPosition) {
                stuckCount++;
                if (Parser.debug) {
                    const timestamp = new Date().toISOString();
                    console.log(`[Parser.parse] [${timestamp}] WARNING: Position stuck at ${currentIndex} (count: ${stuckCount})`);
                }
                if (stuckCount > Parser.MAX_STUCK_ITERATIONS) {
                    const context = this.stream.getCurrentContext();
                    throw new Error(
                        `[Parser.parse] Infinite loop detected! Stuck at position ${currentIndex} for ${stuckCount} iterations.\n` +
                        `  Token: ${token?.text || 'null'} (${token?.kind || 'EOF'})\n` +
                        `  Location: line ${token?.line || 'N/A'}, column ${token?.column || 'N/A'}\n` +
                        `  Context: ${context}\n` +
                        `  Parse iteration: ${parseIteration}`
                    );
                }
            } else {
                stuckCount = 0;
                lastPosition = currentIndex;
                // Reset TokenStream stuck detection when we advance
                this.stream.resetStuckDetection();
            }

            // Skip newlines
            if (this.stream.check(TokenKind.NEWLINE)) {
                // Check if there are orphaned decorators (decorators followed by empty line)
                if (this.decoratorBuffer.length > 0) {
                    const nextToken = this.stream.peek(1);
                    // If next token is also newline or EOF, it's an empty line
                    if (!nextToken || nextToken.kind === TokenKind.NEWLINE || nextToken.kind === TokenKind.EOF) {
                        throw new Error(
                            `Orphaned decorators found at line ${token?.line || 'unknown'}. ` +
                            `Decorators must be immediately followed by a statement (def, var, const, or command). ` +
                            `Found ${this.decoratorBuffer.length} unclaimed decorator(s).`
                        );
                    }
                }
                if (Parser.debug) {
                    const timestamp = new Date().toISOString();
                    console.log(`[Parser.parse] [${timestamp}] Skipping newline at ${currentIndex}`);
                }
                this.stream.next();
                continue;
            }

            // Handle comments using CommentParser
            const currentToken = this.stream.current();
            const isComment = currentToken?.kind === TokenKind.COMMENT;
            const checkResult = this.stream.check(TokenKind.COMMENT);
            
            if (isComment || checkResult) {
                if (Parser.debug) {
                    const timestamp = new Date().toISOString();
                    console.log(`[Parser.parse] [${timestamp}] Parsing comment at ${currentIndex}`);
                }
                const commentResult = CommentParser.parseComments(this.stream);
                
                if (commentResult.consumed) {
                    if (commentResult.commentNode) {
                        // Orphaned comment (separated by blank line) - add as standalone node
                        statements.push(commentResult.commentNode);
                    } else if (commentResult.comments.length > 0) {
                        // Comments to attach to next statement
                        this.pendingComments.push(...commentResult.comments);
                    }
                }
                continue;
            }

            // Collect decorators into buffer
            const currentTokenForDecoratorCheck = this.stream.current();
            // Use direct comparison instead of check() due to potential bug
            const isDecorator = currentTokenForDecoratorCheck?.kind === TokenKind.DECORATOR;
            if (isDecorator) {
                const decoratorResult = parseDecorators(this.stream, {
                    parseStatement: (s) => this.parseStatementFromStream(s),
                    parseComment: (s) => this.parseCommentFromStream(s)
                });
                this.decoratorBuffer.push(...decoratorResult.decorators);
                // parseDecorators should have left the stream at the next token (e.g., 'def')
                continue;
            }

            // Check for special __ast__ command
            if (token && (token.kind === TokenKind.IDENTIFIER || token.kind === TokenKind.KEYWORD) && token.text === '__ast__') {
                // Consume the __ast__ token
                this.stream.next();
                
                // Skip whitespace and comments
                this.stream.skipWhitespaceAndComments();
                
                // Check if there's a function name following
                const nextToken = this.stream.current();
                if (nextToken && (nextToken.kind === TokenKind.IDENTIFIER || nextToken.kind === TokenKind.KEYWORD)) {
                    // There's a function name - show that function's AST
                    const functionName = nextToken.text;
                    this.stream.next(); // Consume the function name
                    
                    // Look up the function
                    const func = this.extractedFunctions.find(f => f.name === functionName);
                    if (func) {
                        const serialized = this.serializeAST(func);
                        console.log(`AST for function "${functionName}":`, JSON.stringify(serialized, null, 2));
                    } else {
                        console.log(`Function "${functionName}" not found. Available functions:`, this.extractedFunctions.map(f => f.name).join(', ') || 'none');
                    }
                } else {
                    // No function name - show current AST
                    const serialized = this.serializeAST(statements);
                    console.log('Current AST:', JSON.stringify(serialized, null, 2));
                }
                continue;
            }

            // Try to parse a statement
            if (Parser.debug) {
                const timestamp = new Date().toISOString();
                console.log(`[Parser.parse] [${timestamp}] Attempting to parse statement at ${currentIndex}`);
            }
            const statement = await this.parseStatement();
            if (statement) {
                if (Parser.debug) {
                    const timestamp = new Date().toISOString();
                    console.log(`[Parser.parse] [${timestamp}] Parsed statement type: ${statement.type} at ${currentIndex}`);
                }
                // Attach pending comments (above the statement)
                if (this.pendingComments.length > 0) {
                    CommentParser.attachComments(statement, this.pendingComments);
                    this.pendingComments = [];
                }
                // Attach inline comments if present
                this.attachInlineComments(statement);
                statements.push(statement);
            } else {
                // If we can't parse anything, check if there are orphaned decorators
                if (this.decoratorBuffer.length > 0) {
            console.log(this.decoratorBuffer);
                    
                    throw new Error(
                        `Orphaned decorators found at line ${token?.line || 'unknown'}. ` +
                        `Decorators must be immediately followed by a statement (def, var, const, or command). ` +
                        `Found ${this.decoratorBuffer.length} unclaimed decorator(s) before '${token?.text || 'unknown'}'.`
                    );
                }
                // If we can't parse anything, skip the current token to avoid infinite loop
                if (Parser.debug) {
                    const timestamp = new Date().toISOString();
                    console.log(`[Parser.parse] [${timestamp}] WARNING: Could not parse statement at ${currentIndex}, skipping token: ${token?.text || 'null'}`);
                }
                const skippedToken = this.stream.next();
                if (!skippedToken) break;
            }
        }
        
        // Check for orphaned decorators at end of file
        if (this.decoratorBuffer.length > 0) {
            throw new Error(
                `Orphaned decorators found at end of file. ` +
                `Decorators must be immediately followed by a statement (def, var, const, or command). ` +
                `Found ${this.decoratorBuffer.length} unclaimed decorator(s).`
            );
        }
        
        // Handle any pending comments at end of file (make them orphaned)
        if (this.pendingComments.length > 0) {
            const groupedText = this.pendingComments.map(c => c.text).join('\n');
            const groupedCodePos: CodePosition = {
                startRow: this.pendingComments[0].codePos.startRow,
                startCol: this.pendingComments[0].codePos.startCol,
                endRow: this.pendingComments[this.pendingComments.length - 1].codePos.endRow,
                endCol: this.pendingComments[this.pendingComments.length - 1].codePos.endCol
            };
            
            statements.push({
                type: 'comment',
                comments: [{
                    text: groupedText,
                    codePos: groupedCodePos,
                    inline: false
                }],
                lineNumber: this.pendingComments[0].codePos.startRow
            });
            this.pendingComments = [];
        }
        
        if (Parser.debug) {
            const timestamp = new Date().toISOString();
            console.log(`[Parser.parse] [${timestamp}] Parse complete. Total iterations: ${parseIteration}, statements: ${statements.length}`);
        }

        return statements;
    }


    /**
     * Parse a statement from a stream (for use in DefineParser)
     */
    private parseStatementFromStream(stream: TokenStream): Statement | null {
        const token = stream.current();
        if (!token) return null;

        // Check for variable assignment
        if (token.kind === TokenKind.VARIABLE) {
            let offset = 1;
            while (true) {
                const nextToken = stream.peek(offset);
                if (!nextToken) break;
                if (nextToken.kind === TokenKind.COMMENT || 
                    (nextToken.kind === TokenKind.NEWLINE && stream.peek(offset + 1)?.kind !== TokenKind.EOF)) {
                    offset++;
                    continue;
                }
                if (nextToken.kind === TokenKind.ASSIGN) {
                    return AssignmentParser.parse(stream, {
                        parseStatement: (s) => this.parseStatementFromStream(s),
                        createCodePosition: (start, end) => ({
                            startRow: start.line - 1,
                            startCol: start.column,
                            endRow: end.line - 1,
                            endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
                        })
                    });
                }
                break;
            }
        }

        // Check for 'return' statement
        if (token.kind === TokenKind.KEYWORD && token.text === 'return') {
            return parseReturn(stream, {
                parseStatement: (s) => this.parseStatementFromStream(s),
                createCodePosition: (start, end) => ({
                    startRow: start.line - 1,
                    startCol: start.column,
                    endRow: end.line - 1,
                    endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
                })
            });
        }

        // Check for 'break' statement
        if (token.kind === TokenKind.KEYWORD && token.text === 'break') {
            return parseBreak(stream, {
                createCodePosition: (start, end) => ({
                    startRow: start.line - 1,
                    startCol: start.column,
                    endRow: end.line - 1,
                    endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
                })
            });
        }

        // Check for 'continue' statement
        if (token.kind === TokenKind.KEYWORD && token.text === 'continue') {
            return parseContinue(stream, {
                createCodePosition: (start, end) => ({
                    startRow: start.line - 1,
                    startCol: start.column,
                    endRow: end.line - 1,
                    endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
                })
            });
        }

        // Check for 'if' statement
        if (token.kind === TokenKind.KEYWORD && token.text === 'if') {
            // Note: parseStatementFromStream is used in nested contexts (def, do, etc.)
            // where decorators are not available, so we don't pass decorators here
            return parseIf(stream, {
                parseStatement: (s) => this.parseStatementFromStream(s),
                parseComment: (s) => this.parseCommentFromStream(s),
                createCodePosition: (start, end) => ({
                    startRow: start.line - 1,
                    startCol: start.column,
                    endRow: end.line - 1,
                    endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
                })
            });
        }

        // Check for 'for' loop
        if (token.kind === TokenKind.KEYWORD && token.text === 'for') {
            return parseForLoop(stream, {
                parseStatement: (s) => this.parseStatementFromStream(s),
                parseComment: (s) => this.parseCommentFromStream(s),
                createCodePosition: (start, end) => ({
                    startRow: start.line - 1,
                    startCol: start.column,
                    endRow: end.line - 1,
                    endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
                })
            });
        }

        // Check for 'do' scope block
        if (token.kind === TokenKind.KEYWORD && token.text === 'do') {
            return ScopeParser.parse(
                stream,
                (s) => this.parseStatementFromStream(s),
                (s) => this.parseCommentFromStream(s)
            );
        }

        // Check for 'else' keyword - this should only appear inside if blocks
        // If we encounter it here, it means it's not part of an if block, which is an error
        if (token.kind === TokenKind.KEYWORD && token.text === 'else') {
            throw new Error(`'else' keyword found outside of if block at line ${token.line}`);
        }

        // Check for 'endif' keyword - this should only appear inside if blocks
        // If we encounter it here, it means it's not part of an if block, which is an error
        if (token.kind === TokenKind.KEYWORD && token.text === 'endif') {
            throw new Error(`'endif' keyword found outside of if block at line ${token.line}`);
        }

        // Check for 'endon' keyword - this should only appear inside on blocks
        // If we encounter it here, it means it's not part of an on block, which is an error
        if (token.kind === TokenKind.KEYWORD && token.text === 'endon') {
            throw new Error(`'endon' keyword found outside of on block at line ${token.line}`);
        }

        // Check for standalone object literal: {...}
        if (token.kind === TokenKind.LBRACE) {
            const objResult = ObjectLiteralParser.parse(stream);
            const createCodePosition = (start: Token, end: Token) => ({
                startRow: start.line - 1,
                startCol: start.column,
                endRow: end.line - 1,
                endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
            });
            return {
                type: 'command',
                name: '_object',
                args: [{ type: 'object', code: objResult.code }],
                codePos: createCodePosition(objResult.startToken, objResult.endToken)
            };
        }

        // Check for standalone array literal: [...]
        if (token.kind === TokenKind.LBRACKET) {
            const arrResult = ArrayLiteralParser.parse(stream);
            const createCodePosition = (start: Token, end: Token) => ({
                startRow: start.line - 1,
                startCol: start.column,
                endRow: end.line - 1,
                endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
            });
            return {
                type: 'command',
                name: '_array',
                args: [{ type: 'array', code: arrResult.code }],
                codePos: createCodePosition(arrResult.startToken, arrResult.endToken)
            };
        }

        // Check for standalone string literal: "..." or '...' or `...`
        // These should set the last value ($) to the string value
        if (token.kind === TokenKind.STRING) {
            const isTemplateString = token.text.startsWith('`');
            const value = token.value !== undefined ? token.value : LexerUtils.parseString(token.text);
            const stringToken = token;
            stream.next();
            const createCodePosition = (start: Token, end: Token) => ({
                startRow: start.line - 1,
                startCol: start.column,
                endRow: end.line - 1,
                endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
            });
            // Mark template strings with special prefix
            const stringValue = isTemplateString ? `\0TEMPLATE\0${value}` : value;
            return {
                type: 'command',
                name: '_literal',
                args: [{ type: 'string', value: stringValue }],
                codePos: createCodePosition(stringToken, stringToken)
            };
        }

        // Check for standalone number literal
        if (token.kind === TokenKind.NUMBER) {
            const value = token.value !== undefined ? token.value : parseFloat(token.text);
            const numberToken = token;
            stream.next();
            const createCodePosition = (start: Token, end: Token) => ({
                startRow: start.line - 1,
                startCol: start.column,
                endRow: end.line - 1,
                endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
            });
            return {
                type: 'command',
                name: '_literal',
                args: [{ type: 'number', value }],
                codePos: createCodePosition(numberToken, numberToken)
            };
        }

        // Check for standalone boolean literal
        if (token.kind === TokenKind.BOOLEAN) {
            const value = token.value !== undefined ? token.value : (token.text === 'true');
            const booleanToken = token;
            stream.next();
            const createCodePosition = (start: Token, end: Token) => ({
                startRow: start.line - 1,
                startCol: start.column,
                endRow: end.line - 1,
                endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
            });
            return {
                type: 'command',
                name: '_literal',
                args: [{ type: 'literal', value }],
                codePos: createCodePosition(booleanToken, booleanToken)
            };
        }

        // Check for standalone null literal
        if (token.kind === TokenKind.NULL) {
            const nullToken = token;
            stream.next();
            const createCodePosition = (start: Token, end: Token) => ({
                startRow: start.line - 1,
                startCol: start.column,
                endRow: end.line - 1,
                endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
            });
            return {
                type: 'command',
                name: '_literal',
                args: [{ type: 'literal', value: null }],
                codePos: createCodePosition(nullToken, nullToken)
            };
        }

        // Check for standalone subexpression: $(...)
        // These should set the last value ($) to the subexpression result
        if (token.kind === TokenKind.SUBEXPRESSION_OPEN) {
            const subexpr = SubexpressionParser.parse(stream, {
                parseStatement: (s) => this.parseStatementFromStream(s),
                createCodePosition: (start, end) => ({
                    startRow: start.line - 1,
                    startCol: start.column,
                    endRow: end.line - 1,
                    endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
                })
            });

            // Wrap in _subexpr command to set last value
            // Pass as Expression type so evaluateArg can properly evaluate it
            return {
                type: 'command',
                name: '_subexpr',
                args: [{ 
                    type: 'subexpression', 
                    body: subexpr.body,
                    codePos: subexpr.codePos
                }],
                codePos: subexpr.codePos
            };
        }

        // Check for command call
        if (token.kind === TokenKind.IDENTIFIER || token.kind === TokenKind.KEYWORD) {
            return CommandParser.parse(stream, {
                parseStatement: (s) => this.parseStatementFromStream(s),
                createCodePosition: (start, end) => ({
                    startRow: start.line - 1,
                    startCol: start.column,
                    endRow: end.line - 1,
                    endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
                }),
                parseScope: (s) => ScopeParser.parse(s,
                    (s2) => this.parseStatementFromStream(s2),
                    (s2) => this.parseCommentFromStream(s2)
                )
            });
        }

        // TODO: Add other statement types
        return null;
    }

    /**
     * Parse a comment from a stream (for use in DefineParser)
     */
    private parseCommentFromStream(stream: TokenStream): Statement | null {
        if (!stream.check(TokenKind.COMMENT)) {
            return null;
        }

        const comments: CommentWithPosition[] = [];
        let startLine = -1;

        while (stream.check(TokenKind.COMMENT)) {
            const token = stream.next();
            if (!token) break;

            if (startLine === -1) {
                startLine = token.line - 1;
            }

            const commentText = token.text.startsWith('#') 
                ? token.text.slice(1).trim() 
                : token.text.trim();

            const codePos: CodePosition = {
                startRow: token.line - 1,
                startCol: token.column,
                endRow: token.line - 1,
                endCol: token.column + token.text.length - 1
            };

            comments.push({
                text: commentText,
                codePos,
                inline: false
            });
        }

        if (comments.length === 0) {
            return null;
        }

        return {
            type: 'comment',
            comments,
            lineNumber: startLine
        };
    }

    /**
     * Get extracted function definitions (def/enddef blocks)
     */
    getExtractedFunctions(): DefineFunction[] {
        return this.extractedFunctions;
    }

    /**
     * Get extracted event handlers (on/endon blocks)
     */
    getExtractedEventHandlers(): OnBlock[] {
        return this.extractedEventHandlers;
    }



    /**
     * Parse a single statement
     */
    private async parseStatement(): Promise<Statement | null> {
        const token = this.stream.current();
        if (!token) {
            if (Parser.debug) {
                const timestamp = new Date().toISOString();
                console.log(`[Parser.parseStatement] [${timestamp}] No token at position ${this.stream.getPosition()}`);
            }
            return null;
        }
        
        if (Parser.debug) {
            const timestamp = new Date().toISOString();
            console.log(`[Parser.parseStatement] [${timestamp}] Parsing statement at position ${this.stream.getPosition()}, token: ${token.text} (${token.kind}), line: ${token.line}`);
        }
        
        // Get the current token
        const currentToken = this.stream.current();
        if (!currentToken) {
            return null;
        }

        // Check for variable assignment: $var = ...
        if (currentToken.kind === TokenKind.VARIABLE) {
            // Look ahead to see if next token is = (skip whitespace/comments)
            let offset = 1;
            while (true) {
                const nextToken = this.stream.peek(offset);
                if (!nextToken) break;
                
                // Skip comments and newlines
                if (nextToken.kind === TokenKind.COMMENT || 
                    (nextToken.kind === TokenKind.NEWLINE && this.stream.peek(offset + 1)?.kind !== TokenKind.EOF)) {
                    offset++;
                    continue;
                }
                
                // Found the next non-whitespace token
                if (nextToken.kind === TokenKind.ASSIGN) {
                    const assignment = AssignmentParser.parse(this.stream, {
                        parseStatement: (s) => this.parseStatementFromStream(s),
                        createCodePosition: (start, end) => ({
                            startRow: start.line - 1,
                            startCol: start.column,
                            endRow: end.line - 1,
                            endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
                        })
                    });
                    return assignment;
                }
                break; // Not an assignment
            }
        }

        // Check for 'return' statement
        if (currentToken.kind === TokenKind.KEYWORD && currentToken.text === 'return') {
            return parseReturn(this.stream, {
                parseStatement: (s) => this.parseStatementFromStream(s),
                createCodePosition: (start, end) => ({
                    startRow: start.line - 1,
                    startCol: start.column,
                    endRow: end.line - 1,
                    endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
                })
            });
        }

        // Check for 'break' statement
        if (currentToken.kind === TokenKind.KEYWORD && currentToken.text === 'break') {
            return parseBreak(this.stream, {
                createCodePosition: (start, end) => ({
                    startRow: start.line - 1,
                    startCol: start.column,
                    endRow: end.line - 1,
                    endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
                })
            });
        }

        // Check for 'continue' statement
        if (currentToken.kind === TokenKind.KEYWORD && currentToken.text === 'continue') {
            return parseContinue(this.stream, {
                createCodePosition: (start, end) => ({
                    startRow: start.line - 1,
                    startCol: start.column,
                    endRow: end.line - 1,
                    endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
                })
            });
        }

        // Check for 'if' statement
        if (token.kind === TokenKind.KEYWORD && token.text === 'if') {
            // Attach decorators if any are in the buffer
            const decorators = this.decoratorBuffer.length > 0 ? [...this.decoratorBuffer] : undefined;
            if (decorators) {
                this.decoratorBuffer = []; // Clear buffer
            }
            const ifBlock = parseIf(this.stream, {
                parseStatement: (s) => this.parseStatementFromStream(s),
                parseComment: (s) => this.parseCommentFromStream(s),
                createCodePosition: (start, end) => ({
                    startRow: start.line - 1,
                    startCol: start.column,
                    endRow: end.line - 1,
                    endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
                })
            }, decorators);
            return ifBlock;
        }

        // Check for 'for' loop
        if (currentToken.kind === TokenKind.KEYWORD && currentToken.text === 'for') {
            // Attach decorators if any are in the buffer
            const decorators = this.decoratorBuffer.length > 0 ? [...this.decoratorBuffer] : undefined;
            if (decorators) {
                this.decoratorBuffer = []; // Clear buffer
            }
            const forLoop = parseForLoop(this.stream, {
                parseStatement: (s) => this.parseStatementFromStream(s),
                parseComment: (s) => this.parseCommentFromStream(s),
                createCodePosition: (start, end) => ({
                    startRow: start.line - 1,
                    startCol: start.column,
                    endRow: end.line - 1,
                    endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
                })
            }, decorators);
            return forLoop;
        }

        // Check for 'together' block (must come before 'do' check since together contains do blocks)
        if (currentToken.kind === TokenKind.KEYWORD && currentToken.text === 'together') {
            // Attach decorators if any are in the buffer
            const decorators = this.decoratorBuffer.length > 0 ? [...this.decoratorBuffer] : undefined;
            if (decorators) {
                this.decoratorBuffer = []; // Clear buffer
            }
            const togetherBlock = parseTogether(this.stream, {
                parseStatement: (s) => this.parseStatementFromStream(s),
                parseComment: (s) => this.parseCommentFromStream(s),
                createCodePosition: (start, end) => ({
                    startRow: start.line - 1,
                    startCol: start.column,
                    endRow: end.line - 1,
                    endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
                })
            }, decorators);
            return togetherBlock;
        }

        // Check for 'do' scope block
        if (currentToken.kind === TokenKind.KEYWORD && currentToken.text === 'do') {
            if (Parser.debug) {
                const timestamp = new Date().toISOString();
                console.log(`[Parser.parseStatement] [${timestamp}] Found 'do' keyword, calling ScopeParser.parse at position ${this.stream.getPosition()}`);
            }
            // Attach decorators if any are in the buffer
            const decorators = this.decoratorBuffer.length > 0 ? [...this.decoratorBuffer] : undefined;
            if (decorators) {
                this.decoratorBuffer = []; // Clear buffer
            }
            const scopeBlock = ScopeParser.parse(
                this.stream,
                (s) => this.parseStatementFromStream(s),
                (s) => this.parseCommentFromStream(s),
                decorators
            );
            return scopeBlock;
        }

        // Check for standalone object literal: {...}
        if (currentToken.kind === TokenKind.LBRACE) {
            const objResult = ObjectLiteralParser.parse(this.stream);
            const createCodePosition = (start: Token, end: Token) => ({
                startRow: start.line - 1,
                startCol: start.column,
                endRow: end.line - 1,
                endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
            });
            return {
                type: 'command',
                name: '_object',
                args: [{ type: 'object', code: objResult.code }],
                codePos: createCodePosition(objResult.startToken, objResult.endToken)
            };
        }

        // Check for standalone array literal: [...]
        if (currentToken.kind === TokenKind.LBRACKET) {
            const arrResult = ArrayLiteralParser.parse(this.stream);
            const createCodePosition = (start: Token, end: Token) => ({
                startRow: start.line - 1,
                startCol: start.column,
                endRow: end.line - 1,
                endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
            });
            return {
                type: 'command',
                name: '_array',
                args: [{ type: 'array', code: arrResult.code }],
                codePos: createCodePosition(arrResult.startToken, arrResult.endToken)
            };
        }

        // Check for standalone string literal: "..." or '...' or `...`
        // These should set the last value ($) to the string value
        if (currentToken.kind === TokenKind.STRING) {
            const isTemplateString = currentToken.text.startsWith('`');
            const value = currentToken.value !== undefined ? currentToken.value : LexerUtils.parseString(currentToken.text);
            const stringToken = currentToken;
            this.stream.next();
            const createCodePosition = (start: Token, end: Token) => ({
                startRow: start.line - 1,
                startCol: start.column,
                endRow: end.line - 1,
                endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
            });
            // Mark template strings with special prefix
            const stringValue = isTemplateString ? `\0TEMPLATE\0${value}` : value;
            return {
                type: 'command',
                name: '_literal',
                args: [{ type: 'string', value: stringValue }],
                codePos: createCodePosition(stringToken, stringToken)
            };
        }

        // Check for standalone number literal
        if (currentToken.kind === TokenKind.NUMBER) {
            const value = currentToken.value !== undefined ? currentToken.value : parseFloat(currentToken.text);
            const numberToken = currentToken;
            this.stream.next();
            const createCodePosition = (start: Token, end: Token) => ({
                startRow: start.line - 1,
                startCol: start.column,
                endRow: end.line - 1,
                endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
            });
            return {
                type: 'command',
                name: '_literal',
                args: [{ type: 'number', value }],
                codePos: createCodePosition(numberToken, numberToken)
            };
        }

        // Check for standalone boolean literal
        if (currentToken.kind === TokenKind.BOOLEAN) {
            const value = currentToken.value !== undefined ? currentToken.value : (currentToken.text === 'true');
            const booleanToken = currentToken;
            this.stream.next();
            const createCodePosition = (start: Token, end: Token) => ({
                startRow: start.line - 1,
                startCol: start.column,
                endRow: end.line - 1,
                endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
            });
            return {
                type: 'command',
                name: '_literal',
                args: [{ type: 'literal', value }],
                codePos: createCodePosition(booleanToken, booleanToken)
            };
        }

        // Check for standalone null literal
        if (currentToken.kind === TokenKind.NULL) {
            const nullToken = currentToken;
            this.stream.next();
            const createCodePosition = (start: Token, end: Token) => ({
                startRow: start.line - 1,
                startCol: start.column,
                endRow: end.line - 1,
                endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
            });
            return {
                type: 'command',
                name: '_literal',
                args: [{ type: 'literal', value: null }],
                codePos: createCodePosition(nullToken, nullToken)
            };
        }

        // Check for standalone subexpression: $(...)
        // These should set the last value ($) to the subexpression result
        if (currentToken.kind === TokenKind.SUBEXPRESSION_OPEN) {
            const subexpr = SubexpressionParser.parse(this.stream, {
                parseStatement: (s) => this.parseStatementFromStream(s),
                createCodePosition: (start, end) => ({
                    startRow: start.line - 1,
                    startCol: start.column,
                    endRow: end.line - 1,
                    endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
                })
            });

            // Wrap in _subexpr command to set last value
            // Pass as Expression type so evaluateArg can properly evaluate it
            return {
                type: 'command',
                name: '_subexpr',
                args: [{ 
                    type: 'subexpression', 
                    body: subexpr.body,
                    codePos: subexpr.codePos
                }],
                codePos: subexpr.codePos
            };
        }

        // Check for command call (identifier or keyword that's not a variable assignment or do block)
        if (currentToken.kind === TokenKind.IDENTIFIER || currentToken.kind === TokenKind.KEYWORD) {
            // Check if this is 'def' or 'define' (function definition)
            const isDef = currentToken.kind === TokenKind.KEYWORD && currentToken.text === 'def';
            const isDefine = currentToken.kind === TokenKind.IDENTIFIER && currentToken.text === 'define';

            if (isDef || isDefine) {
                // Claim decorators from buffer and pass to DefineParser
                const decorators: DecoratorCall[] = [];
                if (this.decoratorBuffer.length > 0) {
                    decorators.push(...this.decoratorBuffer);
                    this.decoratorBuffer = []; // Clear buffer
                }
                
                const func = await DefineParser.parse(
                    this.stream,
                    (s) => this.parseStatementFromStream(s),
                    (s) => this.parseCommentFromStream(s),
                    decorators.length > 0 ? decorators : undefined,
                    this.environment
                );
                
                // Add to extracted functions if not already present (for hoisting)
                const existingFunc = this.extractedFunctions.find(f => f.name === func.name);
                if (!existingFunc) {
                    this.extractedFunctions.push(func);
                }
                
                return func;
            }
            
            // Check if this is 'on' (event handler)
            if (currentToken.kind === TokenKind.KEYWORD && currentToken.text === 'on') {
                // Claim decorators from buffer and pass to EventParser
                const decorators: DecoratorCall[] = [];
                if (this.decoratorBuffer.length > 0) {
                    decorators.push(...this.decoratorBuffer);
                    this.decoratorBuffer = []; // Clear buffer
                }
                
                const onBlock = await EventParser.parse(
                    this.stream,
                    (s) => this.parseStatementFromStream(s),
                    (s) => this.parseCommentFromStream(s),
                    decorators.length > 0 ? decorators : undefined,
                    this.environment
                );
                
                // Add to extracted event handlers if not already present (for hoisting)
                const existingHandler = this.extractedEventHandlers.find(h => h.eventName === onBlock.eventName);
                if (!existingHandler) {
                    this.extractedEventHandlers.push(onBlock);
                }
                
                return onBlock;
            }
            
            // Make sure it's not part of an assignment (we already checked for that above)
            const command = CommandParser.parse(this.stream, {
                parseStatement: (s) => this.parseStatementFromStream(s),
                createCodePosition: (start, end) => ({
                    startRow: start.line - 1,
                    startCol: start.column,
                    endRow: end.line - 1,
                    endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
                }),
                parseScope: (s) => {
                    // Check if this is a 'with' block or 'do' block
                    const currentToken = s.current();
                    if (currentToken && currentToken.kind === TokenKind.KEYWORD && currentToken.text === 'with') {
                        return WithScopeParser.parse(s,
                            (s2) => this.parseStatementFromStream(s2),
                            (s2) => this.parseCommentFromStream(s2)
                        );
                    } else {
                        return ScopeParser.parse(s,
                    (s2) => this.parseStatementFromStream(s2),
                    (s2) => this.parseCommentFromStream(s2)
                        );
                    }
                }
            });
            // Check if this is a var/const command and attach decorators
            if (command.type === 'command' && (command.name === 'var' || command.name === 'const')) {
                // Claim decorators from buffer
                const decorators: DecoratorCall[] = [];
                if (this.decoratorBuffer.length > 0) {
                    decorators.push(...this.decoratorBuffer);
                    this.decoratorBuffer = []; // Clear buffer
                }
                
                if (decorators.length > 0) {
                    command.decorators = decorators;
                    // Extract variable name from command args (first arg should be the variable)
                    if (command.args.length > 0 && command.args[0].type === 'var') {
                        const varName = command.args[0].name;
                        // Execute parse decorators during parsing
                        await this.executeParseDecorators(decorators, varName, null);
                    }
                }
            }
            return command;
        }

        // TODO: Add other statement parsers here
        // - If blocks
        // - Loops
        // - Function definitions
        // etc.

        if (Parser.debug) {
            const timestamp = new Date().toISOString();
            console.log(`[Parser.parseStatement] [${timestamp}] No matching statement type for token: ${token.text} (${token.kind}) at position ${this.stream.getPosition()}`);
        }
        return null;
    }

    /**
     * Attach inline comments to a statement if they exist on the same line
     */
    private attachInlineComments(statement: Statement): void {
        // Get the statement's line number from codePos
        let statementLine: number | undefined;
        if ('codePos' in statement && statement.codePos) {
            statementLine = statement.codePos.endRow;
        }

        if (statementLine === undefined) {
            return;
        }

        // Use CommentParser to parse inline comment
        const inlineComment = CommentParser.parseInlineComment(this.stream, statementLine);
        
        if (inlineComment) {
            CommentParser.attachComments(statement, [inlineComment]);
        }
    }


    /**
     * Execute parse-time decorators during parsing
     * Parse decorators inject metadata into AST nodes
     */
    private async executeParseDecorators(decorators: DecoratorCall[], targetName: string, func: DefineFunction | null): Promise<void> {
        if (!this.environment) {
            // No environment provided, skip parse decorators
            return;
        }

        for (const decorator of decorators) {
            // Check if this is a parse decorator
            const parseDecoratorHandler = this.environment.parseDecorators.get(decorator.name);
            if (parseDecoratorHandler) {
                // Execute parse decorator with AST arguments (not evaluated)
                await parseDecoratorHandler(targetName, func, decorator.args, this.environment);
            }
            // If it's not a parse decorator, it will be executed at runtime by Executor
        }
    }

    /**
     * Serialize AST to a JSON-serializable format
     * Handles circular references and nested structures properly
     */
    private serializeAST(obj: any): any {
        const seen = new WeakSet();
        
        const serialize = (value: any): any => {
            // Handle null and undefined
            if (value === null || value === undefined) {
                return value;
            }
            
            // Handle primitives
            if (typeof value !== 'object') {
                return value;
            }
            
            // Handle arrays
            if (Array.isArray(value)) {
                return value.map(item => serialize(item));
            }
            
            // Handle circular references
            if (seen.has(value)) {
                return '[Circular]';
            }
            seen.add(value);
            
            // Handle objects
            const result: any = {};
            for (const key in value) {
                if (Object.prototype.hasOwnProperty.call(value, key)) {
                    // Skip internal/private properties that shouldn't be serialized
                    if (key.startsWith('_') && key !== '_subexpr') {
                        continue;
                    }
                    result[key] = serialize(value[key]);
                }
            }
            
            return result;
        };
        
        return serialize(obj);
    }
}
