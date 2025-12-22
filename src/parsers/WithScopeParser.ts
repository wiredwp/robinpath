/**
 * Parser for 'with' scope blocks (callback blocks)
 * Syntax: with [$param1 $param2 ...] [into $var] ... endwith
 * Token-stream based implementation
 */

import { TokenStream, ParsingContext } from '../classes/TokenStream';
import { TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { LexerUtils } from '../utils';
import { CommentParser } from './CommentParser';
import type { ScopeBlock, Statement, CommentWithPosition, CodePosition, DecoratorCall } from '../types/Ast.type';
import type { AttributePathSegment } from '../utils/types';

export class WithScopeParser {
    /**
     * Maximum number of iterations allowed before detecting an infinite loop
     */
    static readonly MAX_STUCK_ITERATIONS = 100;
    
    /**
     * Debug mode flag - set to true to enable logging
     * Can be controlled via VITE_DEBUG environment variable or set programmatically
     */
    static debug: boolean = (() => {
        try {
            // Check process.env (Node.js)
            const proc = (globalThis as any).process;
            if (proc && proc.env?.VITE_DEBUG === 'true') {
                return true;
            }
            // Check import.meta.env (Vite/browser)
            const importMeta = (globalThis as any).import?.meta;
            if (importMeta && importMeta.env?.VITE_DEBUG === 'true') {
                return true;
            }
        } catch {
            // Ignore errors
        }
        return false;
    })();
    
    /**
     * Parse a 'with' scope block (callback block)
     * Expects stream to be positioned at the 'with' keyword
     * 
     * @param stream - TokenStream positioned at the 'with' keyword
     * @param parseStatement - Callback to parse a statement from the stream
     * @param parseComment - Callback to parse a comment from the stream
     * @param decorators - Optional decorators to attach to this with block
     * @returns Parsed ScopeBlock (with type 'do' for AST compatibility)
     */
    static parse(
        stream: TokenStream,
        parseStatement: (stream: TokenStream) => Statement | null,
        parseComment: (stream: TokenStream) => Statement | null,
        decorators?: DecoratorCall[]
    ): ScopeBlock {
        const withToken = stream.current();
        if (!withToken || withToken.text !== 'with') {
            throw new Error(`Expected 'with' keyword at ${stream.formatPosition()}`);
        }

        const startToken = withToken;
        const startPosition = stream.getPosition();
        
        if (WithScopeParser.debug) {
            const timestamp = new Date().toISOString();
            console.log(`[WithScopeParser.parse] [${timestamp}] Starting with block parse at position ${startPosition}, line ${withToken.line}`);
        }
        
        // Push block context
        stream.pushContext(ParsingContext.BLOCK);
        
        try {
            stream.next(); // Consume 'with'

            // Parse header: parameters and 'into' target
            const paramNames: string[] = [];
            let intoTarget: { targetName: string; targetPath?: AttributePathSegment[] } | null = null;
            const headerComments: CommentWithPosition[] = [];

            // Collect tokens until newline (skip only comments, not newlines)
            // Note: We don't skip whitespace/newlines before this loop because we need
            // to find the newline to know where the header ends and body begins
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

            // Parse parameter names (optional): with $a $b or with $a $b into $var
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

            // Parse body until matching 'endwith'
            const body: Statement[] = [];
            let endToken = startToken;
            let bodyIteration = 0;
            let lastBodyPosition = -1;
            let bodyStuckCount = 0;

            while (!stream.isAtEnd()) {
                bodyIteration++;
                const currentPos = stream.getPosition();
                const t = stream.current();
                if (!t || t.kind === TokenKind.EOF) {
                    if (WithScopeParser.debug) {
                        const timestamp = new Date().toISOString();
                        console.log(`[WithScopeParser.parse] [${timestamp}] Reached EOF in with block body at iteration ${bodyIteration}`);
                    }
                    break;
                }

                endToken = t;
                
                if (WithScopeParser.debug) {
                    const timestamp = new Date().toISOString();
                    console.log(`[WithScopeParser.parse] [${timestamp}] Body iteration ${bodyIteration}, position: ${currentPos}, token: ${t.text} (${t.kind}), line: ${t.line}`);
                }
                
                // Detect if we're stuck
                if (currentPos === lastBodyPosition) {
                    bodyStuckCount++;
                    if (WithScopeParser.debug) {
                        const timestamp = new Date().toISOString();
                        console.log(`[WithScopeParser.parse] [${timestamp}] WARNING: Body position stuck at ${currentPos} (count: ${bodyStuckCount})`);
                    }
                    if (bodyStuckCount > WithScopeParser.MAX_STUCK_ITERATIONS) {
                        const timestamp = new Date().toISOString();
                        throw new Error(`[WithScopeParser.parse] [${timestamp}] Infinite loop detected in with block body! Stuck at position ${currentPos} for ${bodyStuckCount} iterations. Token: ${t.text} (${t.kind}), line: ${t.line}`);
                    }
                } else {
                    bodyStuckCount = 0;
                    lastBodyPosition = currentPos;
                }

                // Check for 'endwith' keyword - this closes our block
                if (t.kind === TokenKind.KEYWORD && t.text === 'endwith') {
                    if (WithScopeParser.debug) {
                        const timestamp = new Date().toISOString();
                        console.log(`[WithScopeParser.parse] [${timestamp}] Found 'endwith' at position ${currentPos}, closing with block`);
                    }
                    stream.next(); // consume 'endwith'

                    // Consume everything until end of line after 'endwith'
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
                    if (WithScopeParser.debug) {
                        const timestamp = new Date().toISOString();
                        console.log(`[WithScopeParser.parse] [${timestamp}] Skipping newline in with block body`);
                    }
                    stream.next();
                    continue;
                }

                if (t.kind === TokenKind.COMMENT) {
                    // Parse comment statement
                    if (WithScopeParser.debug) {
                        const timestamp = new Date().toISOString();
                        console.log(`[WithScopeParser.parse] [${timestamp}] Parsing comment in with block body at position ${currentPos}`);
                    }
                    const commentBeforeParse = stream.getPosition();
                    const comment = parseComment(stream);
                    const commentAfterParse = stream.getPosition();
                    
                    // Ensure stream position advanced (parseComment should consume the comment token)
                    if (commentAfterParse === commentBeforeParse) {
                        if (WithScopeParser.debug) {
                            const timestamp = new Date().toISOString();
                            console.log(`[WithScopeParser.parse] [${timestamp}] WARNING: parseComment did not advance stream, manually advancing`);
                        }
                        stream.next(); // Manually advance if parseComment didn't
                    }
                    
                    if (comment) {
                        body.push(comment);
                    }
                    continue;
                }

                // Parse statement using the callback
                if (WithScopeParser.debug) {
                    const timestamp = new Date().toISOString();
                    console.log(`[WithScopeParser.parse] [${timestamp}] Parsing statement in with block body at position ${currentPos}`);
                }
                const stmt = parseStatement(stream);
                if (stmt) {
                    // Check for inline comment immediately after statement
                    if ('codePos' in stmt && stmt.codePos) {
                        const inlineComment = CommentParser.parseInlineComment(stream, stmt.codePos.endRow);
                        if (inlineComment) {
                            CommentParser.attachComments(stmt, [inlineComment]);
                        }
                    }

                    if (WithScopeParser.debug) {
                        const timestamp = new Date().toISOString();
                        console.log(`[WithScopeParser.parse] [${timestamp}] Parsed statement type: ${stmt.type} in with block body`);
                    }
                    body.push(stmt);
                } else {
                    // If we can't parse, skip the token to avoid infinite loop
                    if (WithScopeParser.debug) {
                        const timestamp = new Date().toISOString();
                        console.log(`[WithScopeParser.parse] [${timestamp}] WARNING: Could not parse statement in with block body at position ${currentPos}, skipping token: ${t.text}`);
                    }
                    stream.next();
                }
            }
            
            if (WithScopeParser.debug) {
                const timestamp = new Date().toISOString();
                console.log(`[WithScopeParser.parse] [${timestamp}] With block body parsing complete. Iterations: ${bodyIteration}, statements: ${body.length}, final position: ${stream.getPosition()}`);
            }

            // Build codePos from startToken to endToken
            const codePos = createCodePosition(startToken, endToken);

            // Build result (use type 'do' to maintain AST compatibility, as shown in archived parser)
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

            // Attach decorators if provided
            if (decorators && decorators.length > 0) {
                scopeBlock.decorators = decorators;
            }

            if (WithScopeParser.debug) {
                const timestamp = new Date().toISOString();
                console.log(`[WithScopeParser.parse] [${timestamp}] With block parse complete. Start position: ${startPosition}, end position: ${stream.getPosition()}, body statements: ${body.length}`);
            }

            return scopeBlock;
        } finally {
            // Always pop the context, even if we error out
            stream.popContext();
        }
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

