/**
 * Print define (function definition) node
 */

import type { PrintContext } from '../ASTToCodeConverter';
import { Writer, Printer } from '../ASTToCodeConverter';
import { printArg } from './printArg';
import {
    emitLeadingComments,
    emitBlankLineAfterComments,
    emitBlankLineBetweenStatements
} from './printComment';

export function printDefine(node: any, writer: Writer, ctx: PrintContext): void {
    // Print decorators first (if any)
    if (node.decorators && Array.isArray(node.decorators) && node.decorators.length > 0) {
        for (const decorator of node.decorators) {
            const decoratorArgs: string[] = [];
            for (const arg of decorator.args || []) {
                const argCode = printArg(arg, ctx);
                if (argCode !== null) decoratorArgs.push(argCode);
            }
            const argsStr = decoratorArgs.length > 0 ? ' ' + decoratorArgs.join(' ') : '';
            writer.pushLine(`@${decorator.name}${argsStr}`);
        }
    }

    // Parameters are stored as paramNames (array of strings), not params
    const paramNames = node.paramNames && Array.isArray(node.paramNames) ? node.paramNames : [];
    const paramsStr = paramNames.map((name: string) => `$${name}`).join(' ');
    writer.pushLine(`def ${node.name}${paramsStr ? ' ' + paramsStr : ''}`);

    if (node.body && Array.isArray(node.body)) {
        for (let i = 0; i < node.body.length; i++) {
            const stmt = node.body[i];
            const prevStmt = i > 0 ? node.body[i - 1] : null;
            
            // Check for blank lines between previous statement and current statement
            emitBlankLineBetweenStatements(prevStmt, stmt, writer);
            
            // Emit leading comments
            emitLeadingComments(stmt, writer, ctx, ctx.indentLevel + 1);
            
            // Check if there's a blank line gap between the last comment and the statement
            emitBlankLineAfterComments(stmt, writer);

            const stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel + 1 });
            if (stmtCode) writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');

            const trailingBlankLines = (stmt as any)?.trailingBlankLines;
            if (trailingBlankLines !== undefined && trailingBlankLines !== null && trailingBlankLines > 0) {
                writer.push('\n'.repeat(trailingBlankLines));
            }
        }
    }

    writer.pushLine('enddef');
}
