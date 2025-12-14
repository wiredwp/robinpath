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
    writer.pushLine(`for $${node.varName} in ${iterableStr}`);
    
    if (node.body) {
        for (const stmt of node.body) {
            const stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel + 1 });
            if (stmtCode) {
                writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');
            }
        }
    }
    
    writer.pushLine('endfor');
}
