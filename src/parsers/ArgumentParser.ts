/**
 * Parser for function/command arguments
 * Handles both parenthesized and space-separated argument syntax
 */

import { LexerUtils } from '../utils';
import type { Arg } from '../index';

export class ArgumentParser {
    /**
     * Parse arguments from parenthesized content
     * Handles both positional and named arguments (key=value)
     */
    static parseParenthesizedArguments(content: string): { positionalArgs: Arg[]; namedArgs: Record<string, Arg> } {
        const positionalArgs: Arg[] = [];
        const namedArgs: Record<string, Arg> = {};

        // Optimize: Check length first before trimming
        const trimmedContent = content.trim();
        if (!trimmedContent) {
            return { positionalArgs, namedArgs };
        }

        // Split content into argument tokens
        // Arguments are separated by whitespace (spaces or newlines)
        // But we need to preserve strings and subexpressions
        const argTokens = ArgumentParser.tokenizeParenthesizedArguments(trimmedContent);

        for (let tokenIndex = 0; tokenIndex < argTokens.length; tokenIndex++) {
            const token = argTokens[tokenIndex];
            
            // Check if it's a named argument: key=value or $paramName=value
            // Handle both cases: $a="value" (one token) or $a = "value" (separate tokens)
            let key: string | null = null;
            let valueStr: string | null = null;
            let tokensToSkip = 0;
            
            // Case 1: Check if token contains = (e.g., $a="value" or key="value")
            const equalsIndex = token.indexOf('=');
            if (equalsIndex > 0 && equalsIndex < token.length - 1) {
                const beforeEquals = token.substring(0, equalsIndex).trim();
                valueStr = token.substring(equalsIndex + 1).trim();
                
                // Check for $paramName=value syntax (e.g., $a="value")
                if (beforeEquals.startsWith('$') && beforeEquals.length > 1) {
                    const paramName = beforeEquals.substring(1);
                    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(paramName)) {
                        key = paramName;
                    }
                }
                // Check for key=value syntax (e.g., key="value")
                else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(beforeEquals)) {
                    key = beforeEquals;
                }
            }
            // Case 2: Check if current token is $paramName or key and next token is =
            else if (tokenIndex + 1 < argTokens.length && argTokens[tokenIndex + 1] === '=') {
                // Check for $paramName = value syntax
                if (LexerUtils.isVariable(token)) {
                    const { name: paramName } = LexerUtils.parseVariablePath(token);
                    if (paramName && /^[A-Za-z_][A-Za-z0-9_]*$/.test(paramName)) {
                        key = paramName;
                        // Get the value token (skip =)
                        if (tokenIndex + 2 < argTokens.length) {
                            valueStr = argTokens[tokenIndex + 2];
                            tokensToSkip = 2; // Skip = and value
                        } else {
                            valueStr = '';
                            tokensToSkip = 1; // Skip = only
                        }
                    }
                }
                // Check for key = value syntax (without $)
                else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) {
                    key = token;
                    // Get the value token (skip =)
                    if (tokenIndex + 2 < argTokens.length) {
                        valueStr = argTokens[tokenIndex + 2];
                        tokensToSkip = 2; // Skip = and value
                    } else {
                        valueStr = '';
                        tokensToSkip = 1; // Skip = only
                    }
                }
            }
            
            if (key && valueStr !== null) {
                // This is a named argument
                const valueArg = ArgumentParser.parseArgumentValue(valueStr);
                namedArgs[key] = valueArg;
                tokenIndex += tokensToSkip; // Skip processed tokens
                continue;
            }

            // Positional argument
            const arg = ArgumentParser.parseArgumentValue(token);
            positionalArgs.push(arg);
        }

        return { positionalArgs, namedArgs };
    }

    /**
     * Tokenize arguments from parenthesized content
     * Handles strings, subexpressions, object/array literals, and whitespace separation
     */
    private static tokenizeParenthesizedArguments(content: string): string[] {
        const tokens: string[] = [];
        let current = '';
        let inString: false | '"' | "'" | '`' = false;
        let subexprDepth = 0;
        let braceDepth = 0;
        let bracketDepth = 0;
        let i = 0;

        while (i < content.length) {
            const char = content[i];
            const nextChar = i + 1 < content.length ? content[i + 1] : '';
            const prevChar = i > 0 ? content[i - 1] : '';

            // Handle strings
            if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
                if (!inString) {
                    inString = char;
                } else if (char === inString) {
                    inString = false;
                }
                current += char;
                i++;
                continue;
            }

            if (inString) {
                current += char;
                i++;
                continue;
            }

            // Handle comments (only when not inside a string, subexpression, object, or array)
            // Comments start with # and continue to end of line
            if (char === '#' && subexprDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
                // Skip everything until end of line - optimize by finding newline index first
                const newlineIndex = content.indexOf('\n', i);
                i = newlineIndex >= 0 ? newlineIndex : content.length;
                // The newline will be processed in the next iteration as a separator
                continue;
            }

            // Handle $() subexpressions
            if (char === '$' && nextChar === '(') {
                subexprDepth++;
                current += char;
                i++;
                continue;
            }

            if (char === ')' && subexprDepth > 0) {
                subexprDepth--;
                current += char;
                i++;
                continue;
            }

            // Handle object literals { }
            if (char === '{') {
                braceDepth++;
                current += char;
                i++;
                continue;
            }

            if (char === '}' && braceDepth > 0) {
                braceDepth--;
                current += char;
                i++;
                continue;
            }

            // Handle array literals [ ]
            if (char === '[') {
                bracketDepth++;
                current += char;
                i++;
                continue;
            }

            if (char === ']' && bracketDepth > 0) {
                bracketDepth--;
                current += char;
                i++;
                continue;
            }

            // Handle whitespace, commas, and = (only at top level, not inside $(), {}, or [])
            // Commas are optional separators, = is used for named arguments
            if (((char === ' ' || char === '\n' || char === '\t') || char === ',' || char === '=') && 
                subexprDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
                // Optimize: Only push non-empty tokens
                const trimmed = current.trim();
                if (trimmed) {
                    tokens.push(trimmed);
                }
                current = '';
                // Push = as a separate token for named argument parsing
                if (char === '=') {
                    tokens.push('=');
                }
                i++;
                continue;
            }

            current += char;
            i++;
        }

        // Optimize: Only push non-empty tokens, avoiding filter at the end
        const trimmed = current.trim();
        if (trimmed) {
            tokens.push(trimmed);
        }

        return tokens;
    }

    /**
     * Parse a single argument value (for both positional and named arguments)
     */
    static parseArgumentValue(token: string): Arg {
        // Check if it's exactly $ (last value without attributes)
        if (token === '$') {
            return { type: 'lastValue' };
        }
        
        // Check if it's a variable
        if (LexerUtils.isVariable(token)) {
            const { name, path } = LexerUtils.parseVariablePath(token);
            return { type: 'var', name, path };
        }
        
        // Check if it's a positional param
        if (LexerUtils.isPositionalParam(token)) {
            return { type: 'var', name: token.slice(1) };
        }
        
        // Check if it's a boolean
        if (token === 'true') {
            return { type: 'literal', value: true };
        }
        if (token === 'false') {
            return { type: 'literal', value: false };
        }
        if (token === 'null') {
            return { type: 'literal', value: null };
        }
        
        // Check if it's a string
        if (LexerUtils.isString(token)) {
            return { type: 'string', value: LexerUtils.parseString(token) };
        }
        
        // Check if it's a number
        if (LexerUtils.isNumber(token)) {
            return { type: 'number', value: parseFloat(token) };
        }
        
        // Check if it's a subexpression $(...)
        if (token.startsWith('$(') && token.endsWith(')')) {
            const code = token.slice(2, -1); // Remove $( and )
            return { type: 'subexpr', code };
        }
        
        // Check if it's an object literal {...}
        if (token.startsWith('{') && token.endsWith('}')) {
            const code = token.slice(1, -1); // Remove { and }
            return { type: 'object', code };
        }
        
        // Check if it's an array literal [...]
        if (token.startsWith('[') && token.endsWith(']')) {
            const code = token.slice(1, -1); // Remove [ and ]
            return { type: 'array', code };
        }
        
        // Treat as literal string
        return { type: 'literal', value: token };
    }
}
