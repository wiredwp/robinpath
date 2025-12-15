/**
 * Code Converter Test Runner
 * 
 * Tests that code can be round-tripped through AST without changes:
 * 1. Read file and convert to AST
 * 2. Generate code from AST
 * 3. Compare line by line
 * 4. Handle multiple test blocks separated by "---"
 * 
 * Usage:
 *   npm run test-code-convert -- 0    (tests 00-custom.rp)
 *   npm run test-code-convert -- 1    (tests 01-variable-assignment.rp)
 *   npm run test-code-convert -- 0-5  (tests 0 through 5)
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
    '00-custom.rp',
    '01-variable-assignment.rp',
    '02-expressions.rp',
    '03-conditionals.rp',
    '04-loops.rp',
    '05-functions.rp',
    '06-do-blocks.rp',
    '07-into-syntax.rp',
    '08-subexpressions.rp',
    '09-objects-arrays.rp',
    '10-builtin-commands.rp',
    '11-modules.rp',
    '12-events.rp',
    '13-together.rp',
    '14-with.rp',
    '15-meta.rp',
    '16-decorator.rp',
    '17-line-continuation.rp',
    '18-template-strings.rp',
    '19-last-value.rp',
    '20-comments.rp',
];

/**
 * Split code into blocks separated by "---" lines
 */
function splitIntoBlocks(code) {
    const lines = code.split('\n');
    const blocks = [];
    let currentBlock = [];
    
    for (const line of lines) {
        if (line.trim() === '---') {
            if (currentBlock.length > 0) {
                blocks.push(currentBlock.join('\n'));
                currentBlock = [];
            }
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
 * Compare two code strings line by line
 */
function compareCode(original, generated, testName = '') {
    const originalLines = original.split('\n').map(normalizeLine);
    const generatedLines = generated.split('\n').map(normalizeLine);
    
    const maxLines = Math.max(originalLines.length, generatedLines.length);
    const discrepancies = [];
    
    for (let i = 0; i < maxLines; i++) {
        const origLine = originalLines[i] ?? '';
        const genLine = generatedLines[i] ?? '';
        
        if (origLine !== genLine) {
            discrepancies.push({
                lineNumber: i + 1,
                original: origLine,
                generated: genLine
            });
        }
    }
    
    return {
        match: discrepancies.length === 0,
        discrepancies
    };
}

/**
 * Test a single file
 */
async function testFile(testNumber) {
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
    
    // Split into blocks if "---" separator exists
    const blocks = splitIntoBlocks(originalCode);
    const hasMultipleBlocks = blocks.length > 1;
    
    if (hasMultipleBlocks) {
        console.log(`Found ${blocks.length} test block(s) separated by "---"`);
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
            // Step 1: Convert to AST
            console.log('  Step 1: Converting to AST...');
            const ast = await rp.getAST(trimmedBlock);
            
            if (!ast || !Array.isArray(ast)) {
                throw new Error('AST is not an array');
            }
            
            console.log(`  ✓ AST generated (${ast.length} top-level nodes)`);
            
            // Step 2: Generate code from AST
            console.log('  Step 2: Generating code from AST...');
            const generatedCode = await rp.updateCodeFromAST(trimmedBlock, ast);
            
            if (!generatedCode) {
                throw new Error('Generated code is empty');
            }
            
            console.log('  ✓ Code generated');
            
            // Step 3: Compare line by line
            console.log('  Step 3: Comparing original vs generated...');
            const comparison = compareCode(trimmedBlock, generatedCode, blockName);
            
            if (comparison.match) {
                console.log('  ✓ Code matches perfectly!');
            } else {
                console.log('  ✗ Code mismatch detected!');
                console.log('');
                console.log('  Discrepancies:');
                console.log('  ' + '─'.repeat(78));
                
                // Store AST for export
                astToExport = ast;
                
                for (const disc of comparison.discrepancies) {
                    console.log(`  Line ${disc.lineNumber}:`);
                    console.log(`    Original:  ${JSON.stringify(disc.original)}`);
                    console.log(`    Generated: ${JSON.stringify(disc.generated)}`);
                    console.log('');
                }
                
                // Show context around first discrepancy
                if (comparison.discrepancies.length > 0) {
                    const firstDisc = comparison.discrepancies[0];
                    const contextLines = 3;
                    const startLine = Math.max(0, firstDisc.lineNumber - contextLines - 1);
                    const endLine = Math.min(
                        trimmedBlock.split('\n').length,
                        firstDisc.lineNumber + contextLines
                    );
                    
                    console.log('  Context around first discrepancy:');
                    console.log('  ' + '─'.repeat(78));
                    
                    const originalLines = trimmedBlock.split('\n');
                    const generatedLines = generatedCode.split('\n');
                    
                    for (let i = startLine; i < endLine; i++) {
                        const marker = i === firstDisc.lineNumber - 1 ? '>>> ' : '    ';
                        const origLine = originalLines[i] ?? '';
                        const genLine = generatedLines[i] ?? '';
                        
                        if (i === firstDisc.lineNumber - 1) {
                            console.log(`  ${marker}Line ${i + 1} (ORIGINAL):  ${JSON.stringify(origLine)}`);
                            console.log(`  ${marker}Line ${i + 1} (GENERATED): ${JSON.stringify(genLine)}`);
                        } else {
                            console.log(`  ${marker}Line ${i + 1}: ${JSON.stringify(origLine)}`);
                        }
                    }
                    console.log('');
                }
                
                allErrors.push({
                    block: blockName,
                    filename,
                    discrepancies: comparison.discrepancies
                });
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
        }
    }
    
    // Export AST to JSON file if there were discrepancies
    if (astToExport !== null && allErrors.length > 0) {
        try {
            // Generate JSON filename: replace .rp with .json
            const jsonFilename = filename.replace(/\.rp$/, '.json');
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
        console.log('='.repeat(80));
        return true;
    } else {
        console.log(`✗ Test ${testNumber} (${filename}) FAILED`);
        console.log(`  ${allErrors.length} error(s) found`);
        console.log('='.repeat(80));
        return false;
    }
}

/**
 * Parse command line arguments
 */
function parseArgs() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.error('Usage: npm run test-code-convert -- <test-number>');
        console.error('Example: npm run test-code-convert -- 0');
        console.error('         npm run test-code-convert -- 0-5');
        process.exit(1);
    }
    
    const testNumbers = [];
    
    for (const arg of args) {
        if (arg.includes('-') && !arg.startsWith('-')) {
            // Range: e.g., "0-5"
            const [start, end] = arg.split('-').map(Number);
            if (isNaN(start) || isNaN(end) || start > end) {
                console.error(`Invalid range: ${arg}`);
                process.exit(1);
            }
            for (let i = start; i <= end; i++) {
                testNumbers.push(i);
            }
        } else {
            // Single number
            const num = Number(arg);
            if (isNaN(num)) {
                console.error(`Invalid test number: ${arg}`);
                process.exit(1);
            }
            testNumbers.push(num);
        }
    }
    
    return testNumbers;
}

/**
 * Main function
 */
async function main() {
    const testNumbers = parseArgs();
    const results = [];
    
    for (const testNumber of testNumbers) {
        try {
            const passed = await testFile(testNumber);
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

