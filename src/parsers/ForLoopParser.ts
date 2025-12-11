/**
 * Parser for 'for' loop headers
 * Syntax: for $var in <expr>
 */

import { Lexer } from '../classes/Lexer';
import { LexerUtils } from '../utils';
import { BlockParserBase, type BlockParserContext } from './BlockParserBase';
import type { CommentWithPosition } from '../index';

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
}
