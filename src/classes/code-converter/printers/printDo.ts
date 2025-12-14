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
    
    writer.pushLine(doLine);
    
    // Print body
    if (node.body) {
        for (const stmt of node.body) {
            const stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel + 1 });
            if (stmtCode) {
                writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');
            }
        }
    }
    
    writer.pushLine('enddo');
}
