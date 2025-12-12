/**
 * Utility for formatting errors with code context
 * Uses TokenStream and CodePosition to provide detailed error messages
 */

import type { CodePosition } from '../types/Ast.type';
import type { Token } from '../classes/Lexer';

export interface ErrorContext {
    codePos?: CodePosition;
    code?: string; // Original source code
    token?: Token; // Token where error occurred
    message: string; // Error message
}

/**
 * Extract position from JSON5 error message (e.g., "invalid character '$' at 1:6")
 * Returns { line, column } or null if not found
 */
function extractPositionFromJSON5Error(errorMsg: string): { line: number; column: number } | null {
    // JSON5 errors often have format: "invalid character 'X' at LINE:COL"
    const match = errorMsg.match(/at\s+(\d+):(\d+)/);
    if (match) {
        return {
            line: parseInt(match[1], 10),
            column: parseInt(match[2], 10)
        };
    }
    return null;
}

/**
 * Format an error message with code context
 * 
 * @param context - Error context with position and code information
 * @returns Formatted error message with code snippet
 */
export function formatErrorWithContext(context: ErrorContext): string {
    const { codePos, code, token, message } = context;
    
    // Try to extract position from JSON5 error messages
    let json5Pos = extractPositionFromJSON5Error(message);
    
    // Determine position information
    let line = -1;
    let column = -1;
    
    if (codePos) {
        line = codePos.startRow + 1; // Convert to 1-based for display
        
        // If JSON5 error has a more specific position, use it (relative to codePos)
        // JSON5 error "at 1:6" means line 1, column 6 in the JSON5 string we're parsing
        // We wrap the code as `{interpolatedCode}`, so:
        // - JSON5 column 1 = the opening `{` (which is at codePos.startCol in source, 0-based)
        // - JSON5 column 2+ = the code content
        // Since codePos.startCol is 0-based and JSON5 column is 1-based:
        // sourceColumn (1-based) = codePos.startCol (0-based) + 1 + (json5Pos.column - 1)
        // = codePos.startCol + json5Pos.column
        if (json5Pos) {
            // JSON5 positions are 1-based, codePos.startCol is 0-based
            // Convert both to 1-based: (codePos.startCol + 1) + (json5Pos.column - 1)
            column = codePos.startCol + json5Pos.column;
        } else {
            column = codePos.startCol + 1; // Convert to 1-based for display
        }
    } else if (token) {
        line = token.line;
        column = token.column + 1; // Convert to 1-based for display
    } else if (json5Pos) {
        // Use JSON5 position if we have it but no codePos
        line = json5Pos.line;
        column = json5Pos.column;
    }
    
    // Build base error message
    let errorMsg = message;
    
    // Add position information
    if (line >= 0) {
        if (column >= 0) {
            errorMsg += `\n  at line ${line}, column ${column}`;
        } else {
            errorMsg += `\n  at line ${line}`;
        }
    }
    
    // Add code context if we have source code
    if (code && line >= 0) {
        const lines = code.split('\n');
        const lineIndex = line - 1; // Convert back to 0-based
        
        if (lineIndex >= 0 && lineIndex < lines.length) {
            const errorLine = lines[lineIndex];
            errorMsg += `\n\n  ${errorLine}`;
            
            // Add caret pointing to the error position
            if (column >= 0) {
                const caretPos = Math.max(0, column - 1); // Convert back to 0-based
                const caret = ' '.repeat(Math.min(caretPos, errorLine.length)) + '^';
                errorMsg += `\n  ${caret}`;
            }
            
            // Add surrounding lines for context (2 lines before and after)
            const contextLines: string[] = [];
            for (let i = Math.max(0, lineIndex - 2); i < Math.min(lines.length, lineIndex + 3); i++) {
                const lineNum = (i + 1).toString().padStart(3, ' ');
                const marker = i === lineIndex ? '>' : ' ';
                contextLines.push(`  ${marker}${lineNum} | ${lines[i]}`);
            }
            
            if (contextLines.length > 0) {
                errorMsg += '\n\nContext:\n' + contextLines.join('\n');
            }
        }
    }
    
    return errorMsg;
}

/**
 * Create an error with code context
 * 
 * @param context - Error context
 * @returns Error object with formatted message
 */
export function createErrorWithContext(context: ErrorContext): Error {
    const formattedMessage = formatErrorWithContext(context);
    const error = new Error(formattedMessage);
    // Store the original message separately so stack traces don't duplicate it
    // The stack will still show it, but we can check for it in error handlers
    (error as any).__formattedMessage = formattedMessage;
    return error;
}
