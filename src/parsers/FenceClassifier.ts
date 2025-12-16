/**
 * Fence Classifier - Classifies fence lines with priority order
 * 
 * Priority order (to avoid ambiguity):
 * 1. ---cell ...--- (cell open)
 * 2. ---end--- (cell close)
 * 3. --- chunk:... --- (chunk marker)
 * 4. bare --- (prompt fence open/close)
 */

export type FenceClassification =
    | { kind: 'cell_open'; cellType: string; meta: Record<string, string> }
    | { kind: 'cell_end' }
    | { kind: 'chunk_marker'; id: string; meta: Record<string, string> }
    | { kind: 'prompt_fence' }
    | null;

/**
 * Classify a fence line according to priority order
 * 
 * @param line - Raw line string to classify
 * @returns Classification result or null if not a fence line
 */
export function classifyFenceLine(line: string): FenceClassification {
    const trimmed = line.trim();
    
    // Must start with ---
    if (!trimmed.startsWith('---')) {
        return null;
    }
    
    // Priority 1: Check for cell open: ---cell <cellType> <meta...>---
    const cellOpenRegex = /^\s*---cell\s+([A-Za-z_][A-Za-z0-9_]*)\b(.*?)---\s*$/;
    const cellOpenMatch = line.match(cellOpenRegex);
    if (cellOpenMatch) {
        const cellType = cellOpenMatch[1];
        const metaPart = cellOpenMatch[2].trim();
        const meta = parseMetaPairs(metaPart);
        return { kind: 'cell_open', cellType, meta };
    }
    
    // Priority 2: Check for cell end: ---end---
    const cellEndRegex = /^\s*---end---\s*$/;
    if (cellEndRegex.test(line)) {
        return { kind: 'cell_end' };
    }
    
    // Priority 3: Check for chunk marker: --- chunk:<id> <meta...> ---
    const chunkRegex = /^\s*---\s*chunk:([A-Za-z_][A-Za-z0-9_-]*)\b(.*?)---\s*$/;
    const chunkMatch = line.match(chunkRegex);
    if (chunkMatch) {
        const id = chunkMatch[1];
        const metaPart = chunkMatch[2].trim();
        const meta = parseMetaPairs(metaPart);
        return { kind: 'chunk_marker', id, meta };
    }
    
    // Priority 4: Check for prompt fence (bare ---): ^\s*---\s*$
    const promptFenceRegex = /^\s*---\s*$/;
    if (promptFenceRegex.test(line)) {
        return { kind: 'prompt_fence' };
    }
    
    // Not a recognized fence line
    return null;
}

/**
 * Parse metadata pairs from a string
 * Supports key:value and key=value formats
 * 
 * @param metaPart - String containing metadata pairs separated by whitespace
 * @returns Record of key-value pairs
 */
function parseMetaPairs(metaPart: string): Record<string, string> {
    const meta: Record<string, string> = {};
    
    if (!metaPart || metaPart.trim().length === 0) {
        return meta;
    }
    
    // Split by whitespace and parse each token
    const pairs = metaPart.split(/\s+/).filter(p => p.length > 0);
    
    for (const pair of pairs) {
        // Try key:value format first
        if (pair.includes(':')) {
            const colonIndex = pair.indexOf(':');
            const key = pair.substring(0, colonIndex).trim();
            const value = pair.substring(colonIndex + 1).trim();
            
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
                continue; // Skip invalid keys
            }
            
            // Remove quotes if present
            let unquotedValue = value;
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                unquotedValue = value.slice(1, -1);
            }
            
            meta[key] = unquotedValue;
        }
        // Try key=value format
        else if (pair.includes('=')) {
            const eqIndex = pair.indexOf('=');
            const key = pair.substring(0, eqIndex).trim();
            const value = pair.substring(eqIndex + 1).trim();
            
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
                continue; // Skip invalid keys
            }
            
            // Remove quotes if present
            let unquotedValue = value;
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                unquotedValue = value.slice(1, -1);
            }
            
            meta[key] = unquotedValue;
        }
    }
    
    return meta;
}

