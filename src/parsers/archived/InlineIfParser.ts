/*
This is old code that is no longer used. It is kept here for reference.
This is a line-based parser.
*/

/**
 * Parser for inline if statements
 * Syntax: if <condition> then <command>
 * 
 * Supports both:
 * - Line-based parsing (legacy): parseStatement(startLine)
 * - TokenStream-based parsing: parseFromStream(stream, headerToken, context)
 */

import { Lexer, TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { TokenStream } from '../classes/TokenStream';
import { LexerUtils } from '../utils';
import { ReturnParser } from './ReturnParser';
import type { InlineIf, Statement, CommandCall, CommentWithPosition, CodePosition } from '../types/Ast.type';

/**
 * Context for TokenStream-based inline if statement parsing
 */
export interface InlineIfTokenStreamContext {
    /**
     * All lines in source
     */
    lines: string[];
    
    /**
     * Create code position from tokens
     */
    createCodePositionFromTokens: (startToken: Token, endToken: Token) => CodePosition;
    
    /**
     * Create error with line info
     */
    createError(message: string, lineNumber: number): Error;
    
    /**
     * Extract inline comment from line
     */
    extractInlineComment(line: string, lineNumber?: number): { text: string; position: number } | null;
    
    /**
     * Create inline comment with position
     */
    createInlineCommentWithPosition(line: string, lineNumber: number, comment: { text: string; position: number }): CommentWithPosition;
    
    /**
     * Parse command from tokens
     */
    parseCommandFromTokens(tokens: string[], startLine?: number): CommandCall;
    
    /**
     * Extract subexpression from line
     */
    extractSubexpression(line: string, startPos: number): { code: string; endPos: number };
}

export interface InlineIfParserContext {
    /**
     * Current line number (0-based)
     */
    readonly currentLine: number;
    
    /**
     * All lines in the source
     */
    readonly lines: string[];
    
    /**
     * Advance to the next line
     */
    advanceLine(): void;
    
    /**
     * Create error with line info
     */
    createError(message: string, lineNumber: number): Error;
    
    /**
     * Create code position from start/end lines
     */
    createCodePositionFromLines(startRow: number, endRow: number): CodePosition;
    
    /**
     * Extract inline comment from line
     */
    extractInlineComment(line: string, lineNumber?: number): { text: string; position: number } | null;
    
    /**
     * Create inline comment with position
     */
    createInlineCommentWithPosition(line: string, lineNumber: number, comment: { text: string; position: number }): CommentWithPosition;
    
    /**
     * Parse command from tokens
     */
    parseCommandFromTokens(tokens: string[], startLine?: number): CommandCall;
    
    /**
     * Extract subexpression from line
     */
    extractSubexpression(line: string, startPos: number): { code: string; endPos: number };
}

export class InlineIfParser {
    private readonly context: InlineIfParserContext;
    
    constructor(context: InlineIfParserContext) {
        this.context = context;
    }
    
    /**
     * Parse inline if statement
     * Syntax: if <condition> then <command>
     */
    parseStatement(startLine: number): InlineIf {
        const originalLine = this.context.lines[this.context.currentLine];
        const line = originalLine.trim();
        const tokens = Lexer.tokenize(line);
        
        const thenIndex = tokens.indexOf('then');
        if (thenIndex === -1) {
            throw this.context.createError("inline if requires 'then'", this.context.currentLine);
        }

        const conditionTokens = tokens.slice(1, thenIndex);
        const conditionExpr = conditionTokens.join(' ');
        
        const commandTokens = tokens.slice(thenIndex + 1);
        
        // Check if this is an assignment FIRST, before trying to parse as command
        let finalCommand: Statement;
        if (commandTokens.length >= 3 && LexerUtils.isVariable(commandTokens[0]) && commandTokens[1] === '=') {
            // This is an assignment - parse target with possible attribute path
            const targetVar = commandTokens[0];
            const { name: targetName, path: targetPath } = LexerUtils.parseVariablePath(targetVar);
            const restTokens = commandTokens.slice(2);
            
            // Check if it's a literal value
            if (restTokens.length === 1) {
                const token = restTokens[0];
                if (LexerUtils.isNumber(token)) {
                    const numValue = parseFloat(token);
                    finalCommand = { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: numValue,
                        literalValueType: 'number',
                        codePos: this.context.createCodePositionFromLines(startLine, startLine)
                    };
                } else if (LexerUtils.isString(token)) {
                    const strValue = LexerUtils.parseString(token);
                    finalCommand = { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: strValue,
                        literalValueType: 'string',
                        codePos: this.context.createCodePositionFromLines(startLine, startLine)
                    };
                } else if (token === 'true') {
                    finalCommand = { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: true,
                        literalValueType: 'boolean',
                        codePos: this.context.createCodePositionFromLines(startLine, startLine)
                    };
                } else if (token === 'false') {
                    finalCommand = { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: false,
                        literalValueType: 'boolean',
                        codePos: this.context.createCodePositionFromLines(startLine, startLine)
                    };
                } else if (token === 'null') {
                    finalCommand = { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: null,
                        literalValueType: 'null',
                        codePos: this.context.createCodePositionFromLines(startLine, startLine)
                    };
                } else if (LexerUtils.isVariable(token)) {
                    // Handle variable reference: $a = $b
                    const { name: varName, path: varPath } = LexerUtils.parseVariablePath(token);
                    finalCommand = { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        command: {
                            type: 'command',
                            name: '_var',
                            args: [{ type: 'var', name: varName, path: varPath }],
                            codePos: this.context.createCodePositionFromLines(startLine, startLine)
                        },
                        codePos: this.context.createCodePositionFromLines(startLine, startLine)
                    };
                } else {
                    const cmd = this.context.parseCommandFromTokens(restTokens, startLine);
                    finalCommand = { type: 'assignment', targetName, targetPath, command: cmd, codePos: this.context.createCodePositionFromLines(startLine, startLine) };
                }
            } else {
                const cmd = this.context.parseCommandFromTokens(restTokens, startLine);
                finalCommand = { type: 'assignment', targetName, targetPath, command: cmd, codePos: this.context.createCodePositionFromLines(startLine, startLine) };
            }
        } else {
            // Check if it's a break or return statement
            if (commandTokens.length === 1 && commandTokens[0] === 'break') {
                finalCommand = { type: 'break', codePos: this.context.createCodePositionFromLines(startLine, startLine) };
            } else if (commandTokens.length >= 1 && commandTokens[0] === 'return') {
                // Parse return statement
                const returnValueTokens = commandTokens.slice(1);
                if (returnValueTokens.length === 0) {
                    finalCommand = { type: 'return', codePos: this.context.createCodePositionFromLines(startLine, startLine) };
                } else {
                    // Convert string[] tokens to TokenStream for parseReturnValue
                    const origLine = this.context.lines[startLine];
                    const returnValueLine = origLine.substring(origLine.indexOf('then') + 4).trim();
                    const tokenizedReturnValue = Lexer.tokenizeFull(returnValueLine);
                    const returnValueStream = new TokenStream(tokenizedReturnValue);
                    const returnValue = ReturnParser.parseReturnValueStatic(
                        returnValueStream, 
                        returnValueLine, 
                        (l: string, pos: number) => this.context.extractSubexpression(l, pos)
                    );
                    finalCommand = { type: 'return', value: returnValue, codePos: this.context.createCodePositionFromLines(startLine, startLine) };
                }
            } else {
                // Not an assignment, parse as regular command
                finalCommand = this.context.parseCommandFromTokens(commandTokens, startLine);
            }
        }

        // Extract inline comment from inline if line
        const inlineComment = this.context.extractInlineComment(originalLine, this.context.currentLine);
        const comments: CommentWithPosition[] = [];
        if (inlineComment) {
            comments.push(this.context.createInlineCommentWithPosition(originalLine, this.context.currentLine, inlineComment));
        }

        const endLine = this.context.currentLine;
        this.context.advanceLine();
        const result: InlineIf = { 
            type: 'inlineIf', 
            conditionExpr, 
            command: finalCommand,
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
     * Parse inline if statement from TokenStream - TOKEN-BASED VERSION
     * 
     * @param stream - TokenStream positioned at the 'if' keyword
     * @param headerToken - The 'if' keyword token
     * @param context - Context with helper methods
     * @returns Parsed InlineIf
     */
    static parseFromStream(
        stream: TokenStream,
        headerToken: Token,
        context: InlineIfTokenStreamContext
    ): InlineIf {
        // 1. Validate precondition: stream should be at 'if'
        if (headerToken.text !== 'if') {
            throw new Error(`parseFromStream expected 'if' keyword, got '${headerToken.text}'`);
        }
        
        // Consume 'if' keyword
        stream.next();
        
        // 2. Parse condition expression (everything until 'then')
        const conditionTokens: Token[] = [];
        while (!stream.isAtEnd()) {
            const t = stream.current();
            if (!t) break;
            if (t.kind === TokenKind.KEYWORD && t.text === 'then') {
                break; // Stop at 'then'
            }
            if (t.kind === TokenKind.NEWLINE) {
                throw context.createError("inline if requires 'then'", t.line - 1);
            }
            conditionTokens.push(t);
            stream.next();
        }
        
        if (conditionTokens.length === 0) {
            throw context.createError("inline if requires a condition", headerToken.line - 1);
        }
        
        const conditionExpr = conditionTokens.map(t => t.text).join(' ');
        
        // 3. Expect and consume 'then' keyword
        // Note: expect() already calls next() internally, so we don't need to call next() again
        const thenToken = stream.expect('then', "inline if requires 'then' keyword");
        
        // 4. Parse command after 'then'
        const commandTokens: Token[] = [];
        const headerComments: CommentWithPosition[] = [];
        
        // Collect command tokens (everything after 'then' until NEWLINE)
        while (!stream.isAtEnd()) {
            const t = stream.current();
            if (!t) break;
            if (t.kind === TokenKind.NEWLINE) {
                stream.next(); // consume NEWLINE
                break;
            }
            if (t.kind === TokenKind.COMMENT) {
                // Capture inline comment
                const lineNumber = t.line - 1;
                const line = context.lines[lineNumber] || '';
                const comment = context.extractInlineComment(line, lineNumber);
                if (comment) {
                    headerComments.push(context.createInlineCommentWithPosition(line, lineNumber, comment));
                }
                stream.next();
                continue;
            }
            // Collect all non-comment, non-newline tokens as command tokens
            commandTokens.push(t);
            stream.next();
        }
        
        // 5. Parse the command from tokens
        // Convert tokens to string[] for compatibility with parseCommandFromTokens
        const commandTokenStrings = commandTokens.map(t => t.text);
        const startLine = headerToken.line - 1;
        
        // Validate we have command tokens
        if (commandTokenStrings.length === 0) {
            throw context.createError("inline if requires a command after 'then'", headerToken.line - 1);
        }
        
        // Check if this is an assignment FIRST
        let finalCommand: Statement;
        if (commandTokenStrings.length >= 3 && LexerUtils.isVariable(commandTokenStrings[0]) && commandTokenStrings[1] === '=') {
            // This is an assignment - parse target with possible attribute path
            const targetVar = commandTokenStrings[0];
            const { name: targetName, path: targetPath } = LexerUtils.parseVariablePath(targetVar);
            const restTokens = commandTokenStrings.slice(2);
            
            // Check if it's a literal value
            if (restTokens.length === 1) {
                const token = restTokens[0];
                if (LexerUtils.isNumber(token)) {
                    const numValue = parseFloat(token);
                    finalCommand = { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: numValue,
                        literalValueType: 'number',
                        codePos: context.createCodePositionFromTokens(headerToken, headerToken)
                    };
                } else if (LexerUtils.isString(token)) {
                    const strValue = LexerUtils.parseString(token);
                    finalCommand = { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: strValue,
                        literalValueType: 'string',
                        codePos: context.createCodePositionFromTokens(headerToken, headerToken)
                    };
                } else if (token === 'true') {
                    finalCommand = { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: true,
                        literalValueType: 'boolean',
                        codePos: context.createCodePositionFromTokens(headerToken, headerToken)
                    };
                } else if (token === 'false') {
                    finalCommand = { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: false,
                        literalValueType: 'boolean',
                        codePos: context.createCodePositionFromTokens(headerToken, headerToken)
                    };
                } else if (token === 'null') {
                    finalCommand = { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: null,
                        literalValueType: 'null',
                        codePos: context.createCodePositionFromTokens(headerToken, headerToken)
                    };
                } else if (LexerUtils.isVariable(token)) {
                    // Handle variable reference: $a = $b
                    const { name: varName, path: varPath } = LexerUtils.parseVariablePath(token);
                    finalCommand = { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        command: {
                            type: 'command',
                            name: '_var',
                            args: [{ type: 'var', name: varName, path: varPath }],
                            codePos: context.createCodePositionFromTokens(headerToken, headerToken)
                        },
                        codePos: context.createCodePositionFromTokens(headerToken, headerToken)
                    };
                } else {
                    const cmd = context.parseCommandFromTokens(restTokens, startLine);
                    finalCommand = { type: 'assignment', targetName, targetPath, command: cmd, codePos: context.createCodePositionFromTokens(headerToken, headerToken) };
                }
            } else {
                const cmd = context.parseCommandFromTokens(restTokens, startLine);
                finalCommand = { type: 'assignment', targetName, targetPath, command: cmd, codePos: context.createCodePositionFromTokens(headerToken, headerToken) };
            }
        } else {
            // Check if it's a break or return statement
            if (commandTokenStrings.length === 1 && commandTokenStrings[0] === 'break') {
                finalCommand = { type: 'break', codePos: context.createCodePositionFromTokens(headerToken, headerToken) };
            } else if (commandTokenStrings.length >= 1 && commandTokenStrings[0] === 'return') {
                // Parse return statement
                const returnValueTokens = commandTokenStrings.slice(1);
                if (returnValueTokens.length === 0) {
                    finalCommand = { type: 'return', codePos: context.createCodePositionFromTokens(headerToken, headerToken) };
                } else {
                    // Convert to TokenStream for parseReturnValue
                    const lineNumber = headerToken.line - 1;
                    const line = context.lines[lineNumber] || '';
                    const returnValueLine = line.substring(line.indexOf('then') + 4).trim();
                    const tokenizedReturnValue = Lexer.tokenizeFull(returnValueLine);
                    const returnValueStream = new TokenStream(tokenizedReturnValue);
                    const returnValue = ReturnParser.parseReturnValueStatic(
                        returnValueStream, 
                        returnValueLine, 
                        (l: string, pos: number) => context.extractSubexpression(l, pos)
                    );
                    finalCommand = { type: 'return', value: returnValue, codePos: context.createCodePositionFromTokens(headerToken, headerToken) };
                }
            } else {
                // Not an assignment, parse as regular command
                finalCommand = context.parseCommandFromTokens(commandTokenStrings, startLine);
            }
        }
        
        // 6. Build codePos from headerToken to end of command
        const endToken = commandTokens.length > 0 ? commandTokens[commandTokens.length - 1] : thenToken;
        const codePos = context.createCodePositionFromTokens(headerToken, endToken);
        
        // 7. Build result
        const result: InlineIf = {
            type: 'inlineIf',
            conditionExpr,
            command: finalCommand,
            codePos
        };
        
        if (headerComments.length > 0) {
            result.comments = headerComments;
        }
        
        return result;
    }
}
