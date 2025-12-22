/**
 * Parser utilities and shared helper methods
 */

import type { Token } from '../classes/Lexer';
import type { CodePosition } from '../types/Ast.type';
import { TokenStream } from '../classes/TokenStream';
import { TokenKind } from '../classes/Lexer';

/**
 * Create CodePosition from start and end tokens
 * @param startToken - The token where the node starts
 * @param endToken - The token where the node ends
 * @returns 0-indexed CodePosition
 */
export function createCodePosition(startToken: Token, endToken: Token): CodePosition {
    return {
        startRow: startToken.line - 1, // Convert to 0-based
        startCol: startToken.column,
        endRow: endToken.line - 1, // Convert to 0-based
        endCol: endToken.column + (endToken.text.length > 0 ? endToken.text.length - 1 : 0)
    };
}

/**
 * Skip whitespace and comments on the current line
 * @param stream - TokenStream to skip in
 */
export function skipWhitespaceOnLine(stream: TokenStream): void {
    while (!stream.isAtEnd()) {
        const token = stream.current();
        if (!token) break;
        
        if (token.kind === TokenKind.COMMENT) {
            stream.next();
            continue;
        }
        
        // Skip newline only if it's not the end of a block
        if (token.kind === TokenKind.NEWLINE && stream.peek(1)?.kind !== TokenKind.EOF) {
            stream.next();
            continue;
        }
        
        break;
    }
}
