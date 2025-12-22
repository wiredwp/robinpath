/**
 * Parser for 'on' event handler blocks
 * Syntax: on "eventName" ... endon
 * Token-stream based implementation
 */

import { TokenStream, ParsingContext } from '../classes/TokenStream';
import { TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { createCodePosition } from './ParserUtils';
import type { Statement, CommentWithPosition, OnBlock, DecoratorCall } from '../types/Ast.type';
import type { Environment } from '../index';
import { CommentParser } from './CommentParser';

export class EventParser {
    /**
     * Parse an 'on' event handler block
     * Expects stream to be positioned at the 'on' keyword
     * 
     * @param stream - TokenStream positioned at the 'on' keyword
     * @param parseStatement - Callback to parse a statement from the stream
     * @param parseComment - Callback to parse a comment from the stream
     * @param decorators - Optional decorators to attach to this event handler
     * @param environment - Optional environment for executing parse decorators
     * @returns Parsed OnBlock
     */
    static async parse(
        stream: TokenStream,
        parseStatement: (stream: TokenStream) => Statement | null,
        parseComment: (stream: TokenStream) => Statement | null,
        decorators?: DecoratorCall[],
        environment?: Environment | null
    ): Promise<OnBlock> {
        const onToken = stream.current();
        if (!onToken || (onToken.kind !== TokenKind.KEYWORD || onToken.text !== 'on')) {
            throw new Error(`Expected 'on' keyword at ${stream.formatPosition()}`);
        }

        const headerToken = onToken;
        
        // Push event handler context
        stream.pushContext(ParsingContext.BLOCK);
        
        try {
            stream.next(); // Consume 'on'

            // Skip whitespace and comments
            stream.skipWhitespaceAndComments();

            // Parse event name (must be a string literal)
            const eventNameToken = stream.current();
            if (!eventNameToken || eventNameToken.kind !== TokenKind.STRING) {
                throw new Error(`Expected string literal for event name at ${stream.formatPosition()}`);
            }

            const eventName = eventNameToken.value !== undefined 
                ? String(eventNameToken.value) 
                : eventNameToken.text.slice(1, -1); // Remove quotes
            stream.next(); // Consume event name string

            // Collect header comments (inline comments on the same line)
            const headerComments: CommentWithPosition[] = [];
            stream.skipWhitespaceAndComments();
            
            // Check for inline comment on header line
            const nextToken = stream.current();
            if (nextToken && nextToken.kind === TokenKind.COMMENT) {
                const commentText = nextToken.value !== undefined 
                    ? String(nextToken.value) 
                    : nextToken.text.replace(/^#\s*/, '');
                headerComments.push({
                    text: commentText,
                    inline: true,
                    codePos: createCodePosition(nextToken, nextToken)
                });
                stream.next();
            }

            // Skip to newline to start parsing body
            // Only skip tokens that are on the same line as the event name
            const eventNameLine = eventNameToken.line;
            while (!stream.isAtEnd()) {
                const t = stream.current();
                if (!t) break;
                
                // If we've moved to a different line, stop skipping
                if (t.line > eventNameLine) {
                    break;
                }
                
                if (t.kind === TokenKind.NEWLINE) {
                    stream.next(); // consume NEWLINE, move to first body token
                    break;
                }
                // Skip any remaining tokens on header line (should only be comments, but be safe)
                if (t.kind === TokenKind.COMMENT) {
                    stream.next();
                    continue;
                }
                stream.next();
            }

            // Parse body until matching 'endon' or EOF (for orphaned blocks)
            const body: Statement[] = [];
            let endToken = headerToken;
            let lastPosition = -1;
            let loopCount = 0;
            let lastParsedToken: Token | null = null; // Track last successfully parsed token
            let lastTokenWasNewline = false; // Track if last token was a newline

            while (!stream.isAtEnd()) {
                const currentPosition = stream.getPosition();
                
                // Safety check for infinite loop
                if (currentPosition === lastPosition) {
                    loopCount++;
                    if (loopCount > 100) {
                        const token = stream.current();
                        throw new Error(`Infinite loop detected in EventParser.parse() at position ${currentPosition}, token: ${token?.text} (${token?.kind})`);
                    }
                } else {
                    lastPosition = currentPosition;
                    loopCount = 0;
                }

                const t = stream.current();
                if (!t || t.kind === TokenKind.EOF) {
                    // EOF reached - this is an orphaned block (auto-close)
                    // Use the last parsed token as endToken, or headerToken if nothing was parsed
                    if (lastParsedToken) {
                        endToken = lastParsedToken;
                    }
                    break;
                }

                // Check for nested function or event handler definition (not allowed)
                // This auto-closes the current on block (orphaned block)
                const isDef = t.kind === TokenKind.KEYWORD && t.text === 'def';
                const isDefine = t.kind === TokenKind.IDENTIFIER && t.text === 'define';
                const isOn = t.kind === TokenKind.KEYWORD && t.text === 'on';
                if (isDef || isDefine || isOn) {
                    // Nested definition found - this closes our block (orphaned block)
                    // Use the last parsed token as endToken, or headerToken if nothing was parsed
                    // Don't consume the token, let the outer parser handle it
                    if (lastParsedToken) {
                        endToken = lastParsedToken;
                    }
                    break;
                }

                // Check for 'endon' keyword - this closes our block
                if (t.kind === TokenKind.KEYWORD && t.text === 'endon') {
                    endToken = t; // Set endToken to 'endon' token
                    stream.next(); // consume 'endon'

                    // Consume everything until end of line after 'endon'
                    while (!stream.isAtEnd() && stream.current()?.kind !== TokenKind.NEWLINE) {
                        stream.next();
                    }
                    if (stream.current()?.kind === TokenKind.NEWLINE) {
                        stream.next(); // move to next logical statement
                    }
                    break;
                }

                // Skip newlines and comments at the statement boundary
                if (t.kind === TokenKind.NEWLINE) {
                    // Track newlines as last parsed token for orphaned blocks
                    lastParsedToken = t;
                    lastTokenWasNewline = true;
                    stream.next();
                    continue;
                }

                if (t.kind === TokenKind.COMMENT) {
                    // For orphaned blocks, standalone comments (after newline) should trigger auto-close
                    // This indicates the comment is a separate statement, not part of the on block body
                    if (lastTokenWasNewline && body.length > 0) {
                        // This is a standalone comment after body statements - auto-close the orphaned block
                        // Don't consume the comment, let the outer parser handle it
                        if (lastParsedToken) {
                            endToken = lastParsedToken;
                        }
                        break;
                    }
                    
                    // Otherwise, include the comment in the body (inline comments or first statement)
                    const comment = parseComment(stream);
                    if (comment) {
                        body.push(comment);
                        // Track the comment token as last parsed
                        lastParsedToken = t;
                    }
                    lastTokenWasNewline = false;
                    continue;
                }
                
                // Reset newline flag when we encounter a non-newline, non-comment token
                lastTokenWasNewline = false;

                // Parse statement using the callback
                const stmt = parseStatement(stream);
                if (stmt) {
                    // Check for inline comment immediately after statement
                    if ('codePos' in stmt && stmt.codePos) {
                        const inlineComment = CommentParser.parseInlineComment(stream, stmt.codePos.endRow);
                        if (inlineComment) {
                            CommentParser.attachComments(stmt, [inlineComment]);
                        }
                    }
                    body.push(stmt);
                    // Track the last token of the successfully parsed statement
                    // We'll use the current token position as a proxy
                    lastParsedToken = t;
                } else {
                    // If parseStatement returns null, check if we're at a keyword that should be handled here
                    if (t.kind === TokenKind.KEYWORD && t.text === 'endon') {
                        // This should have been caught by the check above, but if parseStatement didn't advance,
                        // we need to handle it here
                        // Let the loop continue so the endon check above can handle it
                        continue;
                    }
                    // If parseStatement returns null, ensure progress
                    // Still track the token we're skipping
                    lastParsedToken = t;
                    stream.next();
                }
            }

            // Build codePos from headerToken to endToken
            const codePos = createCodePosition(headerToken, endToken);

            const result: OnBlock = {
                type: 'onBlock',
                eventName,
                body,
                codePos,
            };

            if (headerComments.length > 0) {
                result.comments = headerComments;
            }

            // Attach decorators if provided
            if (decorators && decorators.length > 0) {
                result.decorators = decorators;
                // Execute parse decorators during parsing
                if (environment) {
                    for (const decorator of decorators) {
                        const parseDecoratorHandler = environment.parseDecorators.get(decorator.name);
                        if (parseDecoratorHandler) {
                            await parseDecoratorHandler(result.eventName, null, decorator.args, environment);
                        }
                    }
                }
            }

            return result;
        } finally {
            // Always pop the context, even if we error out
            stream.popContext();
        }
    }
}

