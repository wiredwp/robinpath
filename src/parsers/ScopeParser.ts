/**
 * Parser for 'do' blocks
 * Syntax: do [$param1 $param2 ...] [into $var] ... enddo
 */

import { Lexer, TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { TokenStream } from '../classes/TokenStream';
import { BlockParserBase, type BlockParserContext } from './BlockParserBase';
import type { CommentWithPosition, AttributePathSegment, ScopeBlock } from '../index';

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
    
    /**
     * Parse the complete 'do' block (header + body)
     * Syntax: do [$param1 $param2 ...] [into $var] ... enddo
     */
    parseBlock(startLine: number): ScopeBlock {
        // Parse header
        const header = this.parseHeader();
        const { paramNames, intoTarget, comments } = header;
        
        this.context.advanceLine();

        const body: ScopeBlock['body'] = [];
        let closed = false;
        let pendingComments: string[] = [];
        const pendingCommentLines: number[] = [];

        while (this.context.getCurrentLine() < this.context.lines.length) {
            const currentLine = this.context.getCurrentLine();
            const originalBodyLine = this.context.lines[currentLine];
            const bodyLine = originalBodyLine.trim();
            
            // Blank line: preserve pending comments (they may be attached to next statement)
            if (!bodyLine) {
                this.context.advanceLine();
                continue;
            }
            
            // Comment line: if we have pending comments, they were separated by blank line, so create comment nodes
            // Then start a new sequence with this comment
            if (bodyLine.startsWith('#')) {
                const commentText = bodyLine.slice(1).trim();
                
                // If we have pending comments, they were separated by blank line from this comment
                // Create comment nodes for them (they won't be attached to a statement)
                // Group consecutive orphaned comments into a single node
                if (pendingComments.length > 0) {
                    body.push(this.context.createGroupedCommentNode(pendingComments, pendingCommentLines));
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                }
                
                // Start new sequence with this comment
                pendingComments.push(commentText);
                pendingCommentLines.push(currentLine);
                this.context.advanceLine();
                continue;
            }

            const bodyTokens = Lexer.tokenize(bodyLine);
            
            if (bodyTokens[0] === 'enddo') {
                this.context.advanceLine();
                closed = true;
                break;
            }

            const stmt = this.context.parseStatement();
            if (stmt) {
                const allComments: string[] = [];
                
                // Consecutive comments above
                if (pendingComments.length > 0) {
                    allComments.push(...pendingComments);
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                }
                
                // Inline comment on same line
                const inlineComment = this.extractInlineCommentAtLine(currentLine);
                if (inlineComment) {
                    allComments.push(inlineComment.text);
                }
                
                if (allComments.length > 0) {
                    (stmt as any).comments = allComments;
                }
                
                body.push(stmt);
            }
        }

        // Handle any remaining pending comments at end of block
        // Group consecutive orphaned comments into a single node
        if (pendingComments.length > 0) {
            body.push(this.context.createGroupedCommentNode(pendingComments, pendingCommentLines));
        }

        if (!closed) {
            throw this.createError('missing enddo');
        }

        // If parameters are declared, include them in the do block
        const endLine = this.context.getCurrentLine() - 1;
        const scopeBlock: ScopeBlock = paramNames.length > 0 
            ? { 
                type: 'do', 
                paramNames, 
                body, 
                into: intoTarget || undefined,
                codePos: this.context.createCodePositionFromLines(startLine, endLine) 
            }
            : { 
                type: 'do', 
                body, 
                into: intoTarget || undefined,
                codePos: this.context.createCodePositionFromLines(startLine, endLine) 
            };
        if (comments.length > 0) {
            scopeBlock.comments = comments;
        }
        
        return scopeBlock;
    }
}
