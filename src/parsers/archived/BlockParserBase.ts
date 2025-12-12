/**
 * Base class for block parsers
 * Provides common dependencies and utilities for parsing block statements (header + body)
 */

import type { Token } from '../classes/Lexer';
import { TokenStream } from '../classes/TokenStream';
import { LexerUtils } from '../utils';
import type { CodePosition, CommentWithPosition, Statement, CommentStatement } from '../types/Ast.type';
import type { AttributePathSegment } from '../utils/types';

export interface BlockParserContext {
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
     * Get the current line number (mutable - advances as parsing progresses)
     */
    getCurrentLine(): number;
    
    /**
     * Advance to the next line
     */
    advanceLine(): void;
    
    /**
     * Get trimmed line at given line number
     */
    getTrimmedLine(lineNumber: number): string;
    
    /**
     * Extract inline comment from line at given line number
     */
    extractInlineCommentFromLine(lineNumber: number): { text: string; position: number } | null;
    
    /**
     * Create code position from start/end line numbers
     */
    createCodePositionFromLines(startRow: number, endRow: number): CodePosition;
    
    /**
     * Create a grouped comment node from comment texts and line numbers
     */
    createGroupedCommentNode(comments: string[], commentLines: number[]): CommentStatement;
    
    /**
     * Parse a single statement from the current line
     * Returns null if the line is empty or not a valid statement
     */
    parseStatement(): Statement | null;
}

/**
 * Shared context for TokenStream-based block parsing
 * Used by OnBlockParser, ScopeParser, and other block parsers that support TokenStream parsing
 */
export interface BlockTokenStreamContext {
    /**
     * All lines in source (for line-based utilities)
     */
    lines: string[];
    
    /**
     * Parse a statement from TokenStream (stub for now - delegates to line-based)
     */
    parseStatementFromTokens?: (stream: TokenStream) => Statement | null;
    
    /**
     * Create code position from tokens
     */
    createCodePositionFromTokens: (startToken: Token, endToken: Token) => CodePosition;
    
    /**
     * Create code position from line range
     */
    createCodePositionFromLines: (startLine: number, endLine: number) => CodePosition;
    
    /**
     * Create grouped comment node
     */
    createGroupedCommentNode: (comments: string[], commentLines: number[]) => CommentStatement;
}

export abstract class BlockParserBase {
    protected readonly context: BlockParserContext;
    
    constructor(context: BlockParserContext) {
        this.context = context;
    }
    
    /**
     * Create an error with line context
     */
    protected createError(message: string): Error {
        const lineNumber = this.context.lineNumber;
        const line = this.context.lines[lineNumber] || '';
        return new Error(`Line ${lineNumber + 1}: ${message}\n  ${line.trim()}`);
    }
    
    /**
     * Create an error from a token with column information
     */
    protected createErrorFromToken(message: string, token: Token | null): Error {
        if (!token) {
            return new Error(message + ' (at end of input)');
        }
        return new Error(`Line ${token.line}, Column ${token.column}: ${message}\n  Near: '${token.text}'`);
    }
    
    /**
     * Extract inline comment from a line (without caching)
     * For cached version, use context.extractInlineCommentFromLine()
     */
    protected extractInlineComment(line: string): { text: string; position: number } | null {
        // Early exit optimization: if there's no # in the line at all, return null
        if (line.indexOf('#') === -1) {
            return null;
        }
        
        let inString: false | '"' | "'" | '`' = false;
        let escaped = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            // Handle string boundaries
            if (!escaped && (char === '"' || char === "'" || char === '`')) {
                if (!inString) {
                    inString = char;
                } else if (char === inString) {
                    inString = false;
                }
                escaped = false;
                continue;
            }
            
            if (inString) {
                escaped = char === '\\' && !escaped;
                continue;
            }
            
            // Check for comment character (not inside string)
            if (char === '#') {
                const commentText = line.slice(i + 1).trim();
                return commentText ? { text: commentText, position: i } : null;
            }
            
            escaped = false;
        }
        
        return null;
    }
    
    /**
     * Extract inline comment at current line (with caching via context)
     */
    protected extractInlineCommentAtLine(lineNumber: number): { text: string; position: number } | null {
        return this.context.extractInlineCommentFromLine(lineNumber);
    }
    
    /**
     * Create a CommentWithPosition from inline comment data
     */
    protected createInlineCommentWithPosition(line: string, commentData: { text: string; position: number }): CommentWithPosition {
        const commentCol = commentData.position;
        const endCol = line.length - 1;
        return {
            text: commentData.text,
            codePos: this.createCodePosition(
                this.context.lineNumber,
                commentCol,
                this.context.lineNumber,
                endCol >= 0 ? endCol : 0
            ),
            inline: true
        };
    }
    
    /**
     * Create a code position
     */
    protected createCodePosition(startRow: number, startCol: number, endRow: number, endCol: number): CodePosition {
        return { startRow, startCol, endRow, endCol };
    }
    
    /**
     * Parse parameter names from tokens (e.g., $a $b $c)
     * Stops at first non-parameter token or before "into"
     */
    protected parseParameterNames(tokens: string[], startIndex: number, endIndex: number): string[] {
        const paramNames: string[] = [];
        
        for (let i = startIndex; i < endIndex; i++) {
            const token = tokens[i];
            
            // Parameter names must be variables (e.g., $a, $b, $c) but not positional params or $ itself
            if (LexerUtils.isVariable(token) && !LexerUtils.isPositionalParam(token) && !LexerUtils.isLastValue(token)) {
                const { name: paramName } = LexerUtils.parseVariablePath(token);
                if (paramName && /^[A-Za-z_][A-Za-z0-9_]*$/.test(paramName)) {
                    paramNames.push(paramName);
                } else {
                    // Invalid parameter name - stop parsing parameters
                    break;
                }
            } else {
                // Not a valid parameter name - stop parsing parameters
                break;
            }
        }
        
        return paramNames;
    }
    
    /**
     * Parse "into $var" target from tokens
     * Returns null if not found or invalid
     */
    protected parseIntoTarget(tokens: string[], startIndex: number = 0): { 
        target: { targetName: string; targetPath?: AttributePathSegment[] } | null;
        intoIndex: number;
    } {
        const intoIndex = tokens.indexOf('into', startIndex);
        
        if (intoIndex < 0 || intoIndex >= tokens.length - 1) {
            return { target: null, intoIndex: -1 };
        }
        
        const varToken = tokens[intoIndex + 1];
        if (LexerUtils.isVariable(varToken)) {
            const { name, path } = LexerUtils.parseVariablePath(varToken);
            return { 
                target: { targetName: name, targetPath: path },
                intoIndex 
            };
        }
        
        return { target: null, intoIndex: -1 };
    }
}
