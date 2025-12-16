/**
 * Print chunk marker node
 */

import type { PrintContext } from '../ASTToCodeConverter';
import { Writer } from '../ASTToCodeConverter';

export function printChunkMarker(node: any, writer: Writer, _ctx: PrintContext): void {
    // If raw is preserved, use that (for now, always use canonical format)
    // Future: could add preserveRaw option to PrintContext if needed

    // Print in canonical format
    let line = `--- chunk:${node.id}`;

    // Add metadata if present
    if (node.meta && Object.keys(node.meta).length > 0) {
        // Sort keys alphabetically for canonical output
        const sortedKeys = Object.keys(node.meta).sort();
        const metaPairs = sortedKeys.map(key => {
            const value = node.meta[key];
            // If value contains spaces or special chars, quote it
            if (/[\s:=-]/.test(value)) {
                return `${key}:"${value}"`;
            }
            return `${key}:${value}`;
        });
        line += ' ' + metaPairs.join(' ');
    }

    line += ' ---';
    writer.pushLine(line);
}

