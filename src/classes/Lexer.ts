/**
 * Lexer class for tokenizing RobinPath code
 */

// ============================================================================
// Token Types
// ============================================================================

/**
 * Token kinds for RobinPath language
 * Using const object instead of enum for better compatibility
 */
export const TokenKind = {
    // Literals
    STRING: 'STRING',           // "hello", 'world', `template`
    NUMBER: 'NUMBER',           // 42, 3.14, -10
    BOOLEAN: 'BOOLEAN',         // true, false
    NULL: 'NULL',               // null
    
    // Identifiers and Variables
    IDENTIFIER: 'IDENTIFIER',   // funcName, moduleName
    VARIABLE: 'VARIABLE',       // $var, $arr[0], $obj.prop
    KEYWORD: 'KEYWORD',         // if, else, def, do, for, etc.
    
    // Operators
    ASSIGN: 'ASSIGN',           // =
    PLUS: 'PLUS',               // +
    MINUS: 'MINUS',             // -
    MULTIPLY: 'MULTIPLY',       // *
    DIVIDE: 'DIVIDE',           // /
    MODULO: 'MODULO',           // %
    
    // Comparison Operators
    EQ: 'EQ',                   // ==
    NE: 'NE',                   // !=
    GT: 'GT',                   // >
    LT: 'LT',                   // <
    GTE: 'GTE',                 // >=
    LTE: 'LTE',                 // <=
    
    // Logical Operators
    AND: 'AND',                 // &&
    OR: 'OR',                   // ||
    NOT: 'NOT',                 // !
    
    // Punctuation
    LPAREN: 'LPAREN',           // (
    RPAREN: 'RPAREN',           // )
    LBRACKET: 'LBRACKET',       // [
    RBRACKET: 'RBRACKET',       // ]
    LBRACE: 'LBRACE',           // {
    RBRACE: 'RBRACE',           // }
    COMMA: 'COMMA',             // ,
    COLON: 'COLON',             // :
    DOT: 'DOT',                 // .
    
    // Special
    DECORATOR: 'DECORATOR',     // @decorator
    COMMENT: 'COMMENT',         // # comment
    NEWLINE: 'NEWLINE',         // \n
    EOF: 'EOF',                 // End of file
    SUBEXPRESSION_OPEN: 'SUBEXPRESSION_OPEN', // $( - opening of subexpression
    
    // Future: INDENT/DEDENT if we need Python-style indentation
    // INDENT: 'INDENT',
    // DEDENT: 'DEDENT',
} as const;

export type TokenKind = typeof TokenKind[keyof typeof TokenKind];

/**
 * List of RobinPath keywords
 */
export const KEYWORDS = new Set([
    'if', 'else', 'elseif', 'endif', 'then',
    'do', 'enddo', 'with', 'endwith',
    'def', 'enddef',
    'for', 'endfor', 'in',
    'on', 'endon',
    'return', 'break', 'continue',
    'together', 'endtogether',
    'into',
    'var', 'const',
    'log',
    'true', 'false',
    'null',
    'repeat',
    'iftrue', 'iffalse',
    'not', 'and', 'or',
]);

/**
 * A single token in the source code
 */
export interface Token {
    kind: TokenKind;
    text: string;           // Original text from source
    line: number;           // 1-based line number
    column: number;         // 0-based column offset
    value?: any;            // Parsed value for literals (number, boolean, string content)
}

/**
 * Position information for error reporting
 */
export interface SourcePosition {
    line: number;
    column: number;
}

// ============================================================================
// Lexer Implementation
// ============================================================================

export class Lexer {
    /**
     * Tokenize entire source code into Token objects
     * This is the new token-stream based approach
     * 
     * @param source - Full source code (multi-line)
     * @returns Array of tokens with position information
     */
    static tokenizeFull(source: string): Token[] {
        const tokens: Token[] = [];
        let line = 1;
        let column = 0;
        let i = 0;
        
        // Helper to create a token
        const makeToken = (kind: TokenKind, text: string, startLine: number, startCol: number, value?: any): Token => {
            return { kind, text, line: startLine, column: startCol, value };
        };
        
        // Helper to check if character is whitespace (excluding newline)
        const isWhitespace = (char: string): boolean => {
            return char === ' ' || char === '\t' || char === '\r';
        };
        
        // Helper to check if character is digit
        const isDigit = (char: string): boolean => {
            return char >= '0' && char <= '9';
        };
        
        // Helper to check if character is alpha or underscore
        const isAlpha = (char: string): boolean => {
            return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_';
        };
        
        // Helper to check if character is alphanumeric
        const isAlphaNumeric = (char: string): boolean => {
            return isAlpha(char) || isDigit(char);
        };
        
        while (i < source.length) {
            const char = source[i];
            const nextChar = i + 1 < source.length ? source[i + 1] : '';
            
            // Handle backslash line continuation: \ followed by optional whitespace and newline
            // The \ and newline are cancelled (treated as if they don't exist)
            // The \ itself is treated as a space, so we skip it and the newline
            if (char === '\\') {
                // Look ahead to see if this is a line continuation
                let lookAhead = i + 1;
                
                // Skip whitespace after backslash
                while (lookAhead < source.length && isWhitespace(source[lookAhead])) {
                    lookAhead++;
                }
                
                // Check if next non-whitespace is newline
                if (lookAhead < source.length && source[lookAhead] === '\n') {
                    // This is a line continuation: skip the \, whitespace, and newline
                    // The \ is treated as a space, so we just skip everything
                    // (spaces are normally skipped anyway, so no token is emitted)
                    i = lookAhead + 1; // Skip past newline
                    line++;
                    column = 0;
                    continue;
                }
                // If not a line continuation, fall through to handle as regular character
                // (though \ shouldn't normally appear outside strings)
            }
            
            // Handle newlines
            if (char === '\n') {
                tokens.push(makeToken(TokenKind.NEWLINE, '\n', line, column));
                i++;
                line++;
                column = 0;
                continue;
            }
            
            // Handle whitespace (space, tab, carriage return)
            if (isWhitespace(char)) {
                i++;
                column++;
                continue;
            }
            
            // Handle comments (# to end of line)
            if (char === '#') {
                const commentStartCol = column;
                i++; // skip #
                column++;
                
                // Read until end of line
                let commentText = '';
                while (i < source.length && source[i] !== '\n') {
                    commentText += source[i];
                    i++;
                    column++;
                }
                
                tokens.push(makeToken(TokenKind.COMMENT, '#' + commentText, line, commentStartCol, commentText.trim()));
                continue;
            }
            
            // Handle strings (", ', `)
            if (char === '"' || char === "'" || char === '`') {
                const stringStartCol = column;
                const quoteChar = char;
                let stringContent = '';
                i++; // skip opening quote
                column++;
                
                let escaped = false;
                while (i < source.length) {
                    const c = source[i];
                    
                    if (escaped) {
                        // Handle escape sequences
                        // For template strings (backticks), preserve \$ and \( and \) for StringTemplateParser
                        // by keeping the backslash in the string content
                        if (quoteChar === '`') {
                            switch (c) {
                                case 'n': stringContent += '\n'; break;
                                case 't': stringContent += '\t'; break;
                                case 'r': stringContent += '\r'; break;
                                case '\\': stringContent += '\\'; break;
                                case '`': stringContent += '`'; break;
                                case '$': 
                                    // Preserve \$ for template parser - add backslash + dollar
                                    stringContent += '\\$'; 
                                    break;
                                case '(': 
                                    // Preserve \( for template parser - add backslash + paren
                                    stringContent += '\\('; 
                                    break;
                                case ')': 
                                    // Preserve \) for template parser - add backslash + paren
                                    stringContent += '\\)'; 
                                    break;
                                default: stringContent += c; break;
                            }
                        } else {
                            // For regular strings (", '), unescape normally
                        switch (c) {
                            case 'n': stringContent += '\n'; break;
                            case 't': stringContent += '\t'; break;
                            case 'r': stringContent += '\r'; break;
                            case '\\': stringContent += '\\'; break;
                            case '"': stringContent += '"'; break;
                            case "'": stringContent += "'"; break;
                            case '`': stringContent += '`'; break;
                            default: stringContent += c; break;
                            }
                        }
                        escaped = false;
                        i++;
                        column++;
                        continue;
                    }
                    
                    if (c === '\\') {
                        escaped = true;
                        i++;
                        column++;
                        continue;
                    }
                    
                    if (c === quoteChar) {
                        i++; // skip closing quote
                        column++;
                        break;
                    }
                    
                    if (c === '\n') {
                        // Strings can span multiple lines
                        stringContent += c;
                        i++;
                        line++;
                        column = 0;
                        continue;
                    }
                    
                    stringContent += c;
                    i++;
                    column++;
                }
                
                const fullText = quoteChar + stringContent + quoteChar;
                tokens.push(makeToken(TokenKind.STRING, fullText, line, stringStartCol, stringContent));
                continue;
            }
            
            // Handle decorators (@identifier)
            if (char === '@') {
                const decoratorStartCol = column;
                i++; // skip @
                column++;
                
                // Read identifier after @
                let decoratorName = '';
                while (i < source.length && isAlphaNumeric(source[i])) {
                    decoratorName += source[i];
                    i++;
                    column++;
                }
                
                tokens.push(makeToken(TokenKind.DECORATOR, '@' + decoratorName, line, decoratorStartCol, decoratorName));
                continue;
            }
            
            // Handle variables ($identifier, $arr[0], $obj.prop) and subexpressions ($(...))
            if (char === '$') {
                const varStartCol = column;
                i++; // skip $
                column++;
                
                // Check if this is a $( subexpression opening
                if (i < source.length && source[i] === '(') {
                    // Tokenize $( as SUBEXPRESSION_OPEN
                    tokens.push(makeToken(TokenKind.SUBEXPRESSION_OPEN, '$(', line, varStartCol));
                    i++; // skip (
                    column++;
                    continue;
                }
                
                // Read variable name (alphanumeric, dots, brackets)
                let varText = '$';
                while (i < source.length) {
                    const c = source[i];
                    if (isAlphaNumeric(c) || c === '.' || c === '[' || c === ']') {
                        varText += c;
                        i++;
                        column++;
                    } else {
                        break;
                    }
                }
                
                tokens.push(makeToken(TokenKind.VARIABLE, varText, line, varStartCol, varText.substring(1)));
                continue;
            }
            
            // Handle numbers (including negative numbers and decimals)
            if (isDigit(char) || (char === '-' && isDigit(nextChar))) {
                const numStartCol = column;
                let numText = '';
                
                if (char === '-') {
                    numText += char;
                    i++;
                    column++;
                }
                
                // Read integer part
                while (i < source.length && isDigit(source[i])) {
                    numText += source[i];
                    i++;
                    column++;
                }
                
                // Check for decimal point
                if (i < source.length && source[i] === '.' && i + 1 < source.length && isDigit(source[i + 1])) {
                    numText += '.';
                    i++;
                    column++;
                    
                    // Read fractional part
                    while (i < source.length && isDigit(source[i])) {
                        numText += source[i];
                        i++;
                        column++;
                    }
                }
                
                const numValue = parseFloat(numText);
                tokens.push(makeToken(TokenKind.NUMBER, numText, line, numStartCol, numValue));
                continue;
            }
            
            // Handle two-character operators
            if (char === '=' && nextChar === '=') {
                tokens.push(makeToken(TokenKind.EQ, '==', line, column));
                i += 2;
                column += 2;
                continue;
            }
            if (char === '!' && nextChar === '=') {
                tokens.push(makeToken(TokenKind.NE, '!=', line, column));
                i += 2;
                column += 2;
                continue;
            }
            if (char === '>' && nextChar === '=') {
                tokens.push(makeToken(TokenKind.GTE, '>=', line, column));
                i += 2;
                column += 2;
                continue;
            }
            if (char === '<' && nextChar === '=') {
                tokens.push(makeToken(TokenKind.LTE, '<=', line, column));
                i += 2;
                column += 2;
                continue;
            }
            if (char === '&' && nextChar === '&') {
                tokens.push(makeToken(TokenKind.AND, '&&', line, column));
                i += 2;
                column += 2;
                continue;
            }
            if (char === '|' && nextChar === '|') {
                tokens.push(makeToken(TokenKind.OR, '||', line, column));
                i += 2;
                column += 2;
                continue;
            }
            
            // Handle single-character operators and punctuation
            switch (char) {
                case '=':
                    tokens.push(makeToken(TokenKind.ASSIGN, '=', line, column));
                    i++;
                    column++;
                    continue;
                case '+':
                    tokens.push(makeToken(TokenKind.PLUS, '+', line, column));
                    i++;
                    column++;
                    continue;
                case '-':
                    tokens.push(makeToken(TokenKind.MINUS, '-', line, column));
                    i++;
                    column++;
                    continue;
                case '*':
                    tokens.push(makeToken(TokenKind.MULTIPLY, '*', line, column));
                    i++;
                    column++;
                    continue;
                case '/':
                    tokens.push(makeToken(TokenKind.DIVIDE, '/', line, column));
                    i++;
                    column++;
                    continue;
                case '%':
                    tokens.push(makeToken(TokenKind.MODULO, '%', line, column));
                    i++;
                    column++;
                    continue;
                case '>':
                    tokens.push(makeToken(TokenKind.GT, '>', line, column));
                    i++;
                    column++;
                    continue;
                case '<':
                    tokens.push(makeToken(TokenKind.LT, '<', line, column));
                    i++;
                    column++;
                    continue;
                case '!':
                    tokens.push(makeToken(TokenKind.NOT, '!', line, column));
                    i++;
                    column++;
                    continue;
                case '(':
                    tokens.push(makeToken(TokenKind.LPAREN, '(', line, column));
                    i++;
                    column++;
                    continue;
                case ')':
                    tokens.push(makeToken(TokenKind.RPAREN, ')', line, column));
                    i++;
                    column++;
                    continue;
                case '[':
                    tokens.push(makeToken(TokenKind.LBRACKET, '[', line, column));
                    i++;
                    column++;
                    continue;
                case ']':
                    tokens.push(makeToken(TokenKind.RBRACKET, ']', line, column));
                    i++;
                    column++;
                    continue;
                case '{':
                    tokens.push(makeToken(TokenKind.LBRACE, '{', line, column));
                    i++;
                    column++;
                    continue;
                case '}':
                    tokens.push(makeToken(TokenKind.RBRACE, '}', line, column));
                    i++;
                    column++;
                    continue;
                case ',':
                    tokens.push(makeToken(TokenKind.COMMA, ',', line, column));
                    i++;
                    column++;
                    continue;
                case ':':
                    tokens.push(makeToken(TokenKind.COLON, ':', line, column));
                    i++;
                    column++;
                    continue;
                case '.':
                    tokens.push(makeToken(TokenKind.DOT, '.', line, column));
                    i++;
                    column++;
                    continue;
            }
            
            // Handle identifiers and keywords
            if (isAlpha(char)) {
                const identStartCol = column;
                let identText = '';
                
                while (i < source.length && isAlphaNumeric(source[i])) {
                    identText += source[i];
                    i++;
                    column++;
                }
                
                // Check if it's a keyword
                if (KEYWORDS.has(identText)) {
                    // Special handling for boolean and null literals
                    if (identText === 'true') {
                        tokens.push(makeToken(TokenKind.BOOLEAN, identText, line, identStartCol, true));
                    } else if (identText === 'false') {
                        tokens.push(makeToken(TokenKind.BOOLEAN, identText, line, identStartCol, false));
                    } else if (identText === 'null') {
                        tokens.push(makeToken(TokenKind.NULL, identText, line, identStartCol, null));
                    } else {
                        tokens.push(makeToken(TokenKind.KEYWORD, identText, line, identStartCol));
                    }
                } else {
                    tokens.push(makeToken(TokenKind.IDENTIFIER, identText, line, identStartCol));
                }
                continue;
            }
            
            // If we get here, we have an unexpected character
            // For now, skip it (in production, we might want to throw an error)
            i++;
            column++;
        }
        
        // Add EOF token
        tokens.push(makeToken(TokenKind.EOF, '', line, column));
        
        return tokens;
    }

    /**
     * Legacy tokenize method - kept for backward compatibility
     * Tokenizes a single line into string tokens
     * 
     * @param line - A single line of code
     * @returns Array of string tokens
     */
    static tokenize(line: string): string[] {
        const tokens: string[] = [];
        // Optimize: Use array builder pattern instead of string concatenation
        const currentChars: string[] = [];
        let inString = false;
        let stringChar = '';
        let i = 0;

        // Helper to flush current token
        const flushCurrent = () => {
            if (currentChars.length > 0) {
                // Find first non-whitespace and last non-whitespace
                let start = 0;
                let end = currentChars.length;
                while (start < end && /\s/.test(currentChars[start])) start++;
                while (end > start && /\s/.test(currentChars[end - 1])) end--;
                if (start < end) {
                    tokens.push(currentChars.slice(start, end).join(''));
                }
                currentChars.length = 0;
            }
        };

        while (i < line.length) {
            const char = line[i];
            const nextChar = i + 1 < line.length ? line[i + 1] : '';

            // Handle comments
            if (!inString && char === '#') {
                break; // Rest of line is comment
            }

            // Handle strings (", ', and `)
            if ((char === '"' || char === "'" || char === '`') && (i === 0 || line[i - 1] !== '\\')) {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                    flushCurrent();
                    currentChars.push(char);
                } else if (char === stringChar) {
                    inString = false;
                    currentChars.push(char);
                    tokens.push(currentChars.join(''));
                    currentChars.length = 0;
                    stringChar = '';
                } else {
                    currentChars.push(char);
                }
                i++;
                continue;
            }

            if (inString) {
                currentChars.push(char);
                i++;
                continue;
            }

            // Handle operators (==, !=, >=, <=, &&, ||)
            if (char === '=' && nextChar === '=') {
                flushCurrent();
                tokens.push('==');
                i += 2;
                continue;
            }
            if (char === '!' && nextChar === '=') {
                flushCurrent();
                tokens.push('!=');
                i += 2;
                continue;
            }
            if (char === '>' && nextChar === '=') {
                flushCurrent();
                tokens.push('>=');
                i += 2;
                continue;
            }
            if (char === '<' && nextChar === '=') {
                flushCurrent();
                tokens.push('<=');
                i += 2;
                continue;
            }
            if (char === '&' && nextChar === '&') {
                flushCurrent();
                tokens.push('&&');
                i += 2;
                continue;
            }
            if (char === '|' && nextChar === '|') {
                flushCurrent();
                tokens.push('||');
                i += 2;
                continue;
            }

            // Handle single character operators and delimiters
            // Note: '.' and '[' ']' are handled specially for attribute access and array indexing
            if (['=', '>', '<', '!', '(', ')', ']'].includes(char)) {
                // Special handling for ']' - it might be part of a variable like $arr[0]
                if (char === ']' && currentChars.length > 0 && currentChars[0] === '$') {
                    // This is part of a variable - keep it in current
                    currentChars.push(char);
                    i++;
                    continue;
                }
                flushCurrent();
                tokens.push(char);
                i++;
                continue;
            }

            // Handle '[' - might be part of variable or standalone
            if (char === '[') {
                // If current starts with $, it's part of a variable
                if (currentChars.length > 0 && currentChars[0] === '$') {
                    currentChars.push(char);
                    i++;
                    continue;
                }
                // Otherwise, it's a standalone token
                flushCurrent();
                tokens.push(char);
                i++;
                continue;
            }

            // Handle '.' - might be part of variable attribute access or decimal number
            if (char === '.') {
                // If current starts with $, it's part of a variable attribute access
                if (currentChars.length > 0 && currentChars[0] === '$') {
                    currentChars.push(char);
                    i++;
                    continue;
                }
                // Check if current is a number (starts with digit)
                if (currentChars.length > 0) {
                    const currentStr = currentChars.join('');
                    const trimmed = currentStr.trim();
                    if (/^-?\d+$/.test(trimmed)) {
                        // Check if next character is a digit (for decimal numbers)
                        if (i + 1 < line.length && /\d/.test(line[i + 1])) {
                            // This is a decimal number - keep the dot as part of the number
                            currentChars.push(char);
                            i++;
                            continue;
                        }
                        // If next char is not a digit, push the number and treat . as separate token
                        tokens.push(trimmed);
                        currentChars.length = 0;
                        tokens.push(char);
                        i++;
                        continue;
                    }
                }
                // Otherwise, it's a standalone token (for module.function syntax)
                flushCurrent();
                tokens.push(char);
                i++;
                continue;
            }

            // Handle whitespace
            if (/\s/.test(char)) {
                flushCurrent();
                i++;
                continue;
            }

            currentChars.push(char);
            i++;
        }

        flushCurrent();

        return tokens;
    }
}

