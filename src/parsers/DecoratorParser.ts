/**
 * Parser for decorators
 * Syntax: @decoratorName [arg1] [arg2] ...
 * Examples:
 *   @desc "description"
 *   @param string $name "description"
 *   @param number $age 25 "description"
 *   @arg number
 *   @required $name
 */

import { TokenStream } from '../classes/TokenStream';
import { TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { CommandParser } from './CommandParser';
import type { DecoratorCall, CodePosition, Arg } from '../types/Ast.type';

export interface DecoratorParserContext {
    parseStatement: (stream: TokenStream) => any;
    parseComment: (stream: TokenStream) => any;
}

/**
 * Parse a decorator call
 * Expects stream to be positioned at the '@' decorator token
 * 
 * @param stream - TokenStream positioned at the decorator token
 * @param context - Context with helper methods
 * @returns Parsed DecoratorCall or null if not a decorator
 */
export function parseDecorator(
    stream: TokenStream,
    context: DecoratorParserContext
): DecoratorCall | null {
    const decoratorToken = stream.current();
    if (!decoratorToken || decoratorToken.kind !== TokenKind.DECORATOR) {
        return null;
    }

    // Extract decorator name (without @)
    const decoratorName = decoratorToken.text.startsWith('@') 
        ? decoratorToken.text.slice(1) 
        : decoratorToken.text;
    
    stream.next(); // Consume decorator token
    
    // Skip whitespace and comments
    stream.skipWhitespaceAndComments();
    
    // Parse decorator arguments (similar to command arguments)
    const args: Arg[] = [];
    let endToken = decoratorToken;
    const startLine = decoratorToken.line;
    
    // Parse arguments until we hit a newline or end of stream
    while (!stream.isAtEnd()) {
        const token = stream.current();
        if (!token || token.kind === TokenKind.EOF) {
            break;
        }
        
        // Stop at newline (decorators are single-line)
        if (token.kind === TokenKind.NEWLINE) {
            endToken = token;
            break;
        }
        
        // Stop if we've moved to a different line
        if (token.line !== startLine) {
            break;
        }
        
        // Skip comments (inline comments are allowed)
        if (token.kind === TokenKind.COMMENT) {
            stream.next();
            continue;
        }
        
        // Parse argument using CommandParser's parseArgumentValue logic
        // This handles literals, variables, subexpressions, objects, arrays, etc.
        const arg = CommandParser.parseArgumentValue(stream, {
            parseStatement: context.parseStatement,
            createCodePosition: (start: Token, end: Token) => ({
                startRow: start.line - 1,
                startCol: start.column,
                endRow: end.line - 1,
                endCol: end.column + (end.text.length > 0 ? end.text.length - 1 : 0)
            })
        });
        
            if (arg) {
                args.push(arg);
                endToken = token;
            // Skip whitespace before checking for next argument
            stream.skipWhitespaceAndComments();
                // Check if there's more on the same line
                const nextToken = stream.current();
                if (!nextToken || nextToken.kind === TokenKind.NEWLINE || nextToken.kind === TokenKind.EOF) {
                    break;
                }
            // If we've moved to a different line, stop
            if (nextToken.line !== startLine) {
                break;
            }
        } else {
            // If we can't parse an argument, we're done
            break;
        }
    }
    
    // Create code position
    const codePos: CodePosition = {
        startRow: decoratorToken.line - 1,
        startCol: decoratorToken.column,
        endRow: endToken.line - 1,
        endCol: endToken.column + (endToken.text.length > 0 ? endToken.text.length - 1 : 0)
    };
    
    return {
        name: decoratorName,
        args,
        codePos
    };
}

/**
 * Parse multiple decorators that appear before a statement
 * Decorators must be on consecutive lines (or same line) before the target statement
 * 
 * @param stream - TokenStream positioned at the first decorator (or the statement if no decorators)
 * @param context - Context with helper methods
 * @returns Array of parsed decorators, the position after the last decorator, and the next token
 */
export function parseDecorators(
    stream: TokenStream,
    context: DecoratorParserContext
): { decorators: DecoratorCall[]; positionAfter: number; nextToken: Token | null } {
    const decorators: DecoratorCall[] = [];
    
    // Collect decorators until we hit a non-decorator statement
    while (!stream.isAtEnd()) {
        const token = stream.current();
        if (!token) break;
        
        // Skip whitespace and comments
        if (token.kind === TokenKind.NEWLINE) {
            stream.next();
            continue;
        }
        
        if (token.kind === TokenKind.COMMENT) {
            const comment = context.parseComment(stream);
            if (comment) {
                stream.next();
            } else {
                stream.next();
            }
            continue;
        }
        
        // Check if this is a decorator
        if (token.kind === TokenKind.DECORATOR) {
            const decorator = parseDecorator(stream, context);
            if (decorator) {
                decorators.push(decorator);
                // parseDecorator stops at NEWLINE without consuming it
                // Just skip the NEWLINE (don't call skipWhitespaceAndComments which might consume too much)
                const currentToken = stream.current();
                if (currentToken && currentToken.kind === TokenKind.NEWLINE) {
                    stream.next(); // Consume the NEWLINE
                }
                continue;
            }
        }
        
        // Not a decorator, stop collecting
        break;
    }
    
    // Get the next token after decorators (skip whitespace and comments)
    stream.skipWhitespaceAndComments();
    const nextToken = stream.current();
    
    return {
        decorators,
        positionAfter: stream.getPosition(),
        nextToken
    };
}

