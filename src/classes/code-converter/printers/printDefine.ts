/**
 * Print define (function definition) node
 */

import type { PrintContext } from '../types';
import { Writer } from '../Writer';
import { printArg } from './printArg';
import { Printer } from '../Printer';

export function printDefine(node: any, writer: Writer, ctx: PrintContext): void {
    // Print decorators first (if any)
    if (node.decorators && Array.isArray(node.decorators) && node.decorators.length > 0) {
        for (const decorator of node.decorators) {
            const decoratorArgs: string[] = [];
            for (const arg of decorator.args || []) {
                const argCode = printArg(arg, ctx);
                if (argCode !== null) {
                    decoratorArgs.push(argCode);
                }
            }
            const decoratorCode = `@${decorator.name}${decoratorArgs.length > 0 ? ' ' + decoratorArgs.join(' ') : ''}`;
            writer.pushLine(decoratorCode);
        }
    }
    
    // Print function definition
    const params = node.paramNames.join(' ');
    writer.pushLine(`def ${node.name}${params ? ' ' + params : ''}`);
    
    // Print body
    if (node.body) {
        for (const stmt of node.body) {
            const stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel + 1 });
            if (stmtCode) {
                writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');
            }
        }
    }
    
    writer.pushLine('enddef');
}
