/**
 * Parser for break statements
 * Syntax: break
 * 
 * Supports both:
 * - Line-based parsing (legacy): parseStatement()
 * - TokenStream-based parsing: parseFromStream(stream, headerToken, context)
 */

import { Lexer, TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { TokenStream } from '../classes/TokenStream';
import type { BreakStatement, CodePosition } from '../index';

/**
 * Context for TokenStream-based break statement parsing
 */
export interface BreakTokenStreamContext {
    /**
     * Create code position from tokens
     */
    createCodePositionFromTokens: (startToken: Token, endToken: Token) => CodePosition;
    
    /**
     * Create error from token position
     */
    createErrorFromToken(message: string, token: Token | null): Error;
}

export interface BreakParserContext {
    /**
     * Current line content (untrimmed)
     */
    readonly originalLine: string;
    
    /**
     * Current line number (0-based)
     */
    readonly lineNumber: number;
    
    /**
     * All lines in the source (for error reporting)
     */
    readonly lines: string[];
    
    /**
     * Create a code position object
     */
    createCodePosition(startRow: number, startCol: number, endRow: number, endCol: number): CodePosition;
    
    /**
     * Create error from token position
     */
    createErrorFromToken(message: string, token: Token | null): Error;
    
    /**
     * Advance to the next line
     */
    advanceLine(): void;
}

export class BreakParser {
    private readonly context: BreakParserContext;
    
    constructor(context: BreakParserContext) {
        this.context = context;
    }
    
    /**
     * Parse break statement
     * Syntax: break
     */
    parseStatement(): BreakStatement {
        const line = this.context.originalLine.trim();
        
        // Use TokenStream for parsing
        const lineTokens = Lexer.tokenizeFull(line);
        const stream = new TokenStream(lineTokens);
        
        // Expect 'break' keyword
        const breakToken = stream.expect('break', "'break' keyword expected");
        
        // Skip comments and whitespace
        stream.skip(TokenKind.COMMENT);
        stream.skipNewlines();
        
        // Verify no extra tokens (break is a simple statement)
        const nextToken = stream.current();
        if (nextToken && nextToken.kind !== TokenKind.EOF && nextToken.kind !== TokenKind.COMMENT && nextToken.kind !== TokenKind.NEWLINE) {
            throw this.context.createErrorFromToken('break statement should not have any arguments', nextToken);
        }
        
        // Use token position for code position (convert from 1-based to 0-based line)
        this.context.advanceLine();
        
        return { 
            type: 'break', 
            codePos: this.context.createCodePosition(
                breakToken.line - 1, // Convert to 0-based
                breakToken.column,
                breakToken.line - 1,
                breakToken.column + breakToken.text.length
            )
        };
    }
    
    // ========================================================================
    // TokenStream-based parsing methods
    // ========================================================================
    
    /**
     * Parse break statement from TokenStream - TOKEN-BASED VERSION
     * 
     * @param stream - TokenStream positioned at the 'break' keyword
     * @param headerToken - The 'break' keyword token
     * @param context - Context with helper methods
     * @returns Parsed BreakStatement
     */
    static parseFromStream(
        stream: TokenStream,
        headerToken: Token,
        context: BreakTokenStreamContext
    ): BreakStatement {
        // 1. Validate precondition: stream should be at 'break'
        if (headerToken.text !== 'break') {
            throw new Error(`parseFromStream expected 'break' keyword, got '${headerToken.text}'`);
        }
        
        // Consume 'break' keyword
        stream.next();
        
        // 2. Skip comments and whitespace
        stream.skip(TokenKind.COMMENT);
        stream.skipNewlines();
        
        // 3. Verify no extra tokens (break is a simple statement)
        const nextToken = stream.current();
        if (nextToken && nextToken.kind !== TokenKind.EOF && nextToken.kind !== TokenKind.COMMENT && nextToken.kind !== TokenKind.NEWLINE) {
            throw context.createErrorFromToken('break statement should not have any arguments', nextToken);
        }
        
        // 4. Build codePos from headerToken
        const codePos = context.createCodePositionFromTokens(headerToken, headerToken);
        
        return {
            type: 'break',
            codePos
        };
    }
}
