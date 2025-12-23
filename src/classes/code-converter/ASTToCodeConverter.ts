/**
 * ASTToCodeConverter - Converts AST nodes back to source code
 * 
 * This class handles the conversion of AST (Abstract Syntax Tree) nodes
 * back into RobinPath source code strings. It provides methods for:
 * - Updating source code based on AST changes
 * - Reconstructing code from individual AST nodes
 * - Handling comments, indentation, and code positioning
 * 
 * Architecture:
 * - LineIndex: Fast row/col → offset conversion (O(1))
 * - PatchPlanner: Collects edit operations (produces Patch[])
 * - Printer: AST → string conversion (pure, no access to originalScript)
 * - PatchApplier: Applies patches to source code
 */

import type { Statement, CommentWithPosition } from '../../types/Ast.type';
import { Parser } from '../Parser';
import { Printer } from './Printer';
import { Writer } from './Writer';
import { LineIndexImpl } from './LineIndex';
import type { LineIndex } from './LineIndex';
import type { Patch, CommentLayout, PrintContext } from './types';

// Re-export for convenience
export type { CommentWithPosition, LineIndex, PrintContext };
export { Writer };

// ============================================================================
// CommentLayout - Normalize comment ownership
// ============================================================================

/**
 * CommentLayout - Normalize comment ownership
 * 
 * Decides, per statement:
 * - leadingComments: Comment[] (non-inline)
 * - inlineComment: Comment | null
 * - leadingGapLines: number (blank lines between last leading comment and statement)
 * - trailingBlankLinesAfterStandaloneComment: number (only for standalone comment nodes)
 */
export class CommentLayoutNormalizer {
    /**
     * Normalize comment layout for a statement
     */
    static normalize(
        node: Statement,
        lineIndex: LineIndex
    ): CommentLayout {
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

// ============================================================================
// PatchApplier - Apply patches to source code
// ============================================================================

/**
 * PatchApplier - Apply patches to source code
 * 
 * Sort patches descending (as you do now) and apply.
 * Optional: validate overlaps and throw in dev mode.
 */
export class PatchApplier {
    /**
     * Apply patches to source code
     * Patches are sorted descending by startOffset and applied from end to start
     * to prevent character position shifts from affecting subsequent replacements
     */
    static apply(originalScript: string, patches: Patch[]): string {
        // Sort by start offset (descending) to replace from end to start
        const sortedPatches = [...patches].sort((a, b) => b.startOffset - a.startOffset);

        // Validate patches don't overlap (optional - can be enabled via flag)
        // this.validatePatches(sortedPatches);

        // Apply patches
        let updatedScript = originalScript;
        // console.log('[PatchApplier] Total patches:', sortedPatches.length, 'for script length:', originalScript.length);
        for (const patch of sortedPatches) {
            updatedScript = 
                updatedScript.slice(0, patch.startOffset) + 
                patch.replacement + 
                updatedScript.slice(patch.endOffset);
        }

        return updatedScript;
    }

    /**
     * Validate that patches don't overlap
     * @internal This method is kept for potential future use or manual invocation
     */
    static validatePatches(patches: Patch[]): void {
        for (let i = 0; i < patches.length - 1; i++) {
            const current = patches[i];
            const next = patches[i + 1];

            // Check if ranges overlap
            // Since patches are sorted descending, current.startOffset >= next.startOffset
            // Overlap occurs if current.endOffset > next.startOffset
            if (current.endOffset > next.startOffset) {
                console.warn('Patch overlap detected:', {
                    current: { start: current.startOffset, end: current.endOffset },
                    next: { start: next.startOffset, end: next.endOffset }
                });
            }
        }
    }
}

// ============================================================================
// PatchPlanner - Collect edit operations
// ============================================================================

/**
 * PatchPlanner - Collect edit operations
 * 
 * Produces Patch[] = { startOffset, endOffset, replacement }.
 * Responsible for "range selection" (including blank lines, inline comment removal, etc.)
 * Must guarantee patches don't overlap (or resolve overlaps deterministically).
 */
export class PatchPlanner {
    private lineIndex: LineIndex;
    private patches: Patch[] = [];
    private originalScript: string;
    private originalAST: Statement[] | null = null;

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

        // Get original AST to detect deletions and compare for changes
        const parser = new Parser(this.originalScript);
        this.originalAST = await parser.parse();

        // Create a set of codePos ranges from modified AST for fast lookup
        const modifiedRanges = new Set<string>();
        for (const node of ast) {
            if ('codePos' in node && node.codePos) {
                const key = `${node.codePos.startRow}:${node.codePos.startCol}:${node.codePos.endRow}:${node.codePos.endCol}`;
                modifiedRanges.add(key);
            }
        }

        // Detect and plan patches for deleted nodes
        for (const originalNode of this.originalAST) {
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
                        this.planPatchForDeletedNode(originalNode, this.originalAST);
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

            const replacement = this.generateReplacement(node, layout, range);
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
            let replacement = this.generateReplacementWithoutLeadingComments(node, range);
            
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
            
            // if (node.codePos && (node.codePos.startRow === 100 || node.codePos.startRow === 103)) {
            //     console.log('[planPatchForStatement] row', node.codePos.startRow, 'patch range:', range, 'replacement:', JSON.stringify(replacement));
            // }
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
        layout: CommentLayout,
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
        // If not, AND previous statement doesn't have trailingBlankLines, include blank lines before the first comment
        // If prev has trailingBlankLines, those blank lines are handled by prev's patch
        const prevHasTrailingBlankLines = prev && (prev as any).trailingBlankLines > 0;
        if (!(prev && prev.type === 'comment') && !prevHasTrailingBlankLines) {
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
        // console.log('[planPatchForLeadingComments] node row:', node.codePos.startRow, 'prevHasTrailingBlankLines:', prevHasTrailingBlankLines, 'effectiveStartRow:', effectiveStartRow, 'commentParts:', commentParts);
        const actualStartRow = effectiveStartRow < firstComment.codePos.startRow 
            ? effectiveStartRow 
            : firstComment.codePos.startRow;
        const actualStartCol = effectiveStartRow < firstComment.codePos.startRow 
            ? effectiveStartCol 
            : firstComment.codePos.startCol;

        const startOffset = this.lineIndex.offsetAt(actualStartRow, actualStartCol, false);
        const endOffset = this.lineIndex.offsetAt(endRow, endCol, true);

        // if (node.codePos && node.codePos.startRow === 103) {
        //     console.log('[planPatchForLeadingComments] row 103 patch startOffset:', startOffset, 'endOffset:', endOffset, 'replacement:', JSON.stringify(combinedCommentCode));
        // }
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
        node: Statement,
        range: { startOffset: number; endOffset: number }
    ): string {
        // Try to preserve original code formatting if the node hasn't changed
        // Extract original code from the script
        const originalCode = this.extractOriginalCode(node, range);
        
        if (originalCode !== null) {
            // Node hasn't changed - use original code with formatting preserved
            return originalCode;
        }
        
        // Node has changed - regenerate but preserve indentation
        const nodeCode = this.generateCodeWithPreservedIndentation(node, range);
            
        // Preserve blank lines that were included in the range
        // Use shared method which handles fallback to original AST for trailingBlankLines
        const blankLines = this.preserveBlankLinesInRange(node, range);
            
        // The generated code should already end with a newline
        // We only need to add the blank lines (which are additional newlines)
        return (nodeCode || '') + blankLines;
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
            lineIndex: this.lineIndex,
            originalScript: this.originalScript
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
            // Note: commentCode already ends with a newline from Printer.printNode
            const blankLinesCount = endRow - lastComment.codePos.endRow;
            const replacement = blankLinesCount > 0
                ? commentCode + '\n'.repeat(blankLinesCount)
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
        layout: CommentLayout,
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

        // Start from the statement itself, or from leading comments/decorators if they overlap
        let startRow = node.codePos.startRow;
        let startCol = node.codePos.startCol;

        // Check for decorators that might be on earlier lines
        if ((node as any).decorators && Array.isArray((node as any).decorators)) {
            const decorators = (node as any).decorators;
            if (decorators.length > 0) {
                const firstDecorator = decorators[0];
                if (firstDecorator.codePos && firstDecorator.codePos.startRow < node.codePos.startRow) {
                    startRow = firstDecorator.codePos.startRow;
                    startCol = firstDecorator.codePos.startCol;
                }
            }
        }

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
        // Only include blank lines if the node has trailingBlankLines set
        // Check both the modified node and the original node (if it exists)
        let nodeTrailingBlankLines = (node as any).trailingBlankLines;
        if ((nodeTrailingBlankLines === undefined || nodeTrailingBlankLines === null) && this.originalAST) {
            const originalNode = this.findOriginalNode(node);
            if (originalNode) {
                nodeTrailingBlankLines = (originalNode as any).trailingBlankLines;
            }
        }
        if (nodeTrailingBlankLines !== undefined && nodeTrailingBlankLines !== null && nodeTrailingBlankLines > 0) {
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
        }

        const startOffset = this.lineIndex.offsetAt(startRow, startCol, false);
        // For endOffset, we want to include the line AND its trailing newline
        // Use lineEndOffset to get the offset right after the newline
        const endOffset = this.lineIndex.lineEndOffset(endRow);

        return { startOffset, endOffset };
    }

    /**
     * Generate replacement text for a node
     */
    private generateReplacement(
        node: Statement, 
        layout: CommentLayout,
        range: { startOffset: number; endOffset: number }
    ): string {
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

        // Try to preserve original code formatting if the node hasn't changed
        const originalCode = this.extractOriginalCode(node, range);
        
        if (originalCode !== null && layout.leadingComments.length === 0) {
            // Node hasn't changed and no leading comments - use original code
            return originalCode;
        }
        
        // Add statement code - preserve indentation if regenerating
        // When regenerating, don't allow extracting original code (node has changed)
        // For statements with decorators, always use the printer directly (not generateCodeWithPreservedIndentation)
        // to avoid including decorators from the original code
        const nodeCode = (layout.leadingComments.length > 0 || 
                         ((node as any).decorators && Array.isArray((node as any).decorators) && (node as any).decorators.length > 0))
            ? Printer.printNode(node, {
                indentLevel: 0,
                lineIndex: this.lineIndex,
                originalScript: this.originalScript,
                allowExtractOriginalCode: false
            })
            : this.generateCodeWithPreservedIndentation(node, range, false);

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

        const replacement = parts.join('\n');
        
        // Preserve blank lines that were included in the range
        const blankLines = this.preserveBlankLinesInRange(node, range);
        
        // Note: preserveBlankLinesInRange already includes trace comments
        return replacement + blankLines;
    }

    /**
     * Preserve blank lines that were included in the range after the statement
     */
    private preserveBlankLinesInRange(
        node: Statement,
        range: { startOffset: number; endOffset: number }
    ): string {
        if (!('codePos' in node) || !node.codePos) {
            return '';
        }

        // Check if this is the last node in the file
        const scriptLength = this.originalScript.length;
        const isLastNode = range.endOffset >= scriptLength;

        // Try to get trailingBlankLines from the node first
        let trailingBlankLines = (node as any).trailingBlankLines;
        
        // If not found in the modified node, try to find it from originalNode
        if ((trailingBlankLines === undefined || trailingBlankLines === null) && this.originalAST) {
            const originalNode = this.findOriginalNode(node);
            if (originalNode) {
                trailingBlankLines = (originalNode as any).trailingBlankLines;
            }
        }

        if (trailingBlankLines !== undefined && trailingBlankLines !== null) {
            // For the last node, check if the original file had a trailing newline
            if (isLastNode) {
                // Check if the original file ends with a newline
                const originalEndsWithNewline = this.originalScript.endsWith('\n');
                // If original doesn't end with newline, don't add trailing blank lines
                if (!originalEndsWithNewline) {
                    return '';
                }
                // If original ends with newline, trailingBlankLines should account for it
                // trailingBlankLines=1 means there's a newline at the end (which is already in the range)
                // So we don't need to add extra newlines
                if (trailingBlankLines === 1) {
                    return '';
                }
                // If trailingBlankLines > 1, it means there were multiple blank lines
                // But for the last node, we should only preserve what was there
                // Since the range already includes the newline, we add (trailingBlankLines - 1) more
                return '\n'.repeat(trailingBlankLines - 1);
            }
            
            // Not the last node - add trailing blank lines normally
            if (trailingBlankLines === 1) {
                return '\n';
            } else {
                return '\n'.repeat(trailingBlankLines - 1) + '\n';
            }
        }
        
        // No trailingBlankLines found in either node or originalNode - return empty
        return '';
    }

    /**
     * Extract original code from the script if the node hasn't changed
     * Returns null if the node has changed and needs regeneration
     * 
     * This preserves all original formatting including:
     * - Indentation (spaces and tabs)
     * - Spacing within statements
     * - Blank lines
     */
    private extractOriginalCode(
        node: Statement,
        _range: { startOffset: number; endOffset: number }
    ): string | null {
        if (!('codePos' in node) || !node.codePos) {
            return null;
        }

        // Check if this is a new node (being added)
        const lineCount = this.lineIndex.lineCount();
        if (node.codePos.startRow >= lineCount) {
            // New node - must regenerate
            return null;
        }

        // Check if the node has changed by comparing with original AST
        if (this.originalAST) {
            const originalNode = this.findOriginalNode(node);
            
            
            // For def, onBlock, and ifBlock, check if body statements have changed
            // If body statements changed, we need to regenerate to preserve formatting of changed statements
            let shouldUseOriginalCode = originalNode && this.nodesAreEqual(node, originalNode);
            if (shouldUseOriginalCode && (node.type === 'define' || node.type === 'onBlock')) {
                // Check if any body statement has changed
                const nodeBody = (node as any).body || [];
                const originalBody = (originalNode as any).body || [];
                if (nodeBody.length !== originalBody.length) {
                    shouldUseOriginalCode = false;
                } else {
                    // Compare each body statement
                    for (let i = 0; i < nodeBody.length; i++) {
                        const stmt = nodeBody[i];
                        const originalStmt = originalBody[i];
                        if (!originalStmt || !this.nodesAreEqual(stmt, originalStmt)) {
                            shouldUseOriginalCode = false;
                            break;
                        }
                    }
                }
            }
            
            // For ifBlock, check thenBranch and elseBranch
            if (shouldUseOriginalCode && node.type === 'ifBlock') {
                const nodeThenBranch = (node as any).thenBranch || [];
                const originalThenBranch = (originalNode as any).thenBranch || [];
                if (nodeThenBranch.length !== originalThenBranch.length) {
                    shouldUseOriginalCode = false;
                } else {
                    for (let i = 0; i < nodeThenBranch.length; i++) {
                        if (!this.nodesAreEqual(nodeThenBranch[i], originalThenBranch[i])) {
                            shouldUseOriginalCode = false;
                            break;
                        }
                    }
                }
                
                // Check elseBranch if still using original
                if (shouldUseOriginalCode) {
                    const nodeElseBranch = (node as any).elseBranch || [];
                    const originalElseBranch = (originalNode as any).elseBranch || [];
                    if (nodeElseBranch.length !== originalElseBranch.length) {
                        shouldUseOriginalCode = false;
                    } else {
                        for (let i = 0; i < nodeElseBranch.length; i++) {
                            if (!this.nodesAreEqual(nodeElseBranch[i], originalElseBranch[i])) {
                                shouldUseOriginalCode = false;
                                break;
                            }
                        }
                    }
                }
            }
            
            // For forLoop, doBlock, and cell blocks, check body
            if (shouldUseOriginalCode && (node.type === 'forLoop' || node.type === 'do' || node.type === 'cell')) {
                const nodeBody = (node as any).body || [];
                const originalBody = (originalNode as any).body || [];
                if (nodeBody.length !== originalBody.length) {
                    shouldUseOriginalCode = false;
                } else {
                    for (let i = 0; i < nodeBody.length; i++) {
                        if (!this.nodesAreEqual(nodeBody[i], originalBody[i])) {
                            shouldUseOriginalCode = false;
                            break;
                        }
                    }
                }
            }
            
            if (shouldUseOriginalCode) {
                // Node hasn't changed - use original code with all formatting preserved
                // Determine start position for extraction
                let extractStartRow = node.codePos.startRow;
                let extractStartCol = node.codePos.startCol;
                
                // Include decorators in extraction if they are on earlier lines
                if ((node as any).decorators && Array.isArray((node as any).decorators)) {
                    const decorators = (node as any).decorators;
                    if (decorators.length > 0) {
                        const firstDecorator = decorators[0];
                        if (firstDecorator.codePos && firstDecorator.codePos.startRow < node.codePos.startRow) {
                            extractStartRow = firstDecorator.codePos.startRow;
                            extractStartCol = firstDecorator.codePos.startCol;
                        }
                    }
                }
                
                const nodeStartOffset = this.lineIndex.offsetAt(
                    extractStartRow,
                    extractStartCol,
                    false
                );
                // Calculate end offset to include the statement line and its newline, but NOT any blank lines after
                // Use lineEndOffset to get the offset right after the statement's line (including its newline)
                const nodeEndOffset = this.lineIndex.lineEndOffset(node.codePos.endRow);
                // Extract original code - this includes the node's content and its newline, but NOT any blank lines after it
                // The blank lines are handled separately based on trailingBlankLines
                // For define statements, this excludes decorators (they're printed by the printer)
                let originalCode = this.originalScript.substring(nodeStartOffset, nodeEndOffset);
                
                
                // Get blank lines using trailingBlankLines from AST (preferred) or from range
                // Note: originalCode already ends with a newline (the node's line ending)
                // So we only need to add the additional blank lines
                // Try originalNode first (most reliable), then node
                const originalTrailingBlankLines = (originalNode as any).trailingBlankLines;
                const nodeTrailingBlankLines = (node as any).trailingBlankLines;
                const trailingBlankLines = originalTrailingBlankLines ?? nodeTrailingBlankLines;
                
                // Check if this is the last node in the file
                const scriptLength = this.originalScript.length;
                const isLastNode = nodeEndOffset >= scriptLength;
                
                let blankLines = '';
                // Only add blank lines if trailingBlankLines is explicitly set
                // If it's undefined, there are no blank lines after this statement
                if (trailingBlankLines !== undefined && trailingBlankLines !== null) {
                    // For the last node, check if the original file had a trailing newline
                    if (isLastNode) {
                        const originalEndsWithNewline = this.originalScript.endsWith('\n');
                        // If original doesn't end with newline, don't add trailing blank lines
                        if (!originalEndsWithNewline) {
                            blankLines = '';
                        } else if (trailingBlankLines === 1) {
                            // Original ends with newline and trailingBlankLines=1 means the newline is already in the range
                            blankLines = '';
                        } else {
                            // Original ends with newline and trailingBlankLines > 1 means there were extra blank lines
                            // But since it's the last node, we should only preserve what was there
                            // The range already includes the newline, so we add (trailingBlankLines - 1) more
                            blankLines = '\n'.repeat(trailingBlankLines - 1);
                        }
                    } else {
                        // Not the last node - add trailing blank lines normally
                        // trailingBlankLines=1 means one blank line after (which is one newline)
                        blankLines = '\n'.repeat(trailingBlankLines);
                    }
                } else {
                    // No trailingBlankLines - this means there are no blank lines after this statement
                    // Don't add any blank lines, even if they're in the range
                    blankLines = '';
                }
                
                return originalCode + blankLines;
            } else {
                // Node not found or changed - must regenerate
                return null;
            }
        }

        // Node has changed or not found in original - must regenerate
        return null;
    }

    /**
     * Find the original node that corresponds to the modified node
     */
    private findOriginalNode(modifiedNode: Statement): Statement | null {
        if (!('codePos' in modifiedNode) || !modifiedNode.codePos || !this.originalAST) {
            return null;
        }

        // Find node with matching codePos
        return this.originalAST.find(originalNode => {
            if (!('codePos' in originalNode) || !originalNode.codePos) {
                return false;
            }
            return originalNode.codePos.startRow === modifiedNode.codePos.startRow &&
                   originalNode.codePos.startCol === modifiedNode.codePos.startCol &&
                   originalNode.codePos.endRow === modifiedNode.codePos.endRow &&
                   originalNode.codePos.endCol === modifiedNode.codePos.endCol;
        }) || null;
    }

    /**
     * Compare two nodes to see if they're equal (ignoring codePos and metadata)
     */
    private nodesAreEqual(node1: Statement, node2: Statement): boolean {
        // Quick type check
        if (node1.type !== node2.type) {
            return false;
        }

        // Deep comparison of node properties (excluding codePos and computed/metadata properties)
        const ignoreKeys = new Set([
            'codePos',           // Position changes when code moves
            'module',            // Added by serializeStatement
            'trailingBlankLines', // Metadata about formatting
            'lastValue',         // Runtime execution state
            'lineNumber',        // Derived from codePos
            'comments',          // Comments are handled separately
            'literalValueType',  // Added by serializeStatement for assignments
            'operatorText',      // Expression original operator text
            'parenthesized',     // Expression was in parentheses
            'conditionExpr',     // Duplicate of condition added by serializeStatement
            'keywordPos',        // Pos of elseif/else keywords (metadata)
            'elseKeywordPos',    // Pos of else keyword (metadata)
            'bodyPos',           // Pos of block body (metadata)
            'openPos',           // Pos of block opening (metadata)
            'closePos',          // Pos of block closing (metadata)
            'headerPos',         // Pos of cell header (metadata)
            'hasThen',           // ifBlock syntax variant (metadata for equality)
            'elseHasThen'        // else branch syntax variant (metadata for equality)
        ]);
        
        const compare = (v1: any, v2: any): boolean => {
            // Primitive equality
            if (v1 === v2) return true;
            
            // Handle null/undefined mismatch
            if (v1 === null && v2 !== null) return false;
            if (v1 !== null && v2 === null) return false;
            if (v1 === undefined && v2 !== undefined) return false;
            if (v1 !== undefined && v2 === undefined) return false;
            
            // Type mismatch
            if (typeof v1 !== typeof v2) return false;
            
            // Primitive types that aren't equal (already checked ===)
            if (typeof v1 !== 'object') return false;
            
            // Array comparison
            if (Array.isArray(v1) !== Array.isArray(v2)) return false;
            if (Array.isArray(v1)) {
                if (v1.length !== v2.length) return false;
                for (let i = 0; i < v1.length; i++) {
                    if (!compare(v1[i], v2[i])) return false;
                }
                return true;
            }
            
            // Object comparison
            const keys1 = Object.keys(v1).filter(k => !ignoreKeys.has(k));
            const keys2 = Object.keys(v2).filter(k => !ignoreKeys.has(k));
            
            if (keys1.length !== keys2.length) return false;
            
            // Sort keys to ensure consistent order isn't required (though we check inclusion)
            // Checking inclusion and value is enough
            for (const key of keys1) {
                // Determine the corresponding key in v2
                // Usually it's the same key
                if (!Object.prototype.hasOwnProperty.call(v2, key)) return false;
                
                if (!compare(v1[key], v2[key])) return false;
            }
            
            return true;
        };

        return compare(node1, node2);
    }

    /**
     * Generate code with preserved indentation and spacing from original
     * This is used when we must regenerate code but want to preserve formatting
     */
    private generateCodeWithPreservedIndentation(
        node: Statement,
        _range: { startOffset: number; endOffset: number },
        allowExtractOriginalCode: boolean = false
    ): string {
        if (!('codePos' in node) || !node.codePos) {
            return Printer.printNode(node, {
                indentLevel: 0,
                lineIndex: this.lineIndex,
                originalScript: this.originalScript,
                allowExtractOriginalCode
            }) || '';
        }

        // Check if this is a new node
        const lineCount = this.lineIndex.lineCount();
        if (node.codePos.startRow >= lineCount) {
            // New node - use standard formatting
            return Printer.printNode(node, {
                indentLevel: 0,
                lineIndex: this.lineIndex,
                originalScript: this.originalScript,
                allowExtractOriginalCode
            }) || '';
        }

        // Extract original code to preserve its formatting patterns
        // Use lineEndOffset to get just the statement line, not any blank lines after it
        // INCLUDE decorators in extraction because Printer prints them
        let extractStartRow = node.codePos.startRow;
        let extractStartCol = node.codePos.startCol;
        
        if ((node as any).decorators && Array.isArray((node as any).decorators)) {
            const decorators = (node as any).decorators;
            if (decorators.length > 0) {
                const firstDecorator = decorators[0];
                // If decorators are on earlier lines, start extraction from the first decorator
                if (firstDecorator.codePos && firstDecorator.codePos.startRow < node.codePos.startRow) {
                    extractStartRow = firstDecorator.codePos.startRow;
                    extractStartCol = firstDecorator.codePos.startCol;
                }
            }
        }
        
        // Extract original indentation from the first line (which might be a decorator)
        const originalLine = this.lineIndex.getLine(extractStartRow);
        const originalIndent = originalLine.substring(0, extractStartCol);
        
        // Generate new code
        const newNodeCode = Printer.printNode(node, {
            indentLevel: 0,
            lineIndex: this.lineIndex,
            originalScript: this.originalScript,
            allowExtractOriginalCode
        }) || '';
        
        // Apply original indentation and spacing patterns to the generated code
        const lines = newNodeCode.split('\n');
        // Apply original indentation to all lines of the generated code
        // We use originalIndent (from line 0) as the base, and prepend it to every line.
        // Since Printer.printNode(node, { indentLevel: 0 }) already produced the internal
        // indentation structure of the node, this correctly preserves both the base
        // position and the internal indentation.
        const indentedLines: string[] = [];
        for (let index = 0; index < lines.length; index++) {
            const line = lines[index];
            if (line.trim() === '') {
                // Blank line: keep as is (don't add indentation to empty lines)
                indentedLines.push(line);
            } else {
                // Prepend the base indentation from the original first line
                indentedLines.push(originalIndent + line);
            }
        }
        
        // Handle trailing newline from Printer.printNode
        // First, remove the empty string from split('\n') if it exists (from code ending with '\n')
        if (indentedLines.length > 0 && indentedLines[indentedLines.length - 1] === '') {
            indentedLines.pop();
        }
        
        const result = indentedLines.join('\n');

        // Ensure result ends with exactly one newline
        if (result && !result.endsWith('\n')) {
            return result + '\n';
        }
        return result;
    }
}

// ============================================================================
// ASTToCodeConverter - Main class
// ============================================================================

/**
 * ASTToCodeConverter - Converts AST nodes back to source code
 * 
 * This class handles the conversion of AST (Abstract Syntax Tree) nodes
 * back into RobinPath source code strings. It provides methods for:
 * - Updating source code based on AST changes
 * - Reconstructing code from individual AST nodes
 * - Handling comments, indentation, and code positioning
 */
export class ASTToCodeConverter {
    /**
     * Update source code based on AST changes
     * Uses precise character-level positions (codePos.startRow/startCol/endRow/endCol) to update code
     * Nested nodes are reconstructed as part of their parent's code
     * @param originalScript The original source code
     * @param ast The modified AST array (top-level nodes only)
     * @returns Updated source code
     */
    async updateCodeFromAST(originalScript: string, ast: Statement[]): Promise<string> {
        // Phase 1: Plan patches (including deletions)
        const planner = new PatchPlanner(originalScript);
        const patches = await planner.planPatches(ast);

        // Phase 2: Apply patches
        return PatchApplier.apply(originalScript, patches);
    }

    /**
     * Reconstruct code string from an AST node
     * @param node The AST node (serialized)
     * @param indentLevel Indentation level for nested code
     * @returns Reconstructed code string, or null if cannot be reconstructed
     */
    reconstructCodeFromASTNode(node: Statement, indentLevel: number = 0): string | null {
        // Create a dummy LineIndex for printing (not used for offset calculations)
        const dummyLineIndex = new LineIndexImpl('');
        
        const result = Printer.printNode(node, {
            indentLevel,
            lineIndex: dummyLineIndex
        });

        return result || null;
    }
}
