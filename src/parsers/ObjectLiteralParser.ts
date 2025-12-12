/**
 * Parser for object literals
 * Syntax: { key: value, key2: value2 }
 * Token-stream based implementation
 */

import { TokenStream, ParsingContext } from '../classes/TokenStream';
import { TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';

export interface ObjectLiteralResult {
    code: string;
    endToken: Token;
    startToken: Token;
}

export class ObjectLiteralParser {
    /**
     * Parse an object literal from TokenStream
     * Expects stream to be positioned at the '{' token
     * 
     * @param stream - TokenStream positioned at the '{' token
     * @returns Parsed object literal with code and end token
     */
    static parse(stream: TokenStream): ObjectLiteralResult {
        const startToken = stream.current();
        if (!startToken) {
            throw new Error('Unexpected end of input while parsing object literal');
        }

        // Verify we're at a LBRACE token
        if (startToken.kind !== TokenKind.LBRACE) {
            throw new Error(`Expected { at start of object literal at line ${startToken.line}, column ${startToken.column}, got ${startToken.kind}`);
        }

        // Push object literal context
        stream.pushContext(ParsingContext.OBJECT_LITERAL);

        // Collect tokens until matching closing brace
        let depth = 1;
        const tokens: Token[] = [];

        try {
            // Consume the opening brace
            stream.next();
            
            while (!stream.isAtEnd() && depth > 0) {
                const token = stream.current();
                if (!token) break;

                // Skip string tokens - they're already tokenized and contain their content
                // We don't want to parse braces inside strings
                if (token.kind === TokenKind.STRING) {
                    tokens.push(token);
                    stream.next();
                    continue;
                }

                // Track nested braces (but not inside strings, which are already tokenized)
                if (token.kind === TokenKind.LBRACE) {
                    depth++;
                } else if (token.kind === TokenKind.RBRACE) {
                    depth--;
                    if (depth === 0) {
                        // Found the matching closing brace - don't include it in the code
                        // But we need to consume it
                        const endToken = token;
                        stream.next(); // Consume the closing brace
                        
                        // Reconstruct the code from tokens
                        // We need to preserve spacing, so we'll join tokens with their original text
                        const code = tokens.map(t => t.text).join('');
                        
                        return {
                            code,
                            endToken,
                            startToken
                        };
                    }
                }

                // Collect token if we're still inside the object
                if (depth > 0) {
                    tokens.push(token);
                }

                stream.next();
            }
        } finally {
            // Always pop the context, even if we error out
            stream.popContext();
        }

        // If we exit the loop and depth > 0, the object literal is unclosed
        if (depth > 0) {
            throw new Error(`Unclosed object literal starting at line ${startToken.line}, column ${startToken.column}`);
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
