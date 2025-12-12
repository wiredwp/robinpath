/**
 * Parser for return statements
 * Syntax: return [value]
 * 
 * Supports both:
 * - Line-based parsing (legacy): parseStatement()
 * - TokenStream-based parsing: parseFromStream(stream, headerToken, context)
 */

import { Lexer, TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { TokenStream } from '../classes/TokenStream';
import { LexerUtils } from '../utils';
import type { ReturnStatement, Arg, CodePosition } from '../types/Ast.type';

/**
 * Context for TokenStream-based return statement parsing
 */
export interface ReturnTokenStreamContext {
    /**
     * All lines in source (for extracting subexpressions)
     */
    lines: string[];
    
    /**
     * Create code position from tokens
     */
    createCodePositionFromTokens: (startToken: Token, endToken: Token) => CodePosition;
    
    /**
     * Create error from token position
     */
    createErrorFromToken(message: string, token: Token | null): Error;
    
    /**
     * Extract subexpression from line at given position
     */
    extractSubexpression(line: string, startPos: number): { code: string; endPos: number };
}

export interface ReturnParserContext {
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
     * Get column positions from line content
     */
    getColumnPositions(lineNumber: number): { startCol: number; endCol: number };
    
    /**
     * Create a code position object
     */
    createCodePosition(startRow: number, startCol: number, endRow: number, endCol: number): CodePosition;
    
    /**
     * Create error from token position
     */
    createErrorFromToken(message: string, token: Token | null): Error;
    
    /**
     * Extract subexpression from line at given position
     */
    extractSubexpression(line: string, startPos: number): { code: string; endPos: number };
    
    /**
     * Advance to the next line
     */
    advanceLine(): void;
}

export class ReturnParser {
    private readonly context: ReturnParserContext;
    
    constructor(context: ReturnParserContext) {
        this.context = context;
    }
    
    /**
     * Parse return statement
     * Syntax: return [value]
     */
    parseStatement(): ReturnStatement {
        const line = this.context.originalLine.trim();
        
        // Use TokenStream for parsing
        const lineTokens = Lexer.tokenizeFull(line);
        const stream = new TokenStream(lineTokens);
        
        // Expect 'return' keyword
        const returnToken = stream.expect('return', "'return' keyword expected");
        
        // Skip comments and whitespace
        stream.skip(TokenKind.COMMENT);
        stream.skipNewlines();
        
        // Parse return value if present
        let value: Arg | undefined;
        
        if (!stream.isAtEnd()) {
            const current = stream.current();
            if (current && current.kind !== TokenKind.EOF && current.kind !== TokenKind.COMMENT && current.kind !== TokenKind.NEWLINE) {
                // There's a value to return - parse it using TokenStream
                value = this.parseReturnValue(stream, line);
            }
        }
        
        this.context.advanceLine();
        
        // Use token position for start, line-based for end (simpler and still accurate)
        const endLine = this.context.lineNumber + 1;
        const endCols = this.context.getColumnPositions(endLine);
        return { 
            type: 'return', 
            value,
            codePos: this.context.createCodePosition(
                returnToken.line - 1, // Convert to 0-based
                returnToken.column,
                endLine,
                endCols.endCol
            )
        };
    }
    
    /**
     * Parse return value using TokenStream
     * Handles various value types including subexpressions $(...)
     */
    private parseReturnValue(stream: TokenStream, line: string): Arg {
        return ReturnParser.parseReturnValueStatic(stream, line, (l: string, pos: number) => this.context.extractSubexpression(l, pos));
    }
    
    /**
     * Static method to parse return value (for use outside of ReturnParser instance)
     * Handles various value types including subexpressions $(...)
     */
    static parseReturnValueStatic(
        stream: TokenStream, 
        line: string, 
        extractSubexpression: (line: string, startPos: number) => { code: string; endPos: number }
    ): Arg {
        if (stream.isAtEnd()) {
            return { type: 'lastValue' };
        }
        
        const currentToken = stream.current();
        if (!currentToken) {
            return { type: 'lastValue' };
        }
        
        // Check if we're at a $( subexpression
        // Subexpressions are not tokenized as a single token, so we check if:
        // 1. Current token is '$' (VARIABLE kind)
        // 2. Next token is '(' (LPAREN kind) OR the next character in line is '('
        const isDollar = currentToken.text === '$' && currentToken.kind === TokenKind.VARIABLE;
        const nextToken = stream.peek(1);
        const isSubexprStart = isDollar && (
            (nextToken && nextToken.kind === TokenKind.LPAREN) ||
            (currentToken.column + 1 < line.length && line[currentToken.column + 1] === '(')
        );
        
        if (isSubexprStart) {
            // Extract subexpression using line-based method (handles nested $() properly)
            const tokenStartPos = currentToken.column;
            const subexprCode = extractSubexpression(line, tokenStartPos);
            
            // Advance stream past the subexpression tokens
            // Consume tokens until we find one that starts at or after endPos
            const endPos = subexprCode.endPos;
            while (!stream.isAtEnd()) {
                const token = stream.current();
                if (!token) break;
                // If token starts at or after endPos, we're done
                if (token.column >= endPos) {
                    break;
                }
                stream.next();
            }
            
            return { type: 'subexpr', code: subexprCode.code };
        }
        
        // Parse single token value
        const token = stream.next()!;
        
        // Check token kind first for better type safety
        if (token.kind === TokenKind.VARIABLE) {
            // Handle $ (last value) or $var, $.property, etc.
            if (token.text === '$') {
                return { type: 'lastValue' };
            }
            const { name, path } = LexerUtils.parseVariablePath(token.text);
            // If name is empty, it means last value with attributes (e.g., $.name)
            if (name === '') {
                return { type: 'var', name: '', path };
            }
            return { type: 'var', name, path };
        } else if (token.kind === TokenKind.BOOLEAN) {
            return { type: 'literal', value: token.value ?? (token.text === 'true') };
        } else if (token.kind === TokenKind.NULL) {
            return { type: 'literal', value: null };
        } else if (token.kind === TokenKind.STRING) {
            return { type: 'string', value: token.value ?? LexerUtils.parseString(token.text) };
        } else if (token.kind === TokenKind.NUMBER) {
            return { type: 'number', value: token.value ?? parseFloat(token.text) };
        } else {
            // Check for positional param ($1, $2, etc.) - these might be tokenized as VARIABLE
            if (LexerUtils.isPositionalParam(token.text)) {
                return { type: 'var', name: token.text.slice(1) };
            }
            // Treat as literal string
            return { type: 'literal', value: token.text };
        }
    }
    
    // ========================================================================
    // TokenStream-based parsing methods
    // ========================================================================
    
    /**
     * Parse return statement from TokenStream - TOKEN-BASED VERSION
     * 
     * @param stream - TokenStream positioned at the 'return' keyword
     * @param headerToken - The 'return' keyword token
     * @param context - Context with helper methods
     * @returns Parsed ReturnStatement
     */
    static parseFromStream(
        stream: TokenStream,
        headerToken: Token,
        context: ReturnTokenStreamContext
    ): ReturnStatement {
        // 1. Validate precondition: stream should be at 'return'
        if (headerToken.text !== 'return') {
            throw new Error(`parseFromStream expected 'return' keyword, got '${headerToken.text}'`);
        }
        
        // Consume 'return' keyword
        stream.next();
        
        // 2. Skip comments and whitespace
        stream.skip(TokenKind.COMMENT);
        stream.skipNewlines();
        
        // 3. Parse return value if present
        let value: Arg | undefined;
        let endToken = headerToken;
        
        if (!stream.isAtEnd()) {
            const current = stream.current();
            if (current && current.kind !== TokenKind.EOF && current.kind !== TokenKind.COMMENT && current.kind !== TokenKind.NEWLINE) {
                // There's a value to return - parse it
                // Get the line for subexpression extraction
                const lineNumber = current.line - 1; // Convert to 0-based
                const line = context.lines[lineNumber] || '';
                
                value = ReturnParser.parseReturnValueStatic(
                    stream,
                    line,
                    (l: string, pos: number) => context.extractSubexpression(l, pos)
                );
                
                // Update endToken to the last token of the return value
                endToken = stream.current() ?? current;
            }
        }
        
        // 4. Build codePos from headerToken to endToken
        const codePos = context.createCodePositionFromTokens(headerToken, endToken);
        
        return {
            type: 'return',
            value,
            codePos
        };
    }
}
