/**
 * PatchApplier - Apply patches to source code
 * 
 * Sort patches descending (as you do now) and apply.
 * Optional: validate overlaps and throw in dev mode.
 */

import type { Patch } from './types';

export class PatchApplier {
    /**
     * Apply patches to source code
     * Patches are sorted descending by startOffset and applied from end to start
     * to prevent character position shifts from affecting subsequent replacements
     */
    static apply(originalScript: string, patches: Patch[]): string {
        // Sort by start offset (descending) to replace from end to start
        const sortedPatches = [...patches].sort((a, b) => b.startOffset - a.startOffset);

        // Validate patches don't overlap (optional - can be enabled via flag)
        // Disabled by default to avoid process.env dependency
        // Uncomment the line below to enable validation:
        // this.validatePatches(sortedPatches);

        // Apply patches
        let updatedScript = originalScript;
        for (const patch of sortedPatches) {
            updatedScript = 
                updatedScript.slice(0, patch.startOffset) + 
                patch.replacement + 
                updatedScript.slice(patch.endOffset);
        }

        return updatedScript;
    }

    /**
     * Validate that patches don't overlap
     * @internal This method is kept for potential future use or manual invocation
     */
    static validatePatches(patches: Patch[]): void {
        for (let i = 0; i < patches.length - 1; i++) {
            const current = patches[i];
            const next = patches[i + 1];

            // Check if ranges overlap
            // Since patches are sorted descending, current.startOffset >= next.startOffset
            // Overlap occurs if current.endOffset > next.startOffset
            if (current.endOffset > next.startOffset) {
                console.warn('Patch overlap detected:', {
                    current: { start: current.startOffset, end: current.endOffset },
                    next: { start: next.startOffset, end: next.endOffset }
                });
            }
        }
    }
}
