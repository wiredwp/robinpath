/**
 * Parser for chunk marker statements
 * 
 * Parses lines like:
 *   --- chunk:main ---
 *   --- chunk:extract_invoice tags:llm cache:content_hash ---
 */

import { TokenStream } from '../classes/TokenStream';
import type { ChunkMarkerStatement, CodePosition } from '../types/Ast.type';
import { classifyFenceLine } from './FenceClassifier';

/**
 * Parse a chunk marker from the current line
 * 
 * Syntax: --- chunk:<id> [key:value ...] ---
 * 
 * @param stream - Token stream positioned at the start of a potential chunk marker
 * @param source - Full source code string for extracting raw line
 * @returns ChunkMarkerStatement if parsed, null otherwise
 */
export function parseChunkMarker(
    stream: TokenStream,
    source: string
): ChunkMarkerStatement | null {
    const startToken = stream.current();
    if (!startToken) return null;

    // Quick check: if first token isn't '---', this can't be a chunk marker
    if (startToken.text !== '---') {
        return null;
    }

    // Extract the raw line from source using line number
    // Split source into lines (1-indexed, so subtract 1)
    const lines = source.split('\n');
    const lineIndex = startToken.line - 1;
    if (lineIndex < 0 || lineIndex >= lines.length) {
        return null;
    }

    const rawLine = lines[lineIndex];

    // Use fence classifier to check if this is a chunk marker
    const fenceClass = classifyFenceLine(rawLine);

    if (!fenceClass || fenceClass.kind !== 'chunk_marker') {
        // Check if line starts with --- and contains chunk: - if so, it must be a valid chunk marker
        const trimmedLine = rawLine.trim();
        if (trimmedLine.startsWith('---') && trimmedLine.includes('chunk:')) {
            throw new Error(
                `Invalid chunk marker syntax at line ${startToken.line}, column ${startToken.column + 1}: ${rawLine}\n` +
                `Expected format: --- chunk:<id> [key:value ...] ---`
            );
        }
        return null;
    }

    const { id, meta } = fenceClass;

    // Check for inline comments (not allowed)
    if (rawLine.includes('#')) {
        const hashIndex = rawLine.indexOf('#');
        const beforeHash = rawLine.substring(0, hashIndex).trim();
        const afterHash = rawLine.substring(hashIndex);
        // If there's content after # that's not part of the marker, it's an error
        if (afterHash.trim() && !beforeHash.endsWith('---')) {
            throw new Error(
                `Chunk marker line cannot contain inline comments. ` +
                `Found at line ${startToken.line}, column ${hashIndex + 1}: ${rawLine}`
            );
        }
    }

    // Calculate code position
    const startRow = startToken.line - 1; // Convert to 0-indexed
    const startCol = rawLine.length - rawLine.trimStart().length; // Leading whitespace
    const endRow = startRow;
    const endCol = startCol + rawLine.trim().length - 1;

    const codePos: CodePosition = {
        startRow,
        startCol,
        endRow,
        endCol
    };

    // Consume all tokens on this line plus the newline
    const startLine = startToken.line;
    while (!stream.isAtEnd()) {
        const token = stream.current();
        if (!token) break;

        // Stop when we move to the next line
        if (token.line > startLine) {
            break;
        }

        stream.next();
    }

    const result: ChunkMarkerStatement = {
        type: 'chunk_marker',
        id,
        codePos,
        raw: rawLine.trim()
    };

    // Only include meta if it has entries
    if (Object.keys(meta).length > 0) {
        result.meta = meta;
    }

    return result;
}

