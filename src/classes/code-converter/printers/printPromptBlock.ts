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
        writer.push(node.rawText);
        // Ensure text ends with newline if it doesn't already
        if (node.rawText.length > 0 && !node.rawText.endsWith('\n')) {
            writer.newline();
        }
    }
    
    // Print closing fence
    writer.pushLine('---');
}

