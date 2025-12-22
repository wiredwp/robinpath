import type { CommentWithPosition } from '../../types/Ast.type';
import type { LineIndex } from './LineIndex';

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
    originalScript?: string; // Optional: original script for extracting original code
    allowExtractOriginalCode?: boolean; // If false, don't extract original code (node has changed)
}

export type { CommentWithPosition, LineIndex };
