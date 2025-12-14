/**
 * Parser for 'def' function definition blocks
 * Syntax: def functionName [$param1 $param2 ...] ... enddef
 */

import { TokenStream, ParsingContext } from '../classes/TokenStream';
import { TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { LexerUtils } from '../utils';
import type { DefineFunction, Statement, CommentWithPosition, CodePosition, DecoratorCall } from '../types/Ast.type';
import type { Environment } from '../index';

export class DefineParser {
    /**
     * Parse a 'def' function definition block
     * Expects stream to be positioned at the 'def' keyword
     * 
     * @param stream - TokenStream positioned at the 'def' keyword
     * @param parseStatement - Callback to parse a statement from the stream
     * @param parseComment - Callback to parse a comment from the stream
     * @param decorators - Optional decorators to attach to this function
     * @param environment - Optional environment for executing parse decorators
     * @returns Parsed DefineFunction
     */
    static async parse(
        stream: TokenStream,
        parseStatement: (stream: TokenStream) => Statement | null,
        parseComment: (stream: TokenStream) => Statement | null,
        decorators?: DecoratorCall[],
        environment?: Environment | null
    ): Promise<DefineFunction> {
        const defToken = stream.current();
        // Accept both 'def' (KEYWORD) and 'define' (IDENTIFIER) as aliases
        const isDef = defToken && defToken.kind === TokenKind.KEYWORD && defToken.text === 'def';
        const isDefine = defToken && defToken.kind === TokenKind.IDENTIFIER && defToken.text === 'define';
        if (!defToken || (!isDef && !isDefine)) {
            throw new Error(`Expected 'def' or 'define' keyword at ${stream.formatPosition()}`);
        }

        const startToken = defToken;
        
        // Push function definition context
        stream.pushContext(ParsingContext.FUNCTION_DEFINITION);
        
        try {
            stream.next(); // Consume 'def' or 'define'

            // Skip whitespace and comments
            stream.skipWhitespaceAndComments();

        // Parse function name
        const nameToken = stream.current();
        if (!nameToken || nameToken.kind === TokenKind.EOF || nameToken.kind === TokenKind.NEWLINE) {
            throw new Error(`def block requires a function name at line ${defToken.line}`);
        }

        if (nameToken.kind !== TokenKind.IDENTIFIER && nameToken.kind !== TokenKind.KEYWORD) {
            throw new Error(`Expected identifier for function name at ${stream.formatPosition()}`);
        }

        const name = nameToken.text;
        stream.next(); // Consume function name

        // Parse parameters (optional): def fn $a $b $c [as]
        const paramNames: string[] = [];
        const headerComments: CommentWithPosition[] = [];

        // Collect tokens until newline
        while (!stream.isAtEnd()) {
            const t = stream.current();
            if (!t) break;
            if (t.kind === TokenKind.NEWLINE) {
                stream.next(); // consume NEWLINE, move to first body token
                break;
            }
            if (t.kind === TokenKind.COMMENT) {
                // Capture inline comment on header line
                const commentText = t.value !== undefined ? String(t.value) : t.text.replace(/^#\s*/, '');
                headerComments.push({
                    text: commentText,
                    inline: true,
                    codePos: createCodePosition(t, t)
                });
                stream.next();
                continue;
            }
            
            // Check for optional "as" keyword after parameters
            // Note: "as" is not in the KEYWORDS set, so it's tokenized as IDENTIFIER
            if ((t.kind === TokenKind.KEYWORD || t.kind === TokenKind.IDENTIFIER) && t.text === 'as') {
                // Consume "as" keyword
                stream.next();
                // After "as", only allow comments and newline
                // skipWhitespaceAndComments will consume newlines, so after it we should be at the body
                stream.skipWhitespaceAndComments();
                // Break out of parameter parsing loop - we're done with the header
                break;
            }
            
            // Parameters should be variables (starting with $)
            if (t.kind === TokenKind.VARIABLE || LexerUtils.isVariable(t.text)) {
                const { name: paramName } = LexerUtils.parseVariablePath(t.text);
                if (paramName && /^[A-Za-z_][A-Za-z0-9_]*$/.test(paramName)) {
                    paramNames.push(paramName);
                    stream.next();
                    continue;
                }
            }
            
            // If we encounter something that's not a parameter, comment, newline, or "as",
            // we should stop parsing parameters (might be start of body or error)
            // Break out of the loop to avoid infinite loops
            break;
        }

        // Parse body until matching 'enddef'
        const body: Statement[] = [];
        let endToken = startToken;
        let lastPosition = -1;
        let loopCount = 0;

        while (!stream.isAtEnd()) {
            const currentPosition = stream.getPosition();
            
            // Safety check for infinite loop
            if (currentPosition === lastPosition) {
                loopCount++;
                if (loopCount > 100) {
                    const token = stream.current();
                    throw new Error(`Infinite loop detected in DefineParser.parse() at position ${currentPosition}, token: ${token?.text} (${token?.kind})`);
                }
            } else {
                lastPosition = currentPosition;
                loopCount = 0;
            }

            const t = stream.current();
            if (!t || t.kind === TokenKind.EOF) break;

            endToken = t;

            // Check for nested function or event handler definition (not allowed)
            const isDef = t.kind === TokenKind.KEYWORD && t.text === 'def';
            const isDefine = t.kind === TokenKind.IDENTIFIER && t.text === 'define';
            const isOn = t.kind === TokenKind.KEYWORD && t.text === 'on';
            if (isDef || isDefine || isOn) {
                const error = new Error(
                    `Nested function or event handler definitions are not allowed. ` +
                    `Found '${t.text}' at line ${t.line}, column ${t.column}. ` +
                    `Function and event handler definitions must be at the top level.`
                );
                (error as any).isNestedDefinitionError = true; // Mark error type
                throw error;
            }

            // Check for 'enddef' keyword - this closes our block
            if (t.kind === TokenKind.KEYWORD && t.text === 'enddef') {
                stream.next(); // consume 'enddef'

                // Consume everything until end of line after 'enddef'
                while (!stream.isAtEnd() && stream.current()?.kind !== TokenKind.NEWLINE) {
                    stream.next();
                }
                if (stream.current()?.kind === TokenKind.NEWLINE) {
                    stream.next(); // move to next logical statement
                }
                break;
            }

            // Skip newlines and comments at the statement boundary
            if (t.kind === TokenKind.NEWLINE) {
                stream.next();
                continue;
            }

            if (t.kind === TokenKind.COMMENT) {
                // Parse comment statement
                const commentBeforeParse = stream.getPosition();
                const comment = parseComment(stream);
                const commentAfterParse = stream.getPosition();
                
                // Ensure stream position advanced (parseComment should consume the comment token)
                // If position didn't change OR we're still on a comment token, manually advance
                const stillOnComment = stream.current()?.kind === TokenKind.COMMENT;
                if (commentAfterParse === commentBeforeParse || stillOnComment) {
                    stream.next(); // Manually advance if parseComment didn't
                }
                
                if (comment) {
                    body.push(comment);
                }
                continue;
            }

            // Parse statement using the callback
            const stmt = parseStatement(stream);
            if (stmt) {
                body.push(stmt);
            } else {
                // If we can't parse, skip the token to avoid infinite loop
                stream.next();
            }
        }

            // Build codePos from startToken to endToken
            const codePos = createCodePosition(startToken, endToken);

            // Build result
            const result: DefineFunction = {
                type: 'define',
                name,
                paramNames,
                body,
                codePos
            };

            if (headerComments.length > 0) {
                result.comments = headerComments;
            }

            // Attach decorators if provided
            if (decorators && decorators.length > 0) {
                result.decorators = decorators;
                // Execute parse decorators during parsing
                if (environment) {
                    for (const decorator of decorators) {
                        const parseDecoratorHandler = environment.parseDecorators.get(decorator.name);
                        if (parseDecoratorHandler) {
                            await parseDecoratorHandler(result.name, result, decorator.args, environment);
                        }
                    }
                }
            }

            return result;
        } finally {
            // Always pop the context, even if we error out
            stream.popContext();
        }
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
