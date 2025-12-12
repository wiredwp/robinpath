/*
This is old code that is no longer used. It is kept here for reference.
This is a line-based parser.
*/

/**
 * Parser for 'for' loops
 * Syntax: for $var in <expr> ... endfor
 * 
 * Supports both:
 * - Line-based parsing (legacy): parseBlock(startLine)
 * - TokenStream-based parsing: parseFromStream(stream, headerToken, context)
 */

import { Lexer, TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { TokenStream } from '../classes/TokenStream';
import { LexerUtils } from '../utils';
import { BlockParserBase, type BlockParserContext, type BlockTokenStreamContext } from './BlockParserBase';
import type { CommentWithPosition, ForLoop, Statement } from '../types/Ast.type';

export interface ForLoopHeader {
    /**
     * Loop variable name (without $)
     */
    varName: string;
    
    /**
     * Iterable expression as string
     */
    iterableExpr: string;
    
    /**
     * Comments attached to the for statement
     */
    comments: CommentWithPosition[];
}

export class ForLoopParser extends BlockParserBase {
    constructor(context: BlockParserContext) {
        super(context);
    }
    
    /**
     * Parse the 'for' loop header
     * Syntax: for $var in <expr>
     */
    parseHeader(): ForLoopHeader {
        const line = this.context.originalLine.trim();
        const tokens = Lexer.tokenize(line);
        
        // Parse: for $var in <expr>
        if (tokens.length < 4) {
            throw this.createError('for loop requires: for $var in <expr>');
        }
        
        if (tokens[0] !== 'for') {
            throw this.createError('expected for keyword');
        }
        
        // Get loop variable
        if (!LexerUtils.isVariable(tokens[1])) {
            throw this.createError('for loop variable must be a variable (e.g., $i, $item)');
        }
        const varName = tokens[1].slice(1); // Remove $
        
        if (tokens[2] !== 'in') {
            throw this.createError("for loop requires 'in' keyword");
        }
        
        // Get iterable expression (everything after 'in')
        const exprTokens = tokens.slice(3);
        const iterableExpr = exprTokens.join(' ');
        
        // Extract inline comment from for line
        const inlineComment = this.extractInlineComment(this.context.originalLine);
        const comments: CommentWithPosition[] = [];
        if (inlineComment) {
            comments.push(this.createInlineCommentWithPosition(this.context.originalLine, inlineComment));
        }
        
        return { varName, iterableExpr, comments };
    }
    
    /**
     * Parse the complete 'for' loop (header + body)
     * Syntax: for $var in <expr> ... endfor
     */
    parseBlock(startLine: number): ForLoop {
        // Parse header
        const header = this.parseHeader();
        const { varName, iterableExpr, comments } = header;
        
        this.context.advanceLine();

        const body: ForLoop['body'] = [];
        let closed = false;
        let pendingComments: string[] = [];
        const pendingCommentLines: number[] = [];

        while (this.context.getCurrentLine() < this.context.lines.length) {
            const currentLine = this.context.getCurrentLine();
            const originalBodyLine = this.context.lines[currentLine];
            const bodyLine = originalBodyLine.trim();
            
            // Blank line: preserve pending comments (they may be attached to next statement)
            if (!bodyLine) {
                this.context.advanceLine();
                continue;
            }
            
            // Comment line: if we have pending comments, they were separated by blank line, so create comment nodes
            // Then start a new sequence with this comment
            if (bodyLine.startsWith('#')) {
                const commentText = bodyLine.slice(1).trim();
                
                // If we have pending comments, they were separated by blank line from this comment
                // Create comment nodes for them (they won't be attached to a statement)
                // Group consecutive orphaned comments into a single node
                if (pendingComments.length > 0) {
                    body.push(this.context.createGroupedCommentNode(pendingComments, pendingCommentLines));
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                }
                
                // Start new sequence with this comment
                pendingComments.push(commentText);
                pendingCommentLines.push(currentLine);
                this.context.advanceLine();
                continue;
            }

            const bodyTokens = Lexer.tokenize(bodyLine);
            
            if (bodyTokens[0] === 'endfor') {
                this.context.advanceLine();
                closed = true;
                break;
            }

            const stmt = this.context.parseStatement();
            if (stmt) {
                const allComments: string[] = [];
                
                // Consecutive comments above
                if (pendingComments.length > 0) {
                    allComments.push(...pendingComments);
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                }
                
                // Inline comment on same line
                const inlineComment = this.extractInlineCommentAtLine(currentLine);
                if (inlineComment) {
                    allComments.push(inlineComment.text);
                }
                
                if (allComments.length > 0) {
                    (stmt as any).comments = allComments;
                }
                
                body.push(stmt);
            }
        }

        // Handle any remaining pending comments at end of block
        // Group consecutive orphaned comments into a single node
        if (pendingComments.length > 0) {
            body.push(this.context.createGroupedCommentNode(pendingComments, pendingCommentLines));
        }

        if (!closed) {
            throw this.createError('missing endfor');
        }

        const endLine = this.context.getCurrentLine() - 1; // endfor line
        const result: ForLoop = { 
            type: 'forLoop', 
            varName, 
            iterableExpr, 
            body,
            codePos: this.context.createCodePositionFromLines(startLine, endLine)
        };
        if (comments.length > 0) {
            result.comments = comments;
        }
        return result;
    }
    
    // ========================================================================
    // TokenStream-based parsing methods
    // ========================================================================
    
    /**
     * Parse 'for' loop from TokenStream - TOKEN-BASED VERSION
     * 
     * @param stream - TokenStream positioned at the 'for' keyword
     * @param headerToken - The 'for' keyword token
     * @param context - Context with helper methods
     * @returns Parsed ForLoop
     */
    static parseFromStream(
        stream: TokenStream,
        headerToken: Token,
        context: BlockTokenStreamContext
    ): ForLoop {
        // 1. Validate precondition: stream should be at 'for'
        if (headerToken.text !== 'for') {
            throw new Error(`parseFromStream expected 'for' keyword, got '${headerToken.text}'`);
        }
        
        // Consume 'for' keyword
        stream.next();
        
        // 2. Parse loop variable
        stream.skip(TokenKind.COMMENT);
        const varToken = stream.current();
        if (!varToken || varToken.kind === TokenKind.EOF || varToken.kind === TokenKind.NEWLINE) {
            throw new Error(`for loop requires a variable at line ${headerToken.line}`);
        }
        
        if (varToken.kind !== TokenKind.VARIABLE && !LexerUtils.isVariable(varToken.text)) {
            throw new Error(`for loop variable must be a variable (e.g., $i, $item) at line ${varToken.line}`);
        }
        
        const varName = LexerUtils.parseVariablePath(varToken.text).name;
        stream.next(); // consume variable token
        
        // 3. Expect 'in' keyword
        stream.skip(TokenKind.COMMENT);
        stream.expect('in', "for loop requires 'in' keyword");
        
        // 4. Parse iterable expression (everything after 'in' until newline)
        const iterableTokens: Token[] = [];
        const headerComments: CommentWithPosition[] = [];
        
        while (!stream.isAtEnd()) {
            const t = stream.current();
            if (!t) break;
            if (t.kind === TokenKind.NEWLINE) {
                stream.next(); // consume NEWLINE, move to first body token
                break;
            }
            if (t.kind === TokenKind.COMMENT) {
                // Capture inline comment on header line
                headerComments.push({
                    text: t.value ?? t.text.replace(/^#\s*/, ''),
                    inline: true,
                    codePos: context.createCodePositionFromTokens(t, t)
                });
                stream.next();
                continue;
            }
            iterableTokens.push(t);
            stream.next();
        }
        
        // Build iterable expression string from tokens
        const iterableExpr = iterableTokens.map(t => t.text).join(' ');
        
        // 5. Parse body tokens until matching 'endfor'
        const body: Statement[] = [];
        const bodyStartToken = stream.current() ?? headerToken;
        let endToken = bodyStartToken;
        
        while (!stream.isAtEnd()) {
            const t = stream.current();
            if (!t || t.kind === TokenKind.EOF) break;
            
            endToken = t;
            
            // Check for 'endfor' keyword - this closes our block
            if (t.kind === TokenKind.KEYWORD && t.text === 'endfor') {
                // Found closing endfor for our block
                stream.next(); // consume 'endfor'
                
                // Consume everything until end of line after 'endfor'
                while (!stream.isAtEnd() && stream.current()?.kind !== TokenKind.NEWLINE) {
                    stream.next();
                }
                if (stream.current()?.kind === TokenKind.NEWLINE) {
                    stream.next(); // move to next logical statement
                }
                break;
            }
            
            // Skip newlines and comments at the statement boundary
            if (t.kind === TokenKind.NEWLINE) {
                stream.next();
                continue;
            }
            
            if (t.kind === TokenKind.COMMENT) {
                // TODO: Handle standalone comments in body
                // For now, skip them
                stream.next();
                continue;
            }
            
            // Parse statement using context-provided parseStatementFromTokens
            const stmt = context.parseStatementFromTokens?.(stream);
            if (stmt) {
                body.push(stmt);
            } else {
                // If parseStatementFromTokens returns null, ensure progress
                stream.next();
            }
        }
        
        // 6. Build codePos from headerToken to endToken
        const codePos = context.createCodePositionFromTokens(headerToken, endToken);
        
        // 7. Build result
        const result: ForLoop = {
            type: 'forLoop',
            varName,
            iterableExpr,
            body,
            codePos
        };
        
        if (headerComments.length > 0) {
            result.comments = headerComments;
        }
        
        return result;
    }
}
