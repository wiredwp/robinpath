/**
 * CommentLayout - Normalize comment ownership
 * 
 * Decides, per statement:
 * - leadingComments: Comment[] (non-inline)
 * - inlineComment: Comment | null
 * - leadingGapLines: number (blank lines between last leading comment and statement)
 * - trailingBlankLinesAfterStandaloneComment: number (only for standalone comment nodes)
 */

import type { CommentWithPosition, Statement } from '../../types/Ast.type';
import type { CommentLayout as CommentLayoutType, LineIndex } from './types';

export class CommentLayoutNormalizer {
    /**
     * Normalize comment layout for a statement
     */
    static normalize(
        node: Statement,
        lineIndex: LineIndex
    ): CommentLayoutType {
        const hasComments = node.comments && Array.isArray(node.comments) && node.comments.length > 0;
        
        if (!hasComments) {
            return {
                leadingComments: [],
                inlineComment: null,
                leadingGapLines: 0,
                trailingBlankLinesAfterStandaloneComment: 0
            };
        }

        // Separate comments above from inline comments
        const leadingComments: CommentWithPosition[] = [];
        let inlineComment: CommentWithPosition | null = null;

        if (node.comments) {
            for (const comment of node.comments) {
                // Skip empty comments
                if (!comment.text || comment.text.trim() === '') {
                    continue;
                }

                if (comment.inline === true) {
                    inlineComment = comment;
                } else {
                    leadingComments.push(comment);
                }
            }
        }

        // Calculate leading gap lines (blank lines between last leading comment and statement)
        let leadingGapLines = 0;
        if (leadingComments.length > 0 && 'codePos' in node && node.codePos) {
            const lastComment = leadingComments[leadingComments.length - 1];
            const nodeStartRow = node.codePos.startRow;
            const lastCommentEndRow = lastComment.codePos.endRow;

            // Count blank lines between last comment and statement
            for (let row = lastCommentEndRow + 1; row < nodeStartRow; row++) {
                const line = lineIndex.getLine(row);
                if (line.trim() === '') {
                    leadingGapLines++;
                } else {
                    break;
                }
            }
        }

        // For standalone comment nodes, calculate trailing blank lines
        let trailingBlankLinesAfterStandaloneComment = 0;
        if (node.type === 'comment' && 'comments' in node && node.comments && Array.isArray(node.comments) && node.comments.length > 0) {
            const lastComment = node.comments[node.comments.length - 1];
            if (lastComment && lastComment.codePos) {
                const lastCommentEndRow = lastComment.codePos.endRow;
                const lines = lineIndex.getLines();
                
                // Count blank lines after the comment
                for (let row = lastCommentEndRow + 1; row < lines.length; row++) {
                    const line = lines[row];
                    if (line.trim() === '') {
                        trailingBlankLinesAfterStandaloneComment++;
                    } else {
                        break;
                    }
                }
            }
        }

        return {
            leadingComments,
            inlineComment,
            leadingGapLines,
            trailingBlankLinesAfterStandaloneComment
        };
    }
}
