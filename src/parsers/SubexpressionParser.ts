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
        
        // Subexpression must start with SUBEXPRESSION_OPEN ($()
        // Regular parentheses ( ) are handled by other parsers, not SubexpressionParser
        if (startToken.kind !== TokenKind.SUBEXPRESSION_OPEN) {
            throw new Error(`Expected $( at start of subexpression, got ${startToken.kind} '${startToken.text || 'EOF'}'`);
        }
        
        // Consume the SUBEXPRESSION_OPEN token
        const openingToken = startToken;
        stream.next();

        // Push subexpression context
        stream.pushContext(ParsingContext.SUBEXPRESSION);

        try {
            // Parse statements inside the subexpression
            // SubexpressionParser only handles $( ... ), not regular ( ... )
            // Regular parentheses are handled by BracketParser
            const body: Statement[] = [];
            let lastToken: Token = openingToken;

            while (!stream.isAtEnd()) {
                const token = stream.current();
                if (!token) break;

                // Check for closing paren - this closes the subexpression
                if (token.kind === TokenKind.RPAREN) {
                    // Found closing paren - done parsing
                    lastToken = token;
                    stream.next(); // Consume closing ')'
                    break;
                }

                // Skip newlines and comments
                if (token.kind === TokenKind.NEWLINE || token.kind === TokenKind.COMMENT) {
                    stream.next();
                    continue;
                }

                // Parse a statement
                // Nested subexpressions $( ... ) and regular brackets ( ... ) 
                // are handled by their respective parsers via parseStatement
                const statement = context.parseStatement(stream);
                if (statement) {
                    body.push(statement);
                    lastToken = stream.current() || token;
                } else {
                    // If we can't parse a statement, skip the token
                    stream.next();
                }
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
     * Subexpressions must start with SUBEXPRESSION_OPEN ($()
     * Regular parentheses ( ) are handled by other parsers
     * 
     * @param stream - TokenStream to check
     * @returns true if current token is SUBEXPRESSION_OPEN
     */
    static isSubexpression(stream: TokenStream): boolean {
        const token = stream.current();
        if (!token) {
            return false;
        }

        // Subexpression must start with SUBEXPRESSION_OPEN ($()
        return token.kind === TokenKind.SUBEXPRESSION_OPEN;
    }
}
