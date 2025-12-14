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
    writer.pushLine(`if ${conditionStr}`);
    
    if (node.thenBranch) {
        for (const stmt of node.thenBranch) {
            const stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel + 1 });
            if (stmtCode) {
                // Ensure it ends with newline
                writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');
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
            for (const stmt of statements) {
                const stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel + 1 });
                if (stmtCode) {
                    writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');
                }
            }
        }
    }
    
    if (node.elseBranch) {
        writer.pushLine('else');
        for (const stmt of node.elseBranch) {
            const stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel + 1 });
            if (stmtCode) {
                writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');
            }
        }
    }
    
    writer.pushLine('endif');
}
