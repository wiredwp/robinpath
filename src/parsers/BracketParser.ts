/**
 * Parser for regular parentheses: ( ... )
 * Handles parenthesized expressions and statements
 * This is separate from SubexpressionParser which handles $( ... )
 */

import { TokenStream } from '../classes/TokenStream';
import { TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import type { CodePosition, Statement } from '../types/Ast.type';

export interface BracketParserContext {
    /**
     * Parse a statement from the stream
     */
    parseStatement: (stream: TokenStream) => Statement | null;
    
    /**
     * Create code position from tokens
     */
    createCodePosition: (startToken: Token, endToken: Token) => CodePosition;
}

export class BracketParser {
    /**
     * Parse a parenthesized block from TokenStream
     * Expects stream to be positioned at the '(' token
     * Syntax: ( ... )
     * 
     * @param stream - TokenStream positioned at the '(' token
     * @param context - Context with helper methods
     * @returns Array of statements inside the parentheses
     */
    static parse(
        stream: TokenStream,
        context: BracketParserContext
    ): Statement[] {
        const startToken = stream.current();
        if (!startToken || startToken.kind !== TokenKind.LPAREN) {
            throw new Error(`Expected ( at start of bracket, got ${startToken?.kind || 'EOF'}`);
        }
        
        // Consume the opening '('
        stream.next();
        
        const body: Statement[] = [];
        let depth = 1; // Track parentheses depth (we're already inside the opening paren)

        while (!stream.isAtEnd() && depth > 0) {
            const token = stream.current();
            if (!token) break;

            // Check for closing paren first - if we're at depth 1 and see ')', we're done
            if (token.kind === TokenKind.RPAREN && depth === 1) {
                // Found closing paren - done parsing
                stream.next(); // Consume closing ')'
                depth--;
                break;
            }

            // Track depth for nested parentheses
            if (token.kind === TokenKind.LPAREN) {
                depth++;
                stream.next();
                continue;
            } else if (token.kind === TokenKind.RPAREN) {
                depth--;
                if (depth === 0) {
                    // Found closing paren - done parsing
                    stream.next(); // Consume closing ')'
                    break;
                }
                stream.next();
                continue;
            }

            // Only parse statements when we're at the top level (depth === 1)
            if (depth === 1) {
                // Skip newlines and comments at the top level
                if (token.kind === TokenKind.NEWLINE || token.kind === TokenKind.COMMENT) {
                    stream.next();
                    continue;
                }

                // Parse a statement
                const statement = context.parseStatement(stream);
                if (statement) {
                    body.push(statement);
                } else {
                    // If we can't parse a statement, skip the token
                    stream.next();
                }
            } else {
                // Inside nested parentheses - let the statement parser handle it
                const beforePos = stream.getPosition();
                const statement = context.parseStatement(stream);
                if (statement) {
                    body.push(statement);
                } else {
                    // If no statement parsed, just advance
                    stream.next();
                }
                
                // Safety check: if we didn't advance, force advance
                if (stream.getPosition() === beforePos) {
                    stream.next();
                }
            }
        }

        if (depth > 0) {
            throw new Error('Unclosed bracket');
        }

        return body;
    }

    /**
     * Check if the current token is the start of a bracket
     * @param stream - TokenStream to check
     * @returns true if current token is LPAREN
     */
    static isBracket(stream: TokenStream): boolean {
        const token = stream.current();
        if (!token) {
            return false;
        }

        return token.kind === TokenKind.LPAREN;
    }
}
