/**
 * Parser for cell blocks (---cell <cellType> <meta...>--- ... ---end---)
 */

import { TokenStream } from '../classes/TokenStream';
import type { CellBlock, CodePosition } from '../types/Ast.type';
import { classifyFenceLine } from './FenceClassifier';
import { Parser } from '../classes/Parser';

/**
 * Parse a cell block from the current position
 * 
 * @param stream - Token stream positioned at the cell open fence
 * @param source - Full source code string
 * @param parseStatement - Function to parse statements (for code cells)
 * @returns CellBlock if parsed, null otherwise
 */
export async function parseCellBlock(
    stream: TokenStream,
    source: string,
    _parseStatement: (stream: TokenStream) => any // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<CellBlock | null> {
    const startToken = stream.current();
    if (!startToken) return null;

    // Extract the raw line from source
    const lines = source.split('\n');
    const lineIndex = startToken.line - 1;
    if (lineIndex < 0 || lineIndex >= lines.length) {
        return null;
    }
    
    const headerLine = lines[lineIndex];
    const classification = classifyFenceLine(headerLine);
    
    if (!classification || classification.kind !== 'cell_open') {
        return null;
    }
    
    const { cellType, meta } = classification;
    
    // Calculate header position
    const headerStartRow = startToken.line - 1;
    const headerStartCol = headerLine.length - headerLine.trimStart().length;
    const headerEndRow = headerStartRow;
    const headerEndCol = headerStartCol + headerLine.trim().length - 1;
    
    const headerPos: CodePosition = {
        startRow: headerStartRow,
        startCol: headerStartCol,
        endRow: headerEndRow,
        endCol: headerEndCol
    };
    
    // Consume the header line tokens
    const startLine = startToken.line;
    while (!stream.isAtEnd()) {
        const token = stream.current();
        if (!token || token.line > startLine) {
            break;
        }
        stream.next();
    }
    
    // Collect body lines until we find ---end---
    const bodyLines: string[] = [];
    let bodyStartRow = -1;
    let bodyEndRow = -1;
    let endLineFound = false;
    let endLineIndex = -1;
    
    while (!stream.isAtEnd()) {
        const token = stream.current();
        if (!token) break;
        
        const currentLineIndex = token.line - 1;
        if (currentLineIndex < 0 || currentLineIndex >= lines.length) {
            break;
        }
        
        const currentLine = lines[currentLineIndex];
        const fenceClass = classifyFenceLine(currentLine);
        
        // Check if this is the end fence
        if (fenceClass && fenceClass.kind === 'cell_end') {
            // Found the end fence
            endLineFound = true;
            endLineIndex = currentLineIndex;
            
            // Consume the end fence line tokens
            const endLine = token.line;
            while (!stream.isAtEnd()) {
                const endToken = stream.current();
                if (!endToken || endToken.line > endLine) {
                    break;
                }
                stream.next();
            }
            break;
        }
        
        // Add this line to body
        if (bodyStartRow === -1) {
            bodyStartRow = currentLineIndex;
        }
        bodyEndRow = currentLineIndex;
        bodyLines.push(currentLine);
        
        // Consume this line's tokens
        const lineNum = token.line;
        while (!stream.isAtEnd()) {
            const lineToken = stream.current();
            if (!lineToken || lineToken.line > lineNum) {
                break;
            }
            stream.next();
        }
    }
    
    if (!endLineFound) {
        throw new Error(
            `Unterminated cell block starting at line ${startToken.line}. ` +
            `Expected ---end--- but reached end of file.`
        );
    }
    
    const rawBody = bodyLines.join('\n');
    
    // Calculate body position
    const bodyStartCol = bodyLines.length > 0 
        ? lines[bodyStartRow].length - lines[bodyStartRow].trimStart().length
        : 0;
    const bodyEndCol = bodyLines.length > 0
        ? lines[bodyEndRow].length - 1
        : 0;
    
    const bodyPos: CodePosition = {
        startRow: bodyStartRow >= 0 ? bodyStartRow : headerEndRow + 1,
        startCol: bodyStartCol,
        endRow: bodyEndRow >= 0 ? bodyEndRow : headerEndRow,
        endCol: bodyEndCol
    };
    
    // Calculate full code position
    const finalEndLineIndex = endLineFound && endLineIndex >= 0 ? endLineIndex : headerEndRow;
    const codePos: CodePosition = {
        startRow: headerStartRow,
        startCol: headerStartCol,
        endRow: finalEndLineIndex,
        endCol: lines[finalEndLineIndex]?.length - 1 || headerEndCol
    };
    
    // Parse body if cellType is "code"
    let body: any[] | undefined;
    if (cellType === 'code' && rawBody.trim().length > 0) {
        try {
            // Create a temporary parser for the body
            const bodyParser = new Parser(rawBody);
            const parsedStatements = await bodyParser.parse();
            if (parsedStatements && Array.isArray(parsedStatements)) {
                body = parsedStatements;
            }
        } catch (error) {
            // If parsing fails, keep rawBody only
            // This allows for syntax errors in code cells to be preserved
            // body remains undefined, so rawBody will be used
        }
    }
    
    return {
        type: 'cell',
        cellType,
        meta,
        rawBody,
        body,
        headerPos,
        bodyPos,
        codePos
    };
}

