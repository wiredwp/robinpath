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
    skipWhitespaceAndComments(stream);

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

/**
 * Skip whitespace (newlines) and comments
 */
function skipWhitespaceAndComments(stream: TokenStream): void {
    while (!stream.isAtEnd()) {
        const token = stream.current();
        if (!token) break;
        
        // Consume comments (including inline comments after continue)
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
