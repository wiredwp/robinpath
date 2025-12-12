/**
 * Parser for subexpressions: $( ... )
 * Subexpressions contain statements that are executed and return a value
 * They are parsed and evaluated before other commands
 */

import { TokenStream, ParsingContext } from '../classes/TokenStream';
import { TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import type { SubexpressionExpression, CodePosition, Statement } from '../types/Ast.type';

export interface SubexpressionParserContext {
    /**
     * Parse a statement from the stream
     */
    parseStatement: (stream: TokenStream) => Statement | null;
    
    /**
     * Create code position from tokens
     */
    createCodePosition: (startToken: Token, endToken: Token) => CodePosition;
}

export class SubexpressionParser {
    /**
     * Parse a subexpression from TokenStream
     * Expects stream to be positioned at the '$' token
     * Syntax: $( ... )
     * 
     * @param stream - TokenStream positioned at the '$' token
     * @param context - Context with helper methods
     * @returns Parsed SubexpressionExpression
     */
    static parse(
        stream: TokenStream,
        context: SubexpressionParserContext
    ): SubexpressionExpression {
        const startToken = stream.current();
        if (!startToken) {
            throw new Error(`Expected $( at start of subexpression, got EOF`);
        }
        
        let openingToken = startToken;
        
        // Check for SUBEXPRESSION_OPEN token ($()
        if (startToken.kind === TokenKind.SUBEXPRESSION_OPEN) {
            // Consume the SUBEXPRESSION_OPEN token
            stream.next();
        } else if (startToken.kind === TokenKind.VARIABLE && startToken.text === '$') {
            // Legacy support: handle $ followed by ( separately
            stream.next(); // Consume '$'
            const lparenToken = stream.current();
            if (!lparenToken || lparenToken.kind !== TokenKind.LPAREN) {
                throw new Error(`Expected ( after $ in subexpression, got ${lparenToken?.text || 'EOF'}`);
            }
            openingToken = lparenToken;
            stream.next(); // Consume '('
        } else {
            throw new Error(`Expected $( at start of subexpression, got ${startToken.text || 'EOF'}`);
        }

        // Push subexpression context
        stream.pushContext(ParsingContext.SUBEXPRESSION);

        try {
            // Parse statements inside the subexpression
            const body: Statement[] = [];
            let depth = 1; // Track parentheses depth (we're already inside the opening paren)
            let lastToken: Token = openingToken;

            while (!stream.isAtEnd() && depth > 0) {
                const token = stream.current();
                if (!token) break;

                // Check for closing paren first - if we're at depth 1 and see ')', we're done
                if (token.kind === TokenKind.RPAREN && depth === 1) {
                    // Found closing paren - done parsing
                    lastToken = token;
                    stream.next(); // Consume closing ')'
                    depth--;
                    break;
                }

                // Track parentheses depth
                if (token.kind === TokenKind.LPAREN) {
                    depth++;
                    stream.next();
                    continue;
                } else if (token.kind === TokenKind.RPAREN) {
                    depth--;
                    if (depth === 0) {
                        // Found closing paren - done parsing
                        lastToken = token;
                        stream.next(); // Consume closing ')'
                        break;
                    }
                    stream.next();
                    continue;
                }

                // Only parse statements when we're at the top level (depth === 1)
                // Nested parentheses are handled by their respective parsers
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
                        lastToken = stream.current() || token;
                    } else {
                        // If we can't parse a statement, skip the token
                        // This handles cases where we're inside nested structures
                        stream.next();
                    }
                } else {
                    // Inside nested parentheses - let the statement parser handle it
                    // We need to advance to avoid infinite loops
                    const beforePos = stream.getPosition();
                    const statement = context.parseStatement(stream);
                    if (statement) {
                        body.push(statement);
                        lastToken = stream.current() || token;
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
                throw new Error('Unclosed subexpression');
            }

            const endToken = stream.current() || lastToken;
            const codePos = context.createCodePosition(startToken, endToken);

            return {
                type: 'subexpression',
                body,
                codePos
            };
        } finally {
            // Always pop the context, even if we error out
            stream.popContext();
        }
    }

    /**
     * Check if the current token is the start of a subexpression
     * @param stream - TokenStream to check
     * @returns true if current token is SUBEXPRESSION_OPEN or '$' followed by '('
     */
    static isSubexpression(stream: TokenStream): boolean {
        const token = stream.current();
        if (!token) {
            return false;
        }

        // Check for SUBEXPRESSION_OPEN token
        if (token.kind === TokenKind.SUBEXPRESSION_OPEN) {
            return true;
        }

        // Legacy support: check for $ followed by (
        if (token.kind === TokenKind.VARIABLE && token.text === '$') {
            const nextToken = stream.peek(1);
            return nextToken !== null && nextToken.kind === TokenKind.LPAREN;
        }

        return false;
    }
}
