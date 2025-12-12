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
import type { ReturnStatement, CodePosition, Arg } from '../types/Ast.type';

export interface ReturnParserContext {
    createCodePosition: (start: Token, end: Token) => CodePosition;
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

    // Skip only comments (not newlines - newlines indicate end of statement)
    skipCommentsOnly(stream);

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
    if (nextToken.kind === TokenKind.NEWLINE || nextToken.kind === TokenKind.EOF) {
        // return without value - returns null
        return {
            type: 'return',
            value: { type: 'literal', value: null },
            codePos: context.createCodePosition(returnToken, returnToken)
        };
    }

    // Parse the return value as an argument
    const value = parseReturnValue(stream);
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
function parseReturnValue(stream: TokenStream): Arg {
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
                const subexpr = SubexpressionParser.parse(stream, {
                    parseStatement: () => null, // ReturnParser doesn't have parseStatement context
                    createCodePosition: (start, end) => ({
                        startRow: start.line - 1,
                        startCol: start.column,
                        endRow: end.line - 1,
                        endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
                    })
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
        const value = token.value !== undefined ? token.value : LexerUtils.parseString(token.text);
        stream.next();
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

    // Identifier/keyword as literal
    if (token.kind === TokenKind.IDENTIFIER || token.kind === TokenKind.KEYWORD) {
        const value = token.text;
        stream.next();
        return { type: 'literal', value };
    }

    throw new Error(`Unexpected token in return value: ${token.kind} '${token.text}' at line ${token.line}, column ${token.column}`);
}


/**
 * Skip only comments (not newlines - newlines indicate end of statement)
 */
function skipCommentsOnly(stream: TokenStream): void {
    while (!stream.isAtEnd()) {
        const token = stream.current();
        if (!token) break;
        
        if (token.kind === TokenKind.COMMENT) {
            stream.next();
            continue;
        }
        
        // Don't skip newlines - they indicate the end of the return statement
        break;
    }
}
