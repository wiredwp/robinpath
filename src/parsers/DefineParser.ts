/**
 * Parser for 'def' blocks
 * Syntax: def functionName [$param1 $param2 ...] ... enddef
 */

import { Lexer } from '../classes/Lexer';
import { BlockParserBase, type BlockParserContext } from './BlockParserBase';
import type { CommentWithPosition, DefineFunction } from '../index';

export interface DefineHeader {
    /**
     * Function name
     */
    name: string;
    
    /**
     * Parameter names (without $)
     */
    paramNames: string[];
    
    /**
     * Comments attached to the def statement
     */
    comments: CommentWithPosition[];
}

export class DefineParser extends BlockParserBase {
    constructor(context: BlockParserContext) {
        super(context);
    }
    
    /**
     * Parse the 'def' block header
     * Syntax: def functionName [$param1 $param2 ...]
     */
    parseHeader(): DefineHeader {
        const line = this.context.originalLine.trim();
        const tokens = Lexer.tokenize(line);
        
        if (tokens.length < 2) {
            throw this.createError('def requires a function name');
        }

        const name = tokens[1];
        
        // Parse parameter names (optional): def fn $a $b $c
        // Start from token index 2, no end limit (parse all parameters)
        const paramNames = this.parseParameterNames(tokens, 2, tokens.length);
        
        // Extract inline comment from def line
        const inlineComment = this.extractInlineComment(this.context.originalLine);
        const comments: CommentWithPosition[] = [];
        if (inlineComment) {
            comments.push(this.createInlineCommentWithPosition(this.context.originalLine, inlineComment));
        }
        
        return { name, paramNames, comments };
    }
    
    /**
     * Parse the complete 'def' block (header + body)
     * Syntax: def functionName [$param1 $param2 ...] ... enddef
     */
    parseBlock(startLine: number): DefineFunction {
        // Parse header
        const header = this.parseHeader();
        const { name, paramNames, comments } = header;
        
        this.context.advanceLine();

        const body: DefineFunction['body'] = [];
        let closed = false;
        let pendingComments: string[] = [];
        const pendingCommentLines: number[] = [];
        let hasBlankLineAfterLastComment = false;
        let hasCreatedCommentNodes = false;

        while (this.context.getCurrentLine() < this.context.lines.length) {
            const currentLine = this.context.getCurrentLine();
            const originalBodyLine = this.context.lines[currentLine];
            const bodyLine = originalBodyLine.trim();
            
            // Blank line: mark that blank line appeared after last comment
            if (!bodyLine) {
                hasBlankLineAfterLastComment = true;
                this.context.advanceLine();
                continue;
            }
            
            // Comment line: if we have pending comments with blank line after, create comment nodes
            if (bodyLine.startsWith('#')) {
                const commentText = bodyLine.slice(1).trim();
                
                // If we have pending comments and there was a blank line after them, create comment nodes
                if (pendingComments.length > 0 && hasBlankLineAfterLastComment) {
                    // Group consecutive orphaned comments into a single node
                    body.push(this.context.createGroupedCommentNode(pendingComments, pendingCommentLines));
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                    hasCreatedCommentNodes = true;
                } else if (!hasBlankLineAfterLastComment) {
                    // Consecutive comment (no blank line) - reset flag so they can be attached
                    hasCreatedCommentNodes = false;
                }
                
                // Start new sequence with this comment
                pendingComments.push(commentText);
                pendingCommentLines.push(currentLine);
                hasBlankLineAfterLastComment = false;
                this.context.advanceLine();
                continue;
            }

            const bodyTokens = Lexer.tokenize(bodyLine);
            
            if (bodyTokens[0] === 'enddef') {
                this.context.advanceLine();
                closed = true;
                break;
            }

            const stmt = this.context.parseStatement();
            if (stmt) {
                const allComments: string[] = [];
                
                // If there was a blank line after pending comments, create comment nodes
                if (pendingComments.length > 0 && hasBlankLineAfterLastComment && hasCreatedCommentNodes) {
                    // comment -> blank -> comment -> blank -> statement: all comments become nodes
                    // Group consecutive orphaned comments into a single node
                    body.push(this.context.createGroupedCommentNode(pendingComments, pendingCommentLines));
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                } else if (pendingComments.length > 0 && hasBlankLineAfterLastComment && !hasCreatedCommentNodes) {
                    // comment -> blank -> statement: comment becomes node (not attached)
                    // Group consecutive orphaned comments into a single node
                    body.push(this.context.createGroupedCommentNode(pendingComments, pendingCommentLines));
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                } else if (pendingComments.length > 0) {
                    // No blank line after comments - attach them (consecutive comments)
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
                hasBlankLineAfterLastComment = false;
                hasCreatedCommentNodes = false;
            }
        }

        // Handle any remaining pending comments at end of block
        // Group consecutive orphaned comments into a single node
        if (pendingComments.length > 0) {
            body.push(this.context.createGroupedCommentNode(pendingComments, pendingCommentLines));
        }

        if (!closed) {
            throw this.createError('missing enddef');
        }

        const endLine = this.context.getCurrentLine() - 1; // enddef line
        const result: DefineFunction = { 
            type: 'define', 
            name, 
            paramNames, 
            body,
            codePos: this.context.createCodePositionFromLines(startLine, endLine)
        };
        if (comments.length > 0) {
            result.comments = comments;
        }
        return result;
    }
}
