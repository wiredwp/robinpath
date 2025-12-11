/**
 * Parser for 'with' block headers (callback blocks)
 * Syntax: with [$param1 $param2 ...] [into $var]
 */

import { Lexer } from '../classes/Lexer';
import { BlockParserBase, type BlockParserContext } from './BlockParserBase';
import type { CommentWithPosition, AttributePathSegment } from '../index';

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
}
