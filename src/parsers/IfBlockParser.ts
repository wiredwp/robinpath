/**
 * Parser for 'if' blocks
 * Syntax: if <condition> ... [elseif <condition> ...] [else ...] endif
 */

import { Lexer } from '../classes/Lexer';
import { BlockParserBase, type BlockParserContext } from './BlockParserBase';
import type { CommentWithPosition, IfBlock } from '../index';

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
}
