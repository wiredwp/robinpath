/**
 * Parser for 'for' loops
 * Syntax: for $var in <expr> ... endfor
 */

import { Lexer } from '../classes/Lexer';
import { LexerUtils } from '../utils';
import { BlockParserBase, type BlockParserContext } from './BlockParserBase';
import type { CommentWithPosition, ForLoop } from '../index';

export interface ForLoopHeader {
    /**
     * Loop variable name (without $)
     */
    varName: string;
    
    /**
     * Iterable expression as string
     */
    iterableExpr: string;
    
    /**
     * Comments attached to the for statement
     */
    comments: CommentWithPosition[];
}

export class ForLoopParser extends BlockParserBase {
    constructor(context: BlockParserContext) {
        super(context);
    }
    
    /**
     * Parse the 'for' loop header
     * Syntax: for $var in <expr>
     */
    parseHeader(): ForLoopHeader {
        const line = this.context.originalLine.trim();
        const tokens = Lexer.tokenize(line);
        
        // Parse: for $var in <expr>
        if (tokens.length < 4) {
            throw this.createError('for loop requires: for $var in <expr>');
        }
        
        if (tokens[0] !== 'for') {
            throw this.createError('expected for keyword');
        }
        
        // Get loop variable
        if (!LexerUtils.isVariable(tokens[1])) {
            throw this.createError('for loop variable must be a variable (e.g., $i, $item)');
        }
        const varName = tokens[1].slice(1); // Remove $
        
        if (tokens[2] !== 'in') {
            throw this.createError("for loop requires 'in' keyword");
        }
        
        // Get iterable expression (everything after 'in')
        const exprTokens = tokens.slice(3);
        const iterableExpr = exprTokens.join(' ');
        
        // Extract inline comment from for line
        const inlineComment = this.extractInlineComment(this.context.originalLine);
        const comments: CommentWithPosition[] = [];
        if (inlineComment) {
            comments.push(this.createInlineCommentWithPosition(this.context.originalLine, inlineComment));
        }
        
        return { varName, iterableExpr, comments };
    }
    
    /**
     * Parse the complete 'for' loop (header + body)
     * Syntax: for $var in <expr> ... endfor
     */
    parseBlock(startLine: number): ForLoop {
        // Parse header
        const header = this.parseHeader();
        const { varName, iterableExpr, comments } = header;
        
        this.context.advanceLine();

        const body: ForLoop['body'] = [];
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
            
            if (bodyTokens[0] === 'endfor') {
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
            throw this.createError('missing endfor');
        }

        const endLine = this.context.getCurrentLine() - 1; // endfor line
        const result: ForLoop = { 
            type: 'forLoop', 
            varName, 
            iterableExpr, 
            body,
            codePos: this.context.createCodePositionFromLines(startLine, endLine)
        };
        if (comments.length > 0) {
            result.comments = comments;
        }
        return result;
    }
}
