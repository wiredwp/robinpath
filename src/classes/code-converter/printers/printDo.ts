/**
 * Print do (scope block) node
 */

import type { PrintContext } from '../types';
import { Writer } from '../Writer';
import { printIntoTarget } from './printArg';
import { Printer } from '../Printer';

export function printDo(node: any, writer: Writer, ctx: PrintContext): void {
    let doLine = 'do';
    
    // Add parameter names if present
    if (node.paramNames && node.paramNames.length > 0) {
        doLine += ' ' + node.paramNames.map((name: string) => `$${name}`).join(' ');
    }
    
    // Add "into $var" if present
    if (node.into) {
        const intoTarget = printIntoTarget(node.into.targetName, node.into.targetPath);
        doLine += ` into ${intoTarget}`;
    }
    
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
        writer.push(doLine);
        writer.newline();
    } else {
        writer.pushLine(doLine);
    }
    
    // Print body
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
    
    // Print enddo with the same indentation as the header
    if (headerIndent) {
        writer.push(headerIndent);
        writer.push('enddo');
        writer.newline();
    } else {
        writer.pushLine('enddo');
    }
}
