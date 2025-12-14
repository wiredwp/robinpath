/**
 * Print comment node
 */

import type { PrintContext, CommentWithPosition } from '../types';
import { Writer } from '../Writer';

export function printComment(node: any, writer: Writer, _ctx: PrintContext): void {
    if (node.comments && Array.isArray(node.comments)) {
        // Filter out empty comments
        const nonEmptyComments = node.comments.filter((c: CommentWithPosition) => c.text && c.text.trim() !== '');
        if (nonEmptyComments.length === 0) {
            // All comments are empty - return empty string to remove the comment
            return;
        }
        // Each comment may contain \n for consecutive comments
        for (const comment of nonEmptyComments) {
            const commentLines = comment.text.split('\n');
            for (const line of commentLines) {
                writer.pushLine(`# ${line}`);
            }
        }
    }
}
