/**
 * Print for loop node
 */

import type { PrintContext } from '../ASTToCodeConverter';
import { Writer, Printer } from '../ASTToCodeConverter';
import { printArg } from './printArg';
import { emitLeadingComments } from './printComment';

export function printForLoop(node: any, writer: Writer, ctx: PrintContext): void {
    const varName = node.varName || node.var || node.iterator || '$i';
    const varPrefix = varName.startsWith('$') ? '' : '$';

    // Handle range from original parser format
    if (node.range && node.range.from !== undefined && node.range.to !== undefined) {
        const from = printArg(node.range.from, ctx);
        const to = printArg(node.range.to, ctx);
        writer.pushLine(`for ${varPrefix}${varName} in range ${from} ${to}`);
    } 
    // Handle iterable
    else if (node.iterable) {
        const iterableStr = printArg(node.iterable, ctx);
        writer.pushLine(`for ${varPrefix}${varName} in ${iterableStr ?? ''}`.trimEnd());
    }
    else {
        writer.pushLine(`for ${varPrefix}${varName} in `.trimEnd());
    }

    if (node.body && Array.isArray(node.body)) {
        for (const stmt of node.body) {
            if (!stmt) continue;
            
            emitLeadingComments(stmt, writer, ctx, ctx.indentLevel + 1);

            const stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel + 1 });
            if (stmtCode) writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');

            const trailingBlankLines = (stmt as any)?.trailingBlankLines;
            if (trailingBlankLines !== undefined && trailingBlankLines !== null && trailingBlankLines > 0) {
                writer.push('\n'.repeat(trailingBlankLines));
            }
        }
    }

    writer.pushLine('endfor');
}
