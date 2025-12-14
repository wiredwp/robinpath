/**
 * CommentParser - Handles comment parsing and attachment to AST nodes
 * 
 * This parser manages:
 * - Attaching comments above statements to those statements
 * - Handling inline comments on the same line as code
 * - Grouping consecutive orphaned comments (separated by blank lines) into single comment nodes
 */

import { TokenStream } from '../classes/TokenStream';
import { TokenKind } from '../classes/Lexer';
import type { CommentWithPosition, CommentStatement, CodePosition, Statement } from '../types/Ast.type';


export class CommentParser {
    /**
     * Parse comments from the stream and determine if they should be attached to the next statement
     * or kept as a standalone comment node
     * 
     * @param stream - TokenStream positioned at a COMMENT token
     * @param context - Optional context for parsing
     * @returns Object with:
     *   - comments: Array of CommentWithPosition for comments to attach
     *   - commentNode: CommentStatement if comments should be standalone (orphaned)
     *   - consumed: Whether comments were consumed from the stream
     */
    static parseComments(
        stream: TokenStream
    ): {
        comments: CommentWithPosition[];
        commentNode: CommentStatement | null;
        consumed: boolean;
    } {
        if (!stream.check(TokenKind.COMMENT)) {
            return { comments: [], commentNode: null, consumed: false };
        }

        const comments: CommentWithPosition[] = [];
        let startLine = -1;
        let lastCommentLine = -1;
        
        // Collect consecutive comment tokens
        while (stream.check(TokenKind.COMMENT)) {
            const token = stream.next();
            if (!token) break;

            if (startLine === -1) {
                startLine = token.line - 1; // Convert to 0-based
            }
            lastCommentLine = token.line;

            // Extract comment text (remove #)
            const commentText = token.text.startsWith('#') 
                ? token.text.slice(1).trim() 
                : token.text.trim();

            const codePos: CodePosition = {
                startRow: token.line - 1,
                startCol: token.column,
                endRow: token.line - 1,
                endCol: token.column + token.text.length - 1
            };

            comments.push({
                text: commentText,
                codePos,
                inline: false // Will be determined later for inline comments
            });

            // Skip newline after comment
            if (stream.check(TokenKind.NEWLINE)) {
                stream.next();
            }
        }

        if (comments.length === 0) {
            return { comments: [], commentNode: null, consumed: false };
        }

        // Check if there's a blank line between comments and next statement
        // After consuming comments and their newlines, the stream should be at the next token
        // If that token is more than 1 line away from the last comment, there's a blank line
        const savedPos = stream.getPosition();
        let nextToken = stream.current();
        
        // Skip any remaining newlines (shouldn't be any, but just in case)
        while (nextToken && nextToken.kind === TokenKind.NEWLINE) {
            stream.next();
            nextToken = stream.current();
        }
        
        let hasBlankLine = false;
        if (nextToken) {
            // Check if the next token's line is more than 1 away from the last comment line
            hasBlankLine = nextToken.line > lastCommentLine + 1;
        }
        
        stream.setPosition(savedPos);

        // If there's a blank line, these are orphaned comments - return as standalone comment node
        if (hasBlankLine) {
            // Group consecutive comments into a single comment with newlines
            const groupedText = comments.map(c => c.text).join('\n');
            const groupedCodePos: CodePosition = {
                startRow: comments[0].codePos.startRow,
                startCol: comments[0].codePos.startCol,
                endRow: comments[comments.length - 1].codePos.endRow,
                endCol: comments[comments.length - 1].codePos.endCol
            };

            return {
                comments: [],
                commentNode: {
                    type: 'comment',
                    comments: [{
                        text: groupedText,
                        codePos: groupedCodePos,
                        inline: false
                    }],
                    lineNumber: startLine
                },
                consumed: true
            };
        }

        // Comments should be attached to the next statement
        // Group consecutive comments into a single comment with newlines
        const groupedText = comments.map(c => c.text).join('\n');
        const groupedCodePos: CodePosition = {
            startRow: comments[0].codePos.startRow,
            startCol: comments[0].codePos.startCol,
            endRow: comments[comments.length - 1].codePos.endRow,
            endCol: comments[comments.length - 1].codePos.endCol
        };

        return {
            comments: [{
                text: groupedText,
                codePos: groupedCodePos,
                inline: false
            }],
            commentNode: null,
            consumed: true
        };
    }

    /**
     * Check if there's a blank line between the last comment line and the next statement
     * A blank line means the next non-whitespace token is more than 1 line away from the last comment
     */
    private static checkForBlankLine(stream: TokenStream, lastCommentLine: number): boolean {
        const savedPosition = stream.getPosition();

        // Skip newlines to find the next non-whitespace token
        // If we see multiple consecutive newlines, that indicates a blank line
        let newlineCount = 0;
        while (true) {
            const token = stream.current();
            if (!token) {
                stream.setPosition(savedPosition);
                return false; // End of file, no blank line
            }

            if (token.kind === TokenKind.NEWLINE) {
                newlineCount++;
                stream.next();
                // Check if next token is also a newline (blank line)
                const nextToken = stream.current();
                if (nextToken && nextToken.kind === TokenKind.NEWLINE) {
                    stream.setPosition(savedPosition);
                    return true; // Found blank line (two consecutive newlines)
                }
                continue;
            }

            // Found a non-whitespace token
            // Check if its line number is more than 1 away from the last comment line
            // (meaning there's at least one blank line between them)
            const hasBlankLine = token.line > lastCommentLine + 1;
            
            stream.setPosition(savedPosition);
            return hasBlankLine;
        }
    }

    /**
     * Parse inline comment from the stream (comment on same line as code)
     * 
     * @param stream - TokenStream positioned at a COMMENT token
     * @param statementLine - Line number of the statement (0-based)
     * @returns CommentWithPosition if inline comment found, null otherwise
     */
    static parseInlineComment(
        stream: TokenStream,
        statementLine: number
    ): CommentWithPosition | null {
        if (!stream.check(TokenKind.COMMENT)) {
            return null;
        }

        const token = stream.current();
        if (!token) {
            return null;
        }

        // Check if comment is on the same line as the statement
        if (token.line - 1 !== statementLine) {
            return null;
        }

        // Extract comment text (remove #)
        const commentText = token.text.startsWith('#') 
            ? token.text.slice(1).trim() 
            : token.text.trim();

        const codePos: CodePosition = {
            startRow: token.line - 1,
            startCol: token.column,
            endRow: token.line - 1,
            endCol: token.column + token.text.length - 1
        };

        // Consume the comment token
        stream.next();

        return {
            text: commentText,
            codePos,
            inline: true
        };
    }

    /**
     * Attach comments to a statement
     */
    static attachComments(statement: Statement, comments: CommentWithPosition[]): void {
        if (!('comments' in statement)) {
            return;
        }

        if (!statement.comments) {
            (statement as any).comments = [];
        }

        // Add comments (above comments first, then inline)
        const aboveComments = comments.filter(c => !c.inline);
        const inlineComments = comments.filter(c => c.inline);

        (statement as any).comments.push(...aboveComments, ...inlineComments);
    }
}
