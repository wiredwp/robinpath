/**
 * LineIndex - Fast row/col → offset conversion
 * 
 * Build once per originalScript. Provides O(1) offset conversion
 * by pre-computing line-start offsets.
 */

import type { LineIndex } from './types';

export class LineIndexImpl implements LineIndex {
    private readonly lineStartOffsets: number[];
    private readonly lines: string[];
    private readonly originalScript: string;

    constructor(originalScript: string) {
        this.originalScript = originalScript;
        this.lines = originalScript.split('\n');
        
        // Pre-compute line start offsets for O(1) lookup
        this.lineStartOffsets = new Array(this.lines.length);
        let offset = 0;
        for (let i = 0; i < this.lines.length; i++) {
            this.lineStartOffsets[i] = offset;
            offset += this.lines[i].length + 1; // +1 for newline
        }
    }

    /**
     * Convert row/column to character offset
     * @param row Zero-based row number
     * @param col Zero-based column number
     * @param exclusive If true, return offset one past the column (for end positions)
     * @returns Character offset in the script string
     */
    offsetAt(row: number, col: number, exclusive: boolean = false): number {
        if (row < 0 || row >= this.lines.length) {
            // Row doesn't exist
            if (exclusive && row >= this.lines.length) {
                // For exclusive end positions beyond the file, return end of file
                return this.originalScript.length;
            }
            return 0;
        }

        const lineStart = this.lineStartOffsets[row];
        const lineLength = this.lines[row].length;
        const colOffset = Math.min(col, lineLength);
        
        let offset = lineStart + colOffset;
        
        if (exclusive) {
            // Point one past the column, or after the newline if at end of line
            if (colOffset >= lineLength) {
                offset += 1; // After the newline
            } else {
                offset += 1; // One past the column
            }
        }
        
        return offset;
    }

    /**
     * Get the offset at the end of a line (after the newline)
     */
    lineEndOffset(row: number): number {
        if (row < 0 || row >= this.lines.length) {
            return this.originalScript.length;
        }
        return this.lineStartOffsets[row] + this.lines[row].length + 1;
    }

    /**
     * Check if a line has a newline character
     */
    hasNewline(row: number): boolean {
        if (row < 0 || row >= this.lines.length) {
            return false;
        }
        // All lines except the last one have newlines (if originalScript ends with newline)
        // For the last line, check if originalScript ends with newline
        if (row === this.lines.length - 1) {
            return this.originalScript.endsWith('\n');
        }
        return true;
    }

    /**
     * Get the text content of a specific line
     */
    getLine(row: number): string {
        if (row < 0 || row >= this.lines.length) {
            return '';
        }
        return this.lines[row];
    }

    /**
     * Get all lines as an array
     */
    getLines(): string[] {
        return [...this.lines];
    }

    /**
     * Get the total number of lines
     */
    lineCount(): number {
        return this.lines.length;
    }
}
