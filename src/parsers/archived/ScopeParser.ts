/*
This is old code that is no longer used. It is kept here for reference.
This is a line-based parser.
*/

/**
 * Parser for 'do' blocks
 * Syntax: do [$param1 $param2 ...] [into $var] ... enddo
 * 
 * Uses TokenStream-based parsing: parseFromStream(stream, headerToken, context)
 */

import { Lexer, TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { TokenStream } from '../classes/TokenStream';
import { LexerUtils } from '../utils';
import { BlockParserBase, type BlockParserContext, type BlockTokenStreamContext } from './BlockParserBase';
import type { CommentWithPosition, ScopeBlock, Statement } from '../types/Ast.type';
import type { AttributePathSegment } from '../utils/types';

export interface ScopeHeader {
    /**
     * Parameter names (without $)
     */
    paramNames: string[];
    
    /**
     * Into target (if present)
     */
    intoTarget: { targetName: string; targetPath?: AttributePathSegment[] } | null;
    
    /**
     * Comments attached to the do statement
     */
    comments: CommentWithPosition[];
}


export class ScopeParser extends BlockParserBase {
    constructor(context: BlockParserContext) {
        super(context);
    }
    
    /**
     * Parse the 'do' block header
     * Syntax: do [$param1 $param2 ...] [into $var]
     */
    parseHeader(): ScopeHeader {
        const line = this.context.originalLine.trim();
        
        // Use TokenStream for parsing the header line
        const lineTokens = Lexer.tokenizeFull(line);
        const stream = new TokenStream(lineTokens);
        
        // Expect 'do' keyword
        stream.expect('do', "'do' keyword expected");
        
        // Collect remaining tokens (skip comments and whitespace)
        const remainingTokens: Token[] = [];
        while (!stream.isAtEnd()) {
            const token = stream.next();
            if (token && token.kind !== TokenKind.EOF && token.kind !== TokenKind.COMMENT && token.kind !== TokenKind.NEWLINE) {
                remainingTokens.push(token);
            }
        }
        
        // Convert to string[] for compatibility with existing logic
        const tokens = remainingTokens.map(t => t.text);
        
        // Check for "into $var" after "do" (can be after parameters)
        const { target: intoTarget, intoIndex } = this.parseIntoTarget(tokens);
        const paramEndIndex = intoIndex >= 0 ? intoIndex : tokens.length;
        
        // Parse parameter names (optional): do $a $b or do $a $b into $var
        // Start from token index 0 (after "do"), stop before "into" if present
        const paramNames = this.parseParameterNames(tokens, 0, paramEndIndex);
        
        // Extract inline comment from scope line
        const inlineComment = this.extractInlineComment(this.context.originalLine);
        const comments: CommentWithPosition[] = [];
        if (inlineComment) {
            comments.push(this.createInlineCommentWithPosition(this.context.originalLine, inlineComment));
        }
        
        return { paramNames, intoTarget, comments };
    }
    
    // ========================================================================
    // TokenStream-based parsing methods
    // ========================================================================
    
    /**
     * Parse 'do' block from TokenStream - TOKEN-BASED VERSION
     * 
     * @param stream - TokenStream positioned at the 'do' keyword
     * @param headerToken - The 'do' keyword token
     * @param context - Context with helper methods
     * @returns Parsed ScopeBlock
     */
    static parseFromStream(
        stream: TokenStream,
        headerToken: Token,
        context: BlockTokenStreamContext
    ): ScopeBlock {
        // 1. Validate precondition: stream should be at 'do'
        if (headerToken.text !== 'do') {
            throw new Error(`parseFromStream expected 'do' keyword, got '${headerToken.text}'`);
        }
        
        // Consume 'do' keyword
        stream.next();
        
        // 2. Parse header: parameters and 'into' target
        const paramNames: string[] = [];
        let intoTarget: { targetName: string; targetPath?: AttributePathSegment[] } | null = null;
        const headerComments: CommentWithPosition[] = [];
        
        // Collect tokens until newline
        const headerTokens: Token[] = [];
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
                stream.next();
                continue;
            }
            headerTokens.push(t);
            stream.next();
        }
        
        // Parse parameters and 'into' from header tokens
        const tokenStrings = headerTokens.map(t => t.text);
        
        // Check for "into $var" after "do" (can be after parameters)
        const intoIndex = tokenStrings.indexOf('into');
        const paramEndIndex = intoIndex >= 0 ? intoIndex : tokenStrings.length;
        
        // Parse parameter names (optional): do $a $b or do $a $b into $var
        for (let i = 0; i < paramEndIndex; i++) {
            const token = headerTokens[i];
            if (!token) continue;
            
            // Parameters should be variables (starting with $)
            if (token.kind === TokenKind.VARIABLE) {
                // Parse variable path to get just the name
                const { name } = LexerUtils.parseVariablePath(token.text);
                paramNames.push(name);
            } else if (LexerUtils.isVariable(token.text)) {
                const { name } = LexerUtils.parseVariablePath(token.text);
                paramNames.push(name);
            }
        }
        
        // Parse 'into' target if present
        if (intoIndex >= 0 && intoIndex < tokenStrings.length - 1) {
            const varToken = headerTokens[intoIndex + 1];
            if (varToken && (varToken.kind === TokenKind.VARIABLE || LexerUtils.isVariable(varToken.text))) {
                const { name, path } = LexerUtils.parseVariablePath(varToken.text);
                intoTarget = { targetName: name, targetPath: path };
            }
        }
        
        // 3. Parse body tokens until matching 'enddo'
        const body: Statement[] = [];
        const bodyStartToken = stream.current() ?? headerToken;
        let endToken = bodyStartToken;
        
        while (!stream.isAtEnd()) {
            const t = stream.current();
            if (!t || t.kind === TokenKind.EOF) break;
            
            endToken = t;
            
            // Check for 'enddo' keyword - this closes our block
            if (t.kind === TokenKind.KEYWORD && t.text === 'enddo') {
                // Found closing enddo for our block
                stream.next(); // consume 'enddo'
                
                // Consume everything until end of line after 'enddo'
                while (!stream.isAtEnd() && stream.current()?.kind !== TokenKind.NEWLINE) {
                    stream.next();
                }
                if (stream.current()?.kind === TokenKind.NEWLINE) {
                    stream.next(); // move to next logical statement
                }
                break;
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
        
        // 4. Build codePos from headerToken to endToken
        const codePos = context.createCodePositionFromTokens(headerToken, endToken);
        
        // 5. Build result
        const scopeBlock: ScopeBlock = paramNames.length > 0 
            ? { 
                type: 'do', 
                paramNames, 
                body, 
                into: intoTarget || undefined,
                codePos
            }
            : { 
                type: 'do', 
                body, 
                into: intoTarget || undefined,
                codePos
            };
        
        if (headerComments.length > 0) {
            scopeBlock.comments = headerComments;
        }
        
        return scopeBlock;
    }
    
}
