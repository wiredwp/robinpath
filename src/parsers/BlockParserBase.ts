/**
 * Base class for block header parsers
 * Provides common dependencies and utilities for parsing block statement headers
 */

import type { Token } from '../classes/Lexer';
import { LexerUtils } from '../utils';
import type { CodePosition, CommentWithPosition, AttributePathSegment } from '../index';

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
     * Extract inline comment from a line
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
