/**
 * Writer - Efficient string building for code generation
 * 
 * Avoids repeated string concatenation by using an array-based approach.
 */
export class Writer {
    private parts: string[] = [];
    private currentIndent: number = 0;
    private indentString: string = '  '; // 2 spaces per indent level

    /**
     * Push a string to the output
     */
    push(text: string): void {
        this.parts.push(text);
    }

    /**
     * Push a newline
     */
    newline(): void {
        this.parts.push('\n');
    }

    /**
     * Set the indentation level
     */
    indent(level: number): void {
        this.currentIndent = level;
    }

    /**
     * Push text with current indentation
     */
    pushIndented(text: string): void {
        const indent = this.indentString.repeat(this.currentIndent);
        this.parts.push(indent + text);
    }

    /**
     * Push a line with current indentation
     */
    pushLine(text: string): void {
        this.pushIndented(text);
        this.newline();
    }

    /**
     * Push a blank line
     */
    pushBlankLine(): void {
        this.parts.push('\n');
    }

    /**
     * Get the final string
     */
    toString(): string {
        return this.parts.join('');
    }

    /**
     * Clear all content
     */
    clear(): void {
        this.parts = [];
        this.currentIndent = 0;
    }
}
