/**
 * Parser for 'together' block headers
 * Syntax: together
 */

import { Lexer } from '../classes/Lexer';
import { BlockParserBase, type BlockParserContext } from './BlockParserBase';
import type { CommentWithPosition } from '../index';

export interface TogetherBlockHeader {
    /**
     * Comments attached to the together statement
     */
    comments: CommentWithPosition[];
}

export class TogetherBlockParser extends BlockParserBase {
    constructor(context: BlockParserContext) {
        super(context);
    }
    
    /**
     * Parse the 'together' block header
     * Syntax: together
     */
    parseHeader(): TogetherBlockHeader {
        const line = this.context.originalLine.trim();
        const tokens = Lexer.tokenize(line);
        
        // Must start with "together"
        if (tokens[0] !== 'together') {
            throw this.createError('expected together');
        }
        
        // Extract inline comment from together line
        const inlineComment = this.extractInlineComment(this.context.originalLine);
        const comments: CommentWithPosition[] = [];
        if (inlineComment) {
            comments.push(this.createInlineCommentWithPosition(this.context.originalLine, inlineComment));
        }
        
        return { comments };
    }
}
