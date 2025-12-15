/**
 * Print onBlock (event handler) node
 */

import type { PrintContext } from '../types';
import { Writer } from '../Writer';
import { Printer } from '../Printer';
import { printArg } from './printArg';

export function printOnBlock(node: any, writer: Writer, ctx: PrintContext): void {
    // Print decorators first (if any)
    if (node.decorators && Array.isArray(node.decorators) && node.decorators.length > 0) {
        for (const decorator of node.decorators) {
            const decoratorArgs: string[] = [];
            for (const arg of decorator.args || []) {
                const argCode = printArg(arg, ctx);
                if (argCode !== null) {
                    decoratorArgs.push(argCode);
                }
            }
            const decoratorCode = `@${decorator.name}${decoratorArgs.length > 0 ? ' ' + decoratorArgs.join(' ') : ''}`;
            writer.pushLine(decoratorCode);
        }
    }
    
    // Print event handler definition
    // Event name should be wrapped in quotes if it's a string literal
    const eventNameStr = typeof node.eventName === 'string' ? `"${node.eventName}"` : String(node.eventName);
    
    // Get the header's indentation from original code if available
    let headerIndent = '';
    if (ctx.originalScript && 'codePos' in node && node.codePos) {
        const headerLine = ctx.lineIndex.getLine(node.codePos.startRow);
        const headerIndentMatch = headerLine.match(/^(\s*)/);
        if (headerIndentMatch) {
            headerIndent = headerIndentMatch[1];
        }
    }
    
    // If we have header indent, use it; otherwise use current indent
    if (headerIndent) {
        writer.push(headerIndent);
        writer.push(`on ${eventNameStr}`);
        writer.newline();
    } else {
        writer.pushLine(`on ${eventNameStr}`);
    }
    
    // Print body
    if (node.body) {
        for (let i = 0; i < node.body.length; i++) {
            const stmt = node.body[i];
            const prevStmt = i > 0 ? node.body[i - 1] : null;
            
            // Try to extract original code if originalScript is available and extraction is allowed
            let stmtCode: string | null = null;
            let extractedFromOriginal = false;
            if (ctx.originalScript && ctx.allowExtractOriginalCode !== false && 'codePos' in stmt && stmt.codePos) {
                // Extract original code for this statement including leading blank lines
                // Start from the end of previous statement (or end of block header) to include leading blank lines
                let stmtStartOffset: number;
                if (prevStmt && 'codePos' in prevStmt && prevStmt.codePos) {
                    // Start from the end of previous statement to include any blank lines between statements
                    stmtStartOffset = ctx.lineIndex.offsetAt(
                        prevStmt.codePos.endRow,
                        prevStmt.codePos.endCol,
                        true  // exclusive: after the previous statement
                    );
                } else {
                    // First statement - start from the end of the block header (e.g., "on "test"") to include leading blank lines
                    if ('codePos' in node && node.codePos) {
                        // Start from the end of the block header line (on "test" line)
                        // The block header is on node.codePos.startRow
                        const headerLineEnd = ctx.lineIndex.lineEndOffset(node.codePos.startRow);
                        stmtStartOffset = headerLineEnd;  // After the header line (includes newline)
                    } else {
                        // Fallback: start from the statement itself
                        stmtStartOffset = ctx.lineIndex.offsetAt(
                            stmt.codePos.startRow,
                            stmt.codePos.startCol,
                            false
                        );
                    }
                }
                
                // Find the next statement to determine where this statement ends
                const nextStmt = i < node.body.length - 1 ? node.body[i + 1] : null;
                let stmtEndOffset: number;
                if (nextStmt && 'codePos' in nextStmt && nextStmt.codePos) {
                    // End before the next statement (to include trailing blank lines)
                    stmtEndOffset = ctx.lineIndex.offsetAt(
                        nextStmt.codePos.startRow,
                        nextStmt.codePos.startCol,
                        false
                    );
                } else {
                    // Last statement - end before endon (which is at node.codePos.endRow)
                    // Include blank lines after the statement up to (but not including) endon
                    if ('codePos' in node && node.codePos) {
                        // Find the endon line
                        const endonRow = node.codePos.endRow;
                        // End before the endon line (to include trailing blank lines)
                        stmtEndOffset = ctx.lineIndex.offsetAt(
                            endonRow,
                            0,  // Start of endon line
                            false  // Not exclusive - we want to end before endon
                        );
                    } else {
                        // Fallback: end at the statement's end
                    stmtEndOffset = ctx.lineIndex.offsetAt(
                        stmt.codePos.endRow,
                        stmt.codePos.endCol,
                        true
                    );
                    }
                }
                stmtCode = ctx.originalScript.substring(stmtStartOffset, stmtEndOffset);
                extractedFromOriginal = true;
            }
            
            // If we couldn't extract original code, use Printer
            if (!stmtCode) {
                stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel + 1 });
            }
            
            if (stmtCode) {
                // If we extracted from original, use it as-is (it already includes blank lines and formatting)
                if (extractedFromOriginal) {
                    // Process line by line to normalize blank lines
                    // Preserve the exact structure but normalize blank lines (remove trailing spaces from blank lines only)
                    const lines = stmtCode.split('\n');
                    const processedLines: string[] = [];
                    
                    for (let j = 0; j < lines.length; j++) {
                        let line = lines[j];
                        // Normalize blank lines (remove all whitespace to make them completely empty)
                        // But preserve non-blank lines exactly as they are (including leading spaces)
                        if (line.trim() === '') {
                            processedLines.push('');
                        } else {
                            processedLines.push(line);
                        }
                    }
                    
                    // Join with newlines - preserve the original structure
                    // If the original ended with a newline, the split would have created an extra empty line
                    // We need to check if the original ended with a newline
                    const endsWithNewline = stmtCode.endsWith('\n');
                    let normalizedCode = processedLines.join('\n');
                    if (endsWithNewline && !normalizedCode.endsWith('\n')) {
                        normalizedCode += '\n';
                    } else if (!endsWithNewline && normalizedCode.endsWith('\n')) {
                        // Remove trailing newline if original didn't have it
                        normalizedCode = normalizedCode.slice(0, -1);
                    }
                    writer.push(normalizedCode);
                } else {
                    // Generated code - add newline and trailing blank lines
                    const finalCode = stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n';
                    writer.push(finalCode);
                    
                    // Handle trailingBlankLines for generated code
                    const trailingBlankLines = (stmt as any).trailingBlankLines;
                    if (trailingBlankLines !== undefined && trailingBlankLines !== null && trailingBlankLines > 0) {
                        // Add blank lines after this statement
                        writer.push('\n'.repeat(trailingBlankLines));
                    }
                }
            }
        }
    }
    
    // Print endon with the same indentation as the header
    if (headerIndent) {
        writer.push(headerIndent);
        writer.push('endon');
        writer.newline();
    } else {
        writer.pushLine('endon');
    }
}
