/*
This is old code that is no longer used. It is kept here for reference.
This is a line-based parser.
*/

/**
 * Parser for 'if' blocks
 * Syntax: if <condition> ... [elseif <condition> ...] [else ...] endif
 * 
 * Supports both:
 * - Line-based parsing (legacy): parseBlock(startLine)
 * - TokenStream-based parsing: parseFromStream(stream, headerToken, context)
 */

import { Lexer, TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { TokenStream } from '../classes/TokenStream';
import { BlockParserBase, type BlockParserContext, type BlockTokenStreamContext } from './BlockParserBase';
import type { CommentWithPosition, IfBlock, Statement } from '../types/Ast.type';

export interface IfBlockHeader {
    /**
     * Condition expression as string
     */
    conditionExpr: string;
    
    /**
     * Comments attached to the if statement
     */
    comments: CommentWithPosition[];
}

export class IfBlockParser extends BlockParserBase {
    constructor(context: BlockParserContext) {
        super(context);
    }
    
    /**
     * Parse the 'if' block header
     * Syntax: if <condition>
     */
    parseHeader(): IfBlockHeader {
        const line = this.context.originalLine.trim();
        
        // Extract condition (everything after 'if')
        // Use the original line string to preserve subexpressions $(...)
        const ifIndex = line.indexOf('if');
        if (ifIndex === -1) {
            throw this.createError('if statement must start with "if"');
        }
        
        // Find the position after "if" and any whitespace
        let conditionStart = ifIndex + 2; // "if" is 2 characters
        while (conditionStart < line.length && /\s/.test(line[conditionStart])) {
            conditionStart++;
        }
        const conditionExpr = line.slice(conditionStart).trim();
        
        // Extract inline comment from if line
        const inlineComment = this.extractInlineComment(this.context.originalLine);
        const comments: CommentWithPosition[] = [];
        if (inlineComment) {
            comments.push(this.createInlineCommentWithPosition(this.context.originalLine, inlineComment));
        }
        
        return { conditionExpr, comments };
    }
    
    /**
     * Parse the complete 'if' block (header + body + elseif/else branches)
     * Syntax: if <condition> ... [elseif <condition> ...] [else ...] endif
     */
    parseBlock(startLine: number): IfBlock {
        // Parse header
        const header = this.parseHeader();
        const { conditionExpr, comments } = header;

        this.context.advanceLine();

        const thenBranch: IfBlock['thenBranch'] = [];
        const elseifBranches: Array<{ condition: string; body: IfBlock['thenBranch'] }> = [];
        let elseBranch: IfBlock['thenBranch'] | undefined;
        let currentBranch: IfBlock['thenBranch'] = thenBranch;
        let pendingComments: string[] = [];
        const pendingCommentLines: number[] = [];
        let hasBlankLineAfterLastComment = false;
        let hasCreatedCommentNodes = false;
        let closed = false;

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
                    currentBranch.push(this.context.createGroupedCommentNode(pendingComments, pendingCommentLines));
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

            const tokens = Lexer.tokenize(bodyLine);

            // Handle elseif - switch to new branch
            if (tokens[0] === 'elseif') {
                // Extract condition from original line string to preserve subexpressions $(...)
                const elseifIndex = bodyLine.indexOf('elseif');
                if (elseifIndex === -1) {
                    throw this.createError('elseif statement must contain "elseif"');
                }
                // Find the position after "elseif" and any whitespace
                let conditionStart = elseifIndex + 6; // "elseif" is 6 characters
                while (conditionStart < bodyLine.length && /\s/.test(bodyLine[conditionStart])) {
                    conditionStart++;
                }
                const condition = bodyLine.slice(conditionStart).trim();
                
                // Extract inline comment from elseif line
                const elseifInlineComment = this.extractInlineCommentAtLine(currentLine);
                const elseifComments: string[] = [];
                if (pendingComments.length > 0) {
                    elseifComments.push(...pendingComments);
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                }
                if (elseifInlineComment) {
                    elseifComments.push(elseifInlineComment.text);
                }
                
                elseifBranches.push({ condition, body: [] });
                currentBranch = elseifBranches[elseifBranches.length - 1].body;
                hasBlankLineAfterLastComment = false;
                hasCreatedCommentNodes = false;
                this.context.advanceLine();
                continue;
            }

            // Handle else - switch to else branch
            if (tokens[0] === 'else') {
                // Extract inline comment from else line
                const elseInlineComment = this.extractInlineCommentAtLine(currentLine);
                const elseComments: string[] = [];
                if (pendingComments.length > 0) {
                    elseComments.push(...pendingComments);
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                }
                if (elseInlineComment) {
                    elseComments.push(elseInlineComment.text);
                }
                
                elseBranch = [];
                currentBranch = elseBranch;
                hasBlankLineAfterLastComment = false;
                hasCreatedCommentNodes = false;
                this.context.advanceLine();
                continue;
            }

            // If this is our closing endif, consume it and stop
            if (tokens[0] === 'endif') {
                this.context.advanceLine();
                closed = true;
                break;
            }

            const stmt = this.context.parseStatement();
            if (stmt) {
                const allComments: string[] = [];
                
                // If we've created comment nodes before, remaining comments should also be nodes
                if (pendingComments.length > 0 && hasCreatedCommentNodes) {
                    // Group consecutive orphaned comments into a single node
                    currentBranch.push(this.context.createGroupedCommentNode(pendingComments, pendingCommentLines));
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                } else if (pendingComments.length > 0) {
                    // No comment nodes created - attach comments
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
                
                currentBranch.push(stmt);
                hasBlankLineAfterLastComment = false;
                hasCreatedCommentNodes = false;
            }
        }

        // Handle any remaining pending comments at end of block
        // Group consecutive orphaned comments into a single node
        if (pendingComments.length > 0) {
            currentBranch.push(this.context.createGroupedCommentNode(pendingComments, pendingCommentLines));
        }

        if (!closed) {
            throw this.createError('missing endif');
        }

        const endLine = this.context.getCurrentLine() - 1; // endif line
        const result: IfBlock = {
            type: 'ifBlock',
            conditionExpr,
            thenBranch,
            elseifBranches: elseifBranches.length > 0 ? elseifBranches : undefined,
            elseBranch,
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
     * Parse 'if' block from TokenStream - TOKEN-BASED VERSION
     * 
     * @param stream - TokenStream positioned at the 'if' keyword
     * @param headerToken - The 'if' keyword token
     * @param context - Context with helper methods
     * @returns Parsed IfBlock
     */
    static parseFromStream(
        stream: TokenStream,
        headerToken: Token,
        context: BlockTokenStreamContext
    ): IfBlock {
        // 1. Validate precondition: stream should be at 'if'
        if (headerToken.text !== 'if') {
            throw new Error(`parseFromStream expected 'if' keyword, got '${headerToken.text}'`);
        }
        
        // Consume 'if' keyword
        stream.next();
        
        // 2. Parse condition expression (everything after 'if' until newline)
        // IMPORTANT: Use original line text to preserve subexpressions $(...)
        // Don't reconstruct from tokens as that breaks subexpression syntax
        const headerLine = headerToken.line - 1; // Convert to 0-based
        const originalLine = context.lines[headerLine] || '';
        const trimmedLine = originalLine.trim();
        
        // Extract condition from original line string (preserves subexpressions)
        const ifIndex = trimmedLine.indexOf('if');
        let conditionStart = ifIndex + 2; // "if" is 2 characters
        while (conditionStart < trimmedLine.length && /\s/.test(trimmedLine[conditionStart])) {
            conditionStart++;
        }
        
        // Find where the condition ends (before inline comment or end of line)
        let conditionEnd = trimmedLine.length;
        const commentIndex = trimmedLine.indexOf('#', conditionStart);
        if (commentIndex >= conditionStart) {
            conditionEnd = commentIndex;
        }
        
        const conditionExpr = trimmedLine.slice(conditionStart, conditionEnd).trim();
        
        // Extract inline comments from header line
        const headerComments: CommentWithPosition[] = [];
        if (commentIndex >= conditionStart) {
            const commentText = trimmedLine.slice(commentIndex + 1).trim();
            headerComments.push({
                text: commentText,
                inline: true,
                codePos: context.createCodePositionFromTokens(headerToken, headerToken)
            });
        }
        
        // Advance stream past the header line (consume all tokens until newline)
        while (!stream.isAtEnd()) {
            const t = stream.current();
            if (!t) break;
            if (t.kind === TokenKind.NEWLINE) {
                stream.next(); // consume NEWLINE, move to first body token
                break;
            }
            stream.next(); // consume all tokens on the header line
        }
        
        // 3. Parse body: then branch, elseif branches, else branch until endif
        const thenBranch: Statement[] = [];
        const elseifBranches: Array<{ condition: string; body: Statement[] }> = [];
        let elseBranch: Statement[] | undefined;
        let currentBranch: Statement[] = thenBranch;
        let endToken = headerToken;
        
        while (!stream.isAtEnd()) {
            const t = stream.current();
            if (!t || t.kind === TokenKind.EOF) break;
            
            // Check for 'endif' keyword - this closes our block
            if (t.kind === TokenKind.KEYWORD && t.text === 'endif') {
                // Set endToken to the 'endif' token itself (or last token on that line)
                // This ensures the codePos spans to the endif line
                endToken = t;
                
                // Consume 'endif' and everything until end of line
                stream.next(); // consume 'endif'
                
                // Consume everything until end of line after 'endif'
                while (!stream.isAtEnd() && stream.current()?.kind !== TokenKind.NEWLINE) {
                    const nextToken = stream.current();
                    if (nextToken) {
                        endToken = nextToken; // Update to last token on the endif line
                    }
                    stream.next();
                }
                if (stream.current()?.kind === TokenKind.NEWLINE) {
                    stream.next(); // move to next logical statement
                }
                break;
            }
            
            endToken = t;
            
            // Check for 'elseif' keyword - switch to new branch
            if (t.kind === TokenKind.KEYWORD && t.text === 'elseif') {
                stream.next(); // consume 'elseif'
                
                // Parse elseif condition from original line text (preserves subexpressions)
                const elseifLine = t.line - 1; // Convert to 0-based
                const originalElseifLine = context.lines[elseifLine] || '';
                const trimmedElseifLine = originalElseifLine.trim();
                
                // Extract condition from original line string (preserves subexpressions)
                const elseifIndex = trimmedElseifLine.indexOf('elseif');
                let elseifConditionStart = elseifIndex + 6; // "elseif" is 6 characters
                while (elseifConditionStart < trimmedElseifLine.length && /\s/.test(trimmedElseifLine[elseifConditionStart])) {
                    elseifConditionStart++;
                }
                
                // Find where the condition ends (before inline comment or end of line)
                let elseifConditionEnd = trimmedElseifLine.length;
                const elseifCommentIndex = trimmedElseifLine.indexOf('#', elseifConditionStart);
                if (elseifCommentIndex >= elseifConditionStart) {
                    elseifConditionEnd = elseifCommentIndex;
                }
                
                const condition = trimmedElseifLine.slice(elseifConditionStart, elseifConditionEnd).trim();
                
                // Advance stream past the elseif line (consume all tokens until newline)
                while (!stream.isAtEnd()) {
                    const condToken = stream.current();
                    if (!condToken) break;
                    if (condToken.kind === TokenKind.NEWLINE) {
                        stream.next(); // consume NEWLINE
                        break;
                    }
                    stream.next(); // consume all tokens on the elseif line
                }
                
                elseifBranches.push({ condition, body: [] });
                currentBranch = elseifBranches[elseifBranches.length - 1].body;
                continue;
            }
            
            // Check for 'else' keyword - switch to else branch
            if (t.kind === TokenKind.KEYWORD && t.text === 'else') {
                stream.next(); // consume 'else'
                
                // Consume to end of line
                while (!stream.isAtEnd() && stream.current()?.kind !== TokenKind.NEWLINE) {
                    stream.next();
                }
                if (stream.current()?.kind === TokenKind.NEWLINE) {
                    stream.next(); // consume NEWLINE
                }
                
                elseBranch = [];
                currentBranch = elseBranch;
                continue;
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
                currentBranch.push(stmt);
            } else {
                // If parseStatementFromTokens returns null, ensure progress
                stream.next();
            }
        }
        
        // 4. Build codePos from headerToken to endToken
        const codePos = context.createCodePositionFromTokens(headerToken, endToken);
        
        // 5. Build result
        const result: IfBlock = {
            type: 'ifBlock',
            conditionExpr,
            thenBranch,
            elseifBranches: elseifBranches.length > 0 ? elseifBranches : undefined,
            elseBranch,
            codePos
        };
        
        if (headerComments.length > 0) {
            result.comments = headerComments;
        }
        
        return result;
    }
}
