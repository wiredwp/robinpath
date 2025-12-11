/**
 * Parser for 'with' blocks (callback blocks)
 * Syntax: with [$param1 $param2 ...] [into $var] ... endwith
 */

import { Lexer } from '../classes/Lexer';
import { BlockParserBase, type BlockParserContext } from './BlockParserBase';
import type { CommentWithPosition, AttributePathSegment, ScopeBlock } from '../index';

export interface WithScopeHeader {
    /**
     * Parameter names (without $)
     */
    paramNames: string[];
    
    /**
     * Into target (if present)
     */
    intoTarget: { targetName: string; targetPath?: AttributePathSegment[] } | null;
    
    /**
     * Comments attached to the with statement
     */
    comments: CommentWithPosition[];
}

export class WithScopeParser extends BlockParserBase {
    /**
     * Whether to ignore "into" on the first line
     * (it might be the command's "into", not the callback's)
     */
    private ignoreIntoOnFirstLine: boolean;
    
    constructor(context: BlockParserContext, ignoreIntoOnFirstLine: boolean = false) {
        super(context);
        this.ignoreIntoOnFirstLine = ignoreIntoOnFirstLine;
    }
    
    /**
     * Parse the 'with' block header
     * Syntax: with [$param1 $param2 ...] [into $var]
     */
    parseHeader(): WithScopeHeader {
        const line = this.context.originalLine.trim();
        const tokens = Lexer.tokenize(line);
        
        // Check for "into $var" after "with" (can be after parameters)
        // But ignore it if ignoreIntoOnFirstLine is true (it's the command's "into", not the callback's)
        const { target: intoTarget, intoIndex } = this.ignoreIntoOnFirstLine 
            ? { target: null, intoIndex: -1 }
            : this.parseIntoTarget(tokens, 1); // Start search from index 1 (after "with")
        const paramEndIndex = intoIndex >= 0 ? intoIndex : tokens.length;
        
        // Parse parameter names (optional): with $a $b or with $a $b into $var
        // Start from token index 1 (after "with"), stop before "into" if present
        const paramNames = this.parseParameterNames(tokens, 1, paramEndIndex);
        
        // Extract inline comment from scope line
        const inlineComment = this.extractInlineComment(this.context.originalLine);
        const comments: CommentWithPosition[] = [];
        if (inlineComment) {
            comments.push(this.createInlineCommentWithPosition(this.context.originalLine, inlineComment));
        }
        
        return { paramNames, intoTarget, comments };
    }
    
    /**
     * Parse the complete 'with' block (header + body)
     * Syntax: with [$param1 $param2 ...] [into $var] ... endwith
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
            
            if (bodyTokens[0] === 'endwith') {
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
            throw this.createError('missing endwith');
        }

        // If parameters are declared, include them in the scope block
        // Note: We use type 'do' to maintain AST compatibility
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
