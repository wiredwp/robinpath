/**
 * Print on block node
 */

import type { PrintContext } from '../ASTToCodeConverter';
import { Writer, Printer } from '../ASTToCodeConverter';
import { emitLeadingComments } from './printComment';

export function printOnBlock(node: any, writer: Writer, ctx: PrintContext): void {
    const eventName = node.eventName || node.event || '';
    // Event name needs to be quoted
    writer.pushLine(`on "${eventName}"`.trimEnd());

    if (node.body && Array.isArray(node.body)) {
        for (const stmt of node.body) {
            emitLeadingComments(stmt, writer, ctx, ctx.indentLevel + 1);

            const stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel + 1 });
            if (stmtCode) writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');

            const trailingBlankLines = (stmt as any)?.trailingBlankLines;
            if (trailingBlankLines !== undefined && trailingBlankLines !== null && trailingBlankLines > 0) {
                writer.push('\n'.repeat(trailingBlankLines));
            }
        }
    }

    writer.pushLine('endon');
}
