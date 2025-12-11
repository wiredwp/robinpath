/**
 * Parser for 'if' block headers
 * Syntax: if <condition>
 */

import { BlockParserBase, type BlockParserContext } from './BlockParserBase';
import type { CommentWithPosition } from '../index';

export interface IfBlockHeader {
    /**
     * Condition expression as string
     */
    conditionExpr: string;
    
    /**
     * Comments attached to the if statement
     */
    comments: CommentWithPosition[];
}

export class IfBlockParser extends BlockParserBase {
    constructor(context: BlockParserContext) {
        super(context);
    }
    
    /**
     * Parse the 'if' block header
     * Syntax: if <condition>
     */
    parseHeader(): IfBlockHeader {
        const line = this.context.originalLine.trim();
        
        // Extract condition (everything after 'if')
        // Use the original line string to preserve subexpressions $(...)
        const ifIndex = line.indexOf('if');
        if (ifIndex === -1) {
            throw this.createError('if statement must start with "if"');
        }
        
        // Find the position after "if" and any whitespace
        let conditionStart = ifIndex + 2; // "if" is 2 characters
        while (conditionStart < line.length && /\s/.test(line[conditionStart])) {
            conditionStart++;
        }
        const conditionExpr = line.slice(conditionStart).trim();
        
        // Extract inline comment from if line
        const inlineComment = this.extractInlineComment(this.context.originalLine);
        const comments: CommentWithPosition[] = [];
        if (inlineComment) {
            comments.push(this.createInlineCommentWithPosition(this.context.originalLine, inlineComment));
        }
        
        return { conditionExpr, comments };
    }
}
