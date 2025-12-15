/**
 * Print do block node
 */

import type { PrintContext } from '../ASTToCodeConverter';
import { Writer, Printer } from '../ASTToCodeConverter';
import { emitLeadingComments } from './printComment';

export function printDo(node: any, writer: Writer, ctx: PrintContext): void {
    writer.pushLine('do');

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

    writer.pushLine('enddo');
}
