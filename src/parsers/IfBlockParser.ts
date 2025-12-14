/**
 * Parser for if blocks and inline if statements
 * Handles: if condition then command, if condition ... endif, elseif, else
 */

import { TokenStream } from '../classes/TokenStream';
import { TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { parseExpression } from './ExpressionParser';
import type { IfBlock, InlineIf, Statement, CodePosition, Expression, DecoratorCall } from '../types/Ast.type';

export interface IfBlockParserContext {
    parseStatement: (stream: TokenStream) => Statement | null;
    parseComment: (stream: TokenStream) => Statement | null;
    createCodePosition: (start: Token, end: Token) => CodePosition;
}

/**
 * Parse an if statement (either inline or block)
 * 
 * @param stream - TokenStream positioned at the 'if' keyword
 * @param context - Context with helper methods
 * @param decorators - Optional decorators to attach to this if block
 * @returns Parsed IfBlock or InlineIf
 */
export function parseIf(
    stream: TokenStream,
    context: IfBlockParserContext,
    decorators?: DecoratorCall[]
): IfBlock | InlineIf {
    const ifToken = stream.current();
    if (!ifToken || ifToken.text !== 'if') {
        throw new Error(`parseIf expected 'if' keyword, got '${ifToken?.text || 'EOF'}'`);
    }

    // Consume 'if' keyword
    stream.next();
    stream.skipWhitespaceAndComments();

    // Parse condition expression
    // The condition can contain parentheses for grouping, e.g., ($age >= 18) && ($citizen == "yes")
    const condition = parseConditionExpression(stream, context);

    // Check if this is an inline if (has 'then' keyword)
    stream.skipWhitespaceAndComments();
    const nextToken = stream.current();
    
    if (nextToken && nextToken.kind === TokenKind.KEYWORD && nextToken.text === 'then') {
        // Check if 'then' is followed by a newline - if so, it's a block if, not inline
        // Peek ahead to see what comes after 'then'
        let peekOffset = 1;
        let peekToken = stream.peek(peekOffset);
        
        // Skip comments when peeking (whitespace is not tokenized)
        while (peekToken && peekToken.kind === TokenKind.COMMENT) {
            peekOffset++;
            peekToken = stream.peek(peekOffset);
        }
        
        if (peekToken && peekToken.kind === TokenKind.NEWLINE) {
            // Block if with 'then': if condition then ... endif
            stream.next(); // consume 'then'
            stream.skipWhitespaceAndComments();
            return parseIfBlock(stream, ifToken, condition, context, decorators);
        } else {
            // Inline if: if condition then command [else command]
        return parseInlineIf(stream, ifToken, condition, context);
        }
    } else {
        // If block: if condition ... endif
        return parseIfBlock(stream, ifToken, condition, context, decorators);
    }
}

/**
 * Parse a condition expression that can contain parentheses for grouping
 * This handles expressions like: ($age >= 18) && ($citizen == "yes")
 */
function parseConditionExpression(
    stream: TokenStream,
    context: IfBlockParserContext
): Expression {
    // Use ExpressionParser to parse the condition
    // We need to enhance it to handle binary expressions with parentheses
    return parseExpression(
        stream,
        context.parseStatement,
        context.parseComment
    );
}

/**
 * Parse inline if: if condition then command [else command]
 */
function parseInlineIf(
    stream: TokenStream,
    ifToken: Token,
    condition: Expression,
    context: IfBlockParserContext
): InlineIf {
    // Consume 'then' keyword
    const thenToken = stream.current();
    if (!thenToken || thenToken.text !== 'then') {
        throw new Error(`Expected 'then' after if condition at line ${ifToken.line}`);
    }
    stream.next();
    stream.skipWhitespaceAndComments();

    // Parse the command statement
    const command = context.parseStatement(stream);
    if (!command) {
        throw new Error(`Expected command after 'then' at line ${thenToken.line}`);
    }

    // Check for optional 'else' clause
    stream.skipWhitespaceAndComments();
    const nextToken = stream.current();
    let elseCommand: Statement | undefined;
    let endToken = stream.current() || thenToken;

    if (nextToken && nextToken.kind === TokenKind.KEYWORD && nextToken.text === 'else') {
        // Consume 'else' keyword
        stream.next();
        stream.skipWhitespaceAndComments();

        // Parse the else command statement
        const parsedElseCommand = context.parseStatement(stream);
        if (!parsedElseCommand) {
            throw new Error(`Expected command after 'else' at line ${nextToken.line}`);
        }
        elseCommand = parsedElseCommand;
        endToken = stream.current() || nextToken;
    }

    return {
        type: 'inlineIf',
        condition,
        command,
        elseCommand,
        codePos: context.createCodePosition(ifToken, endToken)
    };
}

/**
 * Parse if block: if condition ... [elseif ...] [else ...] endif
 */
function parseIfBlock(
    stream: TokenStream,
    ifToken: Token,
    condition: Expression,
    context: IfBlockParserContext,
    decorators?: DecoratorCall[]
): IfBlock {
    const thenBranch: Statement[] = [];
    const elseifBranches: Array<{ condition: Expression; body: Statement[] }> = [];
    let elseBranch: Statement[] | undefined;
    let endToken = ifToken;

    // Parse then branch (body after condition until elseif/else/endif)
    stream.skipWhitespaceAndComments();
    
    // If there's a newline, we're in block mode
    // Otherwise, it might be a single-line if block
    const hasNewline = stream.current()?.kind === TokenKind.NEWLINE;
    if (hasNewline) {
        stream.next(); // consume newline
    }

    // Parse statements until we hit elseif, else, or endif
    while (!stream.isAtEnd()) {
        const token = stream.current();
        if (!token || token.kind === TokenKind.EOF) break;

        // Check for elseif
        if (token.kind === TokenKind.KEYWORD && token.text === 'elseif') {
            stream.next(); // consume 'elseif'
            stream.skipWhitespaceAndComments();
            
            // Parse elseif condition
            const elseifCondition = parseConditionExpression(stream, context);
            
            // Parse elseif body
            stream.skipWhitespaceAndComments();
            if (stream.current()?.kind === TokenKind.NEWLINE) {
                stream.next(); // consume newline
            }
            
            const elseifBody: Statement[] = [];
            while (!stream.isAtEnd()) {
                const t = stream.current();
                if (!t || t.kind === TokenKind.EOF) break;
                
                if (t.kind === TokenKind.KEYWORD && (t.text === 'elseif' || t.text === 'else' || t.text === 'endif')) {
                    break;
                }
                
                if (t.kind === TokenKind.NEWLINE) {
                    stream.next();
                    continue;
                }
                
                if (t.kind === TokenKind.COMMENT) {
                    const comment = context.parseComment(stream);
                    if (comment) {
                        elseifBody.push(comment);
                    }
                    continue;
                }
                
                const stmt = context.parseStatement(stream);
                if (stmt) {
                    elseifBody.push(stmt);
                } else {
                    stream.next();
                }
            }
            
            elseifBranches.push({ condition: elseifCondition, body: elseifBody });
            continue;
        }

        // Check for else
        if (token.kind === TokenKind.KEYWORD && token.text === 'else') {
            stream.next(); // consume 'else'
            stream.skipWhitespaceAndComments();
            if (stream.current()?.kind === TokenKind.NEWLINE) {
                stream.next(); // consume newline
            }
            
            // Parse else branch
            while (!stream.isAtEnd()) {
                const t = stream.current();
                if (!t || t.kind === TokenKind.EOF) break;
                
                if (t.kind === TokenKind.KEYWORD && t.text === 'endif') {
                    break;
                }
                
                if (t.kind === TokenKind.NEWLINE) {
                    stream.next();
                    continue;
                }
                
                if (t.kind === TokenKind.COMMENT) {
                    const comment = context.parseComment(stream);
                    if (comment) {
                        elseBranch = elseBranch || [];
                        elseBranch.push(comment);
                    }
                    continue;
                }
                
                const stmt = context.parseStatement(stream);
                if (stmt) {
                    elseBranch = elseBranch || [];
                    elseBranch.push(stmt);
                } else {
                    stream.next();
                }
            }
            continue;
        }

        // Check for endif
        if (token.kind === TokenKind.KEYWORD && token.text === 'endif') {
            endToken = token;
            stream.next(); // consume 'endif'
            
            // Consume everything until end of line after 'endif'
            // But don't consume closing parentheses - those belong to subexpressions or function calls
            while (!stream.isAtEnd()) {
                const nextToken = stream.current();
                if (!nextToken) break;
                
                // Stop at newline
                if (nextToken.kind === TokenKind.NEWLINE) {
                    stream.next(); // move to next logical statement
                    break;
                }
                
                // Stop at closing paren - this might be closing a subexpression or function call
                // Don't consume it, let the parent parser handle it
                if (nextToken.kind === TokenKind.RPAREN) {
                    break;
                }
                
                // Consume whitespace, comments, and other tokens on the same line
                stream.next();
            }
            break;
        }

        // Parse statement in then branch
        if (token.kind === TokenKind.NEWLINE) {
            stream.next();
            continue;
        }
        
        if (token.kind === TokenKind.COMMENT) {
            const comment = context.parseComment(stream);
            if (comment) {
                thenBranch.push(comment);
            }
            continue;
        }
        
        const stmt = context.parseStatement(stream);
        if (stmt) {
            thenBranch.push(stmt);
        } else {
            // If parseStatement returns null, check if the current token is 'endif', 'else', or 'elseif'
            // These should have been caught by the checks above, but if parseStatement didn't advance
            // the stream, we need to handle them here
            if (token.kind === TokenKind.KEYWORD && 
                (token.text === 'endif' || token.text === 'else' || token.text === 'elseif')) {
                // These keywords should be handled by the checks above, but if we get here,
                // it means parseStatement didn't advance the stream. Let the loop continue
                // so the checks above can handle them.
                continue;
            }
            stream.next();
        }
    }

    const result: IfBlock = {
        type: 'ifBlock',
        condition,
        thenBranch,
        codePos: context.createCodePosition(ifToken, endToken)
    };

    if (elseifBranches.length > 0) {
        result.elseifBranches = elseifBranches;
    }

    if (elseBranch) {
        result.elseBranch = elseBranch;
    }

    // Attach decorators if provided
    if (decorators && decorators.length > 0) {
        result.decorators = decorators;
    }

    return result;
}

