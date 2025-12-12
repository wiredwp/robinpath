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

    // Skip whitespace and comments after 'break' (including inline comments)
    skipWhitespaceAndComments(stream);

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

/**
 * Skip whitespace (newlines) and comments
 */
function skipWhitespaceAndComments(stream: TokenStream): void {
    while (!stream.isAtEnd()) {
        const token = stream.current();
        if (!token) break;
        
        // Consume comments (including inline comments after break)
        if (token.kind === TokenKind.COMMENT) {
            stream.next();
            continue;
        }
        
        // Stop at newline or EOF (end of statement)
        if (token.kind === TokenKind.NEWLINE || token.kind === TokenKind.EOF) {
            break;
        }
        
        // If we encounter anything else, stop (might be next statement)
        break;
    }
}
