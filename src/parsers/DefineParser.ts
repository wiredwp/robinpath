/**
 * Parser for 'def' blocks
 * Syntax: def functionName [$param1 $param2 ...] ... enddef
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
import type { CommentWithPosition, DefineFunction, Statement } from '../index';

export interface DefineHeader {
    /**
     * Function name
     */
    name: string;
    
    /**
     * Parameter names (without $)
     */
    paramNames: string[];
    
    /**
     * Comments attached to the def statement
     */
    comments: CommentWithPosition[];
}

export class DefineParser extends BlockParserBase {
    constructor(context: BlockParserContext) {
        super(context);
    }
    
    /**
     * Parse the 'def' block header
     * Syntax: def functionName [$param1 $param2 ...]
     */
    parseHeader(): DefineHeader {
        const line = this.context.originalLine.trim();
        const tokens = Lexer.tokenize(line);
        
        if (tokens.length < 2) {
            throw this.createError('def requires a function name');
        }

        const name = tokens[1];
        
        // Parse parameter names (optional): def fn $a $b $c
        // Start from token index 2, no end limit (parse all parameters)
        const paramNames = this.parseParameterNames(tokens, 2, tokens.length);
        
        // Extract inline comment from def line
        const inlineComment = this.extractInlineComment(this.context.originalLine);
        const comments: CommentWithPosition[] = [];
        if (inlineComment) {
            comments.push(this.createInlineCommentWithPosition(this.context.originalLine, inlineComment));
        }
        
        return { name, paramNames, comments };
    }
    
    /**
     * Parse the complete 'def' block (header + body)
     * Syntax: def functionName [$param1 $param2 ...] ... enddef
     */
    parseBlock(startLine: number): DefineFunction {
        // Parse header
        const header = this.parseHeader();
        const { name, paramNames, comments } = header;
        
        this.context.advanceLine();

        const body: DefineFunction['body'] = [];
        let closed = false;
        let pendingComments: string[] = [];
        const pendingCommentLines: number[] = [];
        let hasBlankLineAfterLastComment = false;
        let hasCreatedCommentNodes = false;

        while (this.context.getCurrentLine() < this.context.lines.length) {
            const currentLine = this.context.getCurrentLine();
            const originalBodyLine = this.context.lines[currentLine];
            const bodyLine = originalBodyLine.trim();
            
            // Blank line: mark that blank line appeared after last comment
            if (!bodyLine) {
                hasBlankLineAfterLastComment = true;
                this.context.advanceLine();
                continue;
            }
            
            // Comment line: if we have pending comments with blank line after, create comment nodes
            if (bodyLine.startsWith('#')) {
                const commentText = bodyLine.slice(1).trim();
                
                // If we have pending comments and there was a blank line after them, create comment nodes
                if (pendingComments.length > 0 && hasBlankLineAfterLastComment) {
                    // Group consecutive orphaned comments into a single node
                    body.push(this.context.createGroupedCommentNode(pendingComments, pendingCommentLines));
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                    hasCreatedCommentNodes = true;
                } else if (!hasBlankLineAfterLastComment) {
                    // Consecutive comment (no blank line) - reset flag so they can be attached
                    hasCreatedCommentNodes = false;
                }
                
                // Start new sequence with this comment
                pendingComments.push(commentText);
                pendingCommentLines.push(currentLine);
                hasBlankLineAfterLastComment = false;
                this.context.advanceLine();
                continue;
            }

            const bodyTokens = Lexer.tokenize(bodyLine);
            
            if (bodyTokens[0] === 'enddef') {
                this.context.advanceLine();
                closed = true;
                break;
            }

            const stmt = this.context.parseStatement();
            if (stmt) {
                const allComments: string[] = [];
                
                // If there was a blank line after pending comments, create comment nodes
                if (pendingComments.length > 0 && hasBlankLineAfterLastComment && hasCreatedCommentNodes) {
                    // comment -> blank -> comment -> blank -> statement: all comments become nodes
                    // Group consecutive orphaned comments into a single node
                    body.push(this.context.createGroupedCommentNode(pendingComments, pendingCommentLines));
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                } else if (pendingComments.length > 0 && hasBlankLineAfterLastComment && !hasCreatedCommentNodes) {
                    // comment -> blank -> statement: comment becomes node (not attached)
                    // Group consecutive orphaned comments into a single node
                    body.push(this.context.createGroupedCommentNode(pendingComments, pendingCommentLines));
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                } else if (pendingComments.length > 0) {
                    // No blank line after comments - attach them (consecutive comments)
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
                hasBlankLineAfterLastComment = false;
                hasCreatedCommentNodes = false;
            }
        }

        // Handle any remaining pending comments at end of block
        // Group consecutive orphaned comments into a single node
        if (pendingComments.length > 0) {
            body.push(this.context.createGroupedCommentNode(pendingComments, pendingCommentLines));
        }

        if (!closed) {
            throw this.createError('missing enddef');
        }

        const endLine = this.context.getCurrentLine() - 1; // enddef line
        const result: DefineFunction = { 
            type: 'define', 
            name, 
            paramNames, 
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
     * Parse 'def' block from TokenStream - TOKEN-BASED VERSION
     * 
     * @param stream - TokenStream positioned at the 'def' keyword
     * @param headerToken - The 'def' keyword token
     * @param context - Context with helper methods
     * @returns Parsed DefineFunction
     */
    static parseFromStream(
        stream: TokenStream,
        headerToken: Token,
        context: BlockTokenStreamContext
    ): DefineFunction {
        // 1. Validate precondition: stream should be at 'def'
        if (headerToken.text !== 'def') {
            throw new Error(`parseFromStream expected 'def' keyword, got '${headerToken.text}'`);
        }
        
        // Consume 'def' keyword
        stream.next();
        
        // 2. Parse function name
        stream.skip(TokenKind.COMMENT);
        const nameToken = stream.current();
        if (!nameToken || nameToken.kind === TokenKind.EOF || nameToken.kind === TokenKind.NEWLINE) {
            throw new Error(`def block requires a function name at line ${headerToken.line}`);
        }
        
        const name = nameToken.text;
        stream.next(); // consume function name
        
        // 3. Parse parameters (optional): def fn $a $b $c
        const paramNames: string[] = [];
        const headerComments: CommentWithPosition[] = [];
        
        // Collect tokens until newline
        const headerTokens: Token[] = [];
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
            headerTokens.push(t);
            stream.next();
        }
        
        // Parse parameter names from header tokens
        for (const token of headerTokens) {
            // Parameters should be variables (starting with $)
            if (token.kind === TokenKind.VARIABLE || LexerUtils.isVariable(token.text)) {
                const { name: paramName } = LexerUtils.parseVariablePath(token.text);
                if (paramName && /^[A-Za-z_][A-Za-z0-9_]*$/.test(paramName)) {
                    paramNames.push(paramName);
                }
            }
        }
        
        // 4. Parse body tokens until matching 'enddef'
        const body: Statement[] = [];
        const bodyStartToken = stream.current() ?? headerToken;
        let endToken = bodyStartToken;
        
        while (!stream.isAtEnd()) {
            const t = stream.current();
            if (!t || t.kind === TokenKind.EOF) break;
            
            endToken = t;
            
            // Check for 'enddef' keyword - this closes our block
            if (t.kind === TokenKind.KEYWORD && t.text === 'enddef') {
                // Found closing enddef for our block
                stream.next(); // consume 'enddef'
                
                // Consume everything until end of line after 'enddef'
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
        
        // 5. Build codePos from headerToken to endToken
        const codePos = context.createCodePositionFromTokens(headerToken, endToken);
        
        // 6. Build result
        const result: DefineFunction = {
            type: 'define',
            name,
            paramNames,
            body,
            codePos
        };
        
        if (headerComments.length > 0) {
            result.comments = headerComments;
        }
        
        return result;
    }
}
