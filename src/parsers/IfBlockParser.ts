/**
 * Parser for if blocks and inline if statements
 * Handles: if condition then command, if condition ... endif, elseif, else
 */

import { TokenStream, ParsingContext } from '../classes/TokenStream';
import { TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { parseExpression } from './ExpressionParser';
import type { IfBlock, InlineIf, Statement, CommentWithPosition, CodePosition, Expression } from '../types/Ast.type';

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
 * @returns Parsed IfBlock or InlineIf
 */
export function parseIf(
    stream: TokenStream,
    context: IfBlockParserContext
): IfBlock | InlineIf {
    const ifToken = stream.current();
    if (!ifToken || ifToken.text !== 'if') {
        throw new Error(`parseIf expected 'if' keyword, got '${ifToken?.text || 'EOF'}'`);
    }

    // Consume 'if' keyword
    stream.next();
    skipWhitespaceAndComments(stream);

    // Parse condition expression
    // The condition can contain parentheses for grouping, e.g., ($age >= 18) && ($citizen == "yes")
    const condition = parseConditionExpression(stream, context);

    // Check if this is an inline if (has 'then' keyword)
    skipWhitespaceAndComments(stream);
    const nextToken = stream.current();
    
    if (nextToken && nextToken.kind === TokenKind.KEYWORD && nextToken.text === 'then') {
        // Inline if: if condition then command
        return parseInlineIf(stream, ifToken, condition, context);
    } else {
        // If block: if condition ... endif
        return parseIfBlock(stream, ifToken, condition, context);
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
 * Parse inline if: if condition then command
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
    skipWhitespaceAndComments(stream);

    // Parse the command statement
    const command = context.parseStatement(stream);
    if (!command) {
        throw new Error(`Expected command after 'then' at line ${thenToken.line}`);
    }

    // Find end token (end of command)
    const endToken = stream.current() || thenToken;

    return {
        type: 'inlineIf',
        condition,
        command,
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
    context: IfBlockParserContext
): IfBlock {
    const thenBranch: Statement[] = [];
    const elseifBranches: Array<{ condition: Expression; body: Statement[] }> = [];
    let elseBranch: Statement[] | undefined;
    let endToken = ifToken;

    // Parse then branch (body after condition until elseif/else/endif)
    skipWhitespaceAndComments(stream);
    
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
            skipWhitespaceAndComments(stream);
            
            // Parse elseif condition
            const elseifCondition = parseConditionExpression(stream, context);
            
            // Parse elseif body
            skipWhitespaceAndComments(stream);
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
            skipWhitespaceAndComments(stream);
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
            while (!stream.isAtEnd() && stream.current()?.kind !== TokenKind.NEWLINE) {
                stream.next();
            }
            if (stream.current()?.kind === TokenKind.NEWLINE) {
                stream.next(); // move to next logical statement
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

    return result;
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
