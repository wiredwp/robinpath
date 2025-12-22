/**
 * Parser for break statements
 * Handles: break
 */

import { TokenStream } from '../classes/TokenStream';
import { TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import type { BreakStatement, CodePosition } from '../types/Ast.type';

export interface BreakParserContext {
    createCodePosition: (start: Token, end: Token) => CodePosition;
}

/**
 * Parse a break statement
 * Syntax: break [comment]
 * 
 * @param stream - TokenStream positioned at the 'break' keyword
 * @param context - Context with helper methods
 * @returns Parsed BreakStatement
 */
export function parseBreak(
    stream: TokenStream,
    context: BreakParserContext
): BreakStatement {
    const breakToken = stream.current();
    if (!breakToken || breakToken.text !== 'break') {
        throw new Error(`parseBreak expected 'break' keyword, got '${breakToken?.text || 'EOF'}'`);
    }

    // Consume 'break' keyword
    stream.next();

    // Find the end token (last token before newline/EOF)
    let endToken = breakToken;
    const current = stream.current();
    if (current && current.kind !== TokenKind.NEWLINE && current.kind !== TokenKind.EOF) {
        endToken = current;
    }

    return {
        type: 'break',
        codePos: context.createCodePosition(breakToken, endToken)
    };
}
