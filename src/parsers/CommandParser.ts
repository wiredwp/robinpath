/**
 * Parser for command calls (both space-separated and parenthesized syntax)
 * Handles: command arg1 arg2, fn(arg1, arg2), module.fn(args)
 * Token-stream based implementation
 */

import { TokenStream, ParsingContext } from '../classes/TokenStream';
import { TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { LexerUtils } from '../utils';
import { ObjectLiteralParser } from './ObjectLiteralParser';
import { ArrayLiteralParser } from './ArrayLiteralParser';
import { SubexpressionParser } from './SubexpressionParser';
import type { CommandCall, Arg, ScopeBlock, CodePosition, Expression } from '../types/Ast.type';
import type { AttributePathSegment } from '../utils/types';

export interface CommandParserContext {
    /**
     * Parse a statement from the stream (for callback blocks)
     */
    parseStatement?: (stream: TokenStream) => any;
    
    /**
     * Parse a scope block (do/enddo)
     */
    parseScope?: (stream: TokenStream) => ScopeBlock;
    
    /**
     * Create code position from tokens
     */
    createCodePosition?: (startToken: Token, endToken: Token) => CodePosition;
}

export class CommandParser {
    /**
     * Parse a command call from TokenStream
     * Expects stream to be positioned at the command name (identifier or keyword)
     * 
     * @param stream - TokenStream positioned at the command name
     * @param context - Optional context for parsing callbacks and creating code positions
     * @returns Parsed CommandCall
     */
    static parse(stream: TokenStream, context?: CommandParserContext): CommandCall {
        const startToken = stream.current();
        if (!startToken) {
            throw new Error('Unexpected end of input while parsing command');
        }

        // Parse command name (may be module.function)
        const nameResult = this.parseCommandName(stream);
        const commandName = nameResult.name;
        const startLine = startToken.line;

        // Check if next token is '(' for parenthesized syntax
        // Skip whitespace and comments, but don't consume the next token yet
        stream.skipWhitespaceAndComments();
        const nextToken = stream.current();
        
        if (nextToken && nextToken.kind === TokenKind.LPAREN) {
            // Parenthesized syntax: command(...)
            // Don't call skipWhitespaceAndComments again - the '(' is at stream.current()
            // parseParenthesizedCall will consume it with stream.expect()
            return this.parseParenthesizedCall(stream, commandName, startToken, startLine, context);
        } else {
            // Space-separated syntax: command arg1 arg2
            return this.parseSpaceSeparatedCall(stream, commandName, startToken, startLine, context);
        }
    }

    /**
     * Parse command name (handles module.function syntax)
     */
    private static parseCommandName(stream: TokenStream): { name: string; endToken: Token } {
        const startToken = stream.current();
        if (!startToken) {
            throw new Error('Expected command name');
        }

        // Command name must be an identifier or keyword
        if (startToken.kind !== TokenKind.IDENTIFIER && startToken.kind !== TokenKind.KEYWORD) {
            throw new Error(`Expected identifier or keyword for command name at ${stream.formatPosition()}`);
        }

        let name = startToken.text;
        stream.next();

        // Check for module.function syntax
        stream.skipWhitespaceAndComments();
        const dotToken = stream.current();
        if (dotToken && dotToken.kind === TokenKind.DOT) {
            stream.next(); // Consume '.'
            stream.skipWhitespaceAndComments();
            
            const funcToken = stream.current();
            if (!funcToken || (funcToken.kind !== TokenKind.IDENTIFIER && funcToken.kind !== TokenKind.KEYWORD)) {
                throw new Error(`Expected function name after '.' at ${stream.formatPosition()}`);
            }
            
            name = `${name}.${funcToken.text}`;
            stream.next();
        }

        // Validate command name
        if (LexerUtils.isNumber(name)) {
            throw new Error(`Expected command name, got number: ${name}`);
        }
        if (LexerUtils.isString(name)) {
            throw new Error(`Expected command name, got string literal: ${name}`);
        }
        if (LexerUtils.isVariable(name) || LexerUtils.isPositionalParam(name)) {
            throw new Error(`Expected command name, got variable: ${name}`);
        }
        if (LexerUtils.isLastValue(name)) {
            throw new Error(`Expected command name, got last value reference: ${name}`);
        }

        return { name, endToken: stream.current() || startToken };
    }

    /**
     * Parse parenthesized function call: command(...)
     */
    private static parseParenthesizedCall(
        stream: TokenStream,
        name: string,
        startToken: Token,
        _startLine: number,
        context?: CommandParserContext
    ): CommandCall {
        // Push function call context
        stream.pushContext(ParsingContext.FUNCTION_CALL);
        
        try {
            // We've already checked that the current token is '(' in the parse() method
            // and skipWhitespaceAndComments was already called there, so we can directly expect '('
            const currentToken = stream.current();
            if (!currentToken || currentToken.kind !== TokenKind.LPAREN) {
                const actualToken = currentToken 
                    ? `'${currentToken.text}' (${currentToken.kind})` 
                    : 'end of input';
                const position = currentToken 
                    ? `line ${currentToken.line}, column ${currentToken.column}` 
                    : 'end of input';
                throw new Error(
                    `Expected '(' after function name '${name}' but got ${actualToken} at ${position}`
                );
            }
            const lparen = stream.next()!;
            
            // Parse arguments inside parentheses
            const args: Arg[] = [];
            const namedArgs: Record<string, Arg> = {};
            let depth = 1;
            let isMultiline = false;
            const startLineNum = lparen.line;

            while (!stream.isAtEnd() && depth > 0) {
                const token = stream.current();
                if (!token) break;

                if (token.kind === TokenKind.LPAREN) {
                    depth++;
                } else if (token.kind === TokenKind.RPAREN) {
                    depth--;
                    if (depth === 0) {
                        stream.next(); // Consume closing ')'
                        break;
                    }
                }

                // Track if multiline
                if (token.line !== startLineNum) {
                    isMultiline = true;
                }

                // Skip newlines and comments
                if (token.kind === TokenKind.NEWLINE || token.kind === TokenKind.COMMENT) {
                    stream.next();
                    continue;
                }

                // Parse argument
                if (depth === 1) {
                    const argResult = this.parseArgument(stream, context);
                    if (argResult) {
                        if (argResult.isNamed) {
                            namedArgs[argResult.key!] = argResult.arg;
                        } else {
                            args.push(argResult.arg);
                        }
                    }
                } else {
                    // Inside nested parentheses - skip for now (could be subexpression)
                    stream.next();
                }
            }

            // Combine positional and named args
            const allArgs: Arg[] = [...args];
            if (Object.keys(namedArgs).length > 0) {
                // Cast namedArgs to Record<string, Expression> since NamedArgsExpression expects Expression types
                allArgs.push({ type: 'namedArgs', args: namedArgs as Record<string, Expression> });
            }

            // Determine syntax type
            let syntaxType: 'parentheses' | 'named-parentheses' | 'multiline-parentheses';
            if (isMultiline) {
                syntaxType = 'multiline-parentheses';
            } else if (Object.keys(namedArgs).length > 0) {
                syntaxType = 'named-parentheses';
            } else {
                syntaxType = 'parentheses';
            }

            // Check for "into $var" after closing paren (parseInto handles skipping whitespace/newlines)
            const intoInfo = this.parseInto(stream);

            // Check for callback block (do/with)
            const callback = this.parseCallback(stream, context);

            const endToken = stream.current() || startToken;
            const codePos = context?.createCodePosition 
                ? context.createCodePosition(startToken, endToken)
                : createCodePosition(startToken, endToken);

            return {
                type: 'command',
                name,
                args: allArgs,
                syntaxType,
                into: intoInfo || undefined,
                callback,
                codePos
            };
        } finally {
            // Always pop the context, even if we error out
            stream.popContext();
        }
    }

    /**
     * Parse space-separated function call: command arg1 arg2
     */
    private static parseSpaceSeparatedCall(
        stream: TokenStream,
        name: string,
        startToken: Token,
        _startLine: number,
        context?: CommandParserContext
    ): CommandCall {
        // Push function call context
        stream.pushContext(ParsingContext.FUNCTION_CALL);
        
        try {
            const args: Arg[] = [];
            const namedArgs: Record<string, Arg> = {};
            const startLineNum = startToken.line;

        // Special handling for "set" command with optional "as" keyword
        // Syntax: set $var [as] value [fallback]
        if (name === 'set') {
            // Parse first argument (variable)
            stream.skipWhitespaceAndComments();
            const varArgResult = this.parseArgument(stream, context);
            if (!varArgResult || varArgResult.isNamed) {
                throw new Error('set command requires a variable as first argument');
            }
            args.push(varArgResult.arg);
            
            // Check for optional "as" keyword
            // Note: "as" is not in the KEYWORDS set, so it's tokenized as IDENTIFIER
            stream.skipWhitespaceAndComments();
            const nextToken = stream.current();
            if (nextToken && (nextToken.kind === TokenKind.KEYWORD || nextToken.kind === TokenKind.IDENTIFIER) && nextToken.text === 'as') {
                // Consume "as" keyword
                stream.next();
                stream.skipWhitespaceAndComments();
            }
            
            // Parse remaining arguments (value and optional fallback)
            while (!stream.isAtEnd()) {
                const token = stream.current();
                if (!token) break;

                // Stop at EOF or newline
                if (token.kind === TokenKind.EOF || token.kind === TokenKind.NEWLINE) {
                    break;
                }

                // Stop if we've moved to a different line
                if (token.line !== startLineNum) {
                    break;
                }

                // Skip comments
                if (token.kind === TokenKind.COMMENT) {
                    stream.next();
                    continue;
                }

                // If we're inside a subexpression context, stop at closing paren
                // This allows subexpressions like $(set $var 1) to work correctly
                if (stream.isInContext(ParsingContext.SUBEXPRESSION) && 
                    token.kind === TokenKind.RPAREN) {
                    break;
                }

                // Check for "into" keyword - stop parsing arguments if found
                if (token.kind === TokenKind.KEYWORD && token.text === 'into') {
                    break;
                }

                // Parse argument
                const argResult = this.parseArgument(stream, context);
                if (argResult) {
                    if (argResult.isNamed) {
                        namedArgs[argResult.key!] = argResult.arg;
                    } else {
                        args.push(argResult.arg);
                    }
                } else {
                    // If we can't parse, skip the token
                    stream.next();
                }
            }
        } else {
            // Regular command parsing
            // Collect arguments until end of line or "into" keyword
            let lastIndex = -1;
            let loopCount = 0;
            while (!stream.isAtEnd()) {
                const currentIndex = stream.getPosition();
                if (currentIndex === lastIndex) {
                    loopCount++;
                    if (loopCount > 100) {
                         throw new Error(`Infinite loop in CommandParser (space separated) at index ${currentIndex}`);
                    }
                } else {
                    lastIndex = currentIndex;
                    loopCount = 0;
                }

                const token = stream.current();
                if (!token) break;

                // Stop at EOF or newline
                if (token.kind === TokenKind.EOF || token.kind === TokenKind.NEWLINE) {
                    break;
                }

                // Stop if we've moved to a different line
                if (token.line !== startLineNum) {
                    break;
                }

                // Skip comments
                if (token.kind === TokenKind.COMMENT) {
                    stream.next();
                    continue;
                }

                // If we're inside a subexpression context, stop at closing paren
                // This allows subexpressions like $(math.add 5 5) to work correctly
                if (stream.isInContext(ParsingContext.SUBEXPRESSION) && 
                    token.kind === TokenKind.RPAREN) {
                    break;
                }

                // Check for "into" keyword - stop parsing arguments if found
                // This prevents "into" from being consumed as an argument
                if (token.kind === TokenKind.KEYWORD && token.text === 'into') {
                    break;
                }

                // Parse argument
                const argResult = this.parseArgument(stream, context);
                if (argResult) {
                    if (argResult.isNamed) {
                        namedArgs[argResult.key!] = argResult.arg;
                    } else {
                        args.push(argResult.arg);
                    }
                } else {
                    // If we can't parse, skip the token
                    stream.next();
                }
            }
        }

        // Combine positional and named args
        const allArgs: Arg[] = [...args];
        if (Object.keys(namedArgs).length > 0) {
            // Cast namedArgs to Record<string, Expression> since NamedArgsExpression expects Expression types
            allArgs.push({ type: 'namedArgs', args: namedArgs as Record<string, Expression> });
        }

        // Check for "into $var" (parseInto handles skipping whitespace/newlines)
        const intoInfo = this.parseInto(stream);

        // Check for callback block
        const callback = this.parseCallback(stream, context);

            const endToken = stream.current() || startToken;
            const codePos = context?.createCodePosition 
                ? context.createCodePosition(startToken, endToken)
                : createCodePosition(startToken, endToken);

            return {
                type: 'command',
                name,
                args: allArgs,
                into: intoInfo || undefined,
                callback,
                codePos
            };
        } finally {
            // Always pop the context, even if we error out
            stream.popContext();
        }
    }

    /**
     * Parse a single argument (positional or named)
     */
    private static parseArgument(
        stream: TokenStream,
        context?: CommandParserContext
    ): { arg: Arg; isNamed: boolean; key?: string } | null {
        const token = stream.current();
        if (!token) return null;

        // Check for named argument: key=value or $param=value
        if (token.kind === TokenKind.IDENTIFIER || token.kind === TokenKind.KEYWORD) {
            const nextToken = stream.peek(1);
            if (nextToken && nextToken.kind === TokenKind.ASSIGN) {
                // Named argument: key = value
                const key = token.text;
                stream.next(); // Consume key
                stream.next(); // Consume '='
                stream.skipWhitespaceAndComments();
                
                const valueArg = this.parseArgumentValue(stream, context);
                if (valueArg) {
                    return { arg: valueArg, isNamed: true, key };
                }
            }
        }

        // Check for variable named argument: $param=value
        if (token.kind === TokenKind.VARIABLE && token.text !== '$') {
            const varText = token.text;
            const nextToken = stream.peek(1);
            if (nextToken && nextToken.kind === TokenKind.ASSIGN) {
                const { name } = LexerUtils.parseVariablePath(varText);
                if (name && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
                    stream.next(); // Consume variable
                    stream.next(); // Consume '='
                    stream.skipWhitespaceAndComments();
                    
                    const valueArg = this.parseArgumentValue(stream, context);
                    if (valueArg) {
                        return { arg: valueArg, isNamed: true, key: name };
                    }
                }
            }
        }

        // Positional argument
        const valueArg = this.parseArgumentValue(stream, context);
        if (valueArg) {
            return { arg: valueArg, isNamed: false };
        }

        return null;
    }

    /**
     * Parse an argument value (handles literals, variables, subexpressions, objects, arrays)
     */
    private static parseArgumentValue(
        stream: TokenStream,
        context?: CommandParserContext
    ): Arg | null {
        const token = stream.current();
        if (!token) return null;

        // Last value: $
        if (token.kind === TokenKind.VARIABLE && token.text === '$') {
            stream.next();
            return { type: 'lastValue' };
        }

        // Variable
        if (token.kind === TokenKind.VARIABLE) {
            const { name, path } = LexerUtils.parseVariablePath(token.text);
            stream.next();
            return { type: 'var', name, path };
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

        // Subexpression: $(...)
        if (SubexpressionParser.isSubexpression(stream)) {
            const subexpr = SubexpressionParser.parse(stream, {
                parseStatement: context?.parseStatement || (() => null),
                createCodePosition: context?.createCodePosition || createCodePosition
            });
            // Return SubexpressionExpression directly as an Arg (Expression)
            return subexpr;
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

        // Identifier/keyword - check if it's module.function syntax
        if (token.kind === TokenKind.IDENTIFIER || token.kind === TokenKind.KEYWORD) {
            let value = token.text;
            stream.next();
            
            // Check for module.function syntax (e.g., "math.add")
            stream.skipWhitespaceAndComments();
            const dotToken = stream.current();
            if (dotToken && dotToken.kind === TokenKind.DOT) {
                stream.next(); // Consume '.'
                stream.skipWhitespaceAndComments();
                
                const funcToken = stream.current();
                if (funcToken && (funcToken.kind === TokenKind.IDENTIFIER || funcToken.kind === TokenKind.KEYWORD)) {
                    value = `${value}.${funcToken.text}`;
                    stream.next(); // Consume function name
                }
            }
            
            return { type: 'literal', value };
        }

        return null;
    }

    /**
     * Parse "into $var" syntax
     * Handles "into" on the same line or next line (for multiline calls)
     */
    private static parseInto(stream: TokenStream): { targetName: string; targetPath?: AttributePathSegment[] } | null {
        const savedPos = stream.save();
        
        // Skip whitespace, comments, and newlines to find "into"
        // This allows "into" to appear on the next line for multiline parenthesized calls
        while (!stream.isAtEnd()) {
            const token = stream.current();
            if (!token) break;
            
            // Skip comments and newlines
            if (token.kind === TokenKind.COMMENT || token.kind === TokenKind.NEWLINE) {
                stream.next();
                continue;
            }
            
            // Stop at EOF
            if (token.kind === TokenKind.EOF) {
                break;
            }
            
            // Found a non-whitespace token - check if it's "into"
            break;
        }

        const intoToken = stream.current();
        if (!intoToken || intoToken.text !== 'into') {
            stream.restore(savedPos);
            return null;
        }

        stream.next(); // Consume 'into'
        
        // Skip whitespace, comments, and newlines before variable
        while (!stream.isAtEnd()) {
            const token = stream.current();
            if (!token) break;
            
            if (token.kind === TokenKind.COMMENT || token.kind === TokenKind.NEWLINE) {
                stream.next();
                continue;
            }
            
            if (token.kind === TokenKind.EOF) {
                break;
            }
            
            break;
        }

        const varToken = stream.current();
        if (!varToken || varToken.kind !== TokenKind.VARIABLE) {
            stream.restore(savedPos);
            return null;
        }

        const { name, path } = LexerUtils.parseVariablePath(varToken.text);
        stream.next();

        return { targetName: name, targetPath: path };
    }

    /**
     * Parse callback block (with only - do blocks are standalone statements, not callbacks)
     * Only accepts callbacks on the same line as the command (does not skip newlines)
     */
    private static parseCallback(
        stream: TokenStream,
        context?: CommandParserContext
    ): ScopeBlock | undefined {
        if (!context?.parseScope) {
            return undefined;
        }

        const savedPos = stream.save();
        
        // Skip only comments and spaces (NOT newlines)
        // Callbacks must be on the same line as the command
        while (!stream.isAtEnd()) {
            const token = stream.current();
            if (!token) break;
            
            // Skip comments
            if (token.kind === TokenKind.COMMENT) {
                stream.next();
                continue;
            }
            
            // Stop at newline - callbacks must be on the same line
            if (token.kind === TokenKind.NEWLINE) {
                break;
            }
            
            // Stop at EOF
            if (token.kind === TokenKind.EOF) {
                break;
            }
            
            // Found a non-comment, non-newline token
            break;
        }

        const token = stream.current();
        if (!token) {
            stream.restore(savedPos);
            return undefined;
        }

        // Check for 'with' keyword only (do blocks are standalone statements, not callbacks)
        if (token.kind === TokenKind.KEYWORD && token.text === 'with') {
            // Don't restore - we found a callback
            return context.parseScope(stream);
        }

        stream.restore(savedPos);
        return undefined;
    }
}




/**
 * Helper: Create CodePosition from start and end tokens
 */
function createCodePosition(startToken: Token, endToken: Token): CodePosition {
    return {
        startRow: startToken.line - 1, // Convert to 0-based
        startCol: startToken.column,
        endRow: endToken.line - 1, // Convert to 0-based
        endCol: endToken.column + (endToken.text.length > 0 ? endToken.text.length - 1 : 0)
    };
}
