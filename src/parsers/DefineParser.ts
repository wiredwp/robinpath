/**
 * Parser for 'def' block headers
 * Syntax: def functionName [$param1 $param2 ...]
 */

import { Lexer } from '../classes/Lexer';
import { BlockParserBase, type BlockParserContext } from './BlockParserBase';
import type { CommentWithPosition } from '../index';

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
}
