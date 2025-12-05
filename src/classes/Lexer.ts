/**
 * Lexer class for tokenizing RobinPath code
 */

export class Lexer {
    static tokenize(line: string): string[] {
        const tokens: string[] = [];
        // Optimize: Use array builder pattern instead of string concatenation
        const currentChars: string[] = [];
        let currentStart = 0; // Track start of current token (for trimming optimization)
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
                currentStart = 0;
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

