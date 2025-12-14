/**
 * ASTToCodeConverter - Converts AST nodes back to source code
 * 
 * This class handles the conversion of AST (Abstract Syntax Tree) nodes
 * back into RobinPath source code strings. It provides methods for:
 * - Updating source code based on AST changes
 * - Reconstructing code from individual AST nodes
 * - Handling comments, indentation, and code positioning
 * 
 * Architecture:
 * - LineIndex: Fast row/col → offset conversion (O(1))
 * - PatchPlanner: Collects edit operations (produces Patch[])
 * - Printer: AST → string conversion (pure, no access to originalScript)
 * - PatchApplier: Applies patches to source code
 */

import type { Statement } from '../../types/Ast.type';
import { PatchPlanner } from './PatchPlanner';
import { PatchApplier } from './PatchApplier';
import { Printer } from './Printer';
import { LineIndexImpl } from './LineIndex';

export class ASTToCodeConverter {
    /**
     * Update source code based on AST changes
     * Uses precise character-level positions (codePos.startRow/startCol/endRow/endCol) to update code
     * Nested nodes are reconstructed as part of their parent's code
     * @param originalScript The original source code
     * @param ast The modified AST array (top-level nodes only)
     * @returns Updated source code
     */
    async updateCodeFromAST(originalScript: string, ast: Statement[]): Promise<string> {
        // Phase 1: Plan patches (including deletions)
        const planner = new PatchPlanner(originalScript);
        const patches = await planner.planPatches(ast);

        // Phase 2: Apply patches
        return PatchApplier.apply(originalScript, patches);
    }

    /**
     * Reconstruct code string from an AST node
     * @param node The AST node (serialized)
     * @param indentLevel Indentation level for nested code
     * @returns Reconstructed code string, or null if cannot be reconstructed
     */
    reconstructCodeFromASTNode(node: Statement, indentLevel: number = 0): string | null {
        // Create a dummy LineIndex for printing (not used for offset calculations)
        const dummyLineIndex = new LineIndexImpl('');
        
        const result = Printer.printNode(node, {
            indentLevel,
            lineIndex: dummyLineIndex
        });

        return result || null;
    }

}
