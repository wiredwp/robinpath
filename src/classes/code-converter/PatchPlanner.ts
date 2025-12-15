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
        
        // Check if this is the last node in the file
        const scriptLength = this.originalScript.length;
        const isLastNode = range.endOffset >= scriptLength;
        
        // Try to use trailingBlankLines from the node first (before falling back to preserveBlankLinesInRange)
        const nodeTrailingBlankLines = (node as any).trailingBlankLines;
        let blankLines = '';
        if (nodeTrailingBlankLines !== undefined && nodeTrailingBlankLines !== null) {
            // For the last node, check if the original file had a trailing newline
            if (isLastNode) {
                const originalEndsWithNewline = this.originalScript.endsWith('\n');
                // If original doesn't end with newline, don't add trailing blank lines
                if (!originalEndsWithNewline) {
                    blankLines = '';
                } else if (nodeTrailingBlankLines === 1) {
                    // Original ends with newline and trailingBlankLines=1 means the newline is already in the range
                    blankLines = '';
                } else {
                    // Original ends with newline and trailingBlankLines > 1 means there were extra blank lines
                    // But since it's the last node, we should only preserve what was there
                    // The range already includes the newline, so we add (trailingBlankLines - 1) more
                    blankLines =  '\n'.repeat(nodeTrailingBlankLines - 2) + '\n';
                }
            } else {
                // Not the last node - add trailing blank lines normally
                // Return: newline + comment + remaining blank lines
                if (nodeTrailingBlankLines === 1) {
                    blankLines = '\n';
                } else {
                    blankLines = '\n'.repeat(nodeTrailingBlankLines - 1) + '\n';
                }
            }
        } else {
            // Fallback: preserve blank lines that were included in the range
            // Note: nodeCode already ends with a newline, so we need to be careful
            blankLines = this.preserveBlankLinesInRange(node, range);
        }
        
        // The generated code should already end with a newline
        // We only need to add the blank lines (which are additional newlines)
        // So if blankLines is "\n\n", that means 2 blank lines after the node's line
        // Note: preserveBlankLinesInRange already includes trace comments, so we just append
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
        // For endOffset, we want to include the blank lines including their newlines
        // But we need to be careful: if endRow is the last blank line, we want to include its newline
        // So we use exclusive=true to get the offset after the last blank line (after its newline)
        const endOffset = this.lineIndex.offsetAt(endRow, endCol, true);

        return { startOffset, endOffset };
    }

    /**
     * Generate replacement text for a node
     */
    private generateReplacement(
        node: Statement, 
        layout: CommentLayoutType,
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
        const nodeCode = layout.leadingComments.length > 0
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
        range: { startOffset: number; endOffset: number }
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
            const nodeType = node.type;
            const nodeName = (node as any).name || '';
            const nodeInfo = nodeName ? `${nodeType}:${nodeName}` : nodeType;
            
            
            // For def and onBlock, check if body statements have changed
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
            
            if (shouldUseOriginalCode) {
                // Node hasn't changed - use original code with all formatting preserved
                const nodeStartOffset = this.lineIndex.offsetAt(
                    node.codePos.startRow,
                    node.codePos.startCol,
                    false
                );
                const nodeEndOffset = this.lineIndex.offsetAt(
                    node.codePos.endRow,
                    node.codePos.endCol,
                    true
                );
                // Extract original code - this includes the node's content but NOT the blank lines after it
                // The blank lines are handled separately by preserveBlankLinesInRange
                const originalCode = this.originalScript.substring(nodeStartOffset, nodeEndOffset);
                
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
                            const source = originalTrailingBlankLines !== undefined ? 'originalNode' : 'node';
                            const traceComment = `# [BLANK] extractOriginalCode: count=${trailingBlankLines} after=${nodeInfo} from=${source}`;
                            blankLines = '\n' + traceComment + '\n'.repeat(trailingBlankLines - 2);
                        }
                    } else {
                        // Not the last node - add trailing blank lines normally
                        const source = originalTrailingBlankLines !== undefined ? 'originalNode' : 'node';
                        const traceComment = `# [BLANK] extractOriginalCode: count=${trailingBlankLines} after=${nodeInfo} from=${source}`;
                        // Return: newline + comment + remaining blank lines
                        if (trailingBlankLines === 1) {
                            blankLines = '\n' + traceComment;
                        } else {
                            blankLines = '\n' + traceComment + '\n'.repeat(trailingBlankLines - 1);
                        }
                    }
                } else {
                    // No trailingBlankLines - use preserveBlankLinesInRange (which requires trailingBlankLines)
                    // If trailingBlankLines is missing, this will return empty
                    const debugInfo = `originalNode=${originalNode ? 'found' : 'NOT_FOUND'} originalNode.trailingBlankLines=${originalTrailingBlankLines} node.trailingBlankLines=${nodeTrailingBlankLines}`;
                    blankLines = this.preserveBlankLinesInRange(node, range);
                    // If blankLines is empty but we expected some, add a debug comment
                    if (!blankLines && (originalTrailingBlankLines === undefined && nodeTrailingBlankLines === undefined)) {
                        blankLines = `\n# [BLANK] extractOriginalCode: NO_TRAILING_BLANK_LINES (${debugInfo})`;
                    }
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
     * Compare two nodes to see if they're equal (ignoring codePos)
     */
    private nodesAreEqual(node1: Statement, node2: Statement): boolean {
        // Quick type check
        if (node1.type !== node2.type) {
            return false;
        }

        // Deep comparison of node properties (excluding codePos)
        const node1Str = JSON.stringify(node1, (key, value) => {
            return key === 'codePos' ? undefined : value;
        });
        const node2Str = JSON.stringify(node2, (key, value) => {
            return key === 'codePos' ? undefined : value;
        });

        return node1Str === node2Str;
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
        const nodeStartOffset = this.lineIndex.offsetAt(
            node.codePos.startRow,
            node.codePos.startCol,
            false
        );
        const nodeEndOffset = this.lineIndex.offsetAt(
            node.codePos.endRow,
            node.codePos.endCol,
            true
        );
        const originalCode = this.originalScript.substring(nodeStartOffset, nodeEndOffset);
        const originalLines = originalCode.split('\n');
        
        // Extract original indentation from the first line
        const originalLine = this.lineIndex.getLine(node.codePos.startRow);
        const originalIndent = originalLine.substring(0, node.codePos.startCol);
        
        // Generate new code
        const newNodeCode = Printer.printNode(node, {
            indentLevel: 0,
            lineIndex: this.lineIndex,
            originalScript: this.originalScript,
            allowExtractOriginalCode
        }) || '';
        
        // Apply original indentation and spacing patterns to the generated code
        const lines = newNodeCode.split('\n');
        const indentedLines: string[] = [];
        for (let index = 0; index < lines.length; index++) {
            const line = lines[index];
            if (index === 0) {
                // First line: use original indentation
                indentedLines.push(originalIndent + line.trimStart());
            } else if (line.trim() === '') {
                // Blank line: keep as is
                indentedLines.push(line);
            } else if (index < originalLines.length) {
                // Use original indentation for this line if available
                const originalLineContent = originalLines[index];
                const originalLineIndent = originalLineContent.match(/^(\s*)/)?.[1] || '';
                indentedLines.push(originalLineIndent + line.trimStart());
            } else {
                // New line not in original - preserve relative indentation
                // Use the same indentation as the previous line
                const prevLine: string = indentedLines[index - 1] || '';
                const prevIndent: string = prevLine.match(/^(\s*)/)?.[1] || '';
                // Add standard indentation increment (2 spaces) for nested content
                indentedLines.push(prevIndent + '  ' + line.trimStart());
            }
        }
        
        return indentedLines.join('\n');
    }
}
