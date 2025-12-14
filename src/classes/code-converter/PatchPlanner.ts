/**
 * PatchPlanner - Collect edit operations
 * 
 * Produces Patch[] = { startOffset, endOffset, replacement }.
 * Responsible for "range selection" (including blank lines, inline comment removal, etc.)
 * Must guarantee patches don't overlap (or resolve overlaps deterministically).
 */

import type { Statement, CommentWithPosition } from '../../types/Ast.type';
import type { Patch, LineIndex, CommentLayout as CommentLayoutType } from './types';
import { LineIndexImpl } from './LineIndex';
import { CommentLayoutNormalizer } from './CommentLayout';
import { Printer } from './Printer';
import { Parser } from '../Parser';

export class PatchPlanner {
    private lineIndex: LineIndex;
    private patches: Patch[] = [];
    private originalScript: string;

    constructor(originalScript: string) {
        this.originalScript = originalScript;
        this.lineIndex = new LineIndexImpl(originalScript);
    }

    /**
     * Plan patches for all nodes in the AST
     * This includes patches for:
     * - Updated nodes (in modified AST)
     * - New nodes (in modified AST but not in original)
     * - Deleted nodes (in original AST but not in modified)
     */
    async planPatches(ast: Statement[]): Promise<Patch[]> {
        this.patches = [];

        // Get original AST to detect deletions
        const parser = new Parser(this.originalScript);
        const originalAST = await parser.parse();

        // Create a set of codePos ranges from modified AST for fast lookup
        const modifiedRanges = new Set<string>();
        for (const node of ast) {
            if ('codePos' in node && node.codePos) {
                const key = `${node.codePos.startRow}:${node.codePos.startCol}:${node.codePos.endRow}:${node.codePos.endCol}`;
                modifiedRanges.add(key);
            }
        }

        // Detect and plan patches for deleted nodes
        for (const originalNode of originalAST) {
            if ('codePos' in originalNode && originalNode.codePos) {
                const key = `${originalNode.codePos.startRow}:${originalNode.codePos.startCol}:${originalNode.codePos.endRow}:${originalNode.codePos.endCol}`;
                
                // Check if this node still exists in modified AST (exact match)
                if (!modifiedRanges.has(key)) {
                    // Check if any modified node overlaps with this position (node might have been updated)
                    const hasOverlap = ast.some(node => {
                        if (!('codePos' in node) || !node.codePos) return false;
                        // Check if ranges overlap
                        return !(node.codePos.endRow < originalNode.codePos.startRow ||
                                node.codePos.startRow > originalNode.codePos.endRow ||
                                (node.codePos.endRow === originalNode.codePos.startRow && 
                                 node.codePos.endCol < originalNode.codePos.startCol) ||
                                (node.codePos.startRow === originalNode.codePos.endRow && 
                                 node.codePos.startCol > originalNode.codePos.endCol));
                    });

                    // If no overlap, this node was deleted
                    if (!hasOverlap) {
                        this.planPatchForDeletedNode(originalNode, originalAST);
                    }
                }
            }
        }

        // Plan patches for modified/new nodes
        // Use indexed loop to avoid O(n²) from indexOf
        for (let i = 0; i < ast.length; i++) {
            const node = ast[i];
            const prev = i > 0 ? ast[i - 1] : null;
            const next = i < ast.length - 1 ? ast[i + 1] : null;

            this.planPatchForNode(node, prev, next);
        }

        return this.patches;
    }

    /**
     * Plan a patch for a deleted node
     */
    private planPatchForDeletedNode(node: Statement, originalAST: Statement[]): void {
        if (!('codePos' in node) || !node.codePos) return;

        // Find the next node in original AST to determine deletion range
        const nodeIndex = originalAST.indexOf(node);
        const nextNode = nodeIndex >= 0 && nodeIndex < originalAST.length - 1 
            ? originalAST[nodeIndex + 1] 
            : null;

        // Compute deletion range
        const layout = CommentLayoutNormalizer.normalize(node, this.lineIndex);
        const range = this.computeStatementRange(node, layout, nextNode);
        
        if (!range) return;

        // Create deletion patch (empty replacement)
        this.patches.push({
            startOffset: range.startOffset,
            endOffset: range.endOffset,
            replacement: ''
        });
    }

    /**
     * Plan a patch for a single node
     */
    private planPatchForNode(node: Statement, prev: Statement | null, next: Statement | null): void {
        // Handle comment nodes separately
        if (node.type === 'comment') {
            this.planPatchForCommentNode(node, next);
            return;
        }

        // Normalize comment layout
        const layout = CommentLayoutNormalizer.normalize(node, this.lineIndex);

        // Check if comments need to be removed (empty comments array)
        const commentsExplicitlyEmpty = node.comments && Array.isArray(node.comments) && node.comments.length === 0;

        if (commentsExplicitlyEmpty) {
            // Remove existing comments
            this.planPatchToRemoveComments(node);
        }

        // Check if leading comments overlap with the statement
        const commentsOverlapStatement = layout.leadingComments.length > 0 && 
            'codePos' in node && node.codePos &&
            layout.leadingComments[layout.leadingComments.length - 1].codePos.endRow >= node.codePos.startRow;

        if (commentsOverlapStatement) {
            // Merge comment and statement into a single update
            const range = this.computeStatementRange(node, layout, next);
            if (!range) return;

            const replacement = this.generateReplacement(node, layout);
            this.patches.push({
                startOffset: range.startOffset,
                endOffset: range.endOffset,
                replacement
            });
        } else {
            // Process comments above separately (no overlap)
            if (layout.leadingComments.length > 0) {
                this.planPatchForLeadingComments(node, layout, prev);
            }

            // Process the node itself
            const range = this.computeStatementRange(node, layout, next);
            if (!range) return;

            // Generate replacement without leading comments (they're handled separately)
            let replacement = this.generateReplacementWithoutLeadingComments(node);
            
            // Handle new nodes being added beyond the end of the script
            // Similar to how comments are handled - need to add newline prefix
            const lineCount = this.lineIndex.lineCount();
            if ('codePos' in node && node.codePos && node.codePos.startRow >= lineCount) {
                // This is a new node being added at the end
                // Always add newline before the replacement for new nodes
                // This ensures proper separation from existing content
                if (replacement) {
                    replacement = '\n' + replacement;
                }
            }
            
            this.patches.push({
                startOffset: range.startOffset,
                endOffset: range.endOffset,
                replacement
            });
        }
    }

    /**
     * Plan patch for leading comments (non-overlapping case)
     */
    private planPatchForLeadingComments(
        node: Statement,
        layout: CommentLayoutType,
        prev: Statement | null
    ): void {
        if (layout.leadingComments.length === 0 || !('codePos' in node) || !node.codePos) {
            return;
        }

        const firstComment = layout.leadingComments[0];
        const lastComment = layout.leadingComments[layout.leadingComments.length - 1];

        // Check for blank lines before the first comment
        let effectiveStartRow = firstComment.codePos.startRow;
        let effectiveStartCol = firstComment.codePos.startCol;
        const commentParts: string[] = [];

        // Check if there's a standalone comment node before
        // If not, include blank lines before the first comment
        if (!(prev && prev.type === 'comment')) {
            // Check for blank lines before first comment
            for (let row = firstComment.codePos.startRow - 1; row >= 0; row--) {
                const line = this.lineIndex.getLine(row);
                if (line.trim() === '') {
                    effectiveStartRow = row;
                    effectiveStartCol = 0;
                    commentParts.push('');
                } else {
                    break;
                }
            }
        }

        // Add comment codes
        for (let i = 0; i < layout.leadingComments.length; i++) {
            const comment = layout.leadingComments[i];
            const commentCode = Printer.printComment(comment, 0);
            if (commentCode) {
                commentParts.push(commentCode);
            }

            // Check for blank lines between comments
            if (i < layout.leadingComments.length - 1) {
                const nextComment = layout.leadingComments[i + 1];
                for (let row = comment.codePos.endRow + 1; row < nextComment.codePos.startRow; row++) {
                    const line = this.lineIndex.getLine(row);
                    if (line.trim() === '') {
                        commentParts.push('');
                    } else {
                        break;
                    }
                }
            }
        }

        // Include blank lines after the last comment until the node
        let endRow = lastComment.codePos.endRow;
        let endCol = lastComment.codePos.endCol;
        for (let row = endRow + 1; row < node.codePos.startRow; row++) {
            const line = this.lineIndex.getLine(row);
            if (line.trim() === '') {
                commentParts.push('');
                endRow = row;
                endCol = line.length;
            } else {
                break;
            }
        }

        const combinedCommentCode = commentParts.join('\n');
        const actualStartRow = effectiveStartRow < firstComment.codePos.startRow 
            ? effectiveStartRow 
            : firstComment.codePos.startRow;
        const actualStartCol = effectiveStartRow < firstComment.codePos.startRow 
            ? effectiveStartCol 
            : firstComment.codePos.startCol;

        const startOffset = this.lineIndex.offsetAt(actualStartRow, actualStartCol, false);
        const endOffset = this.lineIndex.offsetAt(endRow, endCol, true);

        this.patches.push({
            startOffset,
            endOffset,
            replacement: combinedCommentCode
        });
    }

    /**
     * Generate replacement without leading comments (for non-overlapping case)
     */
    private generateReplacementWithoutLeadingComments(
        node: Statement
    ): string {
        const nodeCode = Printer.printNode(node, {
            indentLevel: 0,
            lineIndex: this.lineIndex
        });

        return nodeCode || '';
    }

    /**
     * Plan patch for a standalone comment node
     */
    private planPatchForCommentNode(node: any, next: Statement | null): void {
        if (!node.comments || !Array.isArray(node.comments) || node.comments.length === 0) {
            return;
        }

        const firstComment = node.comments[0];
        const lastComment = node.comments[node.comments.length - 1];

        if (!firstComment.codePos || !lastComment.codePos) {
            return;
        }

        // Generate comment code
        const commentCode = Printer.printNode(node, {
            indentLevel: 0,
            lineIndex: this.lineIndex
        });

        // Handle new nodes being added beyond the end of the script
        const lineCount = this.lineIndex.lineCount();
        const isNewNode = firstComment.codePos.startRow >= lineCount;

        if (isNewNode) {
            // This is a new comment being added at the end
            // Compute offset at the end of the script
            const lastLine = lineCount > 0 ? this.lineIndex.getLine(lineCount - 1) : '';
            const endOfScript = lineCount > 0 
                ? this.lineIndex.offsetAt(lineCount - 1, lastLine.length, true)
                : 0;
            
            // Add newline before comment if script doesn't end with newline
            const needsNewline = lineCount > 0 && !this.lineIndex.hasNewline(lineCount - 1);
            const replacement = needsNewline ? '\n' + commentCode : commentCode;
            
            this.patches.push({
                startOffset: endOfScript,
                endOffset: endOfScript,
                replacement
            });
            return;
        }

        // If comment code is empty, we're deleting
        if (commentCode === '') {
            // Find the range to delete
            const startOffset = this.lineIndex.offsetAt(
                firstComment.codePos.startRow,
                firstComment.codePos.startCol,
                false
            );

            // Include blank lines after the comment
            let endRow = lastComment.codePos.endRow;
            let endCol = lastComment.codePos.endCol;

            // Find where blank lines end
            const stopRow = next ? this.findStopRowForComment(next) : this.lineIndex.lineCount();

            for (let row = endRow + 1; row < stopRow; row++) {
                const line = this.lineIndex.getLine(row);
                if (line.trim() === '') {
                    endRow = row;
                    endCol = line.length;
                } else {
                    break;
                }
            }

            const endOffset = this.lineIndex.offsetAt(endRow, endCol, true);

            this.patches.push({
                startOffset,
                endOffset,
                replacement: ''
            });
        } else {
            // Replace comment with new code
            const startOffset = this.lineIndex.offsetAt(
                firstComment.codePos.startRow,
                firstComment.codePos.startCol,
                false
            );

            // Include blank lines after
            let endRow = lastComment.codePos.endRow;
            let endCol = lastComment.codePos.endCol;
            const stopRow = next ? this.findStopRowForComment(next) : this.lineIndex.lineCount();

            for (let row = endRow + 1; row < stopRow; row++) {
                const line = this.lineIndex.getLine(row);
                if (line.trim() === '') {
                    endRow = row;
                    endCol = line.length;
                } else {
                    break;
                }
            }

            const endOffset = this.lineIndex.offsetAt(endRow, endCol, true);

            // Add blank lines to replacement if needed
            const blankLinesCount = endRow - lastComment.codePos.endRow;
            const replacement = blankLinesCount > 0
                ? commentCode + '\n' + '\n'.repeat(blankLinesCount)
                : commentCode;

            this.patches.push({
                startOffset,
                endOffset,
                replacement
            });
        }
    }

    /**
     * Find the stop row for comment blank line inclusion
     */
    private findStopRowForComment(next: Statement): number {
        if (!('codePos' in next) || !next.codePos) {
            return this.lineIndex.lineCount();
        }

        let stopRow = next.codePos.startRow;

        // Check if next node has attached comments
        if (next.comments && Array.isArray(next.comments) && next.comments.length > 0) {
            const firstAttachedComment = next.comments.find((c: CommentWithPosition) => !c.inline);
            if (firstAttachedComment && firstAttachedComment.codePos) {
                stopRow = firstAttachedComment.codePos.startRow;
            }
        }

        return stopRow;
    }

    /**
     * Plan patch to remove existing comments
     */
    private planPatchToRemoveComments(node: Statement): void {
        if (!('codePos' in node) || !node.codePos) return;

        const nodeStartRow = node.codePos.startRow;
        const lines = this.lineIndex.getLines();

        // Look for comment lines immediately before this node (up to 10 lines)
        let commentStartRow = -1;
        let commentEndRow = -1;

        for (let row = nodeStartRow - 1; row >= Math.max(0, nodeStartRow - 10); row--) {
            const line = lines[row];
            const trimmed = line.trim();
            if (trimmed.startsWith('#')) {
                if (commentEndRow === -1) {
                    commentEndRow = row;
                }
                commentStartRow = row;
            } else if (trimmed === '') {
                continue;
            } else {
                break;
            }
        }

        // If we found comments above, remove them
        if (commentStartRow >= 0 && commentEndRow >= 0) {
            const firstLine = lines[commentStartRow];
            const lastLine = lines[commentEndRow];
            const startCol = firstLine.indexOf('#');
            const endCol = lastLine.length - 1;

            const startOffset = this.lineIndex.offsetAt(commentStartRow, startCol, false);
            const endOffset = this.lineIndex.offsetAt(commentEndRow, endCol, true);

            this.patches.push({
                startOffset,
                endOffset,
                replacement: ''
            });
        }

        // Also check for inline comments on the same line as the node
        if (nodeStartRow < lines.length) {
            const nodeLine = lines[nodeStartRow];
            const inlineCommentMatch = nodeLine.match(/(\s+#\s*.+)$/);
            if (inlineCommentMatch && 'codePos' in node && node.codePos) {
                const commentStartCol = nodeLine.indexOf('#', node.codePos.startCol);
                if (commentStartCol >= 0) {
                    const beforeComment = nodeLine.substring(0, commentStartCol).replace(/\s+$/, '');
                    const startOffset = this.lineIndex.offsetAt(nodeStartRow, beforeComment.length, false);
                    const endOffset = this.lineIndex.lineEndOffset(nodeStartRow);

                    this.patches.push({
                        startOffset,
                        endOffset,
                        replacement: this.lineIndex.hasNewline(nodeStartRow) ? '\n' : ''
                    });
                }
            }
        }
    }

    /**
     * Compute the range for a statement region
     */
    private computeStatementRange(
        node: Statement,
        layout: CommentLayoutType,
        next: Statement | null
    ): { startOffset: number; endOffset: number } | null {
        if (!('codePos' in node) || !node.codePos) return null;

        // Handle nodes that are being added beyond the end of the script
        // If startRow is beyond the script length, treat it as an append operation
        const lineCount = this.lineIndex.lineCount();
        if (node.codePos.startRow >= lineCount) {
            // This is a new node being added at the end
            // Use offsetAt with a row beyond the file to get the script length
            // This ensures we append after any existing content, including newlines
            const scriptLength = this.lineIndex.offsetAt(lineCount, 0, true);
            return {
                startOffset: scriptLength,
                endOffset: scriptLength
            };
        }

        // Start from the statement itself, or from leading comments if they overlap
        let startRow = node.codePos.startRow;
        let startCol = node.codePos.startCol;

        // If comments overlap the statement, start from first comment
        if (layout.leadingComments.length > 0) {
            const firstComment = layout.leadingComments[0];
            if (firstComment.codePos.endRow >= node.codePos.startRow) {
                startRow = firstComment.codePos.startRow;
                startCol = firstComment.codePos.startCol;
            }
        }

        // End at the statement end, or after inline comment
        let endRow = node.codePos.endRow;
        let endCol = node.codePos.endCol;

        if (layout.inlineComment) {
            if (layout.inlineComment.codePos.endCol > endCol) {
                endCol = layout.inlineComment.codePos.endCol;
            }
        }

        // Include blank lines after if needed
        const stopRow = next && 'codePos' in next && next.codePos 
            ? next.codePos.startRow 
            : this.lineIndex.lineCount();
        for (let row = endRow + 1; row < stopRow; row++) {
            const line = this.lineIndex.getLine(row);
            if (line.trim() === '') {
                endRow = row;
                endCol = line.length;
            } else {
                break;
            }
        }

        const startOffset = this.lineIndex.offsetAt(startRow, startCol, false);
        const endOffset = this.lineIndex.offsetAt(endRow, endCol, true);

        return { startOffset, endOffset };
    }

    /**
     * Generate replacement text for a node
     */
    private generateReplacement(node: Statement, layout: CommentLayoutType): string {
        const parts: string[] = [];

        // Add leading comments
        if (layout.leadingComments.length > 0) {
            for (const comment of layout.leadingComments) {
                const commentCode = Printer.printComment(comment, 0);
                if (commentCode) {
                    parts.push(commentCode);
                }
            }
        }

        // Add blank lines between comments and statement
        if (layout.leadingGapLines > 0) {
            parts.push(...Array(layout.leadingGapLines).fill(''));
        }

        // Add statement code
        const nodeCode = Printer.printNode(node, {
            indentLevel: 0,
            lineIndex: this.lineIndex
        });

        if (nodeCode) {
            // Remove inline comment from nodeCode if it's already in layout
            // (The printer includes it, but we handle it separately)
            const lines = nodeCode.split('\n');
            if (layout.inlineComment && lines.length > 0) {
                // The last line might have the inline comment - we'll keep it as is
                // since the printer already handles it
            }
            parts.push(nodeCode);
        }

        return parts.join('\n');
    }
}
