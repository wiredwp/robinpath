/**
 * Print ifBlock node
 */

import type { PrintContext } from '../ASTToCodeConverter';
import { Writer, Printer } from '../ASTToCodeConverter';
import { printArg } from './printArg';
import {
    emitLeadingComments,
    emitBlankLineAfterComments
} from './printComment';

export function printIfBlock(node: any, writer: Writer, ctx: PrintContext): void {
    // Note: Leading comments attached to the ifBlock are printed by the parent
    // (e.g., printDefine's emitLeadingComments), so we don't print them here.
    // We only print the if statement and its branches.
    
    const condition = node.condition || node.conditionExpr;
    const conditionStr = (typeof condition === 'object' && condition !== null)
        ? (printArg(condition, ctx) ?? String(condition))
        : String(condition);

    writer.pushLine(`if ${conditionStr}`);

    if (node.thenBranch && Array.isArray(node.thenBranch)) {
        for (const stmt of node.thenBranch) {
            emitLeadingComments(stmt, writer, ctx, ctx.indentLevel + 1);
            emitBlankLineAfterComments(stmt, writer);

            const stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel + 1 });
            if (stmtCode) writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');

            const trailingBlankLines = (stmt as any)?.trailingBlankLines;
            if (trailingBlankLines !== undefined && trailingBlankLines !== null && trailingBlankLines > 0) {
                writer.push('\n'.repeat(trailingBlankLines));
            }
        }
    }

    if (node.elseBranch && Array.isArray(node.elseBranch) && node.elseBranch.length > 0) {
        writer.pushLine('else');
        for (const stmt of node.elseBranch) {
            emitLeadingComments(stmt, writer, ctx, ctx.indentLevel + 1);
            emitBlankLineAfterComments(stmt, writer);

            const stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel + 1 });
            if (stmtCode) writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');

            const trailingBlankLines = (stmt as any)?.trailingBlankLines;
            if (trailingBlankLines !== undefined && trailingBlankLines !== null && trailingBlankLines > 0) {
                writer.push('\n'.repeat(trailingBlankLines));
            }
        }
    }

    writer.pushLine('endif');
}
