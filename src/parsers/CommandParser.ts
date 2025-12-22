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
        let lastToken = startToken; // Track the last token that's part of the command name
        stream.next();

        // Check for module.function syntax (don't skip newlines - that would move to next line)
        // Only skip if current token is on the same line
        const afterNameToken = stream.current();
        if (afterNameToken && afterNameToken.kind === TokenKind.DOT && afterNameToken.line === startToken.line) {
            stream.next(); // Consume '.'
            stream.skipWhitespaceAndComments();
            
            const funcToken = stream.current();
            if (!funcToken || (funcToken.kind !== TokenKind.IDENTIFIER && funcToken.kind !== TokenKind.KEYWORD)) {
                throw new Error(`Expected function name after '.' at ${stream.formatPosition()}`);
            }
            
            name = `${name}.${funcToken.text}`;
            lastToken = funcToken;
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

        return { name, endToken: lastToken };
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
        startLineNum: number,
        context?: CommandParserContext
    ): CommandCall {
        // Push function call context
        stream.pushContext(ParsingContext.FUNCTION_CALL);
        
        try {
            const args: Arg[] = [];
            const namedArgs: Record<string, Arg> = {};
            // const startLineNum = startToken.line; // Already passed as arg
            let lastCommandToken: Token = startToken; // Track the last token that was part of the command

        // Special handling for "set" command with optional "as" keyword
        if (name === 'set') {
            // ... (keep set logic as is, omitted for brevity but should be preserved)
            // Parse first argument (variable)
            stream.skipWhitespaceAndComments();
            const varArgResult = this.parseArgument(stream, context);
            if (!varArgResult || varArgResult.isNamed) {
                throw new Error('set command requires a variable as first argument');
            }
            args.push(varArgResult.arg);
            
            stream.skipWhitespaceAndComments();
            const nextToken = stream.current();
            if (nextToken && (nextToken.kind === TokenKind.KEYWORD || nextToken.kind === TokenKind.IDENTIFIER) && nextToken.text === 'as') {
                stream.next();
                stream.skipWhitespaceAndComments();
            }
            
            while (!stream.isAtEnd()) {
                const token = stream.current();
                if (!token) break;
                if (token.kind === TokenKind.EOF || token.kind === TokenKind.NEWLINE) break;
                if (token.line !== startLineNum) break;
                if (token.kind === TokenKind.COMMENT) {
                    stream.next();
                    continue;
                }
                if (stream.isInContext(ParsingContext.SUBEXPRESSION) && token.kind === TokenKind.RPAREN) break;
                if (token.kind === TokenKind.KEYWORD && token.text === 'into') break;

                const argResult = this.parseArgument(stream, context);
                if (argResult) {
                    if (argResult.isNamed) {
                        namedArgs[argResult.key!] = argResult.arg;
                    } else {
                        args.push(argResult.arg);
                    }
                } else {
                    stream.next();
                }
            }
        } else {
            // Regular command parsing
            let lastIndex = -1;
            let loopCount = 0;
            let justFinishedMultilineConstruct = false;
            
            const currentBeforeArgs = stream.current();
            if (currentBeforeArgs && currentBeforeArgs.line === startLineNum) {
                lastCommandToken = currentBeforeArgs;
            }
            
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

                // Stop at EOF
                if (token.kind === TokenKind.EOF) {
                    break;
                }

                // Check for "into"
                if (token.kind === TokenKind.KEYWORD && token.text === 'into') {
                    break;
                }

                // Check for "with"
                if (token.kind === TokenKind.KEYWORD && token.text === 'with') {
                    break;
                }

                // Skip comments
                if (token.kind === TokenKind.COMMENT) {
                    if (token.line === startLineNum) {
                        break;
                    }
                    stream.next();
                    continue;
                }

                // Stop at closing paren (likely from subexpression)
                // Always stop at RPAREN in space-separated calls as it's not a valid argument start
                if (token.kind === TokenKind.RPAREN) {
                    break;
                }

                // Stop at newline if not in subexpression
                // But subexpressions handle newlines internally via SubexpressionParser
                // So if we see a newline here, it means we are between arguments
                // If we are inside a subexpression, newlines separate statements, so we should stop
                if (stream.isInContext(ParsingContext.SUBEXPRESSION)) {
                    if (token.kind === TokenKind.NEWLINE) {
                        // Check if we're in the middle of parsing a multi-line construct argument
                        // (This check is a bit complex, relying on context stack)
                        const isInMultilineArg = stream.isInContext(ParsingContext.OBJECT_LITERAL) ||
                                                stream.isInContext(ParsingContext.ARRAY_LITERAL);
                        if (!isInMultilineArg && !justFinishedMultilineConstruct) {
                            break;
                        }
                    }
                }

                // Check if we're inside a multi-line construct context
                const isInMultilineContext = stream.isInContext(ParsingContext.OBJECT_LITERAL) ||
                                            stream.isInContext(ParsingContext.ARRAY_LITERAL);

                if (isInMultilineContext) {
                    const argResult = this.parseArgument(stream, context);
                    if (argResult) {
                        if (argResult.isNamed) {
                            namedArgs[argResult.key!] = argResult.arg;
                        } else {
                            args.push(argResult.arg);
                        }
                        justFinishedMultilineConstruct = argResult.arg.type === 'object' || 
                                                         argResult.arg.type === 'array' ||
                                                         argResult.arg.type === 'subexpression';
                    } else {
                        stream.next();
                    }
                    continue;
                }

                const isStartOfMultiline = token.kind === TokenKind.LBRACE ||
                                          token.kind === TokenKind.LBRACKET ||
                                          token.kind === TokenKind.SUBEXPRESSION_OPEN ||
                                          (token.kind === TokenKind.VARIABLE && token.text === '$' && 
                                           stream.peek(1)?.kind === TokenKind.LPAREN);

                if (justFinishedMultilineConstruct || isStartOfMultiline) {
                    justFinishedMultilineConstruct = false;
                    
                    // Re-fetch token to avoid narrowing issues from isStartOfMultiline check
                    const currentT = stream.current();
                    if (!currentT || currentT.kind === TokenKind.NEWLINE || currentT.kind === TokenKind.EOF) {
                        break;
                    }
                    if (currentT.kind === TokenKind.RPAREN) {
                        break;
                    }

                    const argResult = this.parseArgument(stream, context);
                    if (argResult) {
                        if (argResult.isNamed) {
                            namedArgs[argResult.key!] = argResult.arg;
                        } else {
                            args.push(argResult.arg);
                        }
                        lastCommandToken = stream.peek(-1) || lastCommandToken;
                        
                        justFinishedMultilineConstruct = argResult.arg.type === 'object' || 
                                                         argResult.arg.type === 'array' ||
                                                         argResult.arg.type === 'subexpression';
                    } else {
                        const current = stream.current();
                        if (!current || current.kind === TokenKind.NEWLINE || current.kind === TokenKind.EOF) {
                            break;
                        }
                        if (current.kind === TokenKind.RPAREN) {
                            break;
                        }
                        stream.next();
                    }
                    continue;
                }

                if (token.kind === TokenKind.NEWLINE) {
                    break;
                }

                if (token.line !== startLineNum && !justFinishedMultilineConstruct) {
                    break;
                }

                const tokenBeforeArg = stream.current();
                
                const argResult = this.parseArgument(stream, context);
                if (argResult) {
                    if (argResult.isNamed) {
                        namedArgs[argResult.key!] = argResult.arg;
                    } else {
                        args.push(argResult.arg);
                    }
                    if (tokenBeforeArg && tokenBeforeArg.line === startLineNum) {
                        lastCommandToken = tokenBeforeArg;
                    }
                    justFinishedMultilineConstruct = argResult.arg.type === 'object' || 
                                                     argResult.arg.type === 'array' ||
                                                     argResult.arg.type === 'subexpression';
                } else {
                    stream.next();
                }
            }
        }

        // Combine positional and named args
        const allArgs: Arg[] = [...args];
        if (Object.keys(namedArgs).length > 0) {
            allArgs.push({ type: 'namedArgs', args: namedArgs as Record<string, Expression> });
        }

        // Callback and Into parsing
        const callback = this.parseCallback(stream, context);
        if (callback && callback.codePos) {
            lastCommandToken = {
                kind: TokenKind.KEYWORD,
                text: 'endwith',
                line: callback.codePos.endRow + 1,
                column: callback.codePos.endCol,
                value: undefined
            };
        }

        const intoInfo = this.parseInto(stream);
        if (intoInfo) {
            const current = stream.current();
            if (current) {
                lastCommandToken = stream.peek(-1) || lastCommandToken;
            }
        }

        try {
            let endToken = lastCommandToken;
            const currentToken = stream.current();
            if (!callback && currentToken && currentToken.line === startToken.line) {
                endToken = currentToken;
            }
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
            stream.popContext();
        }
        } finally {
            // Ensure context is popped if error occurs before inner try
            if (stream.getCurrentContext() === ParsingContext.FUNCTION_CALL) {
                stream.popContext();
            }
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

        const valueArg = this.parseArgumentValue(stream, context);
        if (valueArg) {
            return { arg: valueArg, isNamed: false };
        }

        return null;
    }

    /**
     * Parse an argument value (handles literals, variables, subexpressions, objects, arrays)
     */
    static parseArgumentValue(
        stream: TokenStream,
        context?: CommandParserContext
    ): Arg | null {
        const token = stream.current();
        if (!token) return null;

        if (token.kind === TokenKind.VARIABLE && token.text === '$') {
            stream.next();
            return { type: 'lastValue' };
        }

        if (token.kind === TokenKind.VARIABLE) {
            const { name, path } = LexerUtils.parseVariablePath(token.text);
            stream.next();
            return { type: 'var', name, path };
        }

        if (token.kind === TokenKind.STRING) {
            const isTemplateString = token.text.startsWith('`');
            const value = token.value !== undefined ? token.value : LexerUtils.parseString(token.text);
            stream.next();
            if (isTemplateString) {
                return { type: 'string', value: `\0TEMPLATE\0${value}` };
            }
            return { type: 'string', value };
        }

        if (token.kind === TokenKind.NUMBER) {
            const value = token.value !== undefined ? token.value : parseFloat(token.text);
            stream.next();
            return { type: 'number', value };
        }

        if (token.kind === TokenKind.BOOLEAN) {
            const value = token.value !== undefined ? token.value : (token.text === 'true');
            stream.next();
            return { type: 'literal', value };
        }

        if (token.kind === TokenKind.NULL) {
            stream.next();
            return { type: 'literal', value: null };
        }

        if (SubexpressionParser.isSubexpression(stream)) {
            const subexpr = SubexpressionParser.parse(stream, {
                parseStatement: context?.parseStatement || (() => null),
                createCodePosition: context?.createCodePosition || createCodePosition
            });
            return subexpr;
        }

        if (token.kind === TokenKind.LBRACE) {
            const objResult = ObjectLiteralParser.parse(stream);
            return { type: 'object', code: objResult.code };
        }

        if (token.kind === TokenKind.LBRACKET) {
            const arrResult = ArrayLiteralParser.parse(stream);
            return { type: 'array', code: arrResult.code };
        }

        // Identifier/keyword - check if it's module.function syntax
        if (token.kind === TokenKind.IDENTIFIER || token.kind === TokenKind.KEYWORD) {
            let value = token.text;
            stream.next();
            
            // Check for module.function syntax (e.g., "math.add")
            const savedPos = stream.save();
            
            // Skip comments only (not newlines)
            while (stream.check(TokenKind.COMMENT)) {
                stream.next();
            }
            
            const dotToken = stream.current();
            if (dotToken && dotToken.kind === TokenKind.DOT) {
                stream.next(); // Consume '.'
                
                // Skip comments only
                while (stream.check(TokenKind.COMMENT)) {
                    stream.next();
                }
                
                const funcToken = stream.current();
                if (funcToken && (funcToken.kind === TokenKind.IDENTIFIER || funcToken.kind === TokenKind.KEYWORD)) {
                    value = `${value}.${funcToken.text}`;
                    stream.next(); // Consume function name
                } else {
                    stream.restore(savedPos);
                }
            } else {
                stream.restore(savedPos);
            }
            
            return { type: 'literal', value };
        }

        return null;
    }

    /**
     * Parse "into $var" syntax
     */
    private static parseInto(stream: TokenStream): { targetName: string; targetPath?: AttributePathSegment[] } | null {
        const savedPos = stream.save();
        
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

        const intoToken = stream.current();
        if (!intoToken || intoToken.text !== 'into') {
            stream.restore(savedPos);
            return null;
        }

        stream.next(); 
        
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
     * Parse callback block (with only)
     */
    private static parseCallback(
        stream: TokenStream,
        context?: CommandParserContext
    ): ScopeBlock | undefined {
        if (!context?.parseScope) {
            return undefined;
        }

        const savedPos = stream.save();
        const startLine = stream.current()?.line;

        let checkedTokens = 0;
        while (!stream.isAtEnd() && checkedTokens < 10) {
            const token = stream.current();
            if (!token) break;
            
            if (startLine !== undefined && token.line !== startLine) {
                break;
            }
            
            if (token.kind === TokenKind.COMMENT) {
                stream.next();
                checkedTokens++;
                continue;
            }
            
            if (token.kind === TokenKind.NEWLINE) {
                break;
            }
            
            if (token.kind === TokenKind.EOF) {
                break;
            }

            if (token.kind === TokenKind.KEYWORD && token.text === 'with') {
                return context.parseScope(stream);
            }
            
            break;
        }

        stream.restore(savedPos);
        return undefined;
    }
}

function createCodePosition(startToken: Token, endToken: Token): CodePosition {
    return {
        startRow: startToken.line - 1, 
        startCol: startToken.column,
        endRow: endToken.line - 1, 
        endCol: endToken.column + (endToken.text.length > 0 ? endToken.text.length - 1 : 0)
    };
}