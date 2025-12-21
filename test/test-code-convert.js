/**
 * Code Converter Test Runner
 * 
 * Tests that code can be round-tripped through AST without changes:
 * Performs 3 cycles, each cycle doing:
 *   1. Convert code -> AST
 *   2. Convert AST -> code
 *   3. Convert code (from step 2) -> AST
 *   4. Convert AST (from step 3) -> code
 * Then compares the final code with the original.
 * 
 * Handles multiple test blocks separated by "---"
 * 
 * Usage:
 *   npm run test-code-convert -- 0    (tests 00-custom.robin, default 3 cycles)
 *   npm run test-code-convert -- 1    (tests 01-variable-assignment.robin, default 3 cycles)
 *   npm run test-code-convert -- 0-5  (tests 0 through 5, default 3 cycles)
 *   npm run test-code-convert -- 0 --cycle 5  (tests 00-custom.robin with 5 cycles)
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { RobinPath } from '../dist/index.js';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get the scripts directory
const scriptsDir = join(__dirname, 'scripts');

// Define test files mapping (test number -> filename)
const testFiles = [
    '00-custom.robin',
    '01-variable-assignment.robin',
    '02-expressions.robin',
    '03-conditionals.robin',
    '04-loops.robin',
    '05-functions.robin',
    '06-do-blocks.robin',
    '07-into-syntax.robin',
    '08-subexpressions.robin',
    '09-objects-arrays.robin',
    '10-builtin-commands.robin',
    '11-modules.robin',
    '12-events.robin',
    '13-together.robin',
    '14-with.robin',
    '15-meta.robin',
    '16-decorator.robin',
    '17-line-continuation.robin',
    '18-template-strings.robin',
    '19-last-value.robin',
    '20-comments.robin',
    '21-fenced.robin',
];

/**
 * Split code into blocks separated by "--- chunk:<id> ---" lines
 */
function splitIntoBlocks(code) {
    const lines = code.split('\n');
    const blocks = [];
    let currentBlock = [];
    
    // Regex to match chunk markers: --- chunk:<id> [meta] ---
    // Allow IDs that start with letters, digits, or underscores
    const chunkMarkerRegex = /^\s*---\s*chunk:([A-Za-z0-9_][A-Za-z0-9_-]*)\b.*?---\s*$/;
    
    for (const line of lines) {
        if (chunkMarkerRegex.test(line)) {
            if (currentBlock.length > 0) {
                blocks.push(currentBlock.join('\n'));
                currentBlock = [];
            }
            // Don't include the chunk marker line in the block
        } else {
            currentBlock.push(line);
        }
    }
    
    if (currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n'));
    }
    
    return blocks.length > 0 ? blocks : [code];
}

/**
 * Normalize line endings and trailing whitespace for comparison
 */
function normalizeLine(line) {
    return line.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd();
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a, b) {
    const m = a.length;
    const n = b.length;
    
    if (m === 0) return n;
    if (n === 0) return m;
    
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,      // deletion
                dp[i][j - 1] + 1,      // insertion
                dp[i - 1][j - 1] + cost // substitution
            );
        }
    }
    
    return dp[m][n];
}

/**
 * Compare two code strings line by line with summary statistics
 */
function compareCode(original, generated, testName = '') {
    const originalLines = original.split('\n').map(normalizeLine);
    const generatedLines = generated.split('\n').map(normalizeLine);
    
    const maxLines = Math.max(originalLines.length, generatedLines.length);
    const discrepancies = [];
    let totalLevenshtein = 0;
    let completelyDifferent = 0;
    let blankLineDiff = 0;
    let minorDiff = 0; // Levenshtein <= 5
    
    for (let i = 0; i < maxLines; i++) {
        const origLine = originalLines[i] ?? '';
        const genLine = generatedLines[i] ?? '';
        
        if (origLine !== genLine) {
            const distance = levenshteinDistance(origLine, genLine);
            totalLevenshtein += distance;
            
            // Categorize differences
            const isOrigBlank = origLine.trim() === '';
            const isGenBlank = genLine.trim() === '';
            
            if (isOrigBlank !== isGenBlank) {
                blankLineDiff++;
            } else if (distance > Math.max(origLine.length, genLine.length) * 0.5) {
                completelyDifferent++;
            } else if (distance <= 5) {
                minorDiff++;
            }
            
            discrepancies.push({
                lineNumber: i + 1,
                original: origLine,
                generated: genLine,
                levenshtein: distance
            });
        }
    }
    
    return {
        match: discrepancies.length === 0,
        discrepancies,
        summary: {
            totalLines: maxLines,
            mismatchedLines: discrepancies.length,
            totalLevenshtein,
            completelyDifferent,
            blankLineDiff,
            minorDiff,
            lineDelta: generatedLines.length - originalLines.length
        }
    };
}

/**
 * Test a single file
 */
async function testFile(testNumber, numCycles = 3) {
    if (testNumber < 0 || testNumber >= testFiles.length) {
        throw new Error(`Test number ${testNumber} is out of range (0-${testFiles.length - 1})`);
    }
    
    const filename = testFiles[testNumber];
    const filePath = join(scriptsDir, filename);
    
    console.log('='.repeat(80));
    console.log(`Testing: ${filename} (test #${testNumber})`);
    console.log('='.repeat(80));
    
    // Read the file
    let originalCode;
    try {
        originalCode = readFileSync(filePath, 'utf-8');
    } catch (error) {
        throw new Error(`Failed to read file: ${filePath}\n${error.message}`);
    }
    
    // Split into blocks if "--- chunk:<id> ---" separator exists
    const blocks = splitIntoBlocks(originalCode);
    const hasMultipleBlocks = blocks.length > 1;
    
    if (hasMultipleBlocks) {
        console.log(`Found ${blocks.length} test block(s) separated by chunk markers`);
        console.log('');
    }
    
    const rp = new RobinPath();
    let allErrors = [];
    let blockNumber = 0;
    let astToExport = null; // Store AST for export if there's a discrepancy
    
    for (const blockCode of blocks) {
        blockNumber++;
        const blockName = hasMultipleBlocks ? `Block ${blockNumber}` : 'Main';
        
        console.log(`\n${'─'.repeat(80)}`);
        console.log(`${blockName}:`);
        console.log('─'.repeat(80));
        
        // Trim the block code
        const trimmedBlock = blockCode.trim();
        
        if (!trimmedBlock) {
            console.log('  ⚠ Skipping empty block');
            continue;
        }
        
        try {
            const originalCode = trimmedBlock;
            let currentCode = originalCode;
            let finalCode = null;
            let finalAST = null;
            
            // Perform multiple round-trip cycles
            for (let cycle = 1; cycle <= numCycles; cycle++) {
                console.log(`\n  ${'='.repeat(76)}`);
                console.log(`  CYCLE ${cycle} of ${numCycles}`);
                console.log(`  ${'='.repeat(76)}`);
                
                // Step 1: Convert code -> AST
                console.log(`  Cycle ${cycle}, Step 1: Converting code to AST...`);
                let ast = await rp.getAST(currentCode);
                
                if (!ast || !Array.isArray(ast)) {
                    throw new Error('AST is not an array');
                }
                
                console.log(`  ✓ AST generated (${ast.length} top-level nodes)`);
                
                // Step 2: AST -> code
                console.log(`  Cycle ${cycle}, Step 2: Converting AST to code...`);
                let code = await rp.updateCodeFromAST(currentCode, ast);
                
                if (!code) {
                    throw new Error('Generated code is empty');
                }
                
                console.log('  ✓ Code generated');
                
                // Step 3: Use code from #2 to generate AST
                console.log(`  Cycle ${cycle}, Step 3: Converting code (from step 2) to AST...`);
                ast = await rp.getAST(code);
                
                if (!ast || !Array.isArray(ast)) {
                    throw new Error('AST is not an array');
                }
                
                console.log(`  ✓ AST generated (${ast.length} top-level nodes)`);
                
                // Step 4: Use AST from #3 to convert to code
                console.log(`  Cycle ${cycle}, Step 4: Converting AST (from step 3) to code...`);
                code = await rp.updateCodeFromAST(code, ast);
                
                if (!code) {
                    throw new Error('Generated code is empty');
                }
                
                console.log('  ✓ Code generated');
                
                // Update current code for next cycle
                currentCode = code;
                finalCode = code;
                finalAST = ast;
            }
            
            // Show original and final code with line numbers
            console.log('\n  ' + '─'.repeat(76));
            console.log('  FINAL COMPARISON');
            console.log('  ' + '─'.repeat(76));
            console.log('---original------->');
            const originalLines = originalCode.split('\n');
            originalLines.forEach((line, index) => {
                console.log(`  ${(index + 1).toString().padStart(3)} | ${line}`);
            });
            
            console.log('---final result------->');
            const finalLines = finalCode.split('\n');
            finalLines.forEach((line, index) => {
                console.log(`  ${(index + 1).toString().padStart(3)} | ${line}`);
            });
            console.log('');
            
            // Compare original vs final code
            console.log(`  Comparing original vs final code (after ${numCycles} cycle(s))...`);
            const comparison = compareCode(originalCode, finalCode, blockName);
            
            if (comparison.match) {
                console.log(`  ✓ Code matches perfectly after ${numCycles} cycle(s)!`);
            } else {
                console.log(`  ✗ Code mismatch detected after ${numCycles} cycle(s)!`);
                console.log('');
                
                // Store AST for export
                astToExport = finalAST;
                
                // Show summary statistics
                const s = comparison.summary;
                console.log('  Summary:');
                console.log('  ' + '─'.repeat(78));
                console.log(`    Total lines:          ${s.totalLines}`);
                console.log(`    Mismatched lines:     ${s.mismatchedLines} (${(s.mismatchedLines / s.totalLines * 100).toFixed(1)}%)`);
                console.log(`    Line count delta:     ${s.lineDelta > 0 ? '+' : ''}${s.lineDelta}`);
                console.log(`    Levenshtein total:    ${s.totalLevenshtein}`);
                console.log(`    Blank line issues:    ${s.blankLineDiff}`);
                console.log(`    Completely different: ${s.completelyDifferent}`);
                console.log(`    Minor differences:    ${s.minorDiff}`);
                console.log('');
                
                // Show first few discrepancies with context
                const showCount = Math.min(3, comparison.discrepancies.length);
                if (showCount > 0) {
                    console.log(`  First ${showCount} discrepancies:`);
                    console.log('  ' + '─'.repeat(78));
                    
                    for (let d = 0; d < showCount; d++) {
                        const disc = comparison.discrepancies[d];
                        console.log(`  Line ${disc.lineNumber} (Levenshtein: ${disc.levenshtein}):`);
                        console.log(`    Original: ${JSON.stringify(disc.original).slice(0, 80)}${disc.original.length > 77 ? '...' : ''}`);
                        console.log(`    Final:    ${JSON.stringify(disc.generated).slice(0, 80)}${disc.generated.length > 77 ? '...' : ''}`);
                    }
                    console.log('');
                }
                
                allErrors.push({
                    block: blockName,
                    filename,
                    summary: comparison.summary,
                    discrepancies: comparison.discrepancies
                });
                
                // Stop processing further blocks on mismatch
                console.log(`  ⚠ Stopping at ${blockName} due to code mismatch`);
                break;
            }
            
        } catch (error) {
            console.log(`  ✗ Error: ${error.message}`);
            console.error(error);
            allErrors.push({
                block: blockName,
                filename,
                error: error.message,
                stack: error.stack
            });
            
            // Stop processing further blocks on error
            console.log(`\n  ⚠ Stopping at ${blockName} due to error`);
            break;
        }
    }
    
    // Export AST to JSON file if there were discrepancies
    if (astToExport !== null && allErrors.length > 0) {
        try {
            // Generate JSON filename: replace .robin with .json
            const jsonFilename = filename.replace(/\.robin$/, '.json');
            const jsonFilePath = join(scriptsDir, jsonFilename);
            
            // Write AST as formatted JSON
            const jsonContent = JSON.stringify(astToExport, null, 2);
            writeFileSync(jsonFilePath, jsonContent, 'utf-8');
            
            console.log(`\n  📄 AST exported to: ${jsonFilename}`);
        } catch (error) {
            console.log(`  ⚠ Warning: Failed to export AST: ${error.message}`);
        }
    }
    
    console.log('\n' + '='.repeat(80));
    
    if (allErrors.length === 0) {
        console.log(`✓ Test ${testNumber} (${filename}) PASSED`);
        if (hasMultipleBlocks && blockNumber < blocks.length) {
            console.log(`  (Processed ${blockNumber} of ${blocks.length} block(s))`);
        }
        console.log('='.repeat(80));
        return true;
    } else {
        console.log(`✗ Test ${testNumber} (${filename}) FAILED`);
        console.log(`  ${allErrors.length} error(s) found`);
        if (hasMultipleBlocks && blockNumber < blocks.length) {
            console.log(`  (Stopped at block ${blockNumber} of ${blocks.length})`);
        }
        console.log('='.repeat(80));
        return false;
    }
}

/**
 * Parse command line arguments
 */
function parseArgs() {
    const args = process.argv.slice(2);
    const DEFAULT_CYCLES = 3;
    
    if (args.length === 0) {
        console.error('Usage: npm run test-code-convert -- <test-number> [--cycle <num>]');
        console.error('Example: npm run test-code-convert -- 0');
        console.error('         npm run test-code-convert -- 0-5');
        console.error('         npm run test-code-convert -- 0 --cycle 5');
        process.exit(1);
    }
    
    const testNumbers = [];
    let numCycles = DEFAULT_CYCLES;
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        // Check for --cycle or --cycles flag
        if (arg === '--cycle' || arg === '--cycles') {
            if (i + 1 >= args.length) {
                console.error(`Error: ${arg} requires a number`);
                process.exit(1);
            }
            const cycleValue = Number(args[i + 1]);
            if (isNaN(cycleValue) || cycleValue < 1 || !Number.isInteger(cycleValue)) {
                console.error(`Error: ${arg} must be a positive integer`);
                process.exit(1);
            }
            numCycles = cycleValue;
            i++; // Skip the next argument since we consumed it
            continue;
        }
        
        if (arg.includes('-') && !arg.startsWith('-')) {
            // Range: e.g., "0-5"
            const [start, end] = arg.split('-').map(Number);
            if (isNaN(start) || isNaN(end) || start > end) {
                console.error(`Invalid range: ${arg}`);
                process.exit(1);
            }
            for (let j = start; j <= end; j++) {
                testNumbers.push(j);
            }
        } else if (!arg.startsWith('--')) {
            // Single number (skip flags)
            const num = Number(arg);
            if (isNaN(num)) {
                console.error(`Invalid test number: ${arg}`);
                process.exit(1);
            }
            testNumbers.push(num);
        }
    }
    
    if (testNumbers.length === 0) {
        console.error('Error: No test numbers provided');
        process.exit(1);
    }
    
    return { testNumbers, numCycles };
}

/**
 * Main function
 */
async function main() {
    const { testNumbers, numCycles } = parseArgs();
    const results = [];
    
    console.log(`Running tests with ${numCycles} cycle(s) per test\n`);
    
    for (const testNumber of testNumbers) {
        try {
            const passed = await testFile(testNumber, numCycles);
            results.push({ testNumber, passed });
        } catch (error) {
            console.error(`\n✗ Test ${testNumber} failed with error:`, error.message);
            results.push({ testNumber, passed: false, error: error.message });
        }
    }
    
    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    
    for (const result of results) {
        const status = result.passed ? '✓ PASSED' : '✗ FAILED';
        const filename = testFiles[result.testNumber] || 'unknown';
        console.log(`  Test ${result.testNumber} (${filename}): ${status}`);
    }
    
    console.log('');
    console.log(`Total: ${results.length} test(s)`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log('='.repeat(80));
    
    if (failed > 0) {
        process.exit(1);
    }
}

// Run the tests
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});

