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
import { CommentParser } from './CommentParser';

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
        let pendingComments: CommentWithPosition[] = []; // Comments to attach to next statement

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

            // Skip newlines
            if (t.kind === TokenKind.NEWLINE) {
                stream.next();
                // Check if next token is also newline (blank line) - if so, comments are orphaned
                const nextToken = stream.current();
                if (nextToken && nextToken.kind === TokenKind.NEWLINE) {
                    // Blank line - any pending comments should be standalone
                    if (pendingComments.length > 0) {
                        // Create standalone comment node
                        const groupedText = pendingComments.map(c => c.text).join('\n');
                        const groupedCodePos: CodePosition = {
                            startRow: pendingComments[0].codePos.startRow,
                            startCol: pendingComments[0].codePos.startCol,
                            endRow: pendingComments[pendingComments.length - 1].codePos.endRow,
                            endCol: pendingComments[pendingComments.length - 1].codePos.endCol
                        };
                        body.push({
                            type: 'comment',
                            comments: [{
                                text: groupedText,
                                codePos: groupedCodePos,
                                inline: false
                            }],
                            lineNumber: pendingComments[0].codePos.startRow
                        });
                        pendingComments = [];
                    }
                }
                continue;
            }

            if (t.kind === TokenKind.COMMENT) {
                // Parse comment directly from token - collect it for potential attachment to next statement
                const commentText = t.text.startsWith('#') 
                    ? t.text.slice(1).trim() 
                    : t.text.trim();
                
                const commentCodePos: CodePosition = {
                    startRow: t.line - 1,
                    startCol: t.column,
                    endRow: t.line - 1,
                    endCol: t.column + t.text.length - 1
                };
                
                // Check if this is an inline comment (on same line as previous statement)
                // We'll determine this by checking if there's a newline before this comment
                // For now, treat all comments as non-inline (they'll be attached as leading comments)
                const comment: CommentWithPosition = {
                    text: commentText,
                    codePos: commentCodePos,
                    inline: false
                };
                
                pendingComments.push(comment);
                
                // Consume the comment token and its newline
                stream.next();
                if (stream.current()?.kind === TokenKind.NEWLINE) {
                    stream.next();
                }
                continue;
            }

            // Parse statement using the callback
            const stmt = parseStatement(stream);
            if (stmt) {
                // Attach pending comments to this statement
                if (pendingComments.length > 0) {
                    CommentParser.attachComments(stmt, pendingComments);
                    pendingComments = [];
                }
                
                // Check for inline comment on the same line as the statement
                if ('codePos' in stmt && stmt.codePos) {
                    const statementLine = stmt.codePos.endRow;
                    const currentToken = stream.current();
                    if (currentToken && currentToken.kind === TokenKind.COMMENT) {
                        // Check if comment is on the same line as the statement
                        const commentLine = currentToken.line - 1; // Convert to 0-based
                        if (commentLine === statementLine) {
                            // This is an inline comment
                            const commentText = currentToken.text.startsWith('#') 
                                ? currentToken.text.slice(1).trim() 
                                : currentToken.text.trim();
                            
                            const commentCodePos: CodePosition = {
                                startRow: commentLine,
                                startCol: currentToken.column,
                                endRow: commentLine,
                                endCol: currentToken.column + currentToken.text.length - 1
                            };
                            
                            const inlineComment: CommentWithPosition = {
                                text: commentText,
                                codePos: commentCodePos,
                                inline: true
                            };
                            
                            CommentParser.attachComments(stmt, [inlineComment]);
                            
                            // Consume the inline comment token and its newline
                            stream.next();
                            if (stream.current()?.kind === TokenKind.NEWLINE) {
                                stream.next();
                            }
                        }
                    }
                }
                
                body.push(stmt);
            } else {
                // If we can't parse, skip the token to avoid infinite loop
                stream.next();
            }
        }
        
        // Handle any remaining pending comments at end of def block (make them orphaned)
        if (pendingComments.length > 0) {
            const groupedText = pendingComments.map(c => c.text).join('\n');
            const groupedCodePos: CodePosition = {
                startRow: pendingComments[0].codePos.startRow,
                startCol: pendingComments[0].codePos.startCol,
                endRow: pendingComments[pendingComments.length - 1].codePos.endRow,
                endCol: pendingComments[pendingComments.length - 1].codePos.endCol
            };
            body.push({
                type: 'comment',
                comments: [{
                    text: groupedText,
                    codePos: groupedCodePos,
                    inline: false
                }],
                lineNumber: pendingComments[0].codePos.startRow
            });
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
