/**
 * Parser for 'do' scope blocks
 * Syntax: do [$param1 $param2 ...] [into $var] ... enddo
 * Token-stream based implementation
 */

import { TokenStream, ParsingContext } from '../classes/TokenStream';
import { TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { LexerUtils } from '../utils';
import type { ScopeBlock, Statement, CommentWithPosition, CodePosition } from '../types/Ast.type';
import type { AttributePathSegment } from '../utils/types';

export class ScopeParser {
    /**
     * Parse a 'do' scope block
     * Expects stream to be positioned at the 'do' keyword
     * 
     * @param stream - TokenStream positioned at the 'do' keyword
     * @param parseStatement - Callback to parse a statement from the stream
     * @param parseComment - Callback to parse a comment from the stream
     * @returns Parsed ScopeBlock
     */
    static parse(
        stream: TokenStream,
        parseStatement: (stream: TokenStream) => Statement | null,
        parseComment: (stream: TokenStream) => Statement | null
    ): ScopeBlock {
        const doToken = stream.current();
        if (!doToken || doToken.text !== 'do') {
            throw new Error(`Expected 'do' keyword at ${stream.formatPosition()}`);
        }

        const startToken = doToken;
        
        // Push block context
        stream.pushContext(ParsingContext.BLOCK);
        
        try {
            stream.next(); // Consume 'do'

            // Skip whitespace and comments
            skipWhitespaceAndComments(stream);

            // Parse header: parameters and 'into' target
            const paramNames: string[] = [];
            let intoTarget: { targetName: string; targetPath?: AttributePathSegment[] } | null = null;
            const headerComments: CommentWithPosition[] = [];

            // Collect tokens until newline
            const headerTokens: Token[] = [];
            while (!stream.isAtEnd()) {
                const t = stream.current();
                if (!t) break;
                if (t.kind === TokenKind.NEWLINE) {
                    stream.next(); // consume NEWLINE, move to first body token
                    break;
                }
                if (t.kind === TokenKind.COMMENT) {
                    // Capture inline comment on header line
                    const commentText = t.value !== undefined ? String(t.value) : t.text.replace(/^#\s*/, '');
                    headerComments.push({
                        text: commentText,
                        inline: true,
                        codePos: createCodePosition(t, t)
                    });
                    stream.next();
                    continue;
                }
                headerTokens.push(t);
                stream.next();
            }

            // Parse parameters and 'into' from header tokens
            // Check for "into $var" - it can appear after parameters
            let intoIndex = -1;
            for (let i = 0; i < headerTokens.length; i++) {
                const token = headerTokens[i];
                if (token && token.kind === TokenKind.KEYWORD && token.text === 'into') {
                    intoIndex = i;
                    break;
                }
            }

            const paramEndIndex = intoIndex >= 0 ? intoIndex : headerTokens.length;

            // Parse parameter names (optional): do $a $b or do $a $b into $var
            for (let i = 0; i < paramEndIndex; i++) {
                const token = headerTokens[i];
                if (!token) continue;

                // Parameters should be variables (starting with $)
                if (token.kind === TokenKind.VARIABLE) {
                    const { name } = LexerUtils.parseVariablePath(token.text);
                    if (name && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
                        paramNames.push(name);
                    }
                }
            }

            // Parse 'into' target if present
            if (intoIndex >= 0 && intoIndex < headerTokens.length - 1) {
                const varToken = headerTokens[intoIndex + 1];
                if (varToken && varToken.kind === TokenKind.VARIABLE) {
                    const { name, path } = LexerUtils.parseVariablePath(varToken.text);
                    intoTarget = { targetName: name, targetPath: path };
                }
            }

            // Parse body until matching 'enddo'
            const body: Statement[] = [];
            let endToken = startToken;

            while (!stream.isAtEnd()) {
                const t = stream.current();
                if (!t || t.kind === TokenKind.EOF) break;

                endToken = t;

                // Check for 'enddo' keyword - this closes our block
                if (t.kind === TokenKind.KEYWORD && t.text === 'enddo') {
                    stream.next(); // consume 'enddo'

                    // Consume everything until end of line after 'enddo'
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
                    stream.next();
                    continue;
                }

                if (t.kind === TokenKind.COMMENT) {
                    // Parse comment statement
                    const comment = parseComment(stream);
                    if (comment) {
                        body.push(comment);
                    }
                    continue;
                }

                // Parse statement using the callback
                const stmt = parseStatement(stream);
                if (stmt) {
                    body.push(stmt);
                } else {
                    // If we can't parse, skip the token to avoid infinite loop
                    stream.next();
                }
            }

            // Build codePos from startToken to endToken
            const codePos = createCodePosition(startToken, endToken);

            // Build result
            const scopeBlock: ScopeBlock = {
                type: 'do',
                body,
                codePos
            };

            if (paramNames.length > 0) {
                scopeBlock.paramNames = paramNames;
            }

            if (intoTarget) {
                scopeBlock.into = intoTarget;
            }

            if (headerComments.length > 0) {
                scopeBlock.comments = headerComments;
            }

            return scopeBlock;
        } finally {
            // Always pop the context, even if we error out
            stream.popContext();
        }
    }
}

/**
 * Helper: Skip whitespace and comment tokens (but not newlines)
 */
function skipWhitespaceAndComments(stream: TokenStream): void {
    while (!stream.isAtEnd()) {
        const token = stream.current();
        if (!token) break;
        if (token.kind === TokenKind.COMMENT) {
            stream.next();
            continue;
        }
        // Don't skip newlines - they're statement boundaries
        break;
    }
}

/**
 * Helper: Create CodePosition from start and end tokens
 */
function createCodePosition(startToken: Token, endToken: Token): CodePosition {
    return {
        startRow: startToken.line - 1, // Convert to 0-based
        startCol: startToken.column,
        endRow: endToken.line - 1, // Convert to 0-based
        endCol: endToken.column + (endToken.text.length > 0 ? endToken.text.length - 1 : 0)
    };
}
