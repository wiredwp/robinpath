/**
 * Parser for 'do' scope blocks
 * Syntax: do [$param1 $param2 ...] [into $var] ... enddo
 * Token-stream based implementation
 */

import { TokenStream, ParsingContext } from '../classes/TokenStream';
import { TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { LexerUtils } from '../utils';
import { CommentParser } from './CommentParser';
import type { ScopeBlock, Statement, CommentWithPosition, CodePosition, DecoratorCall } from '../types/Ast.type';
import type { AttributePathSegment } from '../utils/types';

export class ScopeParser {
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
     * Parse a 'do' scope block
     * Expects stream to be positioned at the 'do' keyword
     * 
     * @param stream - TokenStream positioned at the 'do' keyword
     * @param parseStatement - Callback to parse a statement from the stream
     * @param parseComment - Callback to parse a comment from the stream
     * @param decorators - Optional decorators to attach to this do block
     * @returns Parsed ScopeBlock
     */
    static parse(
        stream: TokenStream,
        parseStatement: (stream: TokenStream) => Statement | null,
        _parseComment: (stream: TokenStream) => Statement | null,
        decorators?: DecoratorCall[]
    ): ScopeBlock {
        const doToken = stream.current();
        if (!doToken || doToken.text !== 'do') {
            throw new Error(`Expected 'do' keyword at ${stream.formatPosition()}`);
        }

        const startToken = doToken;
        const startPosition = stream.getPosition();
        
        if (ScopeParser.debug) {
            const timestamp = new Date().toISOString();
            console.log(`[ScopeParser.parse] [${timestamp}] Starting do block parse at position ${startPosition}, line ${doToken.line}`);
        }
        
        // Push block context
        stream.pushContext(ParsingContext.BLOCK);
        
        try {
            stream.next(); // Consume 'do'

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
            let bodyIteration = 0;
            let lastBodyPosition = -1;
            let bodyStuckCount = 0;
            let pendingComments: CommentWithPosition[] = []; // Comments to attach to next statement

            while (!stream.isAtEnd()) {
                bodyIteration++;
                const currentPos = stream.getPosition();
                const t = stream.current();
                if (!t || t.kind === TokenKind.EOF) {
                    if (ScopeParser.debug) {
                        const timestamp = new Date().toISOString();
                        console.log(`[ScopeParser.parse] [${timestamp}] Reached EOF in do block body at iteration ${bodyIteration}`);
                    }
                    break;
                }

                endToken = t;
                
                if (ScopeParser.debug) {
                    const timestamp = new Date().toISOString();
                    console.log(`[ScopeParser.parse] [${timestamp}] Body iteration ${bodyIteration}, position: ${currentPos}, token: ${t.text} (${t.kind}), line: ${t.line}`);
                }
                
                // Detect if we're stuck
                if (currentPos === lastBodyPosition) {
                    bodyStuckCount++;
                    if (ScopeParser.debug) {
                        const timestamp = new Date().toISOString();
                        console.log(`[ScopeParser.parse] [${timestamp}] WARNING: Body position stuck at ${currentPos} (count: ${bodyStuckCount})`);
                    }
                    if (bodyStuckCount > ScopeParser.MAX_STUCK_ITERATIONS) {
                        const timestamp = new Date().toISOString();
                        throw new Error(`[ScopeParser.parse] [${timestamp}] Infinite loop detected in do block body! Stuck at position ${currentPos} for ${bodyStuckCount} iterations. Token: ${t.text} (${t.kind}), line: ${t.line}`);
                    }
                } else {
                    bodyStuckCount = 0;
                    lastBodyPosition = currentPos;
                }

                // Check for 'enddo' keyword - this closes our block
                if (t.kind === TokenKind.KEYWORD && t.text === 'enddo') {
                    if (ScopeParser.debug) {
                        const timestamp = new Date().toISOString();
                        console.log(`[ScopeParser.parse] [${timestamp}] Found 'enddo' at position ${currentPos}, closing do block`);
                    }
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
                    if (ScopeParser.debug) {
                        const timestamp = new Date().toISOString();
                        console.log(`[ScopeParser.parse] [${timestamp}] Skipping newline in do block body`);
                    }
                    stream.next();
                    continue;
                }

                if (t.kind === TokenKind.COMMENT) {
                    // Collect comment to attach to next statement (like main parser does)
                    if (ScopeParser.debug) {
                        const timestamp = new Date().toISOString();
                        console.log(`[ScopeParser.parse] [${timestamp}] Collecting comment in do block body at position ${currentPos}`);
                    }
                    const commentText = t.value !== undefined ? String(t.value) : t.text.replace(/^#\s*/, '');
                    pendingComments.push({
                        text: commentText,
                        inline: false,
                        codePos: createCodePosition(t, t)
                    });
                    stream.next(); // consume the comment token
                    continue;
                }

                // Parse statement using the callback
                if (ScopeParser.debug) {
                    const timestamp = new Date().toISOString();
                    console.log(`[ScopeParser.parse] [${timestamp}] Parsing statement in do block body at position ${currentPos}`);
                }
                const stmt = parseStatement(stream);
                if (stmt) {
                    // Attach pending comments to this statement
                    if (pendingComments.length > 0) {
                        if (!stmt.comments) {
                            stmt.comments = [];
                        }
                        // Prepend pending comments (they come before any existing comments)
                        stmt.comments = [...pendingComments, ...stmt.comments];
                        pendingComments = [];
                    }

                    // Check for inline comment immediately after statement
                    if ('codePos' in stmt && stmt.codePos) {
                        const inlineComment = CommentParser.parseInlineComment(stream, stmt.codePos.endRow);
                        if (inlineComment) {
                            CommentParser.attachComments(stmt, [inlineComment]);
                        }
                    }

                    if (ScopeParser.debug) {
                        const timestamp = new Date().toISOString();
                        console.log(`[ScopeParser.parse] [${timestamp}] Parsed statement type: ${stmt.type} in do block body`);
                    }
                    body.push(stmt);
                } else {
                    // If we can't parse, skip the token to avoid infinite loop
                    if (ScopeParser.debug) {
                        const timestamp = new Date().toISOString();
                        console.log(`[ScopeParser.parse] [${timestamp}] WARNING: Could not parse statement in do block body at position ${currentPos}, skipping token: ${t.text}`);
                    }
                    stream.next();
                }
            }
            
            if (ScopeParser.debug) {
                const timestamp = new Date().toISOString();
                console.log(`[ScopeParser.parse] [${timestamp}] Do block body parsing complete. Iterations: ${bodyIteration}, statements: ${body.length}, final position: ${stream.getPosition()}`);
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

            // Attach decorators if provided
            if (decorators && decorators.length > 0) {
                scopeBlock.decorators = decorators;
            }

            if (ScopeParser.debug) {
                const timestamp = new Date().toISOString();
                console.log(`[ScopeParser.parse] [${timestamp}] Do block parse complete. Start position: ${startPosition}, end position: ${stream.getPosition()}, body statements: ${body.length}`);
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
