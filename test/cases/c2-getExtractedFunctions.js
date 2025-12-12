// Test Case c2: getExtractedFunctions method tests

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { RobinPath } from '../../dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Extracted Functions from test.rp');
    console.log('='.repeat(60));
    
    // Read the main test script
    const testScriptPath = join(__dirname, '..', 'test.rp');
    const testScript = readFileSync(testScriptPath, 'utf-8');
    
    const functionsRp = new RobinPath();
    const extractedFunctions = functionsRp.getExtractedFunctions(testScript);
    
    if (extractedFunctions.length === 0) {
        console.log('No functions defined in test.rp');
    } else {
        console.log(`Total: ${extractedFunctions.length} function(s)`);
        
        // Sort functions alphabetically by name
        const sortedFunctions = [...extractedFunctions].sort((a, b) => 
            a.name.localeCompare(b.name)
        );
        
        // Join function names with commas
        const functionNames = sortedFunctions.map(func => func.name).join(', ');
        console.log(functionNames);
    }
    
    console.log('='.repeat(60));
    console.log('✓ getExtractedFunctions test PASSED');
    console.log('='.repeat(60));
}
