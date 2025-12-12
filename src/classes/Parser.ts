
import { Lexer, TokenKind } from './Lexer';
import type { Token } from './Lexer';
import { TokenStream } from './TokenStream';
import { AssignmentParser } from '../parsers/AssignmentParser';
import { CommandParser } from '../parsers/CommandParser';
import { DefineParser } from '../parsers/DefineParser';
import { ScopeParser } from '../parsers/ScopeParser';
import { parseForLoop } from '../parsers/ForLoopParser';
import { parseIf } from '../parsers/IfBlockParser';
import { parseReturn } from '../parsers/ReturnParser';
import { parseBreak } from '../parsers/BreakParser';
import { parseContinue } from '../parsers/ContinueParser';
import type { Statement, CommentStatement, CommentWithPosition, CodePosition, DefineFunction, OnBlock } from '../types/Ast.type';

export class Parser {
    private tokens: Token[];
    private stream: TokenStream;
    private extractedFunctions: DefineFunction[] = [];
    private extractedEventHandlers: OnBlock[] = [];
    private defBlockTokenIndices: Set<number> = new Set();
    private onBlockTokenIndices: Set<number> = new Set();

    /**
     * Create a new Parser
     * @param source - Full source code as a single string
     */
    constructor(source: string) {
        this.tokens = Lexer.tokenizeFull(source);
        this.stream = new TokenStream(this.tokens);
    }

    /**
     * Parse the source code into an AST
     * @returns Array of statements
     */
    parse(): Statement[] {
        // First pass: extract def/on blocks
        this.extractDefAndOnBlocks();

        // Second pass: parse remaining statements (skip def/on blocks)
        this.stream = new TokenStream(this.tokens); // Reset stream
        const statements: Statement[] = [];

        while (!this.stream.isAtEnd()) {
            const currentIndex = this.stream.getPosition();
            
            // Skip tokens that are part of extracted def/on blocks
            if (this.defBlockTokenIndices.has(currentIndex) || this.onBlockTokenIndices.has(currentIndex)) {
                this.stream.next();
                continue;
            }

            // Skip newlines
            if (this.stream.check(TokenKind.NEWLINE)) {
                this.stream.next();
                continue;
            }

            // Skip comments (they'll be handled separately)
            if (this.stream.check(TokenKind.COMMENT)) {
                const comment = this.parseComment();
                if (comment) {
                    statements.push(comment);
                }
                continue;
            }

            // Try to parse a statement
            const statement = this.parseStatement();
            if (statement) {
                // Attach inline comments if present
                this.attachInlineComments(statement);
                statements.push(statement);
            } else {
                // If we can't parse anything, skip the current token to avoid infinite loop
                const token = this.stream.next();
                if (!token) break;
            }
        }

        return statements;
    }

    /**
     * First pass: Extract def/on blocks and mark their token indices
     */
    private extractDefAndOnBlocks(): void {
        if (!this.tokens) {
            return;
        }
        const scanStream = new TokenStream([...this.tokens]);

        let lastIndex = -1;
        let loopCount = 0;

        while (!scanStream.isAtEnd()) {
            const currentIndex = scanStream.getPosition();
             // Safety check for infinite loop
            if (currentIndex === lastIndex) {
                loopCount++;
                if (loopCount > 100) {
                     const token = scanStream.current();
                     throw new Error(`Infinite loop detected in Parser.extractDefAndOnBlocks at index ${currentIndex}, token: ${token?.text}`);
                }
            } else {
                lastIndex = currentIndex;
                loopCount = 0;
            }

            const token = scanStream.current();
            if (!token) break;

            // Skip newlines and comments
            if (token.kind === TokenKind.NEWLINE || token.kind === TokenKind.COMMENT) {
                scanStream.next();
                continue;
            }

            // Check for 'def' keyword or 'define' identifier (alias)
            const isDef = token.kind === TokenKind.KEYWORD && token.text === 'def';
            const isDefine = token.kind === TokenKind.IDENTIFIER && token.text === 'define';
            if (isDef || isDefine) {
                const startIndex = scanStream.getPosition();
                const savedPosition = scanStream.getPosition();
                
                // Parse the def block
                try {
                    const func = DefineParser.parse(
                        scanStream,
                        (s) => this.parseStatementFromStream(s),
                        (s) => this.parseCommentFromStream(s)
                    );
                    this.extractedFunctions.push(func);

                    // Mark all tokens from start to current position as part of def block
                    const endIndex = scanStream.getPosition();
                    for (let i = startIndex; i < endIndex; i++) {
                        this.defBlockTokenIndices.add(i);
                    }
                } catch (error: any) {
                    if (error.isNestedDefinitionError) {
                        throw error; // Re-throw nested definition errors
                    }
                    // For other parsing errors, restore position and continue
                    scanStream.setPosition(savedPosition);
                    scanStream.next();
                }
                continue;
            }

            // TODO: Check for 'on' keyword and extract on blocks
            // For now, just skip other tokens
            scanStream.next();
        }
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
                    return AssignmentParser.parse(stream);
                }
                break;
            }
        }

        // Check for 'return' statement
        if (token.kind === TokenKind.KEYWORD && token.text === 'return') {
            return parseReturn(stream, {
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

        // Check for command call
        if (token.kind === TokenKind.IDENTIFIER || token.kind === TokenKind.KEYWORD) {
            return CommandParser.parse(stream, {
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
    private parseStatement(): Statement | null {
        const token = this.stream.current();
        if (!token) return null;

        // Check for variable assignment: $var = ...
        if (token.kind === TokenKind.VARIABLE) {
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
                    return AssignmentParser.parse(this.stream);
                }
                break; // Not an assignment
            }
        }

        // Check for 'return' statement
        if (token.kind === TokenKind.KEYWORD && token.text === 'return') {
            return parseReturn(this.stream, {
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
        if (token.kind === TokenKind.KEYWORD && token.text === 'continue') {
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
            return parseIf(this.stream, {
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
            return parseForLoop(this.stream, {
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
                this.stream,
                (s) => this.parseStatementFromStream(s),
                (s) => this.parseCommentFromStream(s)
            );
        }

        // Check for command call (identifier or keyword that's not a variable assignment or do block)
        if (token.kind === TokenKind.IDENTIFIER || token.kind === TokenKind.KEYWORD) {
            // Make sure it's not part of an assignment (we already checked for that above)
            return CommandParser.parse(this.stream, {
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

        // TODO: Add other statement parsers here
        // - If blocks
        // - Loops
        // - Function definitions
        // etc.

        return null;
    }

    /**
     * Attach inline comments to a statement if they exist on the same line
     */
    private attachInlineComments(statement: Statement): void {
        // Check if statement supports comments
        if (!('comments' in statement)) {
            return;
        }

        // Get the statement's line number from codePos
        let statementLine: number | undefined;
        if ('codePos' in statement && statement.codePos) {
            statementLine = statement.codePos.endRow;
        }

        if (statementLine === undefined) {
            return;
        }

        // Collect inline comments (comments on the same line, before newline)
        const inlineComments: CommentWithPosition[] = [];
        
        // Check if the next token is a comment on the same line
        const nextToken = this.stream.current();
        if (nextToken && nextToken.kind === TokenKind.COMMENT) {
            // Check if it's on the same line as the statement
            if (nextToken.line - 1 === statementLine) {
                const commentText = nextToken.text.startsWith('#') 
                    ? nextToken.text.slice(1).trim() 
                    : nextToken.text.trim();
                
                inlineComments.push({
                    text: commentText,
                    codePos: {
                        startRow: nextToken.line - 1,
                        startCol: nextToken.column,
                        endRow: nextToken.line - 1,
                        endCol: nextToken.column + nextToken.text.length - 1
                    },
                    inline: true
                });
                
                // Consume the comment token
                this.stream.next();
            }
        }

        // Attach inline comments to the statement
        if (inlineComments.length > 0) {
            if (!statement.comments) {
                (statement as any).comments = [];
            }
            (statement as any).comments.push(...inlineComments);
        }
    }

    /**
     * Parse a comment statement
     */
    private parseComment(): CommentStatement | null {
        const comments: CommentWithPosition[] = [];
        let startLine = -1;

        // Collect consecutive comment tokens
        while (this.stream.check(TokenKind.COMMENT)) {
            const token = this.stream.next();
            if (!token) break;

            if (startLine === -1) {
                startLine = token.line - 1; // Convert to 0-based
            }

            // Extract comment text (remove #)
            const commentText = token.text.startsWith('#') 
                ? token.text.slice(1).trim() 
                : token.text.trim();

            // Determine if it's inline (same line as code) or standalone
            // For now, we'll treat all comments as standalone
            // This can be improved by checking if there are non-comment tokens on the same line

            const codePos: CodePosition = {
                startRow: token.line - 1,
                startCol: token.column,
                endRow: token.line - 1,
                endCol: token.column + token.text.length - 1
            };

            comments.push({
                text: commentText,
                codePos,
                inline: false // TODO: Determine if inline based on context
            });

            // Skip newline after comment
            if (this.stream.check(TokenKind.NEWLINE)) {
                this.stream.next();
            }
        }

        if (comments.length === 0) {
            return null;
        }

        return {
            type: 'comment',
            comments,
            lineNumber: startLine // Deprecated but kept for compatibility
        };
    }
}
