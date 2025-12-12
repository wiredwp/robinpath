/**
 * Parser for 'for' loops
 * Syntax: for $var in <expr> ... endfor
 */

import { TokenStream } from '../classes/TokenStream';
import { TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { LexerUtils } from '../utils';
import { parseExpression } from './ExpressionParser';
import type { ForLoop, Statement, CommentWithPosition, CodePosition, Expression } from '../types/Ast.type';

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
 * @returns Parsed ForLoop
 */
export function parseForLoop(
    stream: TokenStream,
    context: ForLoopParserContext
): ForLoop {
    const headerToken = stream.current();
    if (!headerToken || headerToken.text !== 'for') {
        throw new Error(`parseForLoop expected 'for' keyword, got '${headerToken?.text || 'EOF'}'`);
    }

    // Consume 'for' keyword
    stream.next();

    // Parse loop variable: $var
    skipWhitespaceAndComments(stream);
    const varToken = stream.current();
    if (!varToken || varToken.kind !== TokenKind.VARIABLE) {
        throw new Error(`for loop requires a variable at line ${headerToken.line}, column ${headerToken.column}`);
    }

    if (!LexerUtils.isVariable(varToken.text)) {
        throw new Error(`for loop variable must be a variable (e.g., $i, $item) at line ${varToken.line}, column ${varToken.column}`);
    }

    const varName = LexerUtils.parseVariablePath(varToken.text).name;
    stream.next(); // consume variable token

    // Expect 'in' keyword
    skipWhitespaceAndComments(stream);
    const inToken = stream.current();
    if (!inToken || inToken.kind !== TokenKind.KEYWORD || inToken.text !== 'in') {
        throw new Error(`for loop requires 'in' keyword at line ${varToken.line}, column ${varToken.column}`);
    }
    stream.next(); // consume 'in' keyword

    // Parse iterable expression (everything after 'in' until newline)
    skipWhitespaceAndComments(stream);
    const iterableStartToken = stream.current();
    if (!iterableStartToken) {
        throw new Error(`for loop requires an iterable expression after 'in' at line ${inToken.line}`);
    }

    // Collect tokens until newline for the iterable expression
    const iterableTokens: Token[] = [];
    const headerComments: CommentWithPosition[] = [];

    while (!stream.isAtEnd()) {
        const t = stream.current();
        if (!t) break;
        
        if (t.kind === TokenKind.NEWLINE) {
            stream.next(); // consume NEWLINE, move to first body token
            break;
        }
        
        if (t.kind === TokenKind.COMMENT) {
            // Capture inline comment on header line
            headerComments.push({
                text: t.value ?? t.text.replace(/^#\s*/, ''),
                inline: true,
                codePos: context.createCodePosition(t, t)
            });
            stream.next();
            continue;
        }
        
        iterableTokens.push(t);
        stream.next();
    }

    // Parse the iterable expression from the collected tokens
    // Create a temporary stream for parsing the expression (starts at position 0)
    const iterableStream = new TokenStream(iterableTokens);
    const iterable: Expression = parseExpression(
        iterableStream,
        context.parseStatement,
        context.parseComment
    );

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
            stream.next();
            continue;
        }
        
        if (t.kind === TokenKind.COMMENT) {
            const comment = context.parseComment(stream);
            if (comment) {
                body.push(comment);
            }
            continue;
        }
        
        // Parse statement using context-provided parseStatement
        const stmt = context.parseStatement(stream);
        if (stmt) {
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
        body,
        codePos
    };

    if (headerComments.length > 0) {
        result.comments = headerComments;
    }

    return result;
}

/**
 * Skip whitespace (newlines) and comments
 */
function skipWhitespaceAndComments(stream: TokenStream): void {
    while (!stream.isAtEnd()) {
        const token = stream.current();
        if (!token) break;
        
        if (token.kind === TokenKind.NEWLINE || token.kind === TokenKind.COMMENT) {
            stream.next();
            continue;
        }
        
        break;
    }
}
