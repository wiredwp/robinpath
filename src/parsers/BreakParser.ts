/**
 * Parser for break statements
 * Syntax: break
 */

import { Lexer, TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { TokenStream } from '../classes/TokenStream';
import type { BreakStatement, CodePosition } from '../index';

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
}
