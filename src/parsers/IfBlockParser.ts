/**
 * Parser for if blocks and inline if statements
 * Handles: if condition then command, if condition ... endif, elseif, else
 */

import { TokenStream } from '../classes/TokenStream';
import { TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { parseExpression } from './ExpressionParser';
import type { IfBlock, InlineIf, Statement, CodePosition, Expression, DecoratorCall, CommentWithPosition } from '../types/Ast.type';
import { CommentParser } from './CommentParser';

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
    // Don't skip comments here - we want to parse them in the thenBranch
    // Only skip whitespace, not comments
    while (!stream.isAtEnd() && stream.current()?.kind === TokenKind.NEWLINE) {
        stream.next();
    }
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
            return parseIfBlock(stream, ifToken, condition, context, decorators, true); // hasThen = true
        } else {
            // Inline if: if condition then command [else command]
        return parseInlineIf(stream, ifToken, condition, context);
        }
    } else {
        // If block: if condition ... endif
        return parseIfBlock(stream, ifToken, condition, context, decorators, false); // hasThen = false
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
 * 
 * Important: Inline if statements MUST be on a single line.
 * We stop parsing at the first NEWLINE to avoid consuming subsequent lines.
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
    const inlineIfLine = thenToken.line; // The line this inline if is on
    stream.next();
    
    // Skip whitespace but NOT newlines - inline if must be on one line
    while (!stream.isAtEnd() && stream.current()?.kind === TokenKind.COMMENT) {
        const commentToken = stream.current();
        // Only skip comments on the same line
        if (commentToken && commentToken.line !== inlineIfLine) break;
        stream.next();
    }

    // Check if we've hit a newline before the command - that's an error
    if (stream.current()?.kind === TokenKind.NEWLINE) {
        throw new Error(`Expected command after 'then' on the same line at line ${thenToken.line}`);
    }

    // Parse the command statement - but we need to be careful not to go past this line
    // Save the position to track how far the statement parsing goes
    const command = context.parseStatement(stream);
    if (!command) {
        throw new Error(`Expected command after 'then' at line ${thenToken.line}`);
    }

    // Verify the parsed command didn't extend past this line
    // If it did, that's a parser bug in the underlying statement parser
    // For now, we'll track the end position properly
    let endToken = stream.current() || thenToken;
    
    // Check for optional 'else' clause - but only on the same line
    // First, skip any tokens until we hit newline or 'else'
    while (!stream.isAtEnd()) {
        const currentToken = stream.current();
        if (!currentToken) break;
        
        // Stop at newline - inline if ends here
        if (currentToken.kind === TokenKind.NEWLINE) {
            break;
        }
        
        // Found 'else' on the same line
        if (currentToken.kind === TokenKind.KEYWORD && currentToken.text === 'else') {
            break;
        }
        
        // Skip other tokens (like trailing whitespace or comments on the same line)
        if (currentToken.kind === TokenKind.COMMENT && currentToken.line === inlineIfLine) {
            stream.next();
            continue;
        }
        
        break;
    }
    
    const nextToken = stream.current();
    let elseCommand: Statement | undefined;

    if (nextToken && nextToken.kind === TokenKind.KEYWORD && nextToken.text === 'else' && nextToken.line === inlineIfLine) {
        // Consume 'else' keyword
        stream.next();
        
        // Skip whitespace but NOT newlines
        while (!stream.isAtEnd() && stream.current()?.kind === TokenKind.COMMENT) {
            const commentToken = stream.current();
            if (commentToken && commentToken.line !== inlineIfLine) break;
            stream.next();
        }

        // Parse the else command statement
        const parsedElseCommand = context.parseStatement(stream);
        if (!parsedElseCommand) {
            throw new Error(`Expected command after 'else' at line ${nextToken.line}`);
        }
        elseCommand = parsedElseCommand;
        endToken = stream.current() || nextToken;
    }

    // Consume the newline at the end of the inline if (if present)
    if (stream.current()?.kind === TokenKind.NEWLINE) {
        endToken = stream.current()!;
        stream.next();
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
    decorators?: DecoratorCall[],
    hasThen?: boolean
): IfBlock {
    const thenBranch: Statement[] = [];
    const elseifBranches: Array<{ condition: Expression; body: Statement[] }> = [];
    let elseBranch: Statement[] | undefined;
    let endToken = ifToken;
    const usedThenKeyword = hasThen === true;

    // Parse then branch (body after condition until elseif/else/endif)
    // Don't skip comments here - we want to parse them and attach to statements
    
    // If there's a newline, we're in block mode
    // Otherwise, it might be a single-line if block
    const hasNewline = stream.current()?.kind === TokenKind.NEWLINE;
    if (hasNewline) {
        stream.next(); // consume newline
    }

    // Parse statements until we hit elseif, else, or endif
    let pendingComments: CommentWithPosition[] = []; // Comments to attach to next statement
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
                    // Parse comment statement
                    const commentBeforeParse = stream.getPosition();
                    const comment = context.parseComment(stream);
                    const commentAfterParse = stream.getPosition();
                    
                    // Ensure stream position advanced (parseComment should consume the comment token)
                    const stillOnComment = stream.current()?.kind === TokenKind.COMMENT;
                    if (commentAfterParse === commentBeforeParse || stillOnComment) {
                        stream.next(); // Manually advance if parseComment didn't
                    }
                    
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
                    // Parse comment statement
                    const commentBeforeParse = stream.getPosition();
                    const comment = context.parseComment(stream);
                    const commentAfterParse = stream.getPosition();
                    
                    // Ensure stream position advanced (parseComment should consume the comment token)
                    const stillOnComment = stream.current()?.kind === TokenKind.COMMENT;
                    if (commentAfterParse === commentBeforeParse || stillOnComment) {
                        stream.next(); // Manually advance if parseComment didn't
                    }
                    
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
                    thenBranch.push({
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
            // If not a blank line, continue - pending comments will be attached to next statement
            continue;
        }
        
        if (token.kind === TokenKind.COMMENT) {
            // Parse comment directly from token - collect it for potential attachment to next statement
            const commentText = token.text.startsWith('#') 
                ? token.text.slice(1).trim() 
                : token.text.trim();
            
            const commentCodePos: CodePosition = {
                startRow: token.line - 1,
                startCol: token.column,
                endRow: token.line - 1,
                endCol: token.column + token.text.length - 1
            };
            
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
        
        const stmt = context.parseStatement(stream);
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
    
    // Handle any remaining pending comments at end of then branch (make them orphaned)
    if (pendingComments.length > 0) {
        const groupedText = pendingComments.map(c => c.text).join('\n');
        const groupedCodePos: CodePosition = {
            startRow: pendingComments[0].codePos.startRow,
            startCol: pendingComments[0].codePos.startCol,
            endRow: pendingComments[pendingComments.length - 1].codePos.endRow,
            endCol: pendingComments[pendingComments.length - 1].codePos.endCol
        };
        thenBranch.push({
            type: 'comment',
            comments: [{
                text: groupedText,
                codePos: groupedCodePos,
                inline: false
            }],
            lineNumber: pendingComments[0].codePos.startRow
        });
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

    // Track if 'then' keyword was used (for code generation)
    if (usedThenKeyword) {
        (result as any).hasThen = true;
    }

    return result;
}

