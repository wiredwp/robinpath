/**
 * Parser for 'together' blocks
 * Syntax: together ... endtogether
 * Contains multiple 'do' blocks that execute in parallel
 */

import { TokenStream } from '../classes/TokenStream';
import { TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { ScopeParser } from './ScopeParser';
import type { TogetherBlock, ScopeBlock, Statement, CommentWithPosition, CodePosition, DecoratorCall } from '../types/Ast.type';

export interface TogetherBlockParserContext {
    parseStatement: (stream: TokenStream) => Statement | null;
    parseComment: (stream: TokenStream) => Statement | null;
    createCodePosition: (start: Token, end: Token) => CodePosition;
}

/**
 * Parse a 'together' block from TokenStream
 * Expects stream to be positioned at the 'together' keyword
 * 
 * @param stream - TokenStream positioned at the 'together' keyword
 * @param context - Context with helper methods
 * @param decorators - Optional decorators to attach to this together block
 * @returns Parsed TogetherBlock
 */
export function parseTogether(
    stream: TokenStream,
    context: TogetherBlockParserContext,
    decorators?: DecoratorCall[]
): TogetherBlock {
    const togetherToken = stream.current();
    if (!togetherToken || togetherToken.text !== 'together') {
        throw new Error(`parseTogether expected 'together' keyword, got '${togetherToken?.text || 'EOF'}'`);
    }

    const startToken = togetherToken;
    const headerComments: CommentWithPosition[] = [];

    // Consume 'together' keyword
    stream.next();

    // Collect header comments (inline comments on the same line as 'together')
    // Skip whitespace and comments until newline
    while (!stream.isAtEnd()) {
        const token = stream.current();
        if (!token) break;
        
        if (token.kind === TokenKind.NEWLINE) {
            stream.next(); // consume NEWLINE, move to first body token
            break;
        }
        
        if (token.kind === TokenKind.COMMENT) {
            // Capture inline comment on header line
            const commentText = token.value !== undefined ? String(token.value) : token.text.replace(/^#\s*/, '');
            headerComments.push({
                text: commentText,
                inline: true,
                codePos: context.createCodePosition(token, token)
            });
            stream.next();
            continue;
        }
        
        // Skip whitespace
        stream.next();
    }

    // Parse body: only 'do' blocks until 'endtogether'
    const blocks: ScopeBlock[] = [];
    let endToken = startToken;
    let lastIndex = -1;
    let loopCount = 0;

    while (!stream.isAtEnd()) {
        const currentIndex = stream.getPosition();
        if (currentIndex === lastIndex) {
            loopCount++;
            if (loopCount > 100) {
                const token = stream.current();
                throw new Error(`Infinite loop detected in TogetherBlockParser at index ${currentIndex}, token: ${token?.text}`);
            }
        } else {
            lastIndex = currentIndex;
            loopCount = 0;
        }

        const token = stream.current();
        if (!token || token.kind === TokenKind.EOF) break;
        
        endToken = token;
        
        // Check for 'endtogether' keyword - this closes our block
        if (token.kind === TokenKind.KEYWORD && token.text === 'endtogether') {
            stream.next(); // consume 'endtogether'
            
            // Consume everything until end of line after 'endtogether'
            while (!stream.isAtEnd() && stream.current()?.kind !== TokenKind.NEWLINE) {
                stream.next();
            }
            if (stream.current()?.kind === TokenKind.NEWLINE) {
                stream.next(); // move to next logical statement
            }
            break;
        }
        
        // Skip newlines and comments
        if (token.kind === TokenKind.NEWLINE) {
            stream.next();
            continue;
        }
        
        if (token.kind === TokenKind.COMMENT) {
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
                // Comments in together blocks are not attached to the together block itself
                // They're just skipped (or could be attached to the next do block if needed)
            }
            continue;
        }
        
        // Only allow 'do' blocks inside together
        if (token.kind !== TokenKind.KEYWORD || token.text !== 'do') {
            throw new Error(`together block can only contain do blocks at line ${token.line}, column ${token.column}. Found: ${token.text}`);
        }
        
        // Parse the do block using ScopeParser
        // Note: do blocks inside together don't get decorators from the together block
        const doBlock = ScopeParser.parse(
            stream,
            context.parseStatement,
            context.parseComment
        );
        
        if (doBlock.type === 'do') {
            blocks.push(doBlock);
        } else {
            throw new Error(`together block can only contain do blocks at line ${token.line}`);
        }
    }

    // Build codePos from startToken to endToken
    const codePos = context.createCodePosition(startToken, endToken);

    // Build result
    const result: TogetherBlock = {
        type: 'together',
        blocks,
        codePos
    };

    if (headerComments.length > 0) {
        result.comments = headerComments;
    }

    // Attach decorators if provided
    if (decorators && decorators.length > 0) {
        result.decorators = decorators;
    }

    return result;
}

