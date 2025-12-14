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
     * Strategy:
     * 1. Collect all consecutive comments
     * 2. After comments, if we hit a newline, check if next token is also newline (blank line)
     * 3. If blank line -> create standalone comment node
     * 4. Otherwise -> return comments to attach to next statement
     * 
     * @param stream - TokenStream positioned at a COMMENT token
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
        const currentToken = stream.current();
        // console.log('[CommentParser] parseComments called, current token:', currentToken?.kind, currentToken?.text);
        
        // Check if current token is a comment (use direct comparison instead of check())
        if (!currentToken || currentToken.kind !== TokenKind.COMMENT) {
            // console.log('[CommentParser] No COMMENT token found, returning empty');
            return { comments: [], commentNode: null, consumed: false };
        }

        const comments: CommentWithPosition[] = [];
        let startLine = -1;
        
        // console.log('[CommentParser] Starting to collect comments...');
        
        // Collect all consecutive comment tokens
        while (true) {
            const token = stream.current();
            if (!token || token.kind !== TokenKind.COMMENT) {
                break;
            }
            
            // Consume the comment token
            stream.next();
            // console.log('[CommentParser] Found comment token:', token.text, 'on line', token.line);

            if (startLine === -1) {
                startLine = token.line - 1; // Convert to 0-based
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

            comments.push({
                text: commentText,
                codePos,
                inline: false // Non-inline comments
            });

            // Skip newline after comment
            if (stream.current()?.kind === TokenKind.NEWLINE) {
                stream.next();
            }
            
            // After consuming newline, check if next token is another comment (consecutive comments)
            // If so, continue collecting. If it's another newline, that's a blank line - stop collecting.
            const peekToken = stream.current();
            if (peekToken?.kind === TokenKind.NEWLINE) {
                // There's a blank line (two consecutive newlines) - stop collecting
                // console.log('[CommentParser] Blank line detected after comment, stopping collection');
                break;
            }
        }

        // console.log('[CommentParser] Collected comments:', comments.map(c => c.text));

        if (comments.length === 0) {
            return { comments: [], commentNode: null, consumed: false };
        }

        // After collecting comments and consuming their newlines, check what's next
        // If the next token is a newline (blank line), create standalone comment node
        // Otherwise, return comments to attach to next statement
        const nextToken = stream.current();
        // console.log('[CommentParser] Next token after comments:', nextToken?.kind, nextToken?.text);
        
        // Check if there's a blank line (two consecutive newlines)
        // We already consumed the newline after the last comment, so if current is also newline, it's a blank line
        if (nextToken && nextToken.kind === TokenKind.NEWLINE) {
            // This is a blank line - create standalone comment node
            const groupedText = comments.map(c => c.text).join('\n');
            const groupedCodePos: CodePosition = {
                startRow: comments[0].codePos.startRow,
                startCol: comments[0].codePos.startCol,
                endRow: comments[comments.length - 1].codePos.endRow,
                endCol: comments[comments.length - 1].codePos.endCol
            };

            // console.log('[CommentParser] Blank line detected, creating standalone comment node');
            
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

        // No blank line - comments should be attached to next statement
        // Group consecutive comments into a single comment with newlines
        const groupedText = comments.map(c => c.text).join('\n');
        const groupedCodePos: CodePosition = {
            startRow: comments[0].codePos.startRow,
            startCol: comments[0].codePos.startCol,
            endRow: comments[comments.length - 1].codePos.endRow,
            endCol: comments[comments.length - 1].codePos.endCol
        };

        // console.log('[CommentParser] No blank line, returning comments to attach:', groupedText);

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
        const token = stream.current();
        if (!token || token.kind !== TokenKind.COMMENT) {
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
        // console.log('[CommentParser.attachComments] Called with', comments.length, 'comments for statement type:', statement.type);
        
        // Initialize comments array if it doesn't exist
        if (!(statement as any).comments) {
            // console.log('[CommentParser.attachComments] Initializing comments array');
            (statement as any).comments = [];
        }

        // Add comments (above comments first, then inline)
        const aboveComments = comments.filter(c => !c.inline);
        const inlineComments = comments.filter(c => c.inline);
        
        // console.log('[CommentParser.attachComments] Adding comments - above:', aboveComments.length, 'inline:', inlineComments.length);
        // console.log('[CommentParser.attachComments] Comments to add:', comments.map(c => ({ text: c.text, inline: c.inline })));

        (statement as any).comments.push(...aboveComments, ...inlineComments);
        
        // console.log('[CommentParser.attachComments] Statement comments after push:', (statement as any).comments?.length, 'comments');
    }
}
