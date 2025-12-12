/**
 * Parser for continue statements
 * Handles: continue
 */

import { TokenStream } from '../classes/TokenStream';
import { TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import type { ContinueStatement, CodePosition } from '../types/Ast.type';

export interface ContinueParserContext {
    createCodePosition: (start: Token, end: Token) => CodePosition;
}

/**
 * Parse a continue statement
 * Syntax: continue [comment]
 * 
 * @param stream - TokenStream positioned at the 'continue' keyword
 * @param context - Context with helper methods
 * @returns Parsed ContinueStatement
 */
export function parseContinue(
    stream: TokenStream,
    context: ContinueParserContext
): ContinueStatement {
    const continueToken = stream.current();
    if (!continueToken || continueToken.text !== 'continue') {
        throw new Error(`parseContinue expected 'continue' keyword, got '${continueToken?.text || 'EOF'}'`);
    }

    // Consume 'continue' keyword
    stream.next();

    // Skip whitespace and comments after 'continue' (including inline comments)
    stream.skipWhitespaceAndComments();

    // Find the end token (last token before newline/EOF)
    let endToken = continueToken;
    const current = stream.current();
    if (current && current.kind !== TokenKind.NEWLINE && current.kind !== TokenKind.EOF) {
        endToken = current;
    }

    return {
        type: 'continue',
        codePos: context.createCodePosition(continueToken, endToken)
    };
}

