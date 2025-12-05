/**
 * String parsing utilities for RobinPath
 */

import type { AttributePathSegment } from './types';

/**
 * Split a script into logical lines, respecting strings, $() subexpressions, and backslash continuation.
 * Treats ; and \n as line separators, but only at the top level (not inside strings or $()).
 * Handles backslash line continuation: lines ending with \ are joined with the next line.
 */
export function splitIntoLogicalLines(script: string): string[] {
    // First pass: handle backslash continuation by joining lines
    const processedScript = handleBackslashContinuation(script);
    
    const lines: string[] = [];
    let current = '';
    let inString: false | '"' | "'" | '`' = false;
    let subexprDepth = 0;
    let i = 0;

    while (i < processedScript.length) {
        const char = processedScript[i];
        const nextChar = i + 1 < processedScript.length ? processedScript[i + 1] : '';
        const prevChar = i > 0 ? processedScript[i - 1] : '';

        // Handle comments first (only when not inside a string)
        // Comments start with # and continue to end of line
        // We need to preserve comment text for the parser, but skip quote processing inside comments
        if (!inString && char === '#' && subexprDepth === 0) {
            // Find the end of line index first, then add the entire comment section at once
            // This avoids character-by-character string concatenation which is slow
            let commentEnd = i;
            while (commentEnd < processedScript.length && processedScript[commentEnd] !== '\n') {
                commentEnd++;
            }
            // Add the entire comment section (including #) to current in one operation
            current += processedScript.slice(i, commentEnd);
            i = commentEnd;
            // The newline will be processed in the next iteration by the line separator logic
            continue;
        }

        // Handle strings
        if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
            if (!inString) {
                // Start of string
                inString = char;
                current += char;
            } else if (char === inString) {
                // End of string
                inString = false;
                current += char;
            } else {
                // Different quote type inside string
                current += char;
            }
            i++;
            continue;
        }

        if (inString) {
            // Inside string - just copy characters
            current += char;
            i++;
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

        // Handle line separators (only at top level, not inside $())
        if ((char === '\n' && subexprDepth === 0) || (char === ';' && subexprDepth === 0)) {
            // End of logical line
            // Preserve original line with whitespace for codePos calculation
            // Only check if it's blank (all whitespace) for comment attachment logic
            const trimmed = current.trim();
            if (trimmed) {
                lines.push(current); // Preserve original line with leading whitespace
            } else {
                // Preserve blank line as empty string
                lines.push('');
            }
            current = '';
            i++;
            continue;
        }
        
        // If we're inside a subexpression and encounter a newline, preserve it
        if (char === '\n' && subexprDepth > 0) {
            current += char;
            i++;
            continue;
        }

        // Regular character
        current += char;
        i++;
    }

    // Push remaining content
    // Preserve original line with whitespace for codePos calculation
    const trimmed = current.trim();
    if (trimmed) {
        lines.push(current); // Preserve original line with leading whitespace
    } else if (current.length > 0 || lines.length === 0) {
        // Preserve blank line as empty string
        lines.push('');
    }

    // Don't filter out empty lines - they're needed for comment attachment logic
    return lines;
}

/**
 * Handle backslash line continuation.
 * Lines ending with \ are joined with the next line, removing the backslash
 * and replacing the newline + leading whitespace with a single space.
 */
export function handleBackslashContinuation(script: string): string {
    const lines = script.split('\n');
    const result: string[] = [];
    let i = 0;

    while (i < lines.length) {
        let currentLine = lines[i];
        
        // Check if this line ends with a backslash (ignoring trailing whitespace)
        const trimmed = currentLine.trimEnd();
        if (trimmed.endsWith('\\')) {
            // Remove the trailing backslash and any trailing whitespace
            currentLine = trimmed.slice(0, -1).trimEnd();
            
            // Continue joining next lines until we find one that doesn't end in a backslash
            i++;
            while (i < lines.length) {
                const nextLine = lines[i];
                const nextTrimmed = nextLine.trimEnd();
                
                if (nextTrimmed.endsWith('\\')) {
                    // This line continues too - join it and continue
                    currentLine += ' ' + nextTrimmed.slice(0, -1).trimEnd();
                    i++;
                } else {
                    // This line doesn't end with backslash - join it and stop
                    currentLine += ' ' + nextLine.trimStart();
                    i++;
                    break;
                }
            }
            // i has already been incremented to point to the next unprocessed line
        } else {
            // Line doesn't end with backslash - just move to next line
            i++;
        }
        
        result.push(currentLine);
    }

    return result.join('\n');
}

/**
 * Lexer utility functions for token parsing
 */
export class LexerUtils {
    static parseString(token: string): string {
        if ((token.startsWith('"') && token.endsWith('"')) || 
            (token.startsWith("'") && token.endsWith("'")) ||
            (token.startsWith('`') && token.endsWith('`'))) {
            const quote = token[0];
            const unquoted = token.slice(1, -1);
            // Handle escape sequences based on quote type
            if (quote === '"') {
                return unquoted.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            } else if (quote === "'") {
                return unquoted.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
            } else if (quote === '`') {
                return unquoted.replace(/\\`/g, '`').replace(/\\\\/g, '\\');
            }
        }
        return token;
    }

    static isString(token: string): boolean {
        return (token.startsWith('"') && token.endsWith('"')) || 
               (token.startsWith("'") && token.endsWith("'")) ||
               (token.startsWith('`') && token.endsWith('`'));
    }

    static isNumber(token: string): boolean {
        // Match integers and decimal numbers
        return /^-?\d+(\.\d+)?$/.test(token);
    }

    static isInteger(token: string): boolean {
        // Match only integers (no decimal point)
        return /^-?\d+$/.test(token);
    }

    static isVariable(token: string): boolean {
        // Match: 
        // - $var, $var.property, $var[0], $var[0], $var.property.subproperty, etc.
        // - $.property, $[0], $.property[0] (last value with attributes)
        if (!token.startsWith('$')) return false;
        
        // Handle $.property or $[index] (last value with attributes)
        if (token.startsWith('$.') || token.startsWith('$[')) {
            // Validate the rest is valid attribute path
            const rest = token.slice(1); // Remove $
            return /^(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d+\])(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d+\])*$/.test(rest);
        }
        
        // Handle regular variables: $var with optional attributes
        return /^\$[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d+\])*$/.test(token);
    }

    /**
     * Parse attribute access path from a variable token
     * Returns the base variable name and path segments
     * If name is empty string, it means the last value ($) with attributes
     */
    static parseVariablePath(token: string): { name: string; path: AttributePathSegment[] } {
        if (!token.startsWith('$')) {
            throw new Error(`Invalid variable token: ${token}`);
        }

        const name = token.slice(1); // Remove $
        const path: AttributePathSegment[] = [];
        
        // Handle $.property or $[index] (last value with attributes)
        if (name.startsWith('.') || name.startsWith('[')) {
            // This is last value with attributes - base name is empty
            let remaining = name;
            
            // Parse path segments (.property or [index])
            while (remaining.length > 0) {
                if (remaining.startsWith('.')) {
                    // Property access: .propertyName
                    const propMatch = remaining.match(/^\.([A-Za-z_][A-Za-z0-9_]*)/);
                    if (!propMatch) {
                        throw new Error(`Invalid property access: ${remaining}`);
                    }
                    path.push({ type: 'property', name: propMatch[1] });
                    remaining = remaining.slice(propMatch[0].length);
                } else if (remaining.startsWith('[')) {
                    // Array index: [number]
                    const indexMatch = remaining.match(/^\[(\d+)\]/);
                    if (!indexMatch) {
                        throw new Error(`Invalid array index: ${remaining}`);
                    }
                    path.push({ type: 'index', index: parseInt(indexMatch[1], 10) });
                    remaining = remaining.slice(indexMatch[0].length);
                } else {
                    throw new Error(`Unexpected character in variable path: ${remaining}`);
                }
            }
            
            return { name: '', path }; // Empty name means last value
        }
        
        // Handle regular variables: $var with optional attributes
        // Extract base variable name (everything before first . or [)
        const baseMatch = name.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
        if (!baseMatch) {
            throw new Error(`Invalid variable name: ${name}`);
        }
        
        const baseName = baseMatch[1];
        let remaining = name.slice(baseName.length);
        
        // Parse path segments (.property or [index])
        while (remaining.length > 0) {
            if (remaining.startsWith('.')) {
                // Property access: .propertyName
                const propMatch = remaining.match(/^\.([A-Za-z_][A-Za-z0-9_]*)/);
                if (!propMatch) {
                    throw new Error(`Invalid property access: ${remaining}`);
                }
                path.push({ type: 'property', name: propMatch[1] });
                remaining = remaining.slice(propMatch[0].length);
            } else if (remaining.startsWith('[')) {
                // Array index: [number]
                const indexMatch = remaining.match(/^\[(\d+)\]/);
                if (!indexMatch) {
                    throw new Error(`Invalid array index: ${remaining}`);
                }
                path.push({ type: 'index', index: parseInt(indexMatch[1], 10) });
                remaining = remaining.slice(indexMatch[0].length);
            } else {
                throw new Error(`Unexpected character in variable path: ${remaining}`);
            }
        }
        
        return { name: baseName, path };
    }

    static isLastValue(token: string): boolean {
        // Match: $, $.property, $[index]
        return token === '$' || token.startsWith('$.') || token.startsWith('$[');
    }

    static isPositionalParam(token: string): boolean {
        return /^\$[0-9]+$/.test(token);
    }
}

