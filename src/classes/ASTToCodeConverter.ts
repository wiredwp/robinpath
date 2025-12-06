/**
 * ASTToCodeConverter - Converts AST nodes back to source code
 * 
 * This class handles the conversion of AST (Abstract Syntax Tree) nodes
 * back into RobinPath source code strings. It provides methods for:
 * - Updating source code based on AST changes
 * - Reconstructing code from individual AST nodes
 * - Handling comments, indentation, and code positioning
 */

import type { Value, CommentWithPosition } from '../index';

export class ASTToCodeConverter {
    /**
     * Update source code based on AST changes
     * Uses precise character-level positions (codePos.startRow/startCol/endRow/endCol) to update code
     * Nested nodes are reconstructed as part of their parent's code
     * @param originalScript The original source code
     * @param ast The modified AST array (top-level nodes only)
     * @returns Updated source code
     */
    updateCodeFromAST(originalScript: string, ast: any[]): string {
        const codePositions: Array<{ startOffset: number; endOffset: number; code: string }> = [];

        // Collect all code positions to update
        for (const node of ast) {
            // Handle comment nodes separately - derive codePos from comments array
            if (node.type === 'comment') {
                if (node.comments && Array.isArray(node.comments) && node.comments.length > 0) {
                    // Get the range from first to last comment (including empty comments for deletion)
                    const firstComment = node.comments[0];
                    const lastComment = node.comments[node.comments.length - 1];
                    
                    if (firstComment.codePos && lastComment.codePos) {
                        const commentCode = this.reconstructCodeFromASTNode(node, 0);
                        // Process even if commentCode is empty string (for deletion)
                        if (commentCode !== null) {
                            const startOffset = this.rowColToCharOffset(
                                originalScript,
                                firstComment.codePos.startRow,
                                firstComment.codePos.startCol,
                                false // inclusive
                            );
                            
                            // Include blank lines after the last comment until the next node
                            const lines = originalScript.split('\n');
                            let endRow = lastComment.codePos.endRow;
                            let endCol = lastComment.codePos.endCol;
                            
                            // Track blank lines to preserve them in the replacement
                            const blankLinesAfter: string[] = [];
                            
                            // Find the next non-comment node to determine where blank lines end
                            // Include blank lines after the comment until we hit a non-blank, non-comment line
                            // or until we hit the next node's actual code (not its attached comments)
                            const currentNodeIndex = ast.indexOf(node);
                            let stopRow = lines.length; // Default: end of script
                            
                            if (currentNodeIndex >= 0 && currentNodeIndex < ast.length - 1) {
                                const nextNode = ast[currentNodeIndex + 1];
                                if (nextNode && nextNode.codePos) {
                                    // If next node has attached comments, they come before the node's codePos.startRow
                                    // We want to include blank lines up to (but not including) those attached comments
                                    // So we check for blank lines until we hit a comment line or the node's code
                                    stopRow = nextNode.codePos.startRow;
                                    
                                    // Check if there are attached comments before the node
                                    if (nextNode.comments && Array.isArray(nextNode.comments) && nextNode.comments.length > 0) {
                                        const firstAttachedComment = nextNode.comments.find((c: any) => !c.inline);
                                        if (firstAttachedComment && firstAttachedComment.codePos) {
                                            // Stop before the attached comments start
                                            stopRow = firstAttachedComment.codePos.startRow;
                                        }
                                    }
                                }
                            }
                            
                            // Include blank lines until we hit the stop row or a non-blank line
                            for (let row = endRow + 1; row < stopRow; row++) {
                                const line = lines[row] || '';
                                if (line.trim() === '') {
                                    // Blank line - include it
                                    blankLinesAfter.push('');
                                    endRow = row;
                                    endCol = line.length;
                                } else if (line.trim().startsWith('#')) {
                                    // Comment line - this is an attached comment, stop here
                                    // The blank line before it has been included
                                    break;
                                } else {
                                    // Non-blank, non-comment line - stop here
                                    break;
                                }
                            }
                            
                            // Preserve blank lines in the replacement code
                            // Each empty string in blankLinesAfter represents a blank line
                            // We need to add a newline for each blank line
                            const commentCodeWithBlanks = blankLinesAfter.length > 0
                                ? commentCode + '\n' + '\n'.repeat(blankLinesAfter.length)
                                : commentCode;
                            
                            const endOffset = this.rowColToCharOffset(
                                originalScript,
                                endRow,
                                endCol,
                                true // exclusive (one past the end)
                            );

                            codePositions.push({
                                startOffset,
                                endOffset,
                                code: commentCodeWithBlanks
                            });
                        }
                    }
                }
                continue; // Skip to next node
            }
            
            // Check if node has comments attached
            // Note: comments can be undefined, empty array [], or array with items
            // Empty array [] explicitly means "remove all comments"
            const hasComments = node.comments && Array.isArray(node.comments) && node.comments.length > 0;
            const commentsExplicitlyEmpty = node.comments && Array.isArray(node.comments) && node.comments.length === 0;
            
            // Separate comments above from inline comments
            const commentsAbove: CommentWithPosition[] = [];
            const inlineComments: CommentWithPosition[] = [];
            
            if (hasComments) {
                for (const comment of node.comments) {
                    // Skip empty comments (they should be removed, not processed)
                    if (!comment.text || comment.text.trim() === '') {
                        continue;
                    }
                    // Use inline property if available, otherwise fall back to codePos check
                    if (comment.inline === true) {
                        inlineComments.push(comment);
                    } else {
                        // Comments above are not inline
                        commentsAbove.push(comment);
                    }
                }
            } else if (commentsExplicitlyEmpty) {
                // comments: [] was explicitly set - need to remove existing comments
                // We need to find comments in the original script that are associated with this node
                // Check if there are comments before this node's startRow (comments above)
                const nodeStartRow = node.codePos?.startRow;
                const nodeStartCol = node.codePos?.startCol;
                if (nodeStartRow !== undefined && nodeStartRow >= 0) {
                    const lines = originalScript.split('\n');
                    // Look for comment lines immediately before this node
                    let commentStartRow = -1;
                    let commentEndRow = -1;
                    
                    // Check lines before the node for comments (only check up to 10 lines to avoid removing wrong comments)
                    for (let row = nodeStartRow - 1; row >= Math.max(0, nodeStartRow - 10); row--) {
                        const line = lines[row];
                        const trimmed = line.trim();
                        if (trimmed.startsWith('#')) {
                            if (commentEndRow === -1) {
                                commentEndRow = row;
                            }
                            commentStartRow = row;
                        } else if (trimmed === '') {
                            // Blank line - continue checking (comments can have blank lines between them)
                            continue;
                        } else {
                            // Non-comment, non-blank line - stop looking
                            break;
                        }
                    }
                    
                    // If we found comments above, remove them
                    if (commentStartRow >= 0 && commentEndRow >= 0) {
                        const firstLine = lines[commentStartRow];
                        const lastLine = lines[commentEndRow];
                        const startCol = firstLine.indexOf('#');
                        const endCol = lastLine.length - 1;
                        
                        const startOffset = this.rowColToCharOffset(
                            originalScript,
                            commentStartRow,
                            startCol,
                            false
                        );
                        const endOffset = this.rowColToCharOffset(
                            originalScript,
                            commentEndRow,
                            endCol,
                            true
                        );
                        
                        codePositions.push({
                            startOffset,
                            endOffset,
                            code: '' // Remove the comments
                        });
                    }
                    
                    // Also check for inline comments on the same line as the node
                    // Note: Inline comments are handled in reconstructCodeFromASTNode which won't include them
                    // when comments is empty, but we need to remove them from the original script
                    if (nodeStartRow < lines.length && nodeStartCol !== undefined) {
                        const nodeLine = lines[nodeStartRow];
                        // Look for inline comment pattern: spaces + # + comment text
                        const inlineCommentMatch = nodeLine.match(/(\s+#\s*.+)$/);
                        if (inlineCommentMatch) {
                            const commentStartCol = nodeLine.indexOf('#', nodeStartCol);
                            if (commentStartCol >= 0) {
                                // Remove the inline comment (including leading space before #)
                                // But preserve the newline character at the end of the line
                                const beforeComment = nodeLine.substring(0, commentStartCol).replace(/\s+$/, '');
                                const startOffset = this.rowColToCharOffset(
                                    originalScript,
                                    nodeStartRow,
                                    beforeComment.length,
                                    false
                                );
                                // Calculate endOffset to point AFTER the newline so it's preserved
                                // rowColToCharOffset(row, nodeLine.length, true) calculates:
                                // - Sum of (lines[i].length + 1) for i < row (includes newlines)
                                // - Add nodeLine.length (current line content)
                                // - Add 1 (because exclusive: true)
                                // This gives us the offset after the newline character
                                // So slice(endOffset) will preserve the newline
                                const endOffset = this.rowColToCharOffset(
                                    originalScript,
                                    nodeStartRow,
                                    nodeLine.length,
                                    true // Point after the newline character
                                );
                                
                                codePositions.push({
                                    startOffset,
                                    endOffset,
                                    code: '' // Remove the inline comment and trailing space
                                    // endOffset points after newline, so slice(endOffset) preserves it
                                });
                            }
                        }
                    }
                }
            }
            
            // Check if comments above would overlap with the statement
            // Note: commentsAbove has already been filtered to exclude empty comments
            let commentsOverlapStatement = false;
            let combinedStartRow = node.codePos.startRow;
            let combinedStartCol = node.codePos.startCol;
            let combinedEndRow = node.codePos.endRow;
            let combinedEndCol = node.codePos.endCol;
            
            if (commentsAbove.length > 0) {
                const firstCommentAbove = commentsAbove[0];
                const lastCommentAbove = commentsAbove[commentsAbove.length - 1];
                
                // Check if comments overlap or are adjacent to the statement
                if (lastCommentAbove.codePos.endRow >= node.codePos.startRow) {
                    commentsOverlapStatement = true;
                    // Merge ranges: from first comment to end of statement (including inline comments)
                    combinedStartRow = firstCommentAbove.codePos.startRow;
                    combinedStartCol = firstCommentAbove.codePos.startCol;
                    combinedEndRow = node.codePos.endRow;
                    combinedEndCol = node.codePos.endCol;
                    
                    // Extend to include inline comments
                    for (const inlineComment of inlineComments) {
                        if (inlineComment.codePos.endCol > combinedEndCol) {
                            combinedEndCol = inlineComment.codePos.endCol;
                        }
                    }
                }
            }
            
            if (commentsOverlapStatement) {
                // Merge comment and statement into a single update
                const reconstructed = this.reconstructCodeFromASTNode(node, 0);
                if (reconstructed !== null) {
                    // Build combined code: comments above + statement
                    // Filter out empty comments before reconstructing
                    // Preserve blank lines between comment groups by including them in the range
                    const commentCodes = commentsAbove
                        .map(c => this.reconstructCommentCode(c, 0))
                        .filter(code => code !== '');
                    
                    // Join comments with newlines (blank lines are preserved via the range calculation)
                    const combinedCode = commentCodes.length > 0 
                        ? [...commentCodes, reconstructed].join('\n')
                        : reconstructed;
                    
                    // Calculate endOffset to include blank lines after the last comment
                    // until the statement starts
                    const lines = originalScript.split('\n');
                    let effectiveEndRow = combinedEndRow;
                    let effectiveEndCol = combinedEndCol;
                    
                    // If there are comments above, check for blank lines between last comment and statement
                    if (commentsAbove.length > 0) {
                        const lastCommentAbove = commentsAbove[commentsAbove.length - 1];
                        // Include blank lines between last comment and the statement
                        for (let row = lastCommentAbove.codePos.endRow + 1; row < node.codePos.startRow; row++) {
                            const line = lines[row] || '';
                            if (line.trim() === '') {
                                // Blank line - include it in the range
                                effectiveEndRow = row;
                                effectiveEndCol = line.length;
                            } else {
                                // Non-blank line - stop here
                                break;
                            }
                        }
                    }
                    
                    const startOffset = this.rowColToCharOffset(
                        originalScript,
                        combinedStartRow,
                        combinedStartCol,
                        false // inclusive
                    );
                    const endOffset = this.rowColToCharOffset(
                        originalScript,
                        effectiveEndRow,
                        effectiveEndCol,
                        true // exclusive (one past the end)
                    );

                    codePositions.push({
                        startOffset,
                        endOffset,
                        code: combinedCode
                    });
                }
            } else {
                // Process comments above separately (no overlap)
                // First, handle empty comments by removing them from the code
                if (hasComments) {
                    for (const comment of node.comments) {
                        // Check if comment is empty (should be removed)
                    if (!comment.text || comment.text.trim() === '') {
                            // This is an empty comment - remove it by replacing with empty string
                            if (comment.inline === true) {
                                // For inline comments, remove from the original line including leading whitespace before #
                                const lines = originalScript.split('\n');
                                const commentLine = lines[comment.codePos.startRow] || '';
                                const commentStartCol = commentLine.indexOf('#', comment.codePos.startCol);
                                if (commentStartCol >= 0) {
                                    // Find the start of the whitespace before the comment (but keep the code before)
                                    let removeStartCol = commentStartCol;
                                    // Go backwards to find where whitespace starts
                                    for (let i = commentStartCol - 1; i >= 0; i--) {
                                        if (/\s/.test(commentLine[i])) {
                                            removeStartCol = i;
                                        } else {
                                            break;
                                        }
                                    }
                                    
                                    const startOffset = this.rowColToCharOffset(
                                        originalScript,
                                        comment.codePos.startRow,
                                        removeStartCol,
                                        false // inclusive
                                    );
                                    const endOffset = this.rowColToCharOffset(
                                        originalScript,
                                        comment.codePos.endRow,
                                        comment.codePos.endCol,
                                        true // exclusive (one past the end)
                                    );

                                    codePositions.push({
                                        startOffset,
                                        endOffset,
                                        code: '' // Empty string removes the inline comment and leading whitespace
                                    });
                                }
                            } else {
                                // Regular comment above the node
                                const startOffset = this.rowColToCharOffset(
                                    originalScript,
                                    comment.codePos.startRow,
                                    comment.codePos.startCol,
                                    false // inclusive
                                );
                                const endOffset = this.rowColToCharOffset(
                                    originalScript,
                                    comment.codePos.endRow,
                                    comment.codePos.endCol,
                                    true // exclusive (one past the end)
                                );

                                codePositions.push({
                                    startOffset,
                                    endOffset,
                                    code: '' // Empty string removes the comment
                                });
                            }
                        }
                    }
                }
                
                // Now process non-empty comments above
                // We need to preserve blank lines between comment groups
                // Process all comments as a single group to preserve blank lines between them
                const lines = originalScript.split('\n');
                
                if (commentsAbove.length > 0) {
                    const firstComment = commentsAbove[0];
                    const lastComment = commentsAbove[commentsAbove.length - 1];
                    
                    // Check for blank lines before the first comment (in case there's a standalone comment node before)
                    // Look backwards from the first comment to find blank lines
                    let effectiveStartRow = firstComment.codePos.startRow;
                    let effectiveStartCol = firstComment.codePos.startCol;
                    let hasStandaloneCommentBefore = false;
                    
                    // Check if there are blank lines before the first comment
                    // (This handles the case where there's a standalone comment node before these attached comments)
                    for (let row = firstComment.codePos.startRow - 1; row >= 0; row--) {
                        const line = lines[row] || '';
                        if (line.trim() === '') {
                            // Blank line - check if there's a standalone comment node before it
                            // Continue checking backwards
                            continue;
                        } else if (line.trim().startsWith('#')) {
                            // Found a comment line - this is a standalone comment node
                            // The blank lines between it and our first comment are already handled
                            // by the standalone comment node's replacement, so we don't need to include them
                            hasStandaloneCommentBefore = true;
                            break;
                        } else {
                            // Non-blank, non-comment line - stop here
                            break;
                        }
                    }
                    
                    // Reconstruct all comments, preserving blank lines between comment groups
                    const commentParts: string[] = [];
                    
                    // Only add blank lines before if there's NO standalone comment node before
                    // (If there is one, the blank lines are already included in its replacement)
                    if (!hasStandaloneCommentBefore) {
                        // Check for blank lines before the first comment
                        for (let row = firstComment.codePos.startRow - 1; row >= 0; row--) {
                            const line = lines[row] || '';
                            if (line.trim() === '') {
                                effectiveStartRow = row;
                                effectiveStartCol = 0;
                                commentParts.push('');
                            } else {
                                break;
                            }
                        }
                    }
                    
                    for (let i = 0; i < commentsAbove.length; i++) {
                        const comment = commentsAbove[i];
                        const commentCode = this.reconstructCommentCode(comment, 0);
                        // Skip empty comments (defensive check)
                        if (commentCode === '') {
                            continue;
                        }
                        
                        // Add the comment code
                        commentParts.push(commentCode);
                        
                        // Check if there's a next comment and if there are blank lines between them
                        if (i < commentsAbove.length - 1) {
                            const nextComment = commentsAbove[i + 1];
                            // Check for blank lines between this comment and the next
                            for (let row = comment.codePos.endRow + 1; row < nextComment.codePos.startRow; row++) {
                                const line = lines[row] || '';
                                if (line.trim() === '') {
                                    // Blank line - preserve it by adding an empty string
                                    commentParts.push('');
                                } else {
                                    // Non-blank line - stop here
                                    break;
                                }
                            }
                        }
                    }
                    
                    // Include blank lines after the last comment until the node
                    let endRow = lastComment.codePos.endRow;
                    let endCol = lastComment.codePos.endCol;
                    for (let row = endRow + 1; row < node.codePos.startRow; row++) {
                        const line = lines[row] || '';
                        if (line.trim() === '') {
                            // Blank line - include it
                            commentParts.push('');
                            endRow = row;
                            endCol = line.length;
                        } else {
                            // Non-blank line - stop here
                            break;
                        }
                    }
                    
                    const combinedCommentCode = commentParts.join('\n');
                    
                    // Check if effectiveStartRow is before firstComment.codePos.startRow
                    // If so, we're including blank lines before, so we need to start from effectiveStartRow
                    // Otherwise, start from the first comment's position
                    const actualStartRow = effectiveStartRow < firstComment.codePos.startRow 
                        ? effectiveStartRow 
                        : firstComment.codePos.startRow;
                    const actualStartCol = effectiveStartRow < firstComment.codePos.startRow 
                        ? effectiveStartCol 
                        : firstComment.codePos.startCol;
                    
                    const startOffset = this.rowColToCharOffset(
                        originalScript,
                        actualStartRow,
                        actualStartCol,
                        false // inclusive
                    );
                    const endOffset = this.rowColToCharOffset(
                        originalScript,
                        endRow,
                        endCol,
                        true // exclusive (one past the end, includes newline)
                    );

                    codePositions.push({
                        startOffset,
                        endOffset,
                        code: combinedCommentCode
                    });
                }
                
                // Process the node itself (includes inline comments in reconstruction)
                const reconstructed = this.reconstructCodeFromASTNode(node, 0);
                if (reconstructed !== null) {
                    // Calculate the effective range that includes inline comments
                    let effectiveStartRow = node.codePos.startRow;
                    let effectiveStartCol = node.codePos.startCol;
                    let effectiveEndRow = node.codePos.endRow;
                    let effectiveEndCol = node.codePos.endCol;
                    
                    // Extend range to include inline comments
                    for (const comment of inlineComments) {
                        if (comment.codePos.endCol > effectiveEndCol) {
                            effectiveEndCol = comment.codePos.endCol;
                        }
                    }
                    
                    const startOffset = this.rowColToCharOffset(
                        originalScript,
                        effectiveStartRow,
                        effectiveStartCol,
                        false // inclusive
                    );
                    
                    // When we have inline comments, we need to preserve the newline
                    // The reconstructed code doesn't include a newline, so we need to ensure
                    // endOffset points AFTER the newline so it's preserved
                    let endOffset: number;
                    let codeToInsert = reconstructed;
                    if (inlineComments.length > 0) {
                        // For nodes with inline comments, calculate endOffset to point after the newline
                        // Get the line containing the inline comment
                        const lines = originalScript.split('\n');
                        const lineWithComment = lines[effectiveEndRow] || '';
                        const isLastLine = effectiveEndRow === lines.length - 1;
                        
                        if (isLastLine) {
                            // This is the last line - don't include newline in endOffset or replacement
                            endOffset = this.rowColToCharOffset(
                                originalScript,
                                effectiveEndRow,
                                effectiveEndCol,
                                true // exclusive (one past the end, but no newline)
                            );
                            codeToInsert = reconstructed; // No newline needed
                        } else {
                            // There's a next line - preserve the newline
                            // Calculate offset to end of line content, then add 1 to point after newline
                            endOffset = this.rowColToCharOffset(
                                originalScript,
                                effectiveEndRow,
                                lineWithComment.length,
                                true // Point after the newline character
                            );
                            // Since endOffset includes the newline, we need to append it to the replacement code
                            // to preserve it
                            codeToInsert = reconstructed + '\n';
                        }
                    } else {
                        // No inline comments, use normal calculation
                        endOffset = this.rowColToCharOffset(
                            originalScript,
                            effectiveEndRow,
                            effectiveEndCol,
                            true // exclusive (one past the end)
                        );
                    }

                    codePositions.push({
                        startOffset,
                        endOffset,
                        code: codeToInsert
                    });
                }
            }
        }

        // Sort by start offset (descending) to replace from end to start
        // This prevents character position shifts from affecting subsequent replacements
        codePositions.sort((a, b) => b.startOffset - a.startOffset);

        // Build updated script by replacing from end to start
        let updatedScript = originalScript;
        for (const pos of codePositions) {
            // Replace the exact character range
            updatedScript = 
                updatedScript.slice(0, pos.startOffset) + 
                pos.code + 
                updatedScript.slice(pos.endOffset);
        }

        return updatedScript;
    }

    /**
     * Reconstruct code string from an AST node
     * @param node The AST node (serialized)
     * @param indentLevel Indentation level for nested code
     * @returns Reconstructed code string, or null if cannot be reconstructed
     */
    private reconstructCodeFromASTNode(node: any, indentLevel: number = 0): string | null {
        const indent = '  '.repeat(indentLevel);

        switch (node.type) {
            case 'command': {
                // Special handling for _var command - just output the variable (used for $a = $b assignments)
                if (node.name === '_var' && node.args && node.args.length === 1 && node.args[0].type === 'var') {
                    const varArg = node.args[0];
                    let varCode = '$' + varArg.name;
                    if (varArg.path) {
                        for (const seg of varArg.path) {
                            if (seg.type === 'property') {
                                varCode += '.' + seg.name;
                            } else if (seg.type === 'index') {
                                varCode += '[' + seg.index + ']';
                            }
                        }
                    }
                    return varCode;
                }
                
                // Special handling for _subexpr command - convert back to $(...) syntax
                if (node.name === '_subexpr' && node.args && node.args.length === 1 && node.args[0].type === 'subexpr') {
                    const subexprArg = node.args[0];
                    // The code field contains the inner command code (e.g., "add 5 2")
                    return `$(${subexprArg.code})`;
                }
                
                // If node.name contains a dot, it already has a module prefix
                // Extract just the command name (after the last dot) if module is set
                let commandName = node.name;
                if (node.module && node.name.includes('.')) {
                    // Remove existing module prefix from name
                    const parts = node.name.split('.');
                    commandName = parts[parts.length - 1];
                }
                const modulePrefix = node.module ? `${node.module}.` : '';
                
                // Separate positional args and named args
                const positionalArgs: any[] = [];
                let namedArgsObj: Record<string, any> | null = null;
                
                for (const arg of node.args || []) {
                    if (arg.type === 'namedArgs') {
                        namedArgsObj = arg.args || {};
                    } else {
                        positionalArgs.push(arg);
                    }
                }
                
                // Determine syntax type (default to 'space' if not specified)
                const syntaxType = node.syntaxType || 'space';
                
                let commandCode: string;
                
                if (syntaxType === 'space') {
                    // Space-separated: fn 'a' 'b'
                    const argsStr = node.args.map((arg: any) => this.reconstructArgCode(arg)).filter((s: string | null) => s !== null).join(' ');
                    commandCode = `${indent}${modulePrefix}${commandName}${argsStr ? ' ' + argsStr : ''}`;
                } else if (syntaxType === 'parentheses') {
                    // Parenthesized single-line: fn('a' 'b')
                    const argsStr = positionalArgs.map((arg: any) => this.reconstructArgCode(arg)).filter((s: string | null) => s !== null).join(' ');
                    commandCode = `${indent}${modulePrefix}${commandName}(${argsStr})`;
                } else if (syntaxType === 'named-parentheses') {
                    // Named arguments single-line: fn($a='a' $b='b')
                    const parts: string[] = [];
                    // Add positional args first if any
                    const posArgsStr = positionalArgs.map((arg: any) => this.reconstructArgCode(arg)).filter((s: string | null) => s !== null);
                    parts.push(...posArgsStr);
                    // Add named args
                    if (namedArgsObj) {
                        for (const [key, valueArg] of Object.entries(namedArgsObj)) {
                            const valueCode = this.reconstructArgCode(valueArg as any);
                            if (valueCode !== null) {
                                parts.push(`$${key}=${valueCode}`);
                            }
                        }
                    }
                    commandCode = `${indent}${modulePrefix}${commandName}(${parts.join(' ')})`;
                } else if (syntaxType === 'multiline-parentheses') {
                    // Multiline parenthesized: fn(\n  $a='a'\n  $b='b'\n)
                    const parts: string[] = [];
                    // Add positional args first if any
                    const posArgsStr = positionalArgs.map((arg: any) => this.reconstructArgCode(arg)).filter((s: string | null) => s !== null);
                    if (posArgsStr.length > 0) {
                        parts.push(...posArgsStr.map(arg => `  ${arg}`));
                    }
                    // Add named args
                    if (namedArgsObj) {
                        for (const [key, valueArg] of Object.entries(namedArgsObj)) {
                            const valueCode = this.reconstructArgCode(valueArg as any);
                            if (valueCode !== null) {
                                parts.push(`  $${key}=${valueCode}`);
                            }
                        }
                    }
                    if (parts.length > 0) {
                        commandCode = `${indent}${modulePrefix}${commandName}(\n${parts.join('\n')}\n${indent})`;
                    } else {
                        commandCode = `${indent}${modulePrefix}${commandName}()`;
                    }
                } else {
                    // Fallback to space-separated
                    const argsStr = node.args.map((arg: any) => this.reconstructArgCode(arg)).filter((s: string | null) => s !== null).join(' ');
                    commandCode = `${indent}${modulePrefix}${commandName}${argsStr ? ' ' + argsStr : ''}`;
                }
                
                // Add inline comment if present (comments above are handled separately in updateCodeFromAST)
                if (node.comments && Array.isArray(node.comments)) {
                    const inlineComment = node.comments.find((c: CommentWithPosition) => c.inline === true && c.text && c.text.trim() !== '');
                    if (inlineComment) {
                        commandCode += `  # ${inlineComment.text}`;
                    }
                }
                
                return commandCode;
            }
            case 'assignment': {
                const target = '$' + node.targetName + (node.targetPath?.map((seg: any) => 
                    seg.type === 'property' ? '.' + seg.name : `[${seg.index}]`
                ).join('') || '');
                
                let assignmentCode: string | null = null;
                if (node.command) {
                    const cmdCode = this.reconstructCodeFromASTNode(node.command, 0);
                    assignmentCode = `${indent}${target} = ${cmdCode?.trim() || ''}`;
                } else if (node.literalValue !== undefined) {
                    // Handle type conversion if literalValueType is specified and different from current type
                    let valueToUse: Value = node.literalValue;
                    let typeToUse: 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';
                    const currentType = this.getValueType(node.literalValue);
                    
                    if (node.literalValueType) {
                        if (currentType !== node.literalValueType) {
                            // Attempt type conversion
                            const converted = this.convertValueType(node.literalValue, node.literalValueType);
                            if (converted !== null) {
                                // Conversion successful, use converted value and target type
                                valueToUse = converted;
                                typeToUse = node.literalValueType;
                            } else {
                                // Conversion failed, keep original value and use original type
                                typeToUse = currentType;
                            }
                        } else {
                            // Types match, use target type
                            typeToUse = node.literalValueType;
                        }
                    } else {
                        // No target type specified, use current type
                        typeToUse = currentType;
                    }
                    
                    // Format the value for code output based on the type to use
                    let valueStr: string;
                    if (typeToUse === 'string') {
                        valueStr = `"${String(valueToUse).replace(/"/g, '\\"')}"`;
                    } else if (typeToUse === 'null') {
                        valueStr = 'null';
                    } else if (typeToUse === 'boolean') {
                        valueStr = String(valueToUse);
                    } else if (typeToUse === 'number') {
                        valueStr = String(valueToUse);
                    } else if (typeToUse === 'array' || typeToUse === 'object') {
                        // For arrays and objects, use JSON.stringify
                        valueStr = JSON.stringify(valueToUse);
                    } else {
                        // Fallback
                        valueStr = typeof valueToUse === 'string' ? `"${valueToUse}"` : String(valueToUse);
                    }
                    
                    assignmentCode = `${indent}${target} = ${valueStr}`;
                } else if (node.isLastValue) {
                    assignmentCode = `${indent}${target} = $`;
                }
                
                // Add inline comment if present (comments above are handled separately in updateCodeFromAST)
                if (assignmentCode && node.comments && Array.isArray(node.comments)) {
                    const inlineComment = node.comments.find((c: CommentWithPosition) => c.inline === true && c.text && c.text.trim() !== '');
                    if (inlineComment) {
                        assignmentCode += `  # ${inlineComment.text}`;
                    }
                }
                
                return assignmentCode;
            }
            case 'shorthand':
                return `${indent}$${node.targetName} = $`;
            case 'inlineIf': {
                const cmdCode = this.reconstructCodeFromASTNode(node.command, 0);
                return `${indent}if ${node.conditionExpr} ${cmdCode?.trim() || ''}`;
            }
            case 'ifBlock': {
                const parts: string[] = [];
                parts.push(`${indent}if ${node.conditionExpr}`);
                
                if (node.thenBranch) {
                    for (const stmt of node.thenBranch) {
                        const stmtCode = this.reconstructCodeFromASTNode(stmt, indentLevel + 1);
                        if (stmtCode) parts.push(stmtCode);
                    }
                }
                
                if (node.elseifBranches) {
                    for (const branch of node.elseifBranches) {
                        parts.push(`${indent}elseif ${branch.condition}`);
                        for (const stmt of branch.body) {
                            const stmtCode = this.reconstructCodeFromASTNode(stmt, indentLevel + 1);
                            if (stmtCode) parts.push(stmtCode);
                        }
                    }
                }
                
                if (node.elseBranch) {
                    parts.push(`${indent}else`);
                    for (const stmt of node.elseBranch) {
                        const stmtCode = this.reconstructCodeFromASTNode(stmt, indentLevel + 1);
                        if (stmtCode) parts.push(stmtCode);
                    }
                }
                
                parts.push(`${indent}endif`);
                return parts.join('\n');
            }
            case 'ifTrue': {
                const cmdCode = this.reconstructCodeFromASTNode(node.command, 0);
                return `${indent}iftrue ${cmdCode?.trim() || ''}`;
            }
            case 'ifFalse': {
                const cmdCode = this.reconstructCodeFromASTNode(node.command, 0);
                return `${indent}iffalse ${cmdCode?.trim() || ''}`;
            }
            case 'define': {
                // Reconstruct decorators first (if any)
                const decoratorLines: string[] = [];
                if (node.decorators && Array.isArray(node.decorators) && node.decorators.length > 0) {
                    for (const decorator of node.decorators) {
                        const decoratorArgs: string[] = [];
                        for (const arg of decorator.args || []) {
                            const argCode = this.reconstructArgCode(arg);
                            if (argCode !== null) {
                                decoratorArgs.push(argCode);
                            }
                        }
                        const decoratorCode = `@${decorator.name}${decoratorArgs.length > 0 ? ' ' + decoratorArgs.join(' ') : ''}`;
                        decoratorLines.push(decoratorCode);
                    }
                }
                const params = node.paramNames.join(' ');
                const parts: string[] = [];
                
                // Add decorators first (if any)
                if (decoratorLines.length > 0) {
                    for (const decoratorLine of decoratorLines) {
                        parts.push(decoratorLine);
                    }
                }
                
                // Add function definition
                parts.push(`${indent}def ${node.name}${params ? ' ' + params : ''}`);
                
                if (node.body) {
                    for (const stmt of node.body) {
                        const stmtCode = this.reconstructCodeFromASTNode(stmt, indentLevel + 1);
                        if (stmtCode) parts.push(stmtCode);
                    }
                }
                
                parts.push(`${indent}enddef`);
                return parts.join('\n');
            }
            case 'do': {
                const parts: string[] = [`${indent}do`];
                
                if (node.body) {
                    for (const stmt of node.body) {
                        const stmtCode = this.reconstructCodeFromASTNode(stmt, indentLevel + 1);
                        if (stmtCode) parts.push(stmtCode);
                    }
                }
                
                parts.push(`${indent}enddo`);
                return parts.join('\n');
            }
            case 'forLoop': {
                const parts: string[] = [`${indent}for $${node.varName} in ${node.iterableExpr}`];
                
                if (node.body) {
                    for (const stmt of node.body) {
                        const stmtCode = this.reconstructCodeFromASTNode(stmt, indentLevel + 1);
                        if (stmtCode) parts.push(stmtCode);
                    }
                }
                
                parts.push(`${indent}endfor`);
                return parts.join('\n');
            }
            case 'return': {
                if (node.value) {
                    const valueCode = this.reconstructArgCode(node.value);
                    return `${indent}return ${valueCode || ''}`;
                }
                return `${indent}return`;
            }
            case 'break':
                return `${indent}break`;
            case 'comment': {
                if (node.comments && Array.isArray(node.comments)) {
                    // Filter out empty comments and process non-empty ones
                    const nonEmptyComments = node.comments.filter((c: CommentWithPosition) => c.text && c.text.trim() !== '');
                    if (nonEmptyComments.length === 0) {
                        // All comments are empty - return empty string to remove the comment
                        return '';
                    }
                    // Each comment may contain \n for consecutive comments
                    return nonEmptyComments.map((c: CommentWithPosition) => {
                        // Split by \n and add # prefix to each line
                        return c.text.split('\n').map(line => `${indent}# ${line}`).join('\n');
                    }).join('\n');
                }
                return null;
            }
            default:
                return null;
        }
    }

    /**
     * Reconstruct code string from an Arg object
     */
    private reconstructArgCode(arg: any): string | null {
        if (!arg) return null;

        switch (arg.type) {
            case 'var': {
                let result = '$' + arg.name;
                if (arg.path) {
                    for (const seg of arg.path) {
                        if (seg.type === 'property') {
                            result += '.' + seg.name;
                        } else if (seg.type === 'index') {
                            result += '[' + seg.index + ']';
                        }
                    }
                }
                return result;
            }
            case 'string':
                return `"${arg.value}"`;
            case 'number':
                return String(arg.value);
            case 'literal':
                return String(arg.value);
            case 'lastValue':
                return '$';
            case 'subexpr':
                return `$(${arg.code || ''})`;
            case 'object':
                return `{${arg.code || ''}}`;
            case 'array':
                return `[${arg.code || ''}]`;
            case 'namedArgs': {
                const pairs: string[] = [];
                for (const [key, valueArg] of Object.entries(arg.args || {})) {
                    const valueCode = this.reconstructArgCode(valueArg as any);
                    if (valueCode !== null) {
                        pairs.push(`${key}=${valueCode}`);
                    }
                }
                return pairs.join(' ');
            }
            default:
                return null;
        }
    }

    /**
     * Reconstruct comment code from a CommentWithPosition object
     */
    private reconstructCommentCode(comment: CommentWithPosition, indentLevel: number = 0): string {
        // Return empty string if comment text is empty
        if (!comment.text || comment.text.trim() === '') {
            return '';
        }
        const indent = '  '.repeat(indentLevel);
        // Split by \n to handle consecutive comments, add # prefix to each line
        return comment.text.split('\n').map(line => `${indent}# ${line}`).join('\n');
    }

    /**
     * Convert row/column position to character offset in script
     * @param script The script string
     * @param row Zero-based row number
     * @param col Zero-based column number
     * @param exclusive If true, return offset one past the column (for end positions)
     * @returns Character offset in the script string
     */
    private rowColToCharOffset(script: string, row: number, col: number, exclusive: boolean = false): number {
        const lines = script.split('\n');
        let offset = 0;
        
        // Sum up the lengths of all lines before the target row
        for (let i = 0; i < row && i < lines.length; i++) {
            offset += lines[i].length + 1; // +1 for the newline character
        }
        
        // Add the column offset within the target row
        if (row < lines.length) {
            const colOffset = Math.min(col, lines[row].length);
            offset += colOffset;
            // If exclusive, add 1 to point one past the column
            if (exclusive) {
                offset += 1;
            }
        } else {
            // Row doesn't exist, but if exclusive, still add 1
            if (exclusive) {
                offset += 1;
            }
        }
        
        return offset;
    }

    /**
     * Get the type of a value
     */
    private getValueType(value: Value): 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array' {
        if (value === null) {
            return 'null';
        }
        if (typeof value === 'string') {
            return 'string';
        }
        if (typeof value === 'number') {
            return 'number';
        }
        if (typeof value === 'boolean') {
            return 'boolean';
        }
        if (Array.isArray(value)) {
            return 'array';
        }
        if (typeof value === 'object') {
            return 'object';
        }
        return 'string'; // Fallback
    }

    /**
     * Attempt to convert a value to a different type
     * @param value The value to convert
     * @param targetType The target type to convert to
     * @returns The converted value, or null if conversion fails
     */
    private convertValueType(value: Value, targetType: 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array'): Value | null {
        // If already the correct type, return as-is
        const currentType = this.getValueType(value);
        if (currentType === targetType) {
            return value;
        }

        try {
            switch (targetType) {
                case 'string':
                    if (value === null) return 'null';
                    if (typeof value === 'object' || Array.isArray(value)) {
                        return JSON.stringify(value);
                    }
                    return String(value);

                case 'number':
                    if (value === null) return null; // null cannot be converted to number
                    if (typeof value === 'boolean') {
                        return value ? 1 : 0;
                    }
                    if (typeof value === 'string') {
                        const parsed = parseFloat(value);
                        if (isNaN(parsed)) {
                            return null; // Conversion failed
                        }
                        return parsed;
                    }
                    if (typeof value === 'number') {
                        return value;
                    }
                    return null; // Cannot convert object/array to number

                case 'boolean':
                    if (value === null) return false;
                    if (typeof value === 'string') {
                        const lower = value.toLowerCase().trim();
                        if (lower === 'true' || lower === '1' || lower === 'yes') return true;
                        if (lower === 'false' || lower === '0' || lower === 'no' || lower === '') return false;
                        return null; // Ambiguous string, conversion failed
                    }
                    if (typeof value === 'number') {
                        return value !== 0 && !isNaN(value);
                    }
                    if (typeof value === 'boolean') {
                        return value;
                    }
                    if (Array.isArray(value)) {
                        return value.length > 0;
                    }
                    if (typeof value === 'object') {
                        return Object.keys(value).length > 0;
                    }
                    return false;

                case 'null':
                    return null;

                case 'array':
                    if (value === null) return [];
                    if (Array.isArray(value)) {
                        return value;
                    }
                    if (typeof value === 'string') {
                        try {
                            const parsed = JSON.parse(value);
                            if (Array.isArray(parsed)) {
                                return parsed;
                            }
                        } catch {
                            // Not valid JSON array, convert string to array of characters
                            return value.split('');
                        }
                    }
                    if (typeof value === 'object') {
                        return Object.values(value);
                    }
                    return [value]; // Wrap primitive in array

                case 'object':
                    if (value === null) return {};
                    if (typeof value === 'object' && !Array.isArray(value)) {
                        return value;
                    }
                    if (typeof value === 'string') {
                        try {
                            const parsed = JSON.parse(value);
                            if (typeof parsed === 'object' && !Array.isArray(parsed)) {
                                return parsed;
                            }
                        } catch {
                            // Not valid JSON object, create object with single property
                            return { value: value };
                        }
                    }
                    if (Array.isArray(value)) {
                        // Convert array to object with numeric keys
                        const obj: Record<string, Value> = {};
                        value.forEach((item, index) => {
                            obj[String(index)] = item;
                        });
                        return obj;
                    }
                    return { value: value }; // Wrap primitive in object

                default:
                    return null;
            }
        } catch {
            return null; // Conversion failed
        }
    }
}

