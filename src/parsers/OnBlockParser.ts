/**
 * Parser for 'on' block headers (event handlers)
 * Syntax: on "eventName"
 */

import { Lexer, TokenKind } from '../classes/Lexer';
import { TokenStream } from '../classes/TokenStream';
import { LexerUtils } from '../utils';
import { BlockParserBase, type BlockParserContext } from './BlockParserBase';
import type { CommentWithPosition } from '../index';

export interface OnBlockHeader {
    /**
     * Event name
     */
    eventName: string;
    
    /**
     * Comments attached to the on statement
     */
    comments: CommentWithPosition[];
}

export class OnBlockParser extends BlockParserBase {
    constructor(context: BlockParserContext) {
        super(context);
    }
    
    /**
     * Parse the 'on' block header
     * Syntax: on "eventName"
     */
    parseHeader(): OnBlockHeader {
        const line = this.context.originalLine.trim();
        
        // Use TokenStream for parsing the header line
        const lineTokens = Lexer.tokenizeFull(line);
        const stream = new TokenStream(lineTokens);
        
        // Expect 'on' keyword
        stream.expect('on', "'on' keyword expected");
        
        // Skip whitespace and comments
        stream.skipNewlines();
        stream.skip(TokenKind.COMMENT);
        
        // Get event name (should be a string or identifier)
        const eventNameToken = stream.next();
        if (!eventNameToken || eventNameToken.kind === TokenKind.EOF) {
            throw this.createError('on block requires an event name');
        }
        
        // Event name can be a string literal or an identifier
        let eventName: string;
        if (eventNameToken.kind === TokenKind.STRING) {
            // String token - remove quotes and unescape
            eventName = eventNameToken.value ?? LexerUtils.parseString(eventNameToken.text);
        } else if (eventNameToken.kind === TokenKind.IDENTIFIER) {
            // Allow unquoted identifiers for convenience
            eventName = eventNameToken.text;
        } else if (LexerUtils.isString(eventNameToken.text)) {
            // Fallback: try to parse as string
            eventName = LexerUtils.parseString(eventNameToken.text);
        } else {
            throw this.createErrorFromToken('on block event name must be a string or identifier', eventNameToken);
        }
        
        // Extract inline comment from on line
        const inlineComment = this.extractInlineComment(this.context.originalLine);
        const comments: CommentWithPosition[] = [];
        if (inlineComment) {
            comments.push(this.createInlineCommentWithPosition(this.context.originalLine, inlineComment));
        }
        
        return { eventName, comments };
    }
}
