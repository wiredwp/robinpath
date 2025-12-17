/**
 * Parser for prompt blocks (--- ... ---)
 */

import { TokenStream } from '../classes/TokenStream';
import type { PromptBlockStatement, CodePosition } from '../types/Ast.type';
import { classifyFenceLine } from './FenceClassifier';

/**
 * Parse a prompt block from the current position
 * 
 * @param stream - Token stream positioned at the opening prompt fence
 * @param source - Full source code string
 * @returns PromptBlockStatement if parsed, null otherwise
 */
export function parsePromptBlock(
    stream: TokenStream,
    source: string
): PromptBlockStatement | null {
    const startToken = stream.current();
    if (!startToken) return null;

    // Extract the raw line from source
    const lines = source.split('\n');
    const lineIndex = startToken.line - 1;
    if (lineIndex < 0 || lineIndex >= lines.length) {
        return null;
    }
    
    const openLine = lines[lineIndex];
    const classification = classifyFenceLine(openLine);
    
    if (!classification || classification.kind !== 'prompt_fence') {
        return null;
    }
    
    // Calculate open position
    const openStartRow = startToken.line - 1;
    const openStartCol = openLine.length - openLine.trimStart().length;
    const openEndRow = openStartRow;
    const openEndCol = openStartCol + openLine.trim().length - 1;
    
    const openPos: CodePosition = {
        startRow: openStartRow,
        startCol: openStartCol,
        endRow: openEndRow,
        endCol: openEndCol
    };
    
    // Consume the open fence line tokens
    const startLine = startToken.line;
    while (!stream.isAtEnd()) {
        const token = stream.current();
        if (!token || token.line > startLine) {
            break;
        }
        stream.next();
    }
    
    // Collect body lines until we find closing ---
    // Use line-based iteration instead of token-based to preserve empty lines
    const bodyLines: string[] = [];
    let bodyStartRow = -1;
    let bodyEndRow = -1;
    let closeLineFound = false;
    let closeLineIndex = -1;
    
    // Start scanning from the line after the opening fence
    for (let scanLineIndex = lineIndex + 1; scanLineIndex < lines.length; scanLineIndex++) {
        const currentLine = lines[scanLineIndex];
        const fenceClass = classifyFenceLine(currentLine);
        
        // Check if this is a closing prompt fence (bare ---)
        // Must be exactly a prompt fence, not cell_end, chunk_marker, or cell_open
        if (fenceClass && fenceClass.kind === 'prompt_fence') {
            // Found the closing fence
            closeLineFound = true;
            closeLineIndex = scanLineIndex;
            
            // Consume tokens up to and including the close fence line
            while (!stream.isAtEnd()) {
                const token = stream.current();
                if (!token || token.line - 1 > closeLineIndex) {
                    break;
                }
                stream.next();
            }
            break;
        }
        
        // Add this line to body (including empty lines)
        if (bodyStartRow === -1) {
            bodyStartRow = scanLineIndex;
        }
        bodyEndRow = scanLineIndex;
        bodyLines.push(currentLine);
    }
    
    if (!closeLineFound) {
        throw new Error(
            `Unterminated prompt block starting at line ${startToken.line}. ` +
            `Expected closing --- but reached end of file.`
        );
    }
    
    // Join body lines, preserving newlines exactly
    const rawText = bodyLines.join('\n');
    
    // Calculate body position
    const bodyStartCol = bodyLines.length > 0 
        ? lines[bodyStartRow].length - lines[bodyStartRow].trimStart().length
        : 0;
    const bodyEndCol = bodyLines.length > 0
        ? lines[bodyEndRow].length - 1
        : 0;
    
    const bodyPos: CodePosition = {
        startRow: bodyStartRow >= 0 ? bodyStartRow : openEndRow + 1,
        startCol: bodyStartCol,
        endRow: bodyEndRow >= 0 ? bodyEndRow : openEndRow,
        endCol: bodyEndCol
    };
    
    // Calculate close position
    const closeLine = lines[closeLineIndex];
    const closeStartCol = closeLine.length - closeLine.trimStart().length;
    const closeEndCol = closeStartCol + closeLine.trim().length - 1;
    
    const closePos: CodePosition = {
        startRow: closeLineIndex,
        startCol: closeStartCol,
        endRow: closeLineIndex,
        endCol: closeEndCol
    };
    
    // Calculate full code position
    const codePos: CodePosition = {
        startRow: openStartRow,
        startCol: openStartCol,
        endRow: closeLineIndex,
        endCol: closeEndCol
    };
    
    return {
        type: 'prompt_block',
        rawText,
        fence: '---',
        codePos,
        openPos,
        bodyPos,
        closePos
    };
}

