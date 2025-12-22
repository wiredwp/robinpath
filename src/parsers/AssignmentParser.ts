/**
 * Parser for variable assignments
 * Handles: $var = value, $var = $, $var = command, etc.
 */

import { TokenStream } from '../classes/TokenStream';
import { TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { LexerUtils } from '../utils';
import { CommandParser } from './CommandParser';
import { ObjectLiteralParser } from './ObjectLiteralParser';
import { ArrayLiteralParser } from './ArrayLiteralParser';
import { SubexpressionParser } from './SubexpressionParser';
import { createCodePosition } from './ParserUtils';
import type { Assignment, CodePosition } from '../types/Ast.type';

export interface AssignmentParserContext {
    /**
     * Parse a statement from the stream (for subexpressions)
     */
    parseStatement?: (stream: TokenStream) => any;
    
    /**
     * Create code position from tokens
     */
    createCodePosition?: (startToken: Token, endToken: Token) => CodePosition;
}

export class AssignmentParser {
    /**
     * Parse a variable assignment statement
     * Expects stream to be positioned at the variable token
     * 
     * @param stream - TokenStream positioned at the variable token
     * @param context - Optional context with helper methods
     * @returns Assignment AST node
     */
    static parse(stream: TokenStream, context?: AssignmentParserContext): Assignment {
        const startToken = stream.current();
        if (!startToken) {
            throw new Error('Unexpected end of input while parsing assignment');
        }

        // Parse target variable: $var or $var.path
        if (startToken.kind !== TokenKind.VARIABLE) {
            throw new Error(`Expected variable at ${stream.formatPosition()}, got ${startToken.kind}`);
        }

        const targetVar = startToken.text;
        const { name: targetName, path: targetPath } = LexerUtils.parseVariablePath(targetVar);
        stream.next(); // Consume variable token

        // Skip whitespace and comments before the '=' token
        while (!stream.isAtEnd()) {
            const token = stream.current();
            if (!token) break;
            if (token.kind === TokenKind.COMMENT || 
                (token.kind === TokenKind.NEWLINE && stream.peek(1)?.kind !== TokenKind.EOF)) {
                stream.next();
                continue;
            }
            break;
        }

        // Expect = token
        const assignToken = stream.current();
        if (!assignToken || assignToken.kind !== TokenKind.ASSIGN) {
            const found = assignToken ? `${assignToken.kind} '${assignToken.text}'` : 'end of input';
            const position = assignToken 
                ? `line ${assignToken.line}, column ${assignToken.column}`
                : stream.formatPosition();
            throw new Error(`Expected '=' after variable at ${position}, found ${found}`);
        }
        stream.next(); // Consume the '=' token

        // Skip whitespace and comments after the '=' token
        while (!stream.isAtEnd()) {
            const token = stream.current();
            if (!token) break;
            if (token.kind === TokenKind.COMMENT || 
                (token.kind === TokenKind.NEWLINE && stream.peek(1)?.kind !== TokenKind.EOF)) {
                stream.next();
                continue;
            }
            break;
        }

        // Parse the assignment value
        const valueResult = this.parseAssignmentValue(stream, context);
        
        // Create code position
        const codePos = createCodePosition(startToken, valueResult.endToken);

        return {
            type: 'assignment',
            targetName,
            targetPath,
            ...valueResult.assignmentData,
            codePos
        };
    }

    /**
     * Parse the value part of an assignment
     * Returns the assignment data and the end token
     */
    private static parseAssignmentValue(stream: TokenStream, context?: AssignmentParserContext): {
        assignmentData: Partial<Assignment>;
        endToken: Token;
    } {
        const startToken = stream.current();
        if (!startToken) {
            throw new Error('Unexpected end of input while parsing assignment value');
        }

        // Check for last value: $
        if (startToken.kind === TokenKind.VARIABLE && startToken.text === '$') {
            stream.next();
            return {
                assignmentData: {
                    literalValue: null,
                    isLastValue: true
                },
                endToken: startToken
            };
        }

        // Check for literal values
        // Handle string concatenation: multiple strings on one line
        if (startToken.kind === TokenKind.STRING) {
            const strings: string[] = [];
            let lastToken = startToken;
            
            // Parse the first string token (startToken)
            // Always use parseString to ensure consistency - token.value might not always be set
            const isTemplateString = startToken.text.startsWith('`');
            const firstValue = LexerUtils.parseString(startToken.text);
            // Mark template strings with special prefix
            strings.push(isTemplateString ? `\0TEMPLATE\0${firstValue}` : firstValue);
            stream.next(); // Consume the first string token
            
            // Collect all consecutive string tokens
            while (!stream.isAtEnd()) {
                const token = stream.current();
                if (!token) break;
                if (token.kind === TokenKind.COMMENT || 
                    (token.kind === TokenKind.NEWLINE && stream.peek(1)?.kind !== TokenKind.EOF)) {
                    stream.next();
                    continue;
                }
                break;
            }
            
            while (stream.check(TokenKind.STRING)) {
                const token = stream.next();
                if (!token) break;
                // Always use parseString for consistency
                const isTemplateString = token.text.startsWith('`');
                const value = LexerUtils.parseString(token.text);
                // Mark template strings with special prefix
                strings.push(isTemplateString ? `\0TEMPLATE\0${value}` : value);
                lastToken = token;
                
                // Skip whitespace between strings
                while (!stream.isAtEnd()) {
                    const t = stream.current();
                    if (!t) break;
                    if (t.kind === TokenKind.COMMENT || 
                        (t.kind === TokenKind.NEWLINE && stream.peek(1)?.kind !== TokenKind.EOF)) {
                        stream.next();
                        continue;
                    }
                    break;
                }
            }
            
            const concatenated = strings.join('');
            return {
                assignmentData: {
                    literalValue: concatenated,
                    literalValueType: 'string'
                },
                endToken: lastToken
            };
        }

        if (startToken.kind === TokenKind.NUMBER) {
            const value = startToken.value !== undefined ? startToken.value : parseFloat(startToken.text);
            stream.next();
            return {
                assignmentData: {
                    literalValue: value,
                    literalValueType: 'number'
                },
                endToken: startToken
            };
        }

        if (startToken.kind === TokenKind.BOOLEAN) {
            const value = startToken.value !== undefined ? startToken.value : (startToken.text === 'true');
            stream.next();
            return {
                assignmentData: {
                    literalValue: value,
                    literalValueType: 'boolean'
                },
                endToken: startToken
            };
        }

        if (startToken.kind === TokenKind.NULL) {
            stream.next();
            return {
                assignmentData: {
                    literalValue: null,
                    literalValueType: 'null'
                },
                endToken: startToken
            };
        }

        // Check for variable assignment: $var1 = $var2 or $var1 = $1
        // Note: $ alone is handled above as lastValue, so this handles $var, $1, etc.
        if (startToken.kind === TokenKind.VARIABLE && startToken.text !== '$') {
            const varText = startToken.text;
            // For variable assignments, we always treat it as a variable reference
            // (not a command), even if there's more on the line
            const { name: varName, path } = LexerUtils.parseVariablePath(varText);
            stream.next();
            
            // Skip any remaining tokens on the line (shouldn't be any for simple var assignment)
            // But don't consume newline - let the main parser handle that
            const endToken = startToken; // The variable token itself is the end
            
            return {
                assignmentData: {
                    command: {
                        type: 'command',
                        name: '_var',
                        args: [{ type: 'var', name: varName, path }],
                        codePos: createCodePosition(startToken, endToken)
                    }
                },
                endToken: endToken
            };
        }

        // Check for subexpression: $(...)
        // The Lexer tokenizes $ and ( separately, so we need to check for VARIABLE($) followed by LPAREN
        if (SubexpressionParser.isSubexpression(stream)) {
            // Parse the subexpression using SubexpressionParser
            const subexpr = SubexpressionParser.parse(stream, {
                parseStatement: context?.parseStatement || (() => null),
                createCodePosition: context?.createCodePosition || createCodePosition
            });
            // Wrap in _subexpr command for backward compatibility with Executor
            const endToken = stream.peek(-1) || startToken;
            return {
                assignmentData: {
                    command: {
                        type: 'command',
                        name: '_subexpr',
                        args: [subexpr], // Pass SubexpressionExpression as arg
                        codePos: subexpr.codePos
                    }
                },
                endToken: endToken
            };
        }

        // Check for object literal: {...}
        if (startToken.kind === TokenKind.LBRACE) {
            const objResult = ObjectLiteralParser.parse(stream);
            return {
                assignmentData: {
                    command: {
                        type: 'command',
                        name: '_object',
                        args: [{ type: 'object', code: objResult.code }],
                        codePos: createCodePosition(objResult.startToken, objResult.endToken)
                    }
                },
                endToken: objResult.endToken
            };
        }

        // Check for array literal: [...]
        if (startToken.kind === TokenKind.LBRACKET) {
            const arrResult = ArrayLiteralParser.parse(stream);
            return {
                assignmentData: {
                    command: {
                        type: 'command',
                        name: '_array',
                        args: [{ type: 'array', code: arrResult.code }],
                        codePos: createCodePosition(arrResult.startToken, arrResult.endToken)
                    }
                },
                endToken: arrResult.endToken
            };
        }

        // Otherwise, parse as command
        const command = CommandParser.parse(stream);
        const endToken = stream.current() || startToken;
        return {
            assignmentData: {
                command
            },
            endToken: endToken
        };
    }
}
