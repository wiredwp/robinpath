/**
 * Parser for 'for' loops
 * Syntax: for $var in <expr> ... endfor
 */

import { TokenStream } from '../classes/TokenStream';
import { TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { LexerUtils } from '../utils';
import { parseExpression } from './ExpressionParser';
import { CommentParser } from './CommentParser';
import type { ForLoop, Statement, CommentWithPosition, CodePosition, Expression, DecoratorCall } from '../types/Ast.type';

export interface ForLoopParserContext {
    parseStatement: (stream: TokenStream) => Statement | null;
    parseComment: (stream: TokenStream) => Statement | null;
    createCodePosition: (start: Token, end: Token) => CodePosition;
}

/**
 * Parse a 'for' loop from TokenStream
 * 
 * @param stream - TokenStream positioned at the 'for' keyword
 * @param context - Context with helper methods
 * @param decorators - Optional decorators to attach to this for loop
 * @returns Parsed ForLoop
 */
export function parseForLoop(
    stream: TokenStream,
    context: ForLoopParserContext,
    decorators?: DecoratorCall[]
): ForLoop {
    const headerToken = stream.current();
    if (!headerToken || headerToken.text !== 'for') {
        throw new Error(`parseForLoop expected 'for' keyword, got '${headerToken?.text || 'EOF'}'`);
    }

    // Consume 'for' keyword
    stream.next();

    // Parse loop variable: $var
    stream.skipWhitespaceAndComments();
    const varToken = stream.current();
    if (!varToken || varToken.kind !== TokenKind.VARIABLE) {
        throw new Error(`for loop requires a variable at line ${headerToken.line}, column ${headerToken.column}`);
    }

    if (!LexerUtils.isVariable(varToken.text)) {
        throw new Error(`for loop variable must be a variable (e.g., $i, $item) at line ${varToken.line}, column ${varToken.column}`);
    }

    const varName = LexerUtils.parseVariablePath(varToken.text).name;
    stream.next(); // consume variable token

    let iterable: Expression | undefined;
    let from: Expression | undefined;
    let to: Expression | undefined;
    let step: Expression | undefined;
    let keyVarName: string | undefined;

    const headerComments: CommentWithPosition[] = [];

    // Parse header components until newline or comment
    while (!stream.isAtEnd()) {
        const t = stream.current();
        if (!t || t.kind === TokenKind.NEWLINE) break;

        if (t.kind === TokenKind.COMMENT) {
            headerComments.push({
                text: t.value ?? t.text.replace(/^#\s*/, ''),
                inline: true,
                codePos: context.createCodePosition(t, t)
            });
            stream.next();
            break;
        }

        if (t.kind === TokenKind.KEYWORD) {
            const keyword = t.text;
            if (keyword === 'in' || keyword === 'from' || keyword === 'to' || keyword === 'by' || keyword === 'step' || keyword === 'key') {
                stream.next(); // consume keyword

                if (keyword === 'key') {
                    const keyToken = stream.current();
                    if (!keyToken || keyToken.kind !== TokenKind.VARIABLE) {
                        throw new Error(`'key' keyword must be followed by a variable at line ${t.line}, column ${t.column}`);
                    }
                    keyVarName = LexerUtils.parseVariablePath(keyToken.text).name;
                    stream.next();
                    continue;
                }

                // Collect tokens for the expression until next keyword or end of line
                const exprTokens: Token[] = [];
                while (!stream.isAtEnd()) {
                    const nextT = stream.current();
                    if (!nextT || nextT.kind === TokenKind.NEWLINE || nextT.kind === TokenKind.COMMENT) break;
                    
                    if (nextT.kind === TokenKind.KEYWORD) {
                        const nk = nextT.text;
                        if (nk === 'in' || nk === 'from' || nk === 'to' || nk === 'by' || nk === 'step' || nk === 'key') {
                            break;
                        }
                    }
                    exprTokens.push(nextT);
                    stream.next();
                }

                if (exprTokens.length === 0) {
                    throw new Error(`'${keyword}' keyword requires an expression at line ${t.line}, column ${t.column}`);
                }

                const expr = parseExpression(new TokenStream(exprTokens), context.parseStatement, context.parseComment);
                
                if (keyword === 'in') {
                    if (iterable) throw new Error(`Multiple 'in' keywords in for loop at line ${t.line}`);
                    iterable = expr;
                } else if (keyword === 'from') {
                    if (from) throw new Error(`Multiple 'from' keywords in for loop at line ${t.line}`);
                    from = expr;
                } else if (keyword === 'to') {
                    if (to) throw new Error(`Multiple 'to' keywords in for loop at line ${t.line}`);
                    to = expr;
                } else if (keyword === 'by' || keyword === 'step') {
                    if (step) throw new Error(`Multiple step keywords ('by' or 'step') in for loop at line ${t.line}`);
                    step = expr;
                }
                continue;
            }
        }

        throw new Error(`Unexpected token '${t.text}' in for loop header at line ${t.line}, column ${t.column}`);
    }

    // Move to next line if we stopped at NEWLINE
    if (stream.current()?.kind === TokenKind.NEWLINE) {
        stream.next();
    }

    // Validation
    if (iterable) {
        if (from || to || step) {
            throw new Error(`for loop cannot have both 'in' and range keywords (from, to, by, step) at line ${headerToken.line}`);
        }
    } else {
        if (from && !to) throw new Error(`for loop with 'from' requires 'to' at line ${headerToken.line}`);
        if (to && !from) throw new Error(`for loop with 'to' requires 'from' at line ${headerToken.line}`);
        if (!from && !to) throw new Error(`for loop requires either 'in' or 'from'/'to' at line ${headerToken.line}`);
    }

    // Parse body statements until matching 'endfor'
    const body: Statement[] = [];
    const bodyStartToken = stream.current() ?? headerToken;
    let endToken = bodyStartToken;

    let lastIndex = -1;
    let loopCount = 0;

    while (!stream.isAtEnd()) {
        const currentIndex = stream.getPosition();
        if (currentIndex === lastIndex) {
            loopCount++;
            if (loopCount > 100) {
                const token = stream.current();
                console.error(`Infinite loop detected in ForLoopParser at index: ${currentIndex}, Token: ${token?.text}`);
                throw new Error(`Infinite loop in ForLoopParser`);
            }
        } else {
            lastIndex = currentIndex;
            loopCount = 0;
        }

        const t = stream.current();
        if (!t || t.kind === TokenKind.EOF) break;
        
        endToken = t;
        
        // Check for 'endfor' keyword - this closes our block
        if (t.kind === TokenKind.KEYWORD && t.text === 'endfor') {
            stream.next(); // consume 'endfor'
            
            // Consume everything until end of line after 'endfor'
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
            let newlineCount = 0;
            while (stream.current()?.kind === TokenKind.NEWLINE) {
                newlineCount++;
                stream.next();
            }

            // If we have > 1 newline, it means we have at least one blank line.
            // We attribute this to the previous statement if possible.
            if (body.length > 0 && newlineCount > 1) {
                const lastStmt = body[body.length - 1];
                // One newline is standard statement terminator/separator. Extra are blank lines.
                lastStmt.trailingBlankLines = (lastStmt.trailingBlankLines || 0) + (newlineCount - 1);
            }
            continue;
        }
        
        if (t.kind === TokenKind.COMMENT) {
            // Parse comment statement
            const commentBeforeParse = stream.getPosition();
            const comment = context.parseComment(stream);
            const commentAfterParse = stream.getPosition();
            
            // Ensure stream position advanced (parseComment should consume the comment token)
            const stillOnComment = stream.current()?.kind === TokenKind.COMMENT;
            if (commentAfterParse === commentBeforeParse || stillOnComment) {
                stream.next(); // Manually advance if parseComment didn't
            }
            
            if (comment) {
                body.push(comment);
            }
            continue;
        }
        
        // Parse statement using context-provided parseStatement
        const stmt = context.parseStatement(stream);
        if (stmt) {
            // Check for inline comment immediately after statement
            if ('codePos' in stmt && stmt.codePos) {
                const inlineComment = CommentParser.parseInlineComment(stream, stmt.codePos.endRow);
                if (inlineComment) {
                    CommentParser.attachComments(stmt, [inlineComment]);
                }
            }
            body.push(stmt);
        } else {
            // If parseStatement returns null, ensure progress
            stream.next();
        }
    }

    // Build codePos from headerToken to endToken
    const codePos = context.createCodePosition(headerToken, endToken);

    // Build result
    const result: ForLoop = {
        type: 'forLoop',
        varName,
        iterable,
        from,
        to,
        step,
        keyVarName,
        body,
        codePos
    };

    if (headerComments.length > 0) {
        result.comments = headerComments;
    }

    // Attach decorators if provided
    if (decorators && decorators.length > 0) {
        result.decorators = decorators;
    }

    return result;
}

