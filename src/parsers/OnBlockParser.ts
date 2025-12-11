/**
 * Parser for 'on' blocks (event handlers)
 * Syntax: on "eventName" ... endon
 * 
 * Supports both:
 * - Line-based parsing (legacy): parseBlock(startLine)
 * - TokenStream-based parsing: parseFromStream(stream, headerToken)
 */

import { Lexer, TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { TokenStream } from '../classes/TokenStream';
import { LexerUtils } from '../utils';
import { BlockParserBase, type BlockParserContext, type BlockTokenStreamContext } from './BlockParserBase';
import type { Statement, CommentWithPosition, OnBlock } from '../index';

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

// Keywords for nested block tracking (reserved for future use)
// const BLOCK_START_KEYWORDS = new Set(['if', 'do', 'with', 'for', 'def', 'together', 'on']);
// const BLOCK_END_KEYWORDS = new Set(['endif', 'enddo', 'endwith', 'endfor', 'enddef', 'endtogether']);

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
    
    /**
     * Parse the complete 'on' block (header + body) - LINE-BASED VERSION
     * Syntax: on "eventName" ... endon
     */
    parseBlock(startLine: number): OnBlock {
        // Parse header
        const header = this.parseHeader();
        const { eventName, comments } = header;
        
        this.context.advanceLine();

        const body: OnBlock['body'] = [];
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
            
            if (bodyTokens[0] === 'endon') {
                this.context.advanceLine();
                closed = true;
                break;
            }
            
            // If we encounter another "on" statement, auto-close the current block
            if (bodyTokens[0] === 'on') {
                // Don't advance currentLine - the next parseOnBlock call will handle it
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
            // Check if there are any more "on" statements after the current position
            // If not, auto-close the block (end of script acts as implicit endon)
            let hasMoreOnStatements = false;
            for (let i = this.context.getCurrentLine(); i < this.context.lines.length; i++) {
                const line = this.context.getTrimmedLine(i);
                if (!line || line.startsWith('#')) {
                    continue; // Skip empty lines and comments
                }
                const tokens = Lexer.tokenize(line);
                if (tokens.length > 0 && tokens[0] === 'on') {
                    hasMoreOnStatements = true;
                    break;
                }
            }
            
            if (!hasMoreOnStatements) {
                // No more "on" statements found - auto-close at end of script
                closed = true;
                // this.currentLine is already at this.lines.length from the while loop
            } else {
                // There are more "on" statements, so endon is required
                throw this.createError('missing endon');
            }
        }

        // Calculate end line: if closed normally, it's the line before endon (currentLine - 1)
        // If auto-closed, it's the last line of the script (this.lines.length - 1)
        const endLine = closed && this.context.getCurrentLine() < this.context.lines.length 
            ? (this.context.getCurrentLine() - 1)  // Normal closure: endon line
            : (this.context.lines.length - 1); // Auto-closure: end of script
        const result: OnBlock = { 
            type: 'onBlock', 
            eventName, 
            body,
            codePos: this.context.createCodePositionFromLines(startLine, endLine)
        };
        if (comments.length > 0) {
            result.comments = comments;
        }
        return result;
    }
    
    // ========================================================================
    // TokenStream-based parsing methods
    // ========================================================================
    
    /**
     * Parse 'on' block from TokenStream - TOKEN-BASED VERSION
     * 
     * @param stream - TokenStream positioned at the 'on' keyword
     * @param headerToken - The 'on' keyword token
     * @param context - Context with helper methods
     * @returns Parsed OnBlock
     */
    static parseFromStream(
        stream: TokenStream,
        headerToken: Token,
        context: BlockTokenStreamContext
    ): OnBlock {
        // 1. Validate precondition: stream should be at 'on'
        if (headerToken.text !== 'on') {
            throw new Error(`parseFromStream expected 'on' keyword, got '${headerToken.text}'`);
        }
        
        // Consume 'on' keyword
        stream.next();
        
        // 2. Parse event name (string literal or identifier)
        // Skip any comments on the same line
        stream.skip(TokenKind.COMMENT);
        
        const eventNameToken = stream.current();
        if (!eventNameToken || eventNameToken.kind === TokenKind.EOF || eventNameToken.kind === TokenKind.NEWLINE) {
            throw new Error(`on block requires an event name at line ${headerToken.line}`);
        }
        
        let eventName: string;
        if (eventNameToken.kind === TokenKind.STRING) {
            eventName = eventNameToken.value ?? LexerUtils.parseString(eventNameToken.text);
        } else if (eventNameToken.kind === TokenKind.IDENTIFIER) {
            eventName = eventNameToken.text;
        } else {
            throw new Error(`on block event name must be a string or identifier at line ${eventNameToken.line}`);
        }
        stream.next(); // consume event name token
        
        // 3. Consume to end of header line (handle inline comments)
        const headerComments: CommentWithPosition[] = [];
        while (!stream.isAtEnd()) {
            const t = stream.current();
            if (!t) break;
            if (t.kind === TokenKind.NEWLINE) {
                stream.next(); // consume NEWLINE, move to first body token
                break;
            }
            if (t.kind === TokenKind.COMMENT) {
                // Capture inline comment on header line
                headerComments.push({
                    text: t.value ?? t.text.replace(/^#\s*/, ''),
                    inline: true,
                    codePos: context.createCodePositionFromTokens(t, t)
                });
            }
            stream.next();
        }
        
        // 4. Parse body tokens until matching 'endon'
        const body: Statement[] = [];
        const bodyStartToken = stream.current() ?? eventNameToken;
        
        // Track nested block depth to avoid stopping on inner 'endon'
        let nestedOnDepth = 0;  // For nested 'on' blocks specifically
        let endToken = bodyStartToken;
        
        while (!stream.isAtEnd()) {
            const t = stream.current();
            if (!t || t.kind === TokenKind.EOF) break;
            
            endToken = t;
            
            // Check for 'endon' at depth 0 - this closes our block
            if (t.kind === TokenKind.KEYWORD && t.text === 'endon' && nestedOnDepth === 0) {
                // Found closing endon for our block
                stream.next(); // consume 'endon'
                
                // Consume everything until end of line after 'endon'
                while (!stream.isAtEnd() && stream.current()?.kind !== TokenKind.NEWLINE) {
                    stream.next();
                }
                if (stream.current()?.kind === TokenKind.NEWLINE) {
                    stream.next(); // move to next logical statement
                }
                break;
            }
            
            // Check for another 'on' keyword - could be nested or auto-close
            if (t.kind === TokenKind.KEYWORD && t.text === 'on') {
                // If we're at depth 0, this is a new top-level 'on' block
                // Auto-close the current block (don't consume the 'on')
                if (nestedOnDepth === 0) {
                    // Auto-close detected - stop here
                    break;
                }
                // Otherwise it's a nested 'on' block
                nestedOnDepth++;
            }
            
            // Track nested 'endon' for nested 'on' blocks
            if (t.kind === TokenKind.KEYWORD && t.text === 'endon' && nestedOnDepth > 0) {
                nestedOnDepth--;
                stream.next();
                continue;
            }
            
            // Skip newlines and comments at the statement boundary
            if (t.kind === TokenKind.NEWLINE) {
                stream.next();
                continue;
            }
            
            if (t.kind === TokenKind.COMMENT) {
                // TODO: Handle standalone comments in body
                // For now, skip them
                stream.next();
                continue;
            }
            
            // Parse statement using context-provided parseStatementFromTokens
            const stmt = context.parseStatementFromTokens?.(stream);
            if (stmt) {
                body.push(stmt);
            } else {
                // If parseStatementFromTokens returns null, ensure progress
                stream.next();
            }
        }
        
        // 5. Build codePos from headerToken to endToken
        const codePos = context.createCodePositionFromTokens(headerToken, endToken);
        
        const result: OnBlock = {
            type: 'onBlock',
            eventName,
            body,
            codePos,
        };
        
        if (headerComments.length > 0) {
            result.comments = headerComments;
        }
        
        return result;
    }
    
}
