/**
 * RobinPath Test Runner
 * 
 * This test runner supports two types of tests:
 * 
 * 1. RP Script Tests (test/scripts/*.rp):
 *    - These are RobinPath language tests written in .rp files
 *    - They test the language features and syntax
 *    - Run with: npm run test -- <test-number>
 *    - Example: npm run test -- 0  (runs 01-variable-assignment.rp)
 * 
 * 2. JavaScript Case Tests (test/cases/c*.js):
 *    - These are JavaScript tests that require calling RobinPath class methods
 *    - They test the JavaScript API (getAST, getEventAST, etc.)
 *    - Run with: npm run test -- c<case-number>
 *    - Example: npm run test -- c0  (runs c0-getAST.js)
 * 
 * Usage:
 *   - npm run test                    (runs all RP script tests, then all JavaScript case tests)
 *   - npm run test -- <test-number>   (runs a specific RP script test)
 *   - npm run test -- c<case-number>  (runs a specific JavaScript case test)
 */

import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Worker } from 'worker_threads';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get the scripts directory (test scripts are in test/scripts/)
const scriptsDir = join(__dirname, 'scripts');

// Define test files mapping (test number -> filename)
// These are RP script tests that test the RobinPath language features
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
    '13-decorators.rp',
    '15-end-command.rp',
    '16-together.rp',
    '17-repeat.rp',
    '18-dom-click.rp',
    '19-parenthesized-calls.rp',
    '20-comparison-functions.rp',
    '21-line-continuation.rp',
    '22-tag-meta.rp'
];

// Define test case files mapping (case number -> filename)
// These are JavaScript tests that require calling RobinPath class methods
const testCases = [
    'c0-getAST.js',
    'c1-getASTWithState.js',
    'c2-getExtractedFunctions.js',
    'c3-commentAST.js',
    'c4-togetherAST.js',
    'c5-getEventAST.js'
];

// Parse command-line arguments
const testArg = process.argv[2];
let testNumber = null;
let testCase = null;
let runAll = false;


if (testArg === undefined) {
    // No argument provided - run all tests
    runAll = true;
} else if (testArg.startsWith('c')) {
    // It's a case test (starts with 'c')
    const caseNumber = parseInt(testArg.substring(1), 10);
    if (isNaN(caseNumber) || caseNumber < 0 || caseNumber >= testCases.length) {
        console.error('='.repeat(60));
        console.error('Invalid test case:', testArg);
        console.error('='.repeat(60));
        console.error();
        console.error('Available JavaScript Case Tests:');
        testCases.forEach((file, index) => {
            console.error(`  c${index}: ${file}`);
        });
        console.error();
        console.error('Usage: npm run test -- c<case-number>');
        console.error('Example: npm run test -- c0  (runs c0-getAST.js)');
        process.exit(1);
    }
    testCase = caseNumber;
} else {
    // It's a numeric test (RP script test)
    testNumber = parseInt(testArg, 10);
    if (isNaN(testNumber) || testNumber < 0 || testNumber >= testFiles.length) {
        console.error('='.repeat(60));
        console.error('Invalid test number:', testArg);
        console.error('='.repeat(60));
        console.error();
        console.error('Available RP Script Tests:');
        testFiles.forEach((file, index) => {
            console.error(`  ${index}: ${file}`);
        });
        console.error();
        console.error('Usage: npm run test -- <test-number>');
        console.error('Example: npm run test -- 0  (runs 01-variable-assignment.rp)');
        process.exit(1);
    }
}

// Helper function to execute the actual test logic
const executeTestLogic = async (testFilePath, isCaseTest) => {
    if (isCaseTest) {
        // For case tests, import and run the test function
        const importPath = testFilePath.startsWith('file://') ? testFilePath : `file://${testFilePath}`;
        const caseModule = await import(importPath);
        
        if (typeof caseModule.runTest !== 'function') {
            throw new Error(`Test case must export a runTest function`);
        }
        await caseModule.runTest();
    } else {
        // For RP script tests, read and execute with RobinPath
        const { readFileSync } = await import('fs');
        const { RobinPath } = await import('../dist/index.js');
        const testScript = readFileSync(testFilePath, 'utf-8');
        const rp = new RobinPath();
        await rp.executeScript(testScript);
    }
};


// Run the selected test(s)
(async () => {
    try {
        // If runAll is true, run all RP script tests first, then all JavaScript case tests
        if (runAll) {
            console.log('='.repeat(60));
            console.log('Running All Tests');
            console.log('='.repeat(60));
            console.log();
            console.log('Phase 1: Running all RP Script Tests');
            console.log('='.repeat(60));
            console.log();
            
            let totalRpTests = 0;
            let passedRpTests = 0;
            let failedRpTests = 0;
            const rpTestResults = [];
            
            // Run all RP script tests
            for (let i = 0; i < testFiles.length; i++) {
                const testFileName = testFiles[i];
                const testFilePath = join(scriptsDir, testFileName);
                
                if (!existsSync(testFilePath)) {
                    console.error(`? Test file not found: ${testFilePath}`);
                    failedRpTests++;
                    rpTestResults.push({ index: i, file: testFileName, passed: false, error: 'File not found' });
                    continue;
                }
                
                totalRpTests++;
                console.log(`[${i}/${testFiles.length - 1}] Running: ${testFileName}`);
                
                const startTime = Date.now();
                
                try {
                    await executeTestLogic(testFilePath, false);
                    const endTime = Date.now();
                    const executionTime = endTime - startTime;
                    passedRpTests++;
                    rpTestResults.push({ index: i, file: testFileName, passed: true, time: executionTime });
                    console.log(`  ? Passed (${executionTime}ms)`);
                } catch (error) {
                    failedRpTests++;
                    rpTestResults.push({ index: i, file: testFileName, passed: false, error: error.message });
                    console.error(`  ? Failed: ${error.message}`);
                }
            }
            
            console.log();
            console.log('='.repeat(60));
            console.log('RP Script Tests Summary');
            console.log('='.repeat(60));
            console.log(`Total: ${totalRpTests} | Passed: ${passedRpTests} | Failed: ${failedRpTests}`);
            console.log('='.repeat(60));
            console.log();
            
            if (failedRpTests > 0) {
                console.log('Failed tests:');
                rpTestResults.filter(r => !r.passed).forEach(r => {
                    console.log(`  ${r.index}: ${r.file} - ${r.error || 'Unknown error'}`);
                });
                console.log();
            }
            
            // Now run all JavaScript case tests
            console.log('='.repeat(60));
            console.log('Phase 2: Running all JavaScript Case Tests');
            console.log('='.repeat(60));
            console.log();
            
            let totalCaseTests = 0;
            let passedCaseTests = 0;
            let failedCaseTests = 0;
            const caseTestResults = [];
            
            for (let i = 0; i < testCases.length; i++) {
                const caseFileName = testCases[i];
                const caseFilePath = join(__dirname, 'cases', caseFileName);
                
                if (!existsSync(caseFilePath)) {
                    console.error(`? Test case file not found: ${caseFilePath}`);
                    failedCaseTests++;
                    caseTestResults.push({ index: i, file: caseFileName, passed: false, error: 'File not found' });
                    continue;
                }
                
                totalCaseTests++;
                console.log(`[c${i}] Running: ${caseFileName}`);
                
                const startTime = Date.now();
                
                try {
                    console.log(`Running: ${caseFilePath}`);
                    await executeTestLogic(caseFilePath, true);
                    const endTime = Date.now();
                    const executionTime = endTime - startTime;
                    passedCaseTests++;
                    caseTestResults.push({ index: i, file: caseFileName, passed: true, time: executionTime });
                    console.log(`  ? Passed (${executionTime}ms)`);
                } catch (error) {
                    failedCaseTests++;
                    caseTestResults.push({ index: i, file: caseFileName, passed: false, error: error.message });
                    console.error(`  ? Failed: ${error.message}`);
                }
            }
            
            console.log();
            console.log('='.repeat(60));
            console.log('JavaScript Case Tests Summary');
            console.log('='.repeat(60));
            console.log(`Total: ${totalCaseTests} | Passed: ${passedCaseTests} | Failed: ${failedCaseTests}`);
            console.log('='.repeat(60));
            console.log();
            
            if (failedCaseTests > 0) {
                console.log('Failed tests:');
                caseTestResults.filter(r => !r.passed).forEach(r => {
                    console.log(`  c${r.index}: ${r.file} - ${r.error || 'Unknown error'}`);
                });
                console.log();
            }
            
            // Final summary
            console.log('='.repeat(60));
            console.log('Final Summary');
            console.log('='.repeat(60));
            const totalTests = totalRpTests + totalCaseTests;
            const totalPassed = passedRpTests + passedCaseTests;
            const totalFailed = failedRpTests + failedCaseTests;
            console.log(`Total Tests: ${totalTests}`);
            console.log(`Passed: ${totalPassed}`);
            console.log(`Failed: ${totalFailed}`);
            console.log('='.repeat(60));
        
            if (totalFailed > 0) {
                process.exit(1);
            } else {
                process.exit(0);
            }
        }
        
        // If a specific test case was provided, run only that case
        if (testCase !== null) {
            const caseFileName = testCases[testCase];
            const caseFilePath = join(__dirname, 'cases', caseFileName);
            
            if (!existsSync(caseFilePath)) {
                console.error(`? Test case file not found: ${caseFilePath}`);
                process.exit(1);
            }
            
            console.log('='.repeat(60));
            console.log(`Running JavaScript Case Test c${testCase}: ${caseFileName}`);
            console.log('='.repeat(60));
            console.log();
            console.log('Note: This is a JavaScript test that requires calling RobinPath class methods.');
            console.log();
            
            const startTime = Date.now();
            
            try {
                await executeTestLogic(caseFilePath, true);
                const endTime = Date.now();
                const executionTime = endTime - startTime;
                console.log();
                console.log('='.repeat(60));
                console.log(`? JavaScript Case Test c${testCase} (${caseFileName}) completed in ${executionTime}ms`);
                console.log('='.repeat(60));
                process.exit(0);
            } catch (error) {
                console.error();
                console.error('='.repeat(60));
                console.error(`? JavaScript Case Test c${testCase} (${caseFileName}) FAILED`);
                console.error('='.repeat(60));
                console.error('Error:', error.message);
                if (error.stack) {
                    console.error(error.stack);
                }
                process.exit(1);
            }
        }
        
        // If a specific test number was provided, run only that test
        if (testNumber !== null) {
            const testFileName = testFiles[testNumber];
            const testFilePath = join(scriptsDir, testFileName);
            
            if (!existsSync(testFilePath)) {
                console.error(`? Test file not found: ${testFilePath}`);
                process.exit(1);
            }
            
            console.log('='.repeat(60));
            console.log(`Running RP Script Test ${testNumber}: ${testFileName}`);
            console.log('='.repeat(60));
            console.log();
            console.log('Note: This is a RobinPath language test written in .rp script format.');
            console.log();
            
            const startTime = Date.now();
            
            try {
                await executeTestLogic(testFilePath, false);
                const endTime = Date.now();
                const executionTime = endTime - startTime;
                console.log();
                console.log('='.repeat(60));
                console.log(`? RP Script Test ${testNumber} (${testFileName}) completed in ${executionTime}ms`);
                console.log('='.repeat(60));
                process.exit(0);
            } catch (error) {
                console.error();
                console.error('='.repeat(60));
                console.error(`? RP Script Test ${testNumber} (${testFileName}) FAILED`);
                console.error('='.repeat(60));
                if (error.stack) {
                    console.error(error.stack);
                } else {
                    console.error('Error:', error.message);
                }
                process.exit(1);
            }
        }
        
    } catch (error) {
        console.error();
        console.error('='.repeat(60));
        console.error('Error executing test:');
        console.error(error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        console.error('='.repeat(60));
        process.exit(1);
    }
})();
