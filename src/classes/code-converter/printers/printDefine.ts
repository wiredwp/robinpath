/**
 * Print define (function definition) node
 */

import type { PrintContext } from '../types';
import { Writer } from '../Writer';
import { printArg } from './printArg';
import { Printer } from '../Printer';

export function printDefine(node: any, writer: Writer, ctx: PrintContext): void {
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
    
    // Print function definition
    // Parameters must always start with $ prefix
    const params = node.paramNames && node.paramNames.length > 0
        ? node.paramNames.map((name: string) => '$' + name).join(' ')
        : '';
    
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
        writer.push(`def ${node.name}${params ? ' ' + params : ''}`);
        writer.newline();
    } else {
        writer.pushLine(`def ${node.name}${params ? ' ' + params : ''}`);
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
                    // First statement - start from the end of the block header (e.g., "def testAssign") to include leading blank lines
                    if ('codePos' in node && node.codePos) {
                        // Start from the end of the block header line (def testAssign line)
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
                    // Last statement - end at the statement's end
                    stmtEndOffset = ctx.lineIndex.offsetAt(
                        stmt.codePos.endRow,
                        stmt.codePos.endCol,
                        true
                    );
                }
                const extractedCode = ctx.originalScript.substring(stmtStartOffset, stmtEndOffset);
                // Preserve the original code as-is (including indentation and blank lines)
                stmtCode = extractedCode;
                extractedFromOriginal = true;
            }
            
            // If we couldn't extract original code, use Printer
            if (!stmtCode) {
                stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel + 1 });
            }
            
            if (stmtCode) {
                // If we extracted from original, use it as-is (it already includes blank lines and formatting)
                if (extractedFromOriginal) {
                    writer.push(stmtCode);
                } else {
                    // Generated code - add newline and trailing blank lines
                    writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');
                    
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
    
    // Print enddef with the same indentation as the header
    if (headerIndent) {
        writer.push(headerIndent);
        writer.push('enddef');
        writer.newline();
    } else {
        writer.pushLine('enddef');
    }
}
