/**
 * Parser for command calls (both space-separated and parenthesized syntax)
 * Handles: command arg1 arg2, fn(arg1, arg2), module.fn(args)
 */

import { Lexer } from '../classes/Lexer';
import { LexerUtils } from '../utils';
import { ArgumentParser } from './ArgumentParser';
import type { CommandCall, Arg, ScopeBlock, CodePosition, AttributePathSegment } from '../index';

export interface CommandParserContext {
    /**
     * Get current line number
     */
    getCurrentLine(): number;
    
    /**
     * Set current line number
     */
    setCurrentLine(line: number): void;
    
    /**
     * All lines in the source
     */
    readonly lines: string[];
    
    /**
     * Create error with line info
     */
    createError(message: string, lineNumber: number): Error;
    
    /**
     * Create code position from start/end lines
     */
    createCodePositionFromLines(startRow: number, endRow: number): CodePosition;
    
    /**
     * Get trimmed line content
     */
    getTrimmedLine(lineNumber: number): string;
    
    /**
     * Extract subexpression from line
     */
    extractSubexpression(line: string, startPos: number): { code: string; endPos: number };
    
    /**
     * Extract object literal from line
     */
    extractObjectLiteral(line: string, startPos: number): { code: string; endPos: number };
    
    /**
     * Extract array literal from line
     */
    extractArrayLiteral(line: string, startPos: number): { code: string; endPos: number };
    
    /**
     * Extract parenthesized content (handles multi-line)
     */
    extractParenthesizedContent(): string;
    
    /**
     * Parse a 'do' scope block
     */
    parseScope(startLine: number): ScopeBlock;
    
    /**
     * Parse a 'with' scope block
     */
    parseWithScope(startLine: number): ScopeBlock;
}

export class CommandParser {
    private readonly context: CommandParserContext;
    
    constructor(context: CommandParserContext) {
        this.context = context;
    }
    
    /**
     * Parse parenthesized function call: fn(...) or module.fn(...)
     */
    parseParenthesizedCall(tokens: string[], startLine?: number): CommandCall {
        const callStartLine = startLine !== undefined ? startLine : this.context.getCurrentLine();
        // Get function name (handle module.function syntax)
        let name: string;
        if (tokens.length >= 4 && tokens[1] === '.' && tokens[3] === '(') {
            // Module function: math.add(...)
            name = `${tokens[0]}.${tokens[2]}`;
        } else if (tokens.length >= 2 && tokens[1] === '(') {
            // Regular function: fn(...)
            name = tokens[0];
        } else {
            throw this.context.createError('expected ( after function name', this.context.getCurrentLine());
        }

        // Validate function name
        if (LexerUtils.isNumber(name)) {
            throw this.context.createError(`expected command name, got number: ${name}`, this.context.getCurrentLine());
        }
        if (LexerUtils.isString(name)) {
            throw this.context.createError(`expected command name, got string literal: ${name}`, this.context.getCurrentLine());
        }
        if (LexerUtils.isVariable(name) || LexerUtils.isPositionalParam(name)) {
            throw this.context.createError(`expected command name, got variable: ${name}`, this.context.getCurrentLine());
        }
        if (LexerUtils.isLastValue(name)) {
            throw this.context.createError(`expected command name, got last value reference: ${name}`, this.context.getCurrentLine());
        }

        // Extract content inside parentheses (handles multi-line)
        const parenStartLine = this.context.getCurrentLine();
        // Save the original line before extractParenthesizedContent modifies currentLine
        const originalLineAtStart = this.context.lines[parenStartLine];
        const parenContent = this.context.extractParenthesizedContent();
        const parenEndLine = this.context.getCurrentLine() - 1; // extractParenthesizedContent advances currentLine past the closing paren
        
        // Detect if multiline (content spans multiple lines)
        const isMultiline = parenEndLine > parenStartLine;
        
        // Parse arguments from the content
        const { positionalArgs, namedArgs } = ArgumentParser.parseParenthesizedArguments(parenContent);

        // Determine syntax type
        let syntaxType: 'parentheses' | 'named-parentheses' | 'multiline-parentheses';
        const hasNamedArgs = Object.keys(namedArgs).length > 0;
        
        if (isMultiline) {
            syntaxType = 'multiline-parentheses';
        } else if (hasNamedArgs) {
            syntaxType = 'named-parentheses';
        } else {
            syntaxType = 'parentheses';
        }

        // Combine positional args and named args (named args as a special object)
        const args: Arg[] = [...positionalArgs];
        if (hasNamedArgs) {
            args.push({ type: 'namedArgs', args: namedArgs });
        }

        // Check for "into $var" after parenthesized call (on same line as closing paren or next line)
        // For single-line calls, check the original line directly
        let intoInfo: { targetName: string; targetPath?: AttributePathSegment[] } | null = null;
        if (!isMultiline && parenEndLine === parenStartLine) {
            // Single-line call - check the original line directly
            const closingParenIndex = originalLineAtStart.lastIndexOf(')');
            if (closingParenIndex >= 0) {
                const afterParen = originalLineAtStart.slice(closingParenIndex + 1).trim();
                if (afterParen) {
                    const afterTokens = Lexer.tokenize(afterParen);
                    const intoIndex = afterTokens.indexOf('into');
                    if (intoIndex >= 0 && intoIndex < afterTokens.length - 1) {
                        const varToken = afterTokens[intoIndex + 1];
                        if (LexerUtils.isVariable(varToken)) {
                            const { name: varName, path } = LexerUtils.parseVariablePath(varToken);
                            // currentLine is already past this line, so no need to advance
                            intoInfo = { targetName: varName, targetPath: path };
                        }
                    }
                }
            }
        }
        
        // If not found on same line (or multiline), check using helper method
        if (!intoInfo) {
            intoInfo = this.checkForIntoAfterParen(parenEndLine);
        }
        
        // Check if next line is a callback block ("with" or "do")
        let callback: ScopeBlock | undefined = undefined;
        let lookAheadLine = this.context.getCurrentLine();
        
        while (lookAheadLine < this.context.lines.length) {
            const lookAheadLineContent = this.context.getTrimmedLine(lookAheadLine);
            if (!lookAheadLineContent || lookAheadLineContent.startsWith('#')) {
                lookAheadLine++;
                continue;
            }
            
            const lookAheadTokens = Lexer.tokenize(lookAheadLineContent);
            const firstToken = lookAheadTokens.length > 0 ? lookAheadTokens[0] : '';
            
            // Check for "with" block (used for callback syntax)
            if (firstToken === 'with') {
                // Found a "with" block - parse it as callback
                this.context.setCurrentLine(lookAheadLine);
                callback = this.context.parseWithScope(lookAheadLine);
                break;
            } else if (firstToken === 'do') {
                // Found a do block - parse it as callback
                this.context.setCurrentLine(lookAheadLine);
                callback = this.context.parseScope(lookAheadLine);
                break;
            } else {
                // Not a callback block - stop looking
                break;
            }
        }
        
        // Determine the end line of the command
        const endLine = callback ? (this.context.getCurrentLine() - 1) : (intoInfo ? parenEndLine : parenEndLine);
        
        const command: CommandCall = { 
            type: 'command', 
            name, 
            args,
            syntaxType,
            into: intoInfo || undefined,
            callback,
            codePos: this.context.createCodePositionFromLines(callStartLine, endLine)
        };
        
        return command;
    }
    
    /**
     * Check for "into $var" after a parenthesized call
     */
    private checkForIntoAfterParen(parenEndLine: number): { targetName: string; targetPath?: AttributePathSegment[] } | null {
        // Check the line containing the closing paren
        if (parenEndLine >= 0 && parenEndLine < this.context.lines.length) {
            const line = this.context.lines[parenEndLine];
            // Find the closing paren position
            const closingParenIndex = line.lastIndexOf(')');
            if (closingParenIndex >= 0) {
                // Check for "into" after the closing paren on the same line
                const afterParen = line.slice(closingParenIndex + 1);
                if (afterParen.trim()) {
                    const tokens = Lexer.tokenize(afterParen.trim());
                    const intoIndex = tokens.indexOf('into');
                    if (intoIndex >= 0 && intoIndex < tokens.length - 1) {
                        const varToken = tokens[intoIndex + 1];
                        if (LexerUtils.isVariable(varToken)) {
                            const { name, path } = LexerUtils.parseVariablePath(varToken);
                            if (parenEndLine + 1 > this.context.getCurrentLine()) {
                                this.context.setCurrentLine(parenEndLine + 1);
                            }
                            return { targetName: name, targetPath: path };
                        }
                    }
                }
            }
        }
        
        // Check next line if not found on same line
        const nextLineNumber = parenEndLine + 1;
        if (nextLineNumber < this.context.lines.length) {
            const nextLine = this.context.getTrimmedLine(nextLineNumber);
            if (nextLine && !nextLine.startsWith('#')) {
                const tokens = Lexer.tokenize(nextLine);
                // Check if line starts with "into"
                if (tokens.length >= 2 && tokens[0] === 'into' && LexerUtils.isVariable(tokens[1])) {
                    const { name, path } = LexerUtils.parseVariablePath(tokens[1]);
                    // Advance past the "into" line
                    if (nextLineNumber + 1 > this.context.getCurrentLine()) {
                        this.context.setCurrentLine(nextLineNumber + 1);
                    }
                    return { targetName: name, targetPath: path };
                }
            }
        }
        
        return null;
    }
    
    /**
     * Parse command from tokens (space-separated syntax)
     */
    parseCommandFromTokens(tokens: string[], startLine?: number): CommandCall {
        const commandStartLine = startLine !== undefined ? startLine : this.context.getCurrentLine();
        if (tokens.length === 0) {
            throw this.context.createError('empty command', this.context.getCurrentLine());
        }

        // Handle module function calls: math.add -> tokens: ["math", ".", "add"]
        // Combine module name and function name if second token is "."
        let name: string;
        let argStartIndex = 1;
        if (tokens.length >= 3 && tokens[1] === '.') {
            // Validate module name doesn't start with a number
            if (/^\d/.test(tokens[0])) {
                throw this.context.createError(`module name cannot start with a number: ${tokens[0]}`, this.context.getCurrentLine());
            }
            // Validate function name doesn't start with a number
            if (/^\d/.test(tokens[2])) {
                throw this.context.createError(`function name cannot start with a number: ${tokens[2]}`, this.context.getCurrentLine());
            }
            name = `${tokens[0]}.${tokens[2]}`;
            argStartIndex = 3;
        } else {
            name = tokens[0];
            // Validate function name doesn't start with a number
            if (/^\d/.test(name)) {
                throw this.context.createError(`function name cannot start with a number: ${name}`, this.context.getCurrentLine());
            }
        }
        
        // Validate that the first token is not a literal number, string, variable, or last value reference
        if (LexerUtils.isNumber(name)) {
            throw this.context.createError(`expected command name, got number: ${name}`, this.context.getCurrentLine());
        }
        if (LexerUtils.isString(name)) {
            throw this.context.createError(`expected command name, got string literal: ${name}`, this.context.getCurrentLine());
        }
        if (LexerUtils.isVariable(name) || LexerUtils.isPositionalParam(name)) {
            throw this.context.createError(`expected command name, got variable: ${name}`, this.context.getCurrentLine());
        }
        if (LexerUtils.isLastValue(name)) {
            throw this.context.createError(`expected command name, got last value reference: ${name}`, this.context.getCurrentLine());
        }
        
        const positionalArgs: Arg[] = [];
        const namedArgs: Record<string, Arg> = {};
        let currentLineIndex = this.context.getCurrentLine();
        let line = this.context.lines[currentLineIndex];

        // We need to scan the original line to find $(...) subexpressions
        let i = argStartIndex;
        
        // Find the position after the command name in the original line
        let nameEndPos: number;
        if (argStartIndex === 3) {
            // Module function: tokens[0] + "." + tokens[2]
            const moduleToken = tokens[0];
            const modulePos = line.indexOf(moduleToken);
            nameEndPos = modulePos + moduleToken.length + 1 + tokens[2].length;
        } else {
            nameEndPos = line.indexOf(name) + name.length;
        }
        let pos = nameEndPos;
        
        // Skip whitespace after command name
        while (pos < line.length && /\s/.test(line[pos])) {
            pos++;
        }

        while (i < tokens.length || pos < line.length || currentLineIndex < this.context.lines.length) {
            // Update line if we've moved to a new line
            if (currentLineIndex !== this.context.getCurrentLine()) {
                currentLineIndex = this.context.getCurrentLine();
                line = this.context.lines[currentLineIndex];
                pos = 0;
                // Skip whitespace at start of new line
                while (pos < line.length && /\s/.test(line[pos])) {
                    pos++;
                }
            }
            
            // Check if we're at a $( subexpression in the current line
            if (pos < line.length - 1 && line[pos] === '$' && line[pos + 1] === '(') {
                // Extract the subexpression code
                const subexprCode = this.context.extractSubexpression(line, pos);
                positionalArgs.push({ type: 'subexpr', code: subexprCode.code });
                
                // Skip past the $() in the current line
                pos = subexprCode.endPos;
                
                // Skip any tokens that were part of this subexpression
                while (i < tokens.length) {
                    const tokenStart = line.indexOf(tokens[i], pos - 100);
                    if (tokenStart === -1 || tokenStart >= pos) {
                        break;
                    }
                    i++;
                }
                
                // Skip whitespace
                while (pos < line.length && /\s/.test(line[pos])) {
                    pos++;
                }
                continue;
            }

            // Check if we're at an object literal { ... }
            if (pos < line.length && line[pos] === '{') {
                const startLineIndex = this.context.getCurrentLine();
                const objCode = this.context.extractObjectLiteral(line, pos);
                positionalArgs.push({ type: 'object', code: objCode.code });
                
                if (this.context.getCurrentLine() > startLineIndex) {
                    currentLineIndex = this.context.getCurrentLine();
                    line = this.context.lines[currentLineIndex];
                    pos = objCode.endPos;
                    if (pos < line.length && line[pos] === '}') {
                        pos++;
                    }
                    const remainingLine = line.substring(pos).trim();
                    if (remainingLine) {
                        const remainingTokens = Lexer.tokenize(remainingLine);
                        tokens.splice(i, 0, ...remainingTokens);
                    }
                } else {
                    pos = objCode.endPos;
                }
                
                // Skip any tokens that were part of this object
                while (i < tokens.length) {
                    const tokenStart = line.indexOf(tokens[i], Math.max(0, pos - 100));
                    if (tokenStart === -1 || tokenStart >= pos) {
                        break;
                    }
                    i++;
                }
                
                // Skip whitespace
                while (pos < line.length && /\s/.test(line[pos])) {
                    pos++;
                }
                continue;
            }

            // Check if we're at an array literal [ ... ]
            if (pos < line.length && line[pos] === '[') {
                const startLineIndex = this.context.getCurrentLine();
                const arrCode = this.context.extractArrayLiteral(line, pos);
                positionalArgs.push({ type: 'array', code: arrCode.code });
                
                if (this.context.getCurrentLine() > startLineIndex) {
                    currentLineIndex = this.context.getCurrentLine();
                    line = this.context.lines[currentLineIndex];
                    pos = arrCode.endPos;
                    if (pos < line.length && line[pos] === ']') {
                        pos++;
                    }
                    const remainingLine = line.substring(pos).trim();
                    if (remainingLine) {
                        const remainingTokens = Lexer.tokenize(remainingLine);
                        tokens.splice(i, 0, ...remainingTokens);
                    }
                } else {
                    pos = arrCode.endPos;
                }
                
                // Skip any tokens that were part of this array
                while (i < tokens.length) {
                    const tokenStart = line.indexOf(tokens[i], Math.max(0, pos - 100));
                    if (tokenStart === -1 || tokenStart >= pos) {
                        break;
                    }
                    i++;
                }
                
                // Skip whitespace
                while (pos < line.length && /\s/.test(line[pos])) {
                    pos++;
                }
                continue;
            }
            
            // If we've processed all tokens and we're at the end of the current line
            if (i >= tokens.length && pos >= line.length) {
                if (currentLineIndex < this.context.getCurrentLine()) {
                    currentLineIndex = this.context.getCurrentLine();
                    line = this.context.lines[currentLineIndex];
                    pos = 0;
                    const remainingTokens = Lexer.tokenize(line);
                    tokens.push(...remainingTokens);
                    while (pos < line.length && /\s/.test(line[pos])) {
                        pos++;
                    }
                    continue;
                } else {
                    break;
                }
            }
            
            // If we've processed all tokens from the original line but there's more content on current line
            if (i >= tokens.length && pos < line.length) {
                const remainingLine = line.substring(pos).trim();
                if (remainingLine) {
                    const remainingTokens = Lexer.tokenize(remainingLine);
                    tokens.push(...remainingTokens);
                    pos = line.length;
                }
            }
            
            // If we still have no tokens, break
            if (i >= tokens.length) {
                break;
            }
            
            const token = tokens[i];
            
            // Check if this is a module function reference
            let actualToken = token;
            let tokensToSkip = 0;
            if (i + 2 < tokens.length && tokens[i + 1] === '.' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(tokens[i + 2])) {
                if (!/^\d/.test(token) && /^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) {
                    actualToken = `${token}.${tokens[i + 2]}`;
                    tokensToSkip = 2;
                }
            }
            
            // Check if this is a named argument
            let key: string | null = null;
            let valueStr: string | null = null;
            
            const equalsIndex = token.indexOf('=');
            if (equalsIndex > 0 && equalsIndex < token.length - 1 && 
                !token.startsWith('"') && !token.startsWith("'") && !token.startsWith('`')) {
                const beforeEquals = token.substring(0, equalsIndex).trim();
                valueStr = token.substring(equalsIndex + 1).trim();
                
                if (beforeEquals.startsWith('$') && beforeEquals.length > 1) {
                    const paramName = beforeEquals.substring(1);
                    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(paramName)) {
                        key = paramName;
                    }
                }
                else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(beforeEquals)) {
                    key = beforeEquals;
                }
            }
            
            let tokensSkipped = 0;
            if (!key && tokensToSkip === 0 && i + 1 < tokens.length && tokens[i + 1] === '=') {
                if (LexerUtils.isVariable(token)) {
                    const { name: paramName } = LexerUtils.parseVariablePath(token);
                    if (paramName && /^[A-Za-z_][A-Za-z0-9_]*$/.test(paramName)) {
                        key = paramName;
                        if (i + 2 < tokens.length) {
                            valueStr = tokens[i + 2];
                            tokensSkipped = 2;
                        } else {
                            valueStr = '';
                            tokensSkipped = 1;
                        }
                    }
                }
                else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) {
                    key = token;
                    if (i + 2 < tokens.length) {
                        valueStr = tokens[i + 2];
                        tokensSkipped = 2;
                    } else {
                        valueStr = '';
                        tokensSkipped = 1;
                    }
                }
            }
            
            if (key && valueStr !== null) {
                const valueArg = ArgumentParser.parseArgumentValue(valueStr);
                namedArgs[key] = valueArg;
                
                const tokenPos = line.indexOf(token, pos);
                if (tokenPos !== -1) {
                    pos = tokenPos + token.length;
                    while (pos < line.length && /\s/.test(line[pos])) {
                        pos++;
                    }
                }
                if (tokensSkipped > 0) {
                    i += tokensSkipped;
                    continue;
                }
            }
            
            // Parse as positional argument
            let arg: Arg;
            if (actualToken === '$') {
                arg = { type: 'lastValue' };
            } else if (LexerUtils.isVariable(actualToken)) {
                const { name: varName, path } = LexerUtils.parseVariablePath(actualToken);
                arg = { type: 'var', name: varName, path };
            } else if (actualToken === 'true') {
                arg = { type: 'literal', value: true };
            } else if (actualToken === 'false') {
                arg = { type: 'literal', value: false };
            } else if (actualToken === 'null') {
                arg = { type: 'literal', value: null };
            } else if (LexerUtils.isPositionalParam(actualToken)) {
                arg = { type: 'var', name: actualToken.slice(1) };
            } else if (LexerUtils.isString(actualToken)) {
                arg = { type: 'string', value: LexerUtils.parseString(actualToken) };
            } else if (LexerUtils.isNumber(actualToken)) {
                arg = { type: 'number', value: parseFloat(actualToken) };
            } else {
                arg = { type: 'literal', value: actualToken };
            }
            
            positionalArgs.push(arg);
            
            // Advance position in line
            const tokenPos = line.indexOf(token, pos);
            if (tokenPos !== -1) {
                const advanceLength = tokensToSkip > 0 ? 
                    (token.length + 1 + tokens[i + 2].length) : token.length;
                pos = tokenPos + advanceLength;
                while (pos < line.length && /\s/.test(line[pos])) {
                    pos++;
                }
            }
            
            i += 1 + tokensToSkip;
        }

        // Combine positional args and named args
        const args: Arg[] = [...positionalArgs];
        if (Object.keys(namedArgs).length > 0) {
            args.push({ type: 'namedArgs', args: namedArgs });
        }

        // Determine end line
        const endLine = currentLineIndex;
        if (currentLineIndex > this.context.getCurrentLine()) {
            this.context.setCurrentLine(currentLineIndex);
        }
        return { type: 'command', name, args, codePos: this.context.createCodePositionFromLines(commandStartLine, endLine) };
    }
}
