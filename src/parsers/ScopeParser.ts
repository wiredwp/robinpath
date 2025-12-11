/**
 * Parser for 'do' block headers
 * Syntax: do [$param1 $param2 ...] [into $var]
 */

import { Lexer, TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { TokenStream } from '../classes/TokenStream';
import { BlockParserBase, type BlockParserContext } from './BlockParserBase';
import type { CommentWithPosition, AttributePathSegment } from '../index';

export interface ScopeHeader {
    /**
     * Parameter names (without $)
     */
    paramNames: string[];
    
    /**
     * Into target (if present)
     */
    intoTarget: { targetName: string; targetPath?: AttributePathSegment[] } | null;
    
    /**
     * Comments attached to the do statement
     */
    comments: CommentWithPosition[];
}

export class ScopeParser extends BlockParserBase {
    constructor(context: BlockParserContext) {
        super(context);
    }
    
    /**
     * Parse the 'do' block header
     * Syntax: do [$param1 $param2 ...] [into $var]
     */
    parseHeader(): ScopeHeader {
        const line = this.context.originalLine.trim();
        
        // Use TokenStream for parsing the header line
        const lineTokens = Lexer.tokenizeFull(line);
        const stream = new TokenStream(lineTokens);
        
        // Expect 'do' keyword
        stream.expect('do', "'do' keyword expected");
        
        // Collect remaining tokens (skip comments and whitespace)
        const remainingTokens: Token[] = [];
        while (!stream.isAtEnd()) {
            const token = stream.next();
            if (token && token.kind !== TokenKind.EOF && token.kind !== TokenKind.COMMENT && token.kind !== TokenKind.NEWLINE) {
                remainingTokens.push(token);
            }
        }
        
        // Convert to string[] for compatibility with existing logic
        const tokens = remainingTokens.map(t => t.text);
        
        // Check for "into $var" after "do" (can be after parameters)
        const { target: intoTarget, intoIndex } = this.parseIntoTarget(tokens);
        const paramEndIndex = intoIndex >= 0 ? intoIndex : tokens.length;
        
        // Parse parameter names (optional): do $a $b or do $a $b into $var
        // Start from token index 0 (after "do"), stop before "into" if present
        const paramNames = this.parseParameterNames(tokens, 0, paramEndIndex);
        
        // Extract inline comment from scope line
        const inlineComment = this.extractInlineComment(this.context.originalLine);
        const comments: CommentWithPosition[] = [];
        if (inlineComment) {
            comments.push(this.createInlineCommentWithPosition(this.context.originalLine, inlineComment));
        }
        
        return { paramNames, intoTarget, comments };
    }
}
