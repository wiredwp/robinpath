/**
 * Print cell block node
 */

import type { PrintContext } from '../ASTToCodeConverter';
import { Writer, Printer } from '../ASTToCodeConverter';

export function printCellBlock(node: any, writer: Writer, ctx: PrintContext): void {
    // Print header: ---cell <cellType> key:value key:value---
    let headerLine = `---cell ${node.cellType}`;
    
    // Collect and sort metadata
    const meta = node.meta || {};
    const metaKeys = Object.keys(meta);
    
    // Print id first if present, then remaining keys sorted
    if (meta.id !== undefined) {
        const value = meta.id;
        if (/[\s:=-]/.test(value)) {
            headerLine += ` id:"${value}"`;
        } else {
            headerLine += ` id:${value}`;
        }
    }
    
    // Print remaining keys sorted alphabetically
    const remainingKeys = metaKeys.filter(k => k !== 'id').sort();
    for (const key of remainingKeys) {
        const value = meta[key];
        if (/[\s:=-]/.test(value)) {
            headerLine += ` ${key}:"${value}"`;
        } else {
            headerLine += ` ${key}:${value}`;
        }
    }
    
    headerLine += '---';
    writer.pushLine(headerLine);
    
    // Print body
    if (node.cellType === 'code' && node.body && Array.isArray(node.body) && node.body.length > 0) {
        // Print parsed statements
        for (const stmt of node.body) {
            const stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel });
            if (stmtCode) {
                writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');
            }
        }
    } else if (node.rawBody !== undefined && node.rawBody.length > 0) {
        // Print raw body verbatim
        writer.push(node.rawBody);
        // Ensure body ends with newline if it doesn't already
        if (!node.rawBody.endsWith('\n')) {
            writer.newline();
        }
    }
    // Empty body - no content between header and ---end---
    
    // Print closing fence
    writer.pushLine('---end---');
}

