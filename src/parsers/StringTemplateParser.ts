/**
 * Parser for template strings (backtick strings)
 * Handles variable interpolation, last value, and subexpressions
 * Syntax: `text $variable $(expression) more text`
 */

import { LexerUtils } from '../utils';
import type { Frame } from '../index';
import type { Value } from '../utils/types';

export interface StringTemplateParserContext {
    /**
     * Resolve a variable by name and path
     */
    resolveVariable: (name: string, path?: any[], frameOverride?: Frame) => Value;
    
    /**
     * Get the current frame's last value
     */
    getLastValue: (frameOverride?: Frame) => Value;
    
    /**
     * Execute a subexpression code string
     */
    executeSubexpression: (code: string, frameOverride?: Frame) => Promise<Value>;
}

export class StringTemplateParser {
    /**
     * Evaluate a template string with variable interpolation and subexpressions
     * 
     * @param template - The template string content (without backticks, already unescaped)
     * @param context - Context with methods to resolve variables and execute subexpressions
     * @param frameOverride - Optional frame override for variable resolution
     * @returns The evaluated string
     */
    static async evaluate(
        template: string,
        context: StringTemplateParserContext,
        frameOverride?: Frame
    ): Promise<string> {
        let result = '';
        let i = 0;
        let escaped = false;

        while (i < template.length) {
            const char = template[i];

            if (escaped) {
                // Handle escape sequences
                switch (char) {
                    case 'n': result += '\n'; break;
                    case 't': result += '\t'; break;
                    case 'r': result += '\r'; break;
                    case '\\': result += '\\'; break;
                    case '`': result += '`'; break;
                    case '$': result += '$'; break;
                    case '(': result += '('; break;
                    case ')': result += ')'; break;
                    default: result += char; break;
                }
                escaped = false;
                i++;
                continue;
            }

            if (char === '\\') {
                escaped = true;
                i++;
                continue;
            }

            // Check for $(...) subexpression
            if (char === '$' && i + 1 < template.length && template[i + 1] === '(') {
                // Find the matching closing parenthesis
                let depth = 1;
                let j = i + 2;
                while (j < template.length && depth > 0) {
                    if (template[j] === '\\') {
                        j += 2; // Skip escaped character
                        continue;
                    }
                    if (template[j] === '(') depth++;
                    if (template[j] === ')') depth--;
                    if (depth > 0) j++;
                }

                if (depth === 0) {
                    // Extract and evaluate the subexpression
                    const subexprCode = template.substring(i + 2, j);
                    try {
                        // Execute the subexpression
                        const subexprValue = await context.executeSubexpression(subexprCode, frameOverride);
                        // Convert to string
                        result += StringTemplateParser.valueToString(subexprValue);
                    } catch (error) {
                        // If evaluation fails, keep the original $(...)
                        result += template.substring(i, j + 1);
                    }
                    i = j + 1;
                    continue;
                }
            }

            // Check for $variable or $ (last value)
            // Note: $(...) is handled above, so here we only handle $variable and standalone $
            if (char === '$') {
                // Check if it's just $ (last value) - must be followed by non-identifier char, non-( char, or end
                if (i + 1 >= template.length || (!/[A-Za-z0-9_$]/.test(template[i + 1]) && template[i + 1] !== '(')) {
                    // It's $ (last value)
                    const lastValue = context.getLastValue(frameOverride);
                    result += StringTemplateParser.valueToString(lastValue);
                    i++;
                    continue;
                }

                // It's $variable - find the variable name
                let j = i + 1;
                // Match variable name: $var, $var.property, $var[0], etc.
                // Also handle positional params: $1, $2, etc.
                while (j < template.length) {
                    const nextChar = template[j];
                    // Allow alphanumeric, underscore, dot, brackets for property access
                    if (/[A-Za-z0-9_.\[\]]/.test(nextChar)) {
                        j++;
                    } else {
                        break;
                    }
                }

                const varPath = template.substring(i, j);
                try {
                    const { name, path } = LexerUtils.parseVariablePath(varPath);
                    const value = context.resolveVariable(name, path, frameOverride);
                    result += StringTemplateParser.valueToString(value);
                } catch {
                    // If parsing fails, keep the original $var
                    result += varPath;
                }
                i = j;
                continue;
            }

            result += char;
            i++;
        }

        return result;
    }

    /**
     * Convert a value to string representation
     */
    private static valueToString(value: Value): string {
        if (value === null || value === undefined) {
            return 'null';
        }
        if (typeof value === 'string') {
            return value;
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
            return String(value);
        }
        if (Array.isArray(value)) {
            return JSON.stringify(value);
        }
        if (typeof value === 'object') {
            return JSON.stringify(value);
        }
        return String(value);
    }
}

