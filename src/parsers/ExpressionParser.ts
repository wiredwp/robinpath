/**
 * Parser for expressions
 * Converts tokens into Expression AST nodes
 */

import { TokenStream, ParsingContext } from '../classes/TokenStream';
import { TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { LexerUtils } from '../utils';
import type { Expression, CodePosition, Statement, BinaryOperator } from '../types/Ast.type';

/**
 * Parse an expression from TokenStream
 * Handles: literals, variables, binary operations, unary operations, parenthesized expressions
 * 
 * @param stream - TokenStream positioned at the start of the expression
 * @param parseStatement - Callback to parse statements (for subexpressions)
 * @param parseComment - Callback to parse comments (for subexpressions)
 * @returns Expression AST node
 */
// Store start token for codePos tracking
let expressionStartToken: Token | null = null;

export function parseExpression(
    stream: TokenStream,
    parseStatement?: (stream: TokenStream) => Statement | null,
    parseComment?: (stream: TokenStream) => Statement | null
): Expression {
    expressionStartToken = stream.current();
    // Parse a binary expression (handles precedence and parentheses)
    return parseBinaryExpression(stream, 0, parseStatement, parseComment);
}

/**
 * Parse a binary expression with operator precedence
 * Precedence levels:
 * - 0: &&, ||
 * - 1: ==, !=, <, <=, >, >=
 * - 2: +, -
 * - 3: *, /, %
 */
function parseBinaryExpression(
    stream: TokenStream,
    minPrecedence: number,
    parseStatement?: (stream: TokenStream) => Statement | null,
    parseComment?: (stream: TokenStream) => Statement | null
): Expression {
    // Parse left operand (unary expression or primary)
    let left = parseUnaryExpression(stream, parseStatement, parseComment);

    // Parse binary operators
    while (true) {
        const token = stream.current();
        if (!token) break;

        // Stop at newlines or assignment operators (not part of expression)
        if (token.kind === TokenKind.NEWLINE || token.kind === TokenKind.ASSIGN) {
            break;
        }

        // Check for binary operators
        const opInfo = getBinaryOperator(token);
        if (!opInfo || opInfo.precedence < minPrecedence) {
            break;
        }

        // Consume operator
        stream.next();
        skipWhitespaceAndComments(stream);

        // Parse right operand
        const right = parseBinaryExpression(stream, opInfo.precedence + 1, parseStatement, parseComment);

        // Create binary expression
        // Use the original token for codePos if we don't have expressionStartToken
        const leftStartToken = expressionStartToken || token;
        const rightEndToken = token;
        
        left = {
            type: 'binary',
            operator: opInfo.operator,
            left,
            right,
            codePos: createCodePosition(leftStartToken, rightEndToken)
        };
    }

    return left;
}

/**
 * Parse a unary expression
 */
function parseUnaryExpression(
    stream: TokenStream,
    parseStatement?: (stream: TokenStream) => Statement | null,
    parseComment?: (stream: TokenStream) => Statement | null
): Expression {
    const token = stream.current();
    if (!token) {
        throw new Error('Unexpected end of input while parsing unary expression');
    }

    // Check for unary operators
    if (token.kind === TokenKind.MINUS || token.kind === TokenKind.PLUS) {
        const operator = token.kind === TokenKind.MINUS ? '-' : '+';
        stream.next();
        skipWhitespaceAndComments(stream);
        const argument = parseUnaryExpression(stream, parseStatement, parseComment);
        return {
            type: 'unary',
            operator,
            argument,
            codePos: createCodePosition(token, token) // Will be improved later with proper end token tracking
        };
    }

    if (token.kind === TokenKind.KEYWORD && (token.text === 'not' || token.text === '!')) {
        const operator = 'not';
        stream.next();
        skipWhitespaceAndComments(stream);
        const argument = parseUnaryExpression(stream, parseStatement, parseComment);
        return {
            type: 'unary',
            operator,
            argument,
            codePos: createCodePosition(token, argument.codePos ? { line: (argument.codePos.endRow + 1), column: argument.codePos.endCol, text: '' } : token)
        };
    }

    // Parse primary expression
    return parsePrimaryExpression(stream, parseStatement, parseComment);
}

/**
 * Parse a primary expression (literals, variables, parenthesized expressions)
 */
function parsePrimaryExpression(
    stream: TokenStream,
    parseStatement?: (stream: TokenStream) => Statement | null,
    parseComment?: (stream: TokenStream) => Statement | null
): Expression {
    const startToken = stream.current();
    if (!startToken) {
        throw new Error('Unexpected end of input while parsing expression');
    }

    // Handle parenthesized expressions: (expr)
    if (startToken.kind === TokenKind.LPAREN) {
        stream.next(); // consume (
        skipWhitespaceAndComments(stream);
        
        // Parse expression inside parentheses
        const expr = parseBinaryExpression(stream, 0, parseStatement, parseComment);
        
        // Expect closing )
        skipWhitespaceAndComments(stream);
        const rparen = stream.current();
        if (!rparen || rparen.kind !== TokenKind.RPAREN) {
            throw new Error(`Expected ')' after expression at line ${startToken.line}, column ${startToken.column}`);
        }
        stream.next(); // consume )
        
        return expr;
    }

    // Handle variables: $var, $var.property, etc.
    if (startToken.kind === TokenKind.VARIABLE) {
        const varText = startToken.text;
        
        // Check for standalone $ (last value)
        if (varText === '$') {
            // Check if it's followed by ( for subexpression
            const nextToken = stream.peek(1);
            if (nextToken && nextToken.kind === TokenKind.LPAREN) {
                // It's a subexpression $(...)
                if (!parseStatement || !parseComment) {
                    throw new Error('parseStatement and parseComment callbacks required for subexpressions');
                }
                return parseSubexpression(stream, parseStatement, parseComment);
            }
            
            // It's just $ (last value)
            stream.next();
            return {
                type: 'lastValue',
                codePos: createCodePosition(startToken, startToken)
            };
        }
        
        // Parse variable path
        const { name, path } = LexerUtils.parseVariablePath(varText);
        stream.next();
        
        return {
            type: 'var',
            name,
            path,
            codePos: createCodePosition(startToken, startToken)
        };
    }

    // Handle string literals
    if (startToken.kind === TokenKind.STRING) {
        const value = LexerUtils.parseString(startToken.text);
        stream.next();
        return {
            type: 'string',
            value,
            codePos: createCodePosition(startToken, startToken)
        };
    }

    // Handle number literals
    if (startToken.kind === TokenKind.NUMBER) {
        const value = parseFloat(startToken.text);
        stream.next();
        return {
            type: 'number',
            value,
            codePos: createCodePosition(startToken, startToken)
        };
    }

    // Handle object literals: {...}
    // TODO: For now, we'll need to enhance ObjectLiteralParser to return Expression nodes
    // For basic for loop iterables, we can skip this for now
    if (startToken.kind === TokenKind.LBRACE) {
        throw new Error('Object literal expressions in for loop iterables not yet implemented');
    }

    // Handle array literals: [...]
    // TODO: For now, we'll need to enhance ArrayLiteralParser to return Expression nodes
    // For basic for loop iterables, we can skip this for now
    if (startToken.kind === TokenKind.LBRACKET) {
        throw new Error('Array literal expressions in for loop iterables not yet implemented');
    }


    // Handle boolean literals
    if (startToken.kind === TokenKind.BOOLEAN) {
        const value = startToken.value !== undefined ? startToken.value : (startToken.text === 'true');
        stream.next();
        return {
            type: 'literal',
            value,
            codePos: createCodePosition(startToken, startToken)
        };
    }

    // Handle null literals
    if (startToken.kind === TokenKind.NULL) {
        stream.next();
        return {
            type: 'literal',
            value: null,
            codePos: createCodePosition(startToken, startToken)
        };
    }

    // Handle identifiers/keywords (could be function calls)
    // Check if it's followed by arguments (space-separated or parenthesized)
    if (startToken.kind === TokenKind.IDENTIFIER || startToken.kind === TokenKind.KEYWORD) {
        // Look ahead to see if this is a command call
        // Check the next token after skipping whitespace/comments
        let offset = 1;
        let nextToken: Token | null = null;
        
        // Skip whitespace and comments to find the next meaningful token
        while (true) {
            const peeked = stream.peek(offset);
            if (!peeked) break;
            
            if (peeked.kind === TokenKind.NEWLINE || peeked.kind === TokenKind.EOF) {
                // End of expression - it's a literal
                break;
            }
            
            if (peeked.kind === TokenKind.COMMENT) {
                offset++;
                continue;
            }
            
            // Found a meaningful token
            nextToken = peeked;
            break;
        }
        
        // If next token is '(' or a non-operator token, it's likely a command call
        if (nextToken && 
            (nextToken.kind === TokenKind.LPAREN || !getBinaryOperator(nextToken))) {
            // This looks like a command call: command arg1 arg2 or command(...)
            return parseCallExpression(stream, parseStatement, parseComment);
        }
        
        // Otherwise, treat as literal string
        const text = startToken.text;
        stream.next();
        return {
            type: 'literal',
            value: text,
            codePos: createCodePosition(startToken, startToken)
        };
    }

    // If we encounter an assignment operator, it means we've gone too far
    // This shouldn't happen in a well-formed expression, but we should handle it gracefully
    if (startToken.kind === TokenKind.ASSIGN) {
        throw new Error(`Unexpected assignment operator in expression at line ${startToken.line}, column ${startToken.column}. Did you mean to use '==' for comparison?`);
    }
    
    throw new Error(`Unexpected token in expression: ${startToken.kind} '${startToken.text}' at line ${startToken.line}, column ${startToken.column}`);
}

/**
 * Get binary operator info from token
 */
function getBinaryOperator(token: Token): { operator: BinaryOperator; precedence: number } | null {
    // Logical operators (precedence 0)
    // && is tokenized as TokenKind.AND, || is tokenized as TokenKind.OR
    if (token.kind === TokenKind.AND || (token.kind === TokenKind.KEYWORD && token.text === 'and')) {
        return { operator: 'and', precedence: 0 };
    }
    if (token.kind === TokenKind.OR || (token.kind === TokenKind.KEYWORD && token.text === 'or')) {
        return { operator: 'or', precedence: 0 };
    }

    // Comparison operators (precedence 1)
    if (token.kind === TokenKind.EQ || (token.text === '==' && token.kind === TokenKind.KEYWORD)) {
        return { operator: '==', precedence: 1 };
    }
    if (token.kind === TokenKind.NE || (token.text === '!=' && token.kind === TokenKind.KEYWORD)) {
        return { operator: '!=', precedence: 1 };
    }
    if (token.kind === TokenKind.LT) {
        return { operator: '<', precedence: 1 };
    }
    if (token.kind === TokenKind.LTE) {
        return { operator: '<=', precedence: 1 };
    }
    if (token.kind === TokenKind.GT) {
        return { operator: '>', precedence: 1 };
    }
    if (token.kind === TokenKind.GTE) {
        return { operator: '>=', precedence: 1 };
    }

    // Arithmetic operators
    if (token.kind === TokenKind.PLUS) {
        return { operator: '+', precedence: 2 };
    }
    if (token.kind === TokenKind.MINUS) {
        return { operator: '-', precedence: 2 };
    }
    if (token.kind === TokenKind.MULTIPLY) {
        return { operator: '*', precedence: 3 };
    }
    if (token.kind === TokenKind.DIVIDE) {
        return { operator: '/', precedence: 3 };
    }
    if (token.kind === TokenKind.MODULO) {
        return { operator: '%', precedence: 3 };
    }

    return null;
}

/**
 * Parse a call expression (command call)
 * Handles: command arg1 arg2, command(arg1, arg2), module.command(args)
 */
function parseCallExpression(
    stream: TokenStream,
    parseStatement?: (stream: TokenStream) => Statement | null,
    parseComment?: (stream: TokenStream) => Statement | null
): Expression {
    const startToken = stream.current();
    if (!startToken) {
        throw new Error('Unexpected end of input while parsing call expression');
    }

    // Parse command name (may be module.function)
    let callee = startToken.text;
    stream.next();

    // Check for module.function syntax
    skipWhitespaceAndComments(stream);
    const dotToken = stream.current();
    if (dotToken && dotToken.kind === TokenKind.DOT) {
        stream.next(); // Consume '.'
        skipWhitespaceAndComments(stream);
        
        const funcToken = stream.current();
        if (!funcToken || (funcToken.kind !== TokenKind.IDENTIFIER && funcToken.kind !== TokenKind.KEYWORD)) {
            throw new Error(`Expected function name after '.' at line ${dotToken.line}`);
        }
        
        callee = `${callee}.${funcToken.text}`;
        stream.next();
    }

    // Parse arguments
    skipWhitespaceAndComments(stream);
    const args: Expression[] = [];
    let endToken = startToken;

    // Check if it's parenthesized call: command(...)
    const nextToken = stream.current();
    if (nextToken && nextToken.kind === TokenKind.LPAREN) {
        // Parenthesized call - parse until matching )
        stream.next(); // consume (
        let depth = 1;
        
        skipWhitespaceAndComments(stream);
        while (!stream.isAtEnd() && depth > 0) {
            const token = stream.current();
            if (!token) break;
            
            if (token.kind === TokenKind.LPAREN) {
                depth++;
                stream.next();
            } else if (token.kind === TokenKind.RPAREN) {
                depth--;
                if (depth === 0) {
                    endToken = token;
                    stream.next(); // consume closing )
                    break;
                }
                stream.next();
            } else if (token.kind === TokenKind.COMMA) {
                stream.next(); // consume comma
                skipWhitespaceAndComments(stream);
            } else if (token.kind === TokenKind.NEWLINE) {
                stream.next();
            } else if (token.kind === TokenKind.COMMENT) {
                stream.next();
            } else {
                // Parse argument expression
                const arg = parseBinaryExpression(stream, 0, parseStatement, parseComment);
                args.push(arg);
                skipWhitespaceAndComments(stream);
            }
        }
    } else {
        // Space-separated call: command arg1 arg2
        // Parse arguments until we hit a binary operator, assignment, newline, or EOF
        while (!stream.isAtEnd()) {
            const token = stream.current();
            if (!token) break;
            
            // Stop at newline, EOF, assignment, or binary operators
            if (token.kind === TokenKind.NEWLINE || token.kind === TokenKind.EOF) {
                break;
            }
            
            // Stop at assignment operator (not part of expression)
            if (token.kind === TokenKind.ASSIGN) {
                break;
            }
            
            // Check if it's a binary operator (end of call expression)
            if (getBinaryOperator(token)) {
                break;
            }
            
            // Skip comments
            if (token.kind === TokenKind.COMMENT) {
                stream.next();
                continue;
            }
            
            // Parse argument expression
            const arg = parseBinaryExpression(stream, 0, parseStatement, parseComment);
            args.push(arg);
            endToken = stream.current() || endToken;
            
            skipWhitespaceAndComments(stream);
            
            // Check if next token is a binary operator or assignment (end of call)
            const next = stream.current();
            if (next && (getBinaryOperator(next) || next.kind === TokenKind.ASSIGN)) {
                break;
            }
        }
    }

    return {
        type: 'call',
        callee,
        args,
        codePos: createCodePosition(startToken, endToken)
    };
}

/**
 * Skip whitespace (newlines) and comments
 */
function skipWhitespaceAndComments(stream: TokenStream): void {
    while (!stream.isAtEnd()) {
        const token = stream.current();
        if (!token) break;
        
        if (token.kind === TokenKind.NEWLINE || token.kind === TokenKind.COMMENT) {
            stream.next();
            continue;
        }
        
        break;
    }
}

/**
 * Parse a subexpression $(...)
 */
function parseSubexpression(
    stream: TokenStream,
    parseStatement: (stream: TokenStream) => Statement | null,
    parseComment: (stream: TokenStream) => Statement | null
): Expression {
    const startToken = stream.current();
    if (!startToken || startToken.kind !== TokenKind.VARIABLE || startToken.text !== '$') {
        throw new Error(`Expected '$' for subexpression at line ${startToken?.line || 0}, column ${startToken?.column || 0}`);
    }

    // Consume $ token
    stream.next();

    // Expect ( token
    const lparenToken = stream.current();
    if (!lparenToken || lparenToken.kind !== TokenKind.LPAREN) {
        throw new Error(`Expected '(' after '$' in subexpression at line ${startToken.line}, column ${startToken.column}`);
    }
    stream.next(); // consume (

    // Parse statements until matching )
    const body: Statement[] = [];
    let depth = 1; // Track nesting depth
    let endToken = lparenToken;

    stream.pushContext(ParsingContext.SUBEXPRESSION);
    try {
        while (!stream.isAtEnd() && depth > 0) {
            const token = stream.current();
            if (!token) break;

            if (token.kind === TokenKind.LPAREN) {
                depth++;
                stream.next();
            } else if (token.kind === TokenKind.RPAREN) {
                depth--;
                if (depth === 0) {
                    endToken = token;
                    stream.next(); // consume closing )
                    break;
                }
                stream.next();
            } else if (token.kind === TokenKind.NEWLINE) {
                stream.next();
            } else if (token.kind === TokenKind.COMMENT) {
                const comment = parseComment(stream);
                if (comment) {
                    body.push(comment);
                }
            } else {
                const stmt = parseStatement(stream);
                if (stmt) {
                    body.push(stmt);
                } else {
                    stream.next(); // Skip token if we can't parse it
                }
            }
        }

        if (depth > 0) {
            throw new Error(`Unclosed subexpression starting at line ${startToken.line}, column ${startToken.column}`);
        }
    } finally {
        stream.popContext();
    }

    return {
        type: 'subexpression',
        body,
        codePos: createCodePosition(startToken, endToken)
    };
}

/**
 * Create a CodePosition from start and end tokens
 */
function createCodePosition(startToken: Token, endToken: Token): CodePosition {
    return {
        startRow: startToken.line - 1,
        startCol: startToken.column,
        endRow: endToken.line - 1,
        endCol: endToken.column + (endToken.text.length > 0 ? endToken.text.length - 1 : 0)
    };
}
