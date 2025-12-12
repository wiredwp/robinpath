/**
 * Parser for return statements
 * Handles: return, return value
 * Can be used in both def functions and do blocks
 */

import { TokenStream, ParsingContext } from '../classes/TokenStream';
import { TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { LexerUtils } from '../utils';
import { ObjectLiteralParser } from './ObjectLiteralParser';
import { ArrayLiteralParser } from './ArrayLiteralParser';
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
            const nextToken = stream.peek(1);
            if (nextToken && nextToken.kind === TokenKind.LPAREN) {
                // It's a subexpression $(...)
                const subexprResult = parseSubexpression(stream);
                return { type: 'subexpr', code: subexprResult.code };
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
 * Parse subexpression $(...)
 * Reused from CommandParser
 */
function parseSubexpression(stream: TokenStream): { code: string; endToken: Token } {
    const dollarToken = stream.current();
    if (!dollarToken || dollarToken.kind !== TokenKind.VARIABLE || dollarToken.text !== '$') {
        throw new Error('Expected $ at start of subexpression');
    }
    
    stream.pushContext(ParsingContext.SUBEXPRESSION);
    
    try {
        stream.next(); // Consume $

        const lparenToken = stream.current();
        if (!lparenToken || lparenToken.kind !== TokenKind.LPAREN) {
            throw new Error('Expected ( after $ in subexpression');
        }
        stream.next(); // consume (
        const lparen = lparenToken;
        
        let depth = 1;
        const tokens: Token[] = [];
        
        while (!stream.isAtEnd() && depth > 0) {
            const token = stream.current();
            if (!token) break;
            
            // Skip string tokens - they're already tokenized
            if (token.kind === TokenKind.STRING) {
                tokens.push(token);
                stream.next();
                continue;
            }
            
            if (token.kind === TokenKind.LPAREN) {
                depth++;
            } else if (token.kind === TokenKind.RPAREN) {
                depth--;
                if (depth === 0) {
                    stream.next(); // Consume closing paren
                    break;
                }
            }
            
            if (depth > 0) {
                tokens.push(token);
            }
            
            stream.next();
        }
        
        if (depth > 0) {
            throw new Error('Unclosed subexpression');
        }
        
        const endToken = stream.current() || lparen;
        const code = tokens.map(t => t.text).join('');
        
        return { code, endToken };
    } finally {
        stream.popContext();
    }
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
