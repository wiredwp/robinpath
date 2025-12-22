/**
 * Parser for return statements
 * Handles: return, return value
 * Can be used in both def functions and do blocks
 */

import { TokenStream } from '../classes/TokenStream';
import { TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { LexerUtils } from '../utils';
import { ObjectLiteralParser } from './ObjectLiteralParser';
import { ArrayLiteralParser } from './ArrayLiteralParser';
import { SubexpressionParser } from './SubexpressionParser';
import type { ReturnStatement, CodePosition, Arg, Statement } from '../types/Ast.type';

export interface ReturnParserContext {
    createCodePosition: (start: Token, end: Token) => CodePosition;
    parseStatement?: (stream: TokenStream) => Statement | null;
}

/**
 * Parse a return statement
 * Syntax: return [value]
 * 
 * @param stream - TokenStream positioned at the 'return' keyword
 * @param context - Context with helper methods
 * @returns Parsed ReturnStatement
 */
export function parseReturn(
    stream: TokenStream,
    context: ReturnParserContext
): ReturnStatement {
    const returnToken = stream.current();
    if (!returnToken || returnToken.text !== 'return') {
        throw new Error(`parseReturn expected 'return' keyword, got '${returnToken?.text || 'EOF'}'`);
    }

    // Consume 'return' keyword
    stream.next();

    // Check if there's a value to return
    const nextToken = stream.current();
    if (!nextToken) {
        // return without value - returns null
        return {
            type: 'return',
            value: { type: 'literal', value: null },
            codePos: context.createCodePosition(returnToken, returnToken)
        };
    }

    // Check if we're at end of line (return without value)
    if (nextToken.kind === TokenKind.NEWLINE || nextToken.kind === TokenKind.EOF || nextToken.kind === TokenKind.COMMENT) {
        // return without value - returns null
        return {
            type: 'return',
            value: { type: 'literal', value: null },
            codePos: context.createCodePosition(returnToken, returnToken)
        };
    }

    // Parse the return value as an argument
    const value = parseReturnValue(stream, context);
    const endToken = stream.current() || returnToken;

    return {
        type: 'return',
        value,
        codePos: context.createCodePosition(returnToken, endToken)
    };
}

/**
 * Parse the return value (everything after 'return' until newline/EOF)
 * Reuses the same logic as CommandParser.parseArgumentValue
 */
function parseReturnValue(stream: TokenStream, context: ReturnParserContext): Arg {
    const token = stream.current();
    if (!token) {
        throw new Error('Expected return value');
    }

    // Variable (including $ for lastValue and subexpressions)
    if (token.kind === TokenKind.VARIABLE) {
        if (token.text === '$') {
            // Check if it's followed by ( for subexpression
            if (SubexpressionParser.isSubexpression(stream)) {
                // It's a subexpression $(...)
                if (!context.parseStatement) {
                    throw new Error('parseStatement callback required for subexpressions in return statements');
                }
                const subexpr = SubexpressionParser.parse(stream, {
                    parseStatement: context.parseStatement,
                    createCodePosition: context.createCodePosition
                });
                return subexpr; // Return SubexpressionExpression directly
            }
            // It's just $ (last value)
            stream.next();
            return { type: 'lastValue' };
        } else {
            // Regular variable
            const { name, path } = LexerUtils.parseVariablePath(token.text);
            stream.next();
            return { type: 'var', name, path };
        }
    }

    // String
    if (token.kind === TokenKind.STRING) {
        const isTemplateString = token.text.startsWith('`');
        const value = token.value !== undefined ? token.value : LexerUtils.parseString(token.text);
        stream.next();
        // Store template string flag in the value by prefixing with special marker
        // We'll detect this in evaluateExpression
        if (isTemplateString) {
            return { type: 'string', value: `\0TEMPLATE\0${value}` };
        }
        return { type: 'string', value };
    }

    // Number
    if (token.kind === TokenKind.NUMBER) {
        const value = token.value !== undefined ? token.value : parseFloat(token.text);
        stream.next();
        return { type: 'number', value };
    }

    // Boolean
    if (token.kind === TokenKind.BOOLEAN) {
        const value = token.value !== undefined ? token.value : (token.text === 'true');
        stream.next();
        return { type: 'literal', value };
    }

    // Null
    if (token.kind === TokenKind.NULL) {
        stream.next();
        return { type: 'literal', value: null };
    }

    // Subexpression: $(...)
    // Check for SUBEXPRESSION_OPEN token (lexer tokenizes $( as single token)
    if (token.kind === TokenKind.SUBEXPRESSION_OPEN) {
        if (!context.parseStatement) {
            throw new Error('parseStatement callback required for subexpressions in return statements');
        }
        const subexpr = SubexpressionParser.parse(stream, {
            parseStatement: context.parseStatement,
            createCodePosition: context.createCodePosition
        });
        return subexpr; // Return SubexpressionExpression directly
    }

    // Object literal: {...}
    if (token.kind === TokenKind.LBRACE) {
        const objResult = ObjectLiteralParser.parse(stream);
        return { type: 'object', code: objResult.code };
    }

    // Array literal: [...]
    if (token.kind === TokenKind.LBRACKET) {
        const arrResult = ArrayLiteralParser.parse(stream);
        return { type: 'array', code: arrResult.code };
    }

    // Identifier/keyword - could be a literal or a command call
    if (token.kind === TokenKind.IDENTIFIER || token.kind === TokenKind.KEYWORD) {
        // Check if this looks like a command call (has arguments after it, not immediately followed by newline)
        // Peek ahead to see if there are arguments
        let peekOffset = 1;
        let peekToken = stream.peek(peekOffset);
        
        // Skip comments when peeking
        while (peekToken && peekToken.kind === TokenKind.COMMENT) {
            peekOffset++;
            peekToken = stream.peek(peekOffset);
        }
        
        // If there's a newline or EOF immediately after, it's just a literal
        if (!peekToken || peekToken.kind === TokenKind.NEWLINE || peekToken.kind === TokenKind.EOF) {
            const value = token.text;
            stream.next();
            return { type: 'literal', value };
        }
        
        // Otherwise, it looks like a command call - try to parse it as a statement
        if (context.parseStatement) {
            // Save current position
            const savedPosition = stream.getPosition();
            
            try {
                // Try to parse as a statement (command call)
                const statement = context.parseStatement(stream);
                
                if (statement && statement.type === 'command') {
                    // It's a command call - wrap it in a subexpression so it gets executed
                    // and returns its result
                    return {
                        type: 'subexpression',
                        body: [statement],
                        codePos: context.createCodePosition(token, stream.current() || token)
                    };
                } else {
                    // Parsed as something else (not a command) - restore position and treat as literal
                    stream.setPosition(savedPosition);
                }
            } catch (error) {
                // If parsing fails, fall back to literal
                // Restore position
                stream.setPosition(savedPosition);
            }
        }
        
        // Fall back to literal if we can't parse as command or parseStatement not available
        const value = token.text;
        stream.next();
        return { type: 'literal', value };
    }

    throw new Error(`Unexpected token in return value: ${token.kind} '${token.text}' at line ${token.line}, column ${token.column}`);
}
