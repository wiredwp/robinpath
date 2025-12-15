/**
 * Print ifBlock node
 */

import type { PrintContext } from '../types';
import { Writer } from '../Writer';
import { Printer } from '../Printer';
import { printArg } from './printArg';

export function printIfBlock(node: any, writer: Writer, ctx: PrintContext): void {
    // Handle both condition and conditionExpr (for compatibility)
    const condition = node.condition || node.conditionExpr;
    // If condition is an Expression object, print it; otherwise use as string
    const conditionStr = typeof condition === 'object' && condition !== null
        ? printArg(condition, ctx) || String(condition)
        : String(condition);
    
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
        writer.push(`if ${conditionStr}`);
        writer.newline();
    } else {
        writer.pushLine(`if ${conditionStr}`);
    }
    
    if (node.thenBranch) {
        for (let i = 0; i < node.thenBranch.length; i++) {
            const stmt = node.thenBranch[i];
            const stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel + 1 });
            if (stmtCode) {
                // Ensure it ends with newline
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
    
    if (node.elseifBranches) {
        for (const branch of node.elseifBranches) {
            // Handle both condition and conditionExpr (for compatibility)
            const condition = branch.condition || branch.conditionExpr;
            // If condition is an Expression object, print it; otherwise use as string
            const conditionStr = typeof condition === 'object' && condition !== null
                ? printArg(condition, ctx) || String(condition)
                : String(condition);
            writer.pushLine(`elseif ${conditionStr}`);
            // Handle both body and statements (for compatibility)
            const statements = branch.body || branch.statements || [];
            for (let i = 0; i < statements.length; i++) {
                const stmt = statements[i];
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
    }
    
    if (node.elseBranch) {
        writer.pushLine('else');
        for (let i = 0; i < node.elseBranch.length; i++) {
            const stmt = node.elseBranch[i];
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
    
    // Print endif with the same indentation as the header
    if (headerIndent) {
        writer.push(headerIndent);
        writer.push('endif');
        writer.newline();
    } else {
        writer.pushLine('endif');
    }
}
