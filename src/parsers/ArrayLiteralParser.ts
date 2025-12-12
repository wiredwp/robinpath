/**
 * Parser for array literals
 * Syntax: [value1, value2, value3]
 * Token-stream based implementation
 */

import { TokenStream, ParsingContext } from '../classes/TokenStream';
import { TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';

export interface ArrayLiteralResult {
    code: string;
    endToken: Token;
    startToken: Token;
}

export class ArrayLiteralParser {
    /**
     * Parse an array literal from TokenStream
     * Expects stream to be positioned at the '[' token
     * 
     * @param stream - TokenStream positioned at the '[' token
     * @returns Parsed array literal with code and end token
     */
    static parse(stream: TokenStream): ArrayLiteralResult {
        const startToken = stream.current();
        if (!startToken) {
            throw new Error('Unexpected end of input while parsing array literal');
        }

        // Verify we're at a LBRACKET token
        if (startToken.kind !== TokenKind.LBRACKET) {
            throw new Error(`Expected [ at start of array literal at line ${startToken.line}, column ${startToken.column}, got ${startToken.kind}`);
        }

        // Push array literal context
        stream.pushContext(ParsingContext.ARRAY_LITERAL);

        // Collect tokens until matching closing bracket
        let depth = 1;
        const tokens: Token[] = [];

        try {
            // Consume the opening bracket
            stream.next();
            
            while (!stream.isAtEnd() && depth > 0) {
                const token = stream.current();
                if (!token) break;

                // Skip string tokens - they're already tokenized and contain their content
                // We don't want to parse brackets inside strings
                if (token.kind === TokenKind.STRING) {
                    tokens.push(token);
                    stream.next();
                    continue;
                }

                // Track nested brackets (but not inside strings, which are already tokenized)
                if (token.kind === TokenKind.LBRACKET) {
                    depth++;
                } else if (token.kind === TokenKind.RBRACKET) {
                    depth--;
                    if (depth === 0) {
                        // Found the matching closing bracket - don't include it in the code
                        // But we need to consume it
                        const endToken = token;
                        stream.next(); // Consume the closing bracket
                        
                        // Reconstruct the code from tokens
                        const code = tokens.map(t => t.text).join('');
                        
                        return {
                            code,
                            endToken,
                            startToken
                        };
                    }
                }

                // Collect token if we're still inside the array
                if (depth > 0) {
                    tokens.push(token);
                }

                stream.next();
            }
        } finally {
            // Always pop the context, even if we error out
            stream.popContext();
        }

        // If we exit the loop and depth > 0, the array literal is unclosed
        if (depth > 0) {
            throw new Error(`Unclosed array literal starting at line ${startToken.line}, column ${startToken.column}`);
        }

        // Should not reach here, but handle gracefully
        const endToken = tokens.length > 0 ? tokens[tokens.length - 1] : startToken;
        const code = tokens.map(t => t.text).join('');
        
        return {
            code,
            endToken,
            startToken
        };
    }
}
