/**
 * Shared types for the code converter module
 */

import type { CommentWithPosition } from '../../types/Ast.type';

// Re-export for convenience
export type { CommentWithPosition };

/**
 * Represents a patch operation to apply to source code
 */
export interface Patch {
    startOffset: number;
    endOffset: number;
    replacement: string;
}

/**
 * Comment layout information for a statement
 */
export interface CommentLayout {
    leadingComments: CommentWithPosition[];
    inlineComment: CommentWithPosition | null;
    leadingGapLines: number; // Blank lines between last leading comment and statement
    trailingBlankLinesAfterStandaloneComment: number; // Only for standalone comment nodes
}

/**
 * Context for printing AST nodes
 */
export interface PrintContext {
    indentLevel: number;
    lineIndex: LineIndex;
}

/**
 * LineIndex interface for fast row/col → offset conversion
 */
export interface LineIndex {
    offsetAt(row: number, col: number, exclusive?: boolean): number;
    lineEndOffset(row: number): number;
    hasNewline(row: number): boolean;
    getLine(row: number): string;
    getLines(): string[];
    lineCount(): number;
}
