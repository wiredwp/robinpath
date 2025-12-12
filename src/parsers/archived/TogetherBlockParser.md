/*
This is old code that is no longer used. It is kept here for reference.
This is a line-based parser.
*/

/**
 * Parser for 'together' blocks
 * Syntax: together ... endtogether
 * 
 * Supports both:
 * - Line-based parsing (legacy): parseBlock(startLine)
 * - TokenStream-based parsing: parseFromStream(stream, headerToken, context)
 */

import { Lexer, TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { TokenStream } from '../classes/TokenStream';
import { BlockParserBase, type BlockParserContext, type BlockTokenStreamContext } from './BlockParserBase';
import { ScopeParser } from './ScopeParser';
import type { CommentWithPosition, TogetherBlock, ScopeBlock } from '../types/Ast.type';

export interface TogetherBlockHeader {
    /**
     * Comments attached to the together statement
     */
    comments: CommentWithPosition[];
}

export class TogetherBlockParser extends BlockParserBase {
    constructor(context: BlockParserContext) {
        super(context);
    }
    
    /**
     * Parse the 'together' block header
     * Syntax: together
     */
    parseHeader(): TogetherBlockHeader {
        const line = this.context.originalLine.trim();
        const tokens = Lexer.tokenize(line);
        
        // Must start with "together"
        if (tokens[0] !== 'together') {
            throw this.createError('expected together');
        }
        
        // Extract inline comment from together line
        const inlineComment = this.extractInlineComment(this.context.originalLine);
        const comments: CommentWithPosition[] = [];
        if (inlineComment) {
            comments.push(this.createInlineCommentWithPosition(this.context.originalLine, inlineComment));
        }
        
        return { comments };
    }
    
    /**
     * Parse the complete 'together' block (header + body)
     * Syntax: together ... endtogether
     */
    parseBlock(startLine: number): TogetherBlock {
        // Parse header
        const header = this.parseHeader();
        
        // Collect comments above the together block (not handled by header parser)
        const comments: CommentWithPosition[] = [];
        let commentStartLine = startLine;
        while (commentStartLine > 0) {
            const prevLine = this.context.lines[commentStartLine - 1].trim();
            if (prevLine.startsWith('#')) {
                const lineNum = commentStartLine - 1;
                const line = this.context.lines[lineNum];
                const startCol = line.indexOf('#');
                const endCol = line.length - 1;
                comments.unshift({
                    text: prevLine.slice(1).trim(),
                    codePos: this.createCodePosition(lineNum, startCol >= 0 ? startCol : 0, lineNum, endCol >= 0 ? endCol : 0)
                });
                commentStartLine--;
            } else if (prevLine === '') {
                commentStartLine--;
            } else {
                break;
            }
        }
        
        // Add inline comment from header to comments
        if (header.comments.length > 0) {
            comments.push(...header.comments);
        }

        this.context.advanceLine(); // Move past "together" line

        const blocks: TogetherBlock['blocks'] = [];
        let closed = false;

        // Parse do blocks until we find "endtogether"
        while (this.context.getCurrentLine() < this.context.lines.length) {
            const currentLine = this.context.getCurrentLine();
            const bodyLine = this.context.lines[currentLine];
            const trimmedBodyLine = bodyLine.trim();

            // Skip empty lines
            if (!trimmedBodyLine || trimmedBodyLine.startsWith('#')) {
                this.context.advanceLine();
                continue;
            }

            const bodyTokens = Lexer.tokenize(trimmedBodyLine);

            // Check for endtogether
            if (bodyTokens[0] === 'endtogether') {
                this.context.advanceLine();
                closed = true;
                break;
            }

            // Only allow "do" blocks inside together
            if (bodyTokens[0] !== 'do') {
                throw this.createError('together block can only contain do blocks');
            }

            // Parse the do block using token stream approach
            // Tokenize the line and find the 'do' token
            const lineTokens = Lexer.tokenizeFull(trimmedBodyLine);
            const doTokenIndex = lineTokens.findIndex(t => t.kind === TokenKind.KEYWORD && t.text === 'do');
            if (doTokenIndex < 0) {
                throw this.createError('expected do block');
            }
            
            const doToken = lineTokens[doTokenIndex];
            const stream = new TokenStream(lineTokens, doTokenIndex);
            
            // Create a token stream context for the do block
            const doBlockContext: BlockTokenStreamContext = {
                lines: this.context.lines,
                parseStatementFromTokens: (_tokenStream: TokenStream) => {
                    // This is a simplified context - in practice, this should delegate to the main parser
                    // For now, we'll use the line-based parseStatement from the context
                    return this.context.parseStatement();
                },
                createCodePositionFromTokens: (startToken: Token, endToken: Token) => {
                    return this.context.createCodePositionFromLines(startToken.line - 1, endToken.line - 1);
                },
                createCodePositionFromLines: (startRow: number, endRow: number) => this.context.createCodePositionFromLines(startRow, endRow),
                createGroupedCommentNode: (comments: string[], commentLines: number[]) => this.context.createGroupedCommentNode(comments, commentLines)
            };
            
            const doBlock = ScopeParser.parseFromStream(stream, doToken, doBlockContext);
            
            // parseFromStream now returns ScopeBlock with optional into property
            if (doBlock.type === 'do') {
                blocks.push(doBlock);
            } else {
                throw this.createError('together block can only contain do blocks');
            }
        }

        if (!closed) {
            throw this.createError('missing endtogether');
        }

        const endLine = this.context.getCurrentLine() - 1;
        const togetherBlock: TogetherBlock = {
            type: 'together',
            blocks,
            codePos: this.context.createCodePositionFromLines(startLine, endLine)
        };
        if (comments.length > 0) {
            togetherBlock.comments = comments;
        }
        return togetherBlock;
    }
    
    // ========================================================================
    // TokenStream-based parsing methods
    // ========================================================================
    
    /**
     * Parse 'together' block from TokenStream - TOKEN-BASED VERSION
     * 
     * @param stream - TokenStream positioned at the 'together' keyword
     * @param headerToken - The 'together' keyword token
     * @param context - Context with helper methods
     * @returns Parsed TogetherBlock
     */
    static parseFromStream(
        stream: TokenStream,
        headerToken: Token,
        context: BlockTokenStreamContext
    ): TogetherBlock {
        // 1. Validate precondition: stream should be at 'together'
        if (headerToken.text !== 'together') {
            throw new Error(`parseFromStream expected 'together' keyword, got '${headerToken.text}'`);
        }
        
        // Consume 'together' keyword
        stream.next();
        
        // 2. Consume to end of header line (handle inline comments)
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
            }
            stream.next();
        }
        
        // 3. Parse body: only 'do' blocks until 'endtogether'
        const blocks: ScopeBlock[] = [];
        let endToken = headerToken;
        
        while (!stream.isAtEnd()) {
            const t = stream.current();
            if (!t || t.kind === TokenKind.EOF) break;
            
            endToken = t;
            
            // Check for 'endtogether' keyword - this closes our block
            if (t.kind === TokenKind.KEYWORD && t.text === 'endtogether') {
                stream.next(); // consume 'endtogether'
                
                // Consume everything until end of line after 'endtogether'
                while (!stream.isAtEnd() && stream.current()?.kind !== TokenKind.NEWLINE) {
                    stream.next();
                }
                if (stream.current()?.kind === TokenKind.NEWLINE) {
                    stream.next(); // move to next logical statement
                }
                break;
            }
            
            // Skip newlines and comments
            if (t.kind === TokenKind.NEWLINE) {
                stream.next();
                continue;
            }
            
            if (t.kind === TokenKind.COMMENT) {
                stream.next();
                continue;
            }
            
            // Only allow 'do' blocks inside together
            if (t.kind !== TokenKind.KEYWORD || t.text !== 'do') {
                throw new Error(`together block can only contain do blocks at line ${t.line}`);
            }
            
            // Parse the do block using ScopeParser.parseFromStream
            // Create a new context for the do block
            const doBlockContext: BlockTokenStreamContext = {
                lines: context.lines,
                parseStatementFromTokens: context.parseStatementFromTokens,
                createCodePositionFromTokens: context.createCodePositionFromTokens,
                createCodePositionFromLines: context.createCodePositionFromLines,
                createGroupedCommentNode: context.createGroupedCommentNode
            };
            
            const doBlock = ScopeParser.parseFromStream(stream, t, doBlockContext);
            
            if (doBlock.type === 'do') {
                blocks.push(doBlock);
            } else {
                throw new Error(`together block can only contain do blocks at line ${t.line}`);
            }
        }
        
        // 4. Build codePos from headerToken to endToken
        const codePos = context.createCodePositionFromTokens(headerToken, endToken);
        
        // 5. Build result
        const result: TogetherBlock = {
            type: 'together',
            blocks,
            codePos
        };
        
        if (headerComments.length > 0) {
            result.comments = headerComments;
        }
        
        return result;
    }
}
