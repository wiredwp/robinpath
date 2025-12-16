/**
 * Print comment node and comment-related utilities
 */

import type { PrintContext, CommentWithPosition } from '../ASTToCodeConverter';
import { Writer, Printer } from '../ASTToCodeConverter';

/**
 * Print a comment node
 */
export function printComment(node: any, writer: Writer, _ctx: PrintContext): void {
    if (!node || !node.comments || !Array.isArray(node.comments)) return;

    for (const comment of node.comments as CommentWithPosition[]) {
        const raw = (comment && typeof comment.text === 'string') ? comment.text : '';
        // Support consecutive comments encoded with \n
        const commentLines = raw.split('\n');

        for (const line of commentLines) {
            const cleaned = line.replace(/\r/g, '');
            if (cleaned.trim() === '') {
                writer.pushLine('#');
            } else {
                writer.pushLine(`# ${cleaned}`);
            }
        }
    }
}

/**
 * Get leading comments from a statement node.
 * Supports both new format (stmt.comments) and old format (stmt.leadingComments).
 */
function getLeadingComments(stmt: any): CommentWithPosition[] {
    // Try new format first (stmt.comments with inline flag)
    if (stmt?.comments && Array.isArray(stmt.comments)) {
        return stmt.comments.filter((c: any) => !c.inline);
    }

    // Fall back to old format (stmt.leadingComments)
    if (stmt?.leadingComments && Array.isArray(stmt.leadingComments)) {
        return stmt.leadingComments;
    }

    return [];
}

/**
 * Get inline comment from a statement node.
 */
export function getInlineComment(stmt: any): CommentWithPosition | null {
    if (!stmt?.comments || !Array.isArray(stmt.comments)) {
        return null;
    }

    return stmt.comments.find((c: any) => c.inline === true) || null;
}

/**
 * Format an inline comment as a string to append to a line.
 */
export function formatInlineComment(comment: CommentWithPosition | null): string {
    if (!comment || !comment.text) {
        return '';
    }
    return `  # ${comment.text}`;
}

/**
 * Emit leading comments for a statement, preserving blank lines between them.
 * Returns true if any comments were emitted, false otherwise.
 */
export function emitLeadingComments(
    stmt: any,
    writer: Writer,
    _ctx: PrintContext,
    indentLevel: number
): boolean {
    const leadingComments = getLeadingComments(stmt);
    if (leadingComments.length === 0) {
        return false;
    }

    // Sort comments by their row position to maintain order
    leadingComments.sort((a: any, b: any) => {
        const aRow = a?.codePos?.startRow ?? 0;
        const bRow = b?.codePos?.startRow ?? 0;
        return aRow - bRow;
    });

    // Print each leading comment, preserving blank lines between them
    for (let i = 0; i < leadingComments.length; i++) {
        const comment = leadingComments[i];
        const commentCode = Printer.printComment(comment, indentLevel);
        if (commentCode) {
            writer.push(commentCode.endsWith('\n') ? commentCode : commentCode + '\n');
        }

        // Check if there's a blank line gap before the next comment
        if (i < leadingComments.length - 1) {
            const nextComment = leadingComments[i + 1];
            const gap = (nextComment?.codePos?.startRow ?? 0) - (comment?.codePos?.endRow ?? 0);
            // If gap > 1, there's at least one blank line between comments
            if (gap > 1) {
                writer.pushBlankLine();
            }
        }
    }

    return true;
}

/**
 * Check if there's a blank line gap between the last comment and a statement,
 * and emit a blank line if needed.
 */
export function emitBlankLineAfterComments(
    stmt: any,
    writer: Writer
): void {
    if (!stmt || !('codePos' in stmt) || !stmt.codePos) {
        return;
    }

    const leadingComments = getLeadingComments(stmt);
    if (leadingComments.length === 0) {
        return;
    }

    const lastComment = leadingComments[leadingComments.length - 1];
    const gap = stmt.codePos.startRow - (lastComment?.codePos?.endRow ?? 0);
    // If gap > 1, there's at least one blank line between last comment and statement
    if (gap > 1) {
        writer.pushBlankLine();
    }
}

/**
 * Check if there's a blank line gap between two statements,
 * and emit a blank line if needed.
 */
export function emitBlankLineBetweenStatements(
    prevStmt: any,
    currentStmt: any,
    writer: Writer
): void {
    if (!prevStmt || !currentStmt) {
        return;
    }

    if (!('codePos' in prevStmt) || !prevStmt.codePos ||
        !('codePos' in currentStmt) || !currentStmt.codePos) {
        return;
    }

    const prevEndRow = prevStmt.codePos.endRow;
    // Get the start row of the current statement or its first leading comment
    let currentStartRow = currentStmt.codePos.startRow;
    const leadingComments = getLeadingComments(currentStmt);
    if (leadingComments.length > 0 && leadingComments[0]?.codePos) {
        currentStartRow = leadingComments[0].codePos.startRow;
    }

    const gap = currentStartRow - prevEndRow;
    // If gap > 1, there's at least one blank line between statements
    if (gap > 1) {
        writer.pushBlankLine();
    }
}
