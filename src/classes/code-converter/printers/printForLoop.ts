/**
 * Print forLoop node
 */

import type { PrintContext } from '../types';
import { Writer } from '../Writer';
import { Printer } from '../Printer';
import { printArg } from './printArg';

export function printForLoop(node: any, writer: Writer, ctx: PrintContext): void {
    // Handle both iterable and iterableExpr (for compatibility)
    const iterable = node.iterable || node.iterableExpr;
    // If iterable is an Expression object, print it; otherwise use as string
    const iterableStr = typeof iterable === 'object' && iterable !== null
        ? printArg(iterable, ctx) || String(iterable)
        : String(iterable);
    
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
        writer.push(`for $${node.varName} in ${iterableStr}`);
        writer.newline();
    } else {
        writer.pushLine(`for $${node.varName} in ${iterableStr}`);
    }
    
    if (node.body) {
        for (let i = 0; i < node.body.length; i++) {
            const stmt = node.body[i];
            const stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel + 1 });
            if (stmtCode) {
                writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');
                
                // Handle trailingBlankLines for this statement
                const trailingBlankLines = (stmt as any).trailingBlankLines;
                if (trailingBlankLines !== undefined && trailingBlankLines !== null && trailingBlankLines > 0) {
                    // Add blank lines after this statement
                    writer.push('\n'.repeat(trailingBlankLines));
                }
            }
        }
    }
    
    // Print endfor with the same indentation as the header
    if (headerIndent) {
        writer.push(headerIndent);
        writer.push('endfor');
        writer.newline();
    } else {
        writer.pushLine('endfor');
    }
}
