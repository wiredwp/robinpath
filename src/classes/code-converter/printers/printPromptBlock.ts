/**
 * Print prompt block node
 */

import type { PrintContext } from '../ASTToCodeConverter';
import { Writer } from '../ASTToCodeConverter';

export function printPromptBlock(node: any, writer: Writer, _ctx: PrintContext): void {
    // Print opening fence
    writer.pushLine('---');
    
    // Print raw text verbatim
    if (node.rawText !== undefined) {
        // rawText contains the content between the fences
        // If rawText is empty but bodyPos indicates there was content (like a blank line),
        // we need to preserve that
        if (node.rawText.length > 0) {
            writer.push(node.rawText);
            // Ensure text ends with newline if it doesn't already
            if (!node.rawText.endsWith('\n')) {
                writer.newline();
            }
        } else if (node.bodyPos && node.bodyPos.startRow >= 0 && node.bodyPos.startRow <= node.bodyPos.endRow) {
            // Empty rawText but body position exists - there was a blank line
            writer.newline();
        }
    }
    
    // Print closing fence
    writer.pushLine('---');
}

