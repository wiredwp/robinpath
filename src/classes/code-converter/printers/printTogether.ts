/**
 * Print together block node
 */

import type { PrintContext } from '../ASTToCodeConverter';
import { Writer, Printer } from '../ASTToCodeConverter';

export function printTogether(node: any, writer: Writer, ctx: PrintContext): void {
    writer.pushLine('together');

    if (node.blocks && Array.isArray(node.blocks)) {
        for (const block of node.blocks) {
            // Each block is a 'do' block
            const blockCode = Printer.printNode(block, { ...ctx, indentLevel: ctx.indentLevel + 1 });
            if (blockCode) writer.push(blockCode.endsWith('\n') ? blockCode : blockCode + '\n');

            const trailingBlankLines = (block as any)?.trailingBlankLines;
            if (trailingBlankLines !== undefined && trailingBlankLines !== null && trailingBlankLines > 0) {
                writer.push('\n'.repeat(trailingBlankLines));
            }
        }
    }

    writer.pushLine('endtogether');
}
