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
     * Expects stream to be positioned at the '$(' token
     * Syntax: $( ... )
     * 
     * @param stream - TokenStream positioned at the '$(' token
     * @param context - Context with helper methods
     * @returns Parsed SubexpressionExpression
     */
    static parse(
        stream: TokenStream,
        context: SubexpressionParserContext
    ): SubexpressionExpression {
        const startToken = stream.current();
        if (!startToken || startToken.kind !== TokenKind.SUBEXPRESSION_OPEN) {
            throw new Error(`Expected $( at start of subexpression`);
        }
        
        // Consume the SUBEXPRESSION_OPEN token
        stream.next();

        // Push subexpression context
        stream.pushContext(ParsingContext.SUBEXPRESSION);

        try {
            const body: Statement[] = [];

            while (!stream.isAtEnd()) {
                // Skip leading whitespace and comments within the subexpression
                stream.skipWhitespaceAndComments();
                
                const token = stream.current();
                if (!token || token.kind === TokenKind.EOF) break;

                // Check for closing paren
                if (token.kind === TokenKind.RPAREN) {
                    const endToken = token;
                    stream.next(); // Consume closing ')'
                    
                    return {
                        type: 'subexpression',
                        body,
                        codePos: context.createCodePosition(startToken, endToken)
                    };
                }

                // Parse a statement
                const statement = context.parseStatement(stream);
                if (statement) {
                    body.push(statement);
                } else {
                    // If we can't parse a statement and it's not RPAREN, ensure progress
                    const currentToken = stream.current();
                    if (currentToken && currentToken.kind !== TokenKind.RPAREN) {
                        stream.next();
                    } else if (!currentToken) {
                        break;
                    }
                }
            }

            throw new Error(`Unclosed subexpression starting at line ${startToken.line}, column ${startToken.column}`);
        } finally {
            // Always pop the context
            stream.popContext();
        }
    }

    /**
     * Check if the current token is the start of a subexpression
     * Subexpressions must start with SUBEXPRESSION_OPEN ($()
     * 
     * @param stream - TokenStream to check
     * @returns true if current token is SUBEXPRESSION_OPEN
     */
    static isSubexpression(stream: TokenStream): boolean {
        const token = stream.current();
        return token ? token.kind === TokenKind.SUBEXPRESSION_OPEN : false;
    }
}