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
 *   - npm run test                           (runs all RP script tests, then all JavaScript case tests)
 *   - npm run test -- <test-number>          (runs a specific RP script test)
 *   - npm run test -- <test-number> --repeat <count>  (runs a test multiple times and shows average runtime)
 *   - npm run test -- <test-number-1> <test-number-2> ...  (runs multiple specific tests)
 *   - npm run test -- <start>-<end>          (runs a range of tests, e.g., 0-7 runs tests 0 through 7)
 *   - npm run test -- c<case-number>         (runs a specific JavaScript case test)
 *   - npm run test -- c<start>-c<end>        (runs a range of case tests, e.g., c0-c5 runs case tests 0 through 5)
 *   - npm run test -- all                    (runs all RP script tests, then all JavaScript case tests)
 * 
 * Examples:
 *   - npm run test -- 0                      (runs test 0)
 *   - npm run test -- 0 1 2 3 4 5            (runs tests 0, 1, 2, 3, 4, 5)
 *   - npm run test -- 0-7                    (runs tests 0 through 7)
 *   - npm run test -- 5 --repeat 100         (runs test 5 one hundred times and shows average runtime)
 *   - npm run test -- c0-c5                  (runs case tests 0 through 5)
 *   - npm run test -- all                    (runs all tests)
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
    '13-meta.rp',
    '14-decorator.rp',
    '15-empty.rp',
    '16-together.rp',
    '17-with.rp',
    '18-empty.rp',
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
const args = process.argv.slice(2);
let testNumbers = []; // Array of test numbers to run
let testCase = null; // Single case test (for backward compatibility)
let testCaseNumbers = []; // Array of case test numbers to run
let runAll = false;
let repeatCount = 1; // Default to 1 run

// Parse arguments
// First pass: extract --repeat flag and its value
const processedArgs = [];
let repeatValue = null;
for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    // Check for --repeat flag
    if (arg === '--repeat') {
        if (i + 1 >= args.length) {
            console.error('Error: --repeat requires a number argument.');
            console.error('Usage: npm run test -- <test-number> --repeat <count>');
            process.exit(1);
        }
        const nextArg = args[i + 1];
        const parsedRepeat = parseInt(nextArg, 10);
        if (isNaN(parsedRepeat) || parsedRepeat < 1) {
            console.error('Error: Invalid repeat count. Must be a positive number.');
            console.error(`Received: "${nextArg}"`);
            process.exit(1);
        }
        repeatValue = parsedRepeat;
        i++; // Skip the next argument (the count)
        continue;
    }
    
    // Add non-repeat arguments to processed list
    processedArgs.push(arg);
}

// Use the processed arguments (without --repeat and its value) for further parsing
const filteredArgs = processedArgs;
if (repeatValue !== null) {
    repeatCount = repeatValue;
}

// Now parse the filtered arguments
for (let i = 0; i < filteredArgs.length; i++) {
    const arg = filteredArgs[i];
    
    // Check for "all" command
    if (arg === 'all') {
        runAll = true;
        continue;
    }
    
    // Check for case test range (e.g., "c0-c5")
    if (arg.startsWith('c') && arg.includes('-')) {
        const parts = arg.split('-');
        if (parts.length === 2 && parts[0].startsWith('c') && parts[1].startsWith('c')) {
            const start = parseInt(parts[0].substring(1), 10);
            const end = parseInt(parts[1].substring(1), 10);
            if (!isNaN(start) && !isNaN(end) && start >= 0 && end >= start && end < testCases.length) {
                for (let j = start; j <= end; j++) {
                    testCaseNumbers.push(j);
                }
                continue;
            } else {
                console.error('='.repeat(60));
                console.error('Invalid case test range:', arg);
                console.error('='.repeat(60));
                console.error();
                console.error('Available JavaScript Case Tests:');
                testCases.forEach((file, index) => {
                    console.error(`  c${index}: ${file}`);
                });
                console.error();
                console.error('Usage: npm run test -- c<start>-c<end>');
                console.error('Example: npm run test -- c0-c5  (runs case tests 0 through 5)');
                process.exit(1);
            }
        }
    }
    
    // Check for case test (starts with 'c')
    if (arg.startsWith('c')) {
        const caseNumber = parseInt(arg.substring(1), 10);
        if (isNaN(caseNumber) || caseNumber < 0 || caseNumber >= testCases.length) {
            console.error('='.repeat(60));
            console.error('Invalid test case:', arg);
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
        testCaseNumbers.push(caseNumber);
        continue;
    }
    
    // Check for range syntax (e.g., "0-7")
    if (arg.includes('-')) {
        const parts = arg.split('-');
        if (parts.length === 2) {
            const start = parseInt(parts[0], 10);
            const end = parseInt(parts[1], 10);
            if (!isNaN(start) && !isNaN(end) && start >= 0 && end >= start && end < testFiles.length) {
                for (let j = start; j <= end; j++) {
                    testNumbers.push(j);
                }
                continue;
            }
        }
    }
    
    // Check for numeric test number
    const testNum = parseInt(arg, 10);
    if (!isNaN(testNum)) {
        if (testNum < 0 || testNum >= testFiles.length) {
            console.error('='.repeat(60));
            console.error('Invalid test number:', testNum);
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
        testNumbers.push(testNum);
    }
}

// Remove duplicates and sort
testNumbers = [...new Set(testNumbers)].sort((a, b) => a - b);
testCaseNumbers = [...new Set(testCaseNumbers)].sort((a, b) => a - b);

// Validate --repeat usage: it only works with RP script tests, not case tests
if (repeatCount > 1 && testCaseNumbers.length > 0) {
    console.error('Error: --repeat can only be used with RP script tests, not JavaScript case tests.');
    console.error('Usage: npm run test -- <test-number> --repeat <count>');
    console.error('Example: npm run test -- 5 --repeat 100');
    process.exit(1);
}

// If no arguments provided (after filtering), run all tests
if (filteredArgs.length === 0) {
    runAll = true;
}

// If we have case tests, don't process test numbers
// Also handle backward compatibility: if testCase is set but testCaseNumbers is empty, add it
if (testCase !== null && testCaseNumbers.length === 0) {
    testCaseNumbers.push(testCase);
}
if (testCaseNumbers.length > 0) {
    testNumbers = [];
    testCase = null; // Clear single testCase since we're using testCaseNumbers
}

// Helper function to suppress console output
const suppressConsole = async (callback) => {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;
    const originalDebug = console.debug;
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    
    // Create no-op functions
    const noop = () => {};
    const noopWrite = function(chunk, encoding, callback) {
        if (typeof callback === 'function') {
            callback();
        }
        return true;
    };
    
    // Override console methods
    console.log = noop;
    console.error = noop;
    console.warn = noop;
    console.info = noop;
    console.debug = noop;
    
    // Override stdout/stderr write to suppress output
    process.stdout.write = noopWrite;
    process.stderr.write = noopWrite;
    
    try {
        return await callback();
    } finally {
        // Restore original methods
        console.log = originalLog;
        console.error = originalError;
        console.warn = originalWarn;
        console.info = originalInfo;
        console.debug = originalDebug;
        process.stdout.write = originalStdoutWrite;
        process.stderr.write = originalStderrWrite;
    }
};

// Helper function to execute the actual test logic
const executeTestLogic = async (testFilePath, isCaseTest, suppressOutput = false) => {
    if (suppressOutput) {
        // Suppress console before importing modules (they might capture console at import time)
        return suppressConsole(async () => {
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
        });
    } else {
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
        
        // If case test(s) were provided, run them
        if (testCaseNumbers.length > 0) {
            const results = [];
            let totalPassed = 0;
            let totalFailed = 0;
            const overallStartTime = Date.now();
            
            for (const caseNum of testCaseNumbers) {
                const caseFileName = testCases[caseNum];
                const caseFilePath = join(__dirname, 'cases', caseFileName);
                
                if (!existsSync(caseFilePath)) {
                    console.error(`? Test case file not found: ${caseFilePath}`);
                    results.push({ caseNum, passed: false, error: 'File not found' });
                    totalFailed++;
                    continue;
                }
                
                console.log('='.repeat(60));
                console.log(`Running JavaScript Case Test c${caseNum}: ${caseFileName}`);
                console.log('='.repeat(60));
                console.log();
                console.log('Note: This is a JavaScript test that requires calling RobinPath class methods.');
                console.log();
                
                const startTime = Date.now();
                
                try {
                    await executeTestLogic(caseFilePath, true);
                    const endTime = Date.now();
                    const executionTime = endTime - startTime;
                    totalPassed++;
                    results.push({ caseNum, passed: true, time: executionTime });
                    console.log();
                    console.log('='.repeat(60));
                    console.log(`? JavaScript Case Test c${caseNum} (${caseFileName}) completed in ${executionTime}ms`);
                    console.log('='.repeat(60));
                } catch (error) {
                    totalFailed++;
                    results.push({ caseNum, passed: false, error: error.message });
                    console.error();
                    console.error('='.repeat(60));
                    console.error(`? JavaScript Case Test c${caseNum} (${caseFileName}) FAILED`);
                    console.error('='.repeat(60));
                    console.error('Error:', error.message);
                    if (error.stack) {
                        console.error(error.stack);
                    }
                }
                console.log();
            }
            
            // Summary if multiple tests
            if (testCaseNumbers.length > 1) {
                const overallEndTime = Date.now();
                const totalWallClockTime = overallEndTime - overallStartTime;
                const totalRuntime = results.filter(r => r.passed).reduce((sum, r) => sum + (r.time || 0), 0);
                
                console.log('='.repeat(60));
                console.log('Case Test Summary');
                console.log('='.repeat(60));
                console.log(`Total: ${testCaseNumbers.length} | Passed: ${totalPassed} | Failed: ${totalFailed}`);
                console.log(`Total Runtime: ${totalRuntime.toFixed(2)}ms`);
                console.log('='.repeat(60));
                
                if (totalFailed > 0) {
                    console.log();
                    console.log('Failed tests:');
                    results.filter(r => !r.passed).forEach(r => {
                        console.log(`  c${r.caseNum}: ${testCases[r.caseNum]} - ${r.error || 'Unknown error'}`);
                    });
                }
            }
            
            process.exit(totalFailed > 0 ? 1 : 0);
        }
        
        // If specific test numbers were provided, run them
        if (testNumbers.length > 0) {
            const results = [];
            let totalPassed = 0;
            let totalFailed = 0;
            const overallStartTime = Date.now();
            
            for (const testNum of testNumbers) {
                const testFileName = testFiles[testNum];
                const testFilePath = join(scriptsDir, testFileName);
                
                if (!existsSync(testFilePath)) {
                    console.error(`? Test file not found: ${testFilePath}`);
                    results.push({ testNum, passed: false, error: 'File not found' });
                    totalFailed++;
                    continue;
                }
                
                console.log('='.repeat(60));
                if (repeatCount > 1) {
                    console.log(`Running RP Script Test ${testNum}: ${testFileName} (${repeatCount} times)`);
                } else {
                    console.log(`Running RP Script Test ${testNum}: ${testFileName}`);
                }
                console.log('='.repeat(60));
                console.log();
                
                const executionTimes = [];
                let testPassed = true;
                let testError = null;
                
                // Run the test repeatCount times
                for (let run = 1; run <= repeatCount; run++) {
                    // Enable debug mode for test 6 via environment variable (only on first run if repeating)
                    if (testNum === 6 && repeatCount === 1) {
                        // process.env.VITE_DEBUG = 'true';
                        console.log('DEBUG MODE ENABLED FOR TEST 6 (via VITE_DEBUG=true)');
                    } else if (testNum === 6 && repeatCount > 1) {
                        // Disable debug mode when repeating to avoid log spam
                        process.env.VITE_DEBUG = 'false';
                    }
                    
                    const startTime = Date.now();
                    
                    try {
                        // Suppress console output when repeating
                        await executeTestLogic(testFilePath, false, repeatCount > 1);
                        const endTime = Date.now();
                        const executionTime = endTime - startTime;
                        executionTimes.push(executionTime);
                        
                        if (repeatCount === 1) {
                            console.log(`  ? Passed (${executionTime}ms)`);
                        }
                        // Don't show individual run messages when repeating
                    } catch (error) {
                        testPassed = false;
                        testError = error.message;
                        if (error.stack && repeatCount === 1) {
                            console.error(error.stack);
                        } else {
                            console.error(`  Run ${run} failed: ${error.message}`);
                        }
                        break; // Stop repeating if test fails
                    }
                }
                
                console.log();
                
                if (testPassed) {
                    const totalTestTime = executionTimes.reduce((a, b) => a + b, 0);
                    const avgTime = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;
                    if (repeatCount > 1) {
                        const minTime = Math.min(...executionTimes);
                        const maxTime = Math.max(...executionTimes);
                        console.log('='.repeat(60));
                        console.log(`? RP Script Test ${testNum} (${testFileName}) - All ${repeatCount} runs passed`);
                        console.log(`  Total: ${totalTestTime}ms`);
                        console.log(`  Average: ${avgTime.toFixed(2)}ms`);
                        console.log(`  Min: ${minTime}ms | Max: ${maxTime}ms`);
                        console.log('='.repeat(60));
                    } else {
                        console.log('='.repeat(60));
                        console.log(`? RP Script Test ${testNum} (${testFileName}) completed in ${executionTimes[0]}ms`);
                        console.log('='.repeat(60));
                    }
                    totalPassed++;
                    results.push({ testNum, passed: true, times: executionTimes, totalTime: totalTestTime, avgTime: avgTime });
                } else {
                    console.error('='.repeat(60));
                    console.error(`? RP Script Test ${testNum} (${testFileName}) FAILED`);
                    console.error('='.repeat(60));
                    if (testError) {
                        console.error('Error:', testError);
                    }
                    totalFailed++;
                    results.push({ testNum, passed: false, error: testError, totalTime: 0, avgTime: 0 });
                }
                console.log();
            }
            
            // Summary if multiple tests
            const overallEndTime = Date.now();
            const totalWallClockTime = overallEndTime - overallStartTime;
            
            // Calculate total runtime by summing all average times from each test
            // This represents the total time to run all tests once
            const passedResults = results.filter(r => r.passed);
            const totalRuntime = passedResults.reduce((sum, r) => {
                // Use avgTime if available (from repeated runs), otherwise use the single run time
                const avgTime = r.avgTime !== undefined ? r.avgTime : (r.times && r.times[0] ? r.times[0] : 0);
                return sum + avgTime;
            }, 0);
            
            if (testNumbers.length > 1) {
                console.log('='.repeat(60));
                console.log('Test Summary');
                console.log('='.repeat(60));
                console.log(`Total: ${testNumbers.length} | Passed: ${totalPassed} | Failed: ${totalFailed}`);
                console.log(`Total Runtime: ${totalRuntime.toFixed(2)}ms`);
                console.log('='.repeat(60));
                
                if (totalFailed > 0) {
                    console.log();
                    console.log('Failed tests:');
                    results.filter(r => !r.passed).forEach(r => {
                        console.log(`  ${r.testNum}: ${testFiles[r.testNum]} - ${r.error || 'Unknown error'}`);
                    });
                }
            }
            
            process.exit(totalFailed > 0 ? 1 : 0);
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
