/**
 * RobinPath Test Runner
 * 
 * This test runner supports two types of tests:
 * 
 * 1. RP Script Tests (test/scripts/*.robin):
 *    - These are RobinPath language tests written in .robin files
 *    - They test the language features and syntax
 *    - Run with: npm run test -- <test-number>
 *    - Example: npm run test -- 0  (runs 01-variable-assignment.robin)
 * 
 * 2. RobinPath Sample Tests (test/samples/s*.robin):
 *    - These are RobinPath sample scripts that test complex scenarios
 *    - Run with: npm run test -- s<sample-number>
 *    - Example: npm run test -- s0  (runs s0-calculator-engine.robin)
 * 
 * 3. JavaScript Case Tests (test/cases/c*.js):
 *    - These are JavaScript tests that require calling RobinPath class methods
 *    - They test the JavaScript API (getAST, getEventAST, etc.)
 *    - Run with: npm run test -- c<case-number>
 *    - Example: npm run test -- c0  (runs c0-getAST.js)
 * 
 * Usage:
 *   - npm run test                           (runs all script tests, samples, and case tests)
 *   - npm run test -- <test-number>          (runs a specific RP script test)
 *   - npm run test -- s<sample-number>       (runs a specific RobinPath sample test)
 *   - npm run test -- <test-number> --repeat <count>  (runs a test multiple times and shows average runtime)
 *   - npm run test -- <test-number-1> <test-number-2> ...  (runs multiple specific tests)
 *   - npm run test -- <start>-<end>          (runs a range of tests, e.g., 0-7 runs tests 0 through 7)
 *   - npm run test -- s<start>-s<end>        (runs a range of sample tests, e.g., s0-s5 runs samples 0 through 5)
 *   - npm run test -- c<case-number>         (runs a specific JavaScript case test)
 *   - npm run test -- c<start>-c<end>        (runs a range of case tests, e.g., c0-c5 runs case tests 0 through 5)
 *   - npm run test -- all                    (runs all script tests, samples, and case tests)
 *   - npm run test -- --file <file-path>     (runs a specific RP file directly)
 * 
 * Examples:
 *   - npm run test -- 0                      (runs test 0)
 *   - npm run test -- 0 1 2 3 4 5            (runs tests 0, 1, 2, 3, 4, 5)
 *   - npm run test -- 0-7                    (runs tests 0 through 7)
 *   - npm run test -- 5 --repeat 100         (runs test 5 one hundred times and shows average runtime)
 *   - npm run test -- c0-c5                  (runs case tests 0 through 5)
 *   - npm run test -- all                    (runs all tests)
 *   - npm run test -- --file test.robin      (runs test.robin from test/scripts/ or current directory)
 *   - npm run test -- --file test/scripts/test.robin  (runs test.robin with full path)
 *   - npm run test -- --file test.robin --repeat 10   (runs test.robin 10 times)
 */

import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Worker } from 'worker_threads';
import { cpus } from 'os';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get the scripts directory (test scripts are in test/scripts/)
const scriptsDir = join(__dirname, 'scripts');
const samplesDir = join(__dirname, 'samples');

// Define test files mapping (test number -> filename)
// These are RP script tests that test the RobinPath language features
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
    '22-set-assignment.robin',
    '23-do-decorators.robin',
    '24-nested-var-decorators.robin',
    '25-together-decorators.robin',
    '26-title-decorator.robin',
];

// Define sample files mapping (sample number -> filename)
// These are RobinPath sample scripts in test/samples/
const sampleFiles = [
    's0-calculator-engine.robin',
    's1-event-workflow.robin',
    's2-data-pipeline.robin',
    's3-state-machine.robin',
    's4-recursive-algorithms.robin',
    's5-game-simulation.robin',
    's6-validation-engine.robin',
    's7-task-scheduler.robin',
    's8-template-renderer.robin',
    's9-inventory-system.robin',
];

// Define test case files mapping (case number -> filename)
// These are JavaScript tests that require calling RobinPath class methods
const testCases = [
    'c0-getAST.js',
    'c1-getExtractedFunctions.js',
    'c2-commentAST.js',
    'c3-togetherAST.js',
    'c4-getEventAST.js',
    'c5-end-command.js',
];

// Define AST test case files mapping (case number -> filename)
// These are JavaScript tests for AST reading, updating, and code generation
// Each AST test file should match a corresponding script file in test/scripts/
// Example: a1-variable-assignment.js matches 01-variable-assignment.robin
const astTestCases = [
    'ast/a0-custom.js', // a0 - matches a0-custom.robin
    'ast/a1-variable-assignment.js', // a1 - matches 01-variable-assignment.robin
    'ast/a2-expressions.js',         // a2 - matches 02-expressions.robin
    'ast/a3-conditionals.js',         // a3 - matches 03-conditionals.robin
    'ast/a4-loops.js',                 // a4 - matches 04-loops.robin
    'ast/a5-functions.js',             // a5 - matches 05-functions.robin
    'ast/a6-do-blocks.js',             // a6 - matches 06-do-blocks.robin
    'ast/a7-into-syntax.js',           // a7 - matches 07-into-syntax.robin
    'ast/a8-subexpressions.js',       // a8 - matches 08-subexpressions.robin
    'ast/a9-objects-arrays.js',       // a9 - matches 09-objects-arrays.robin
    'ast/a10-builtin-commands.js',     // a10 - matches 10-builtin-commands.robin
    'ast/a11-modules.js',              // a11 - matches 11-modules.robin
    'ast/a12-events.js',               // a12 - matches 12-events.robin
    'ast/a13-together.js',             // a13 - matches 13-together.robin
    'ast/a14-with.js',                 // a14 - matches 14-with.robin
    'ast/a15-meta.js',                 // a15 - matches 15-meta.robin
    'ast/a16-decorator.js',            // a16 - matches 16-decorator.robin
    'ast/a17-line-continuation.js',    // a17 - matches 17-line-continuation.robin
    'ast/a18-template-strings.js',     // a18 - matches 18-template-strings.robin
    'ast/a19-last-value.js',           // a19 - matches 19-last-value.robin
    'ast/a20-comments.js',             // a20 - matches 20-comments.robin
    'ast/a21-fenced.js',               // a21 - matches 21-fenced.robin
    'ast/a22-set-assignment.js',       // a22 - matches 22-set-assignment.robin
    'ast/a23-do-decorators.js',        // a23 - matches 23-do-decorators.robin
    'ast/a24-nested-var-decorators.js', // a24 - matches 24-nested-var-decorators.robin
    'ast/a25-together-decorators.js',  // a25 - matches 25-together-decorators.robin
    'ast/a26-title-decorator.js',      // a26 - matches 26-title-decorator.robin
];

// Parse command-line arguments
const args = process.argv.slice(2);
let testNumbers = []; // Array of test numbers to run
let sampleNumbers = []; // Array of sample numbers to run
let testCase = null; // Single case test (for backward compatibility)
let testCaseNumbers = []; // Array of case test numbers to run
let testCaseIsAST = []; // Array of flags indicating if each test case is an AST test
let runAll = false;
let repeatCount = 1; // Default to 1 run
let customFile = null; // Custom file path specified with --file

// Parse arguments
// First pass: extract --repeat and --file flags and their values
const processedArgs = [];
let repeatValue = null;
let fileValue = null;
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
    
    // Check for --file flag
    if (arg === '--file') {
        if (i + 1 >= args.length) {
            console.error('Error: --file requires a file path argument.');
            console.error('Usage: npm run test -- --file <file-path>');
            process.exit(1);
        }
        const nextArg = args[i + 1];
        fileValue = nextArg;
        i++; // Skip the next argument (the file path)
        continue;
    }
    
    // Add non-flag arguments to processed list
    processedArgs.push(arg);
}

// Use the processed arguments (without --repeat, --file and their values) for further parsing
const filteredArgs = processedArgs;
if (repeatValue !== null) {
    repeatCount = repeatValue;
}
if (fileValue !== null) {
    customFile = fileValue;
}

// Now parse the filtered arguments
for (let i = 0; i < filteredArgs.length; i++) {
    const arg = filteredArgs[i];
    
    // Check for "all" command
    if (arg === 'all') {
        runAll = true;
        continue;
    }
    
    // Check for AST test case range (e.g., "a0-a22")
    if (arg.startsWith('a') && arg.includes('-')) {
        const parts = arg.split('-');
        if (parts.length === 2 && parts[0].startsWith('a') && parts[1].startsWith('a')) {
            const start = parseInt(parts[0].substring(1), 10);
            const end = parseInt(parts[1].substring(1), 10);
            if (!isNaN(start) && !isNaN(end) && start >= 0 && end >= start && end < astTestCases.length) {
                for (let j = start; j <= end; j++) {
                    testCaseNumbers.push(j);
                    testCaseIsAST.push(true);
                }
                continue;
            } else {
                console.error('='.repeat(60));
                console.error('Invalid AST test range:', arg);
                console.error('='.repeat(60));
                console.error();
                console.error('Available AST Test Cases:');
                astTestCases.forEach((file, index) => {
                    console.error(`  a${index}: ${file || 'null'}`);
                });
                console.error();
                console.error('Usage: npm run test -- a<start>-a<end>');
                console.error('Example: npm run test -- a0-a22  (runs AST tests 0 through 22)');
                process.exit(1);
            }
        }
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
                    testCaseIsAST.push(false);
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
    
    // Check for sample range (e.g., "s0-s5")
    if (arg.startsWith('s') && arg.includes('-')) {
        const parts = arg.split('-');
        if (parts.length === 2 && parts[0].startsWith('s') && parts[1].startsWith('s')) {
            const start = parseInt(parts[0].substring(1), 10);
            const end = parseInt(parts[1].substring(1), 10);
            if (!isNaN(start) && !isNaN(end) && start >= 0 && end >= start && end < sampleFiles.length) {
                for (let j = start; j <= end; j++) {
                    sampleNumbers.push(j);
                }
                continue;
            } else {
                console.error('='.repeat(60));
                console.error('Invalid sample test range:', arg);
                console.error('='.repeat(60));
                console.error();
                console.error('Available RobinPath Samples:');
                sampleFiles.forEach((file, index) => {
                    console.error(`  s${index}: ${file}`);
                });
                console.error();
                console.error('Usage: npm run test -- s<start>-s<end>');
                console.error('Example: npm run test -- s0-s5  (runs samples 0 through 5)');
                process.exit(1);
            }
        }
    }
    
    // Check for sample (starts with 's')
    if (arg.startsWith('s')) {
        const sampleNumber = parseInt(arg.substring(1), 10);
        if (isNaN(sampleNumber) || sampleNumber < 0 || sampleNumber >= sampleFiles.length) {
            console.error('='.repeat(60));
            console.error('Invalid sample number:', arg);
            console.error('='.repeat(60));
            console.error();
            console.error('Available RobinPath Samples:');
            sampleFiles.forEach((file, index) => {
                console.error(`  s${index}: ${file}`);
            });
            console.error();
            console.error('Usage: npm run test -- s<sample-number>');
            console.error('Example: npm run test -- s0  (runs s0-calculator-engine.robin)');
            console.error('Example: npm run test -- 0  (runs 01-variable-assignment.robin)');
            process.exit(1);
        }
        sampleNumbers.push(sampleNumber);
        continue;
    }
    
    // Check for AST test (starts with 'a')
    if (arg.startsWith('a')) {
        const astCaseNumber = parseInt(arg.substring(1), 10);
        if (isNaN(astCaseNumber) || astCaseNumber < 0 || astCaseNumber >= astTestCases.length) {
            console.error('='.repeat(60));
            console.error('Invalid AST test case:', arg);
            console.error('='.repeat(60));
            console.error();
            console.error('Available AST Test Cases:');
            astTestCases.forEach((file, index) => {
                console.error(`  a${index}: ${file}`);
            });
            console.error();
            console.error('Usage: npm run test -- a<case-number>');
            console.error('Example: npm run test -- a0  (runs ast/a1-variable-assignment.js)');
            process.exit(1);
        }
        testCaseNumbers.push(astCaseNumber);
        testCaseIsAST.push(true);
        continue;
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
        testCaseIsAST.push(false);
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
sampleNumbers = [...new Set(sampleNumbers)].sort((a, b) => a - b);
testCaseNumbers = [...new Set(testCaseNumbers)].sort((a, b) => a - b);

// Validate --repeat usage: it only works with RP script tests, not case tests
if (repeatCount > 1 && testCaseNumbers.length > 0) {
    console.error('Error: --repeat can only be used with RP script tests, not JavaScript case tests.');
    console.error('Usage: npm run test -- <test-number> --repeat <count>');
    console.error('Example: npm run test -- 5 --repeat 100');
    process.exit(1);
}

// Validate --file usage: it cannot be used with other test selections
if (customFile !== null) {
    if (testNumbers.length > 0 || testCaseNumbers.length > 0 || runAll) {
        console.error('Error: --file cannot be used with other test selections (test numbers, case tests, or "all").');
        console.error('Usage: npm run test -- --file <file-path>');
        console.error('Example: npm run test -- --file test.robin');
        process.exit(1);
    }
}

// If no arguments provided (after filtering) and no custom file, run all tests
if (filteredArgs.length === 0 && customFile === null) {
    runAll = true;
}

// Handle backward compatibility: if testCase is set but testCaseNumbers is empty, add it
if (testCase !== null && testCaseNumbers.length === 0) {
    testCaseNumbers.push(testCase);
}
if (testCaseNumbers.length > 0) {
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

/**
 * Execute test logic with timeout and CPU monitoring
 */
const executeTestLogicWithTimeout = async (testFilePath, isCaseTest, suppressOutput = false, timeoutMs = 30000) => {
    return new Promise(async (resolve, reject) => {
        let testCompleted = false;
        let cpuCheckInterval = null;
        let timeoutHandle = null;
        const startTime = Date.now();
        let lastCpuCheck = Date.now();
        let highCpuStartTime = null;
        const HIGH_CPU_THRESHOLD = 5000; // 5 seconds of high CPU indicates stuck
        
        // Start CPU monitoring
        const startCpuMonitoring = () => {
            const cpuUsage = process.cpuUsage();
            let lastUser = cpuUsage.user;
            let lastSystem = cpuUsage.system;
            
            cpuCheckInterval = setInterval(() => {
                if (testCompleted) {
                    clearInterval(cpuCheckInterval);
                    return;
                }
                
                const currentCpu = process.cpuUsage();
                const userDelta = currentCpu.user - lastUser;
                const systemDelta = currentCpu.system - lastSystem;
                const totalDelta = userDelta + systemDelta;
                const elapsed = Date.now() - lastCpuCheck;
                
                // Convert to percentage (microseconds to milliseconds, then to percentage)
                // Assuming 1 CPU core, 100% = 1000ms per second = 1,000,000 microseconds per second
                const cpuPercent = (totalDelta / elapsed / 10) * 100; // Rough estimate
                
                // Check for high CPU usage (stuck in loop)
                if (cpuPercent > 80) {
                    if (highCpuStartTime === null) {
                        highCpuStartTime = Date.now();
                    } else {
                        const highCpuDuration = Date.now() - highCpuStartTime;
                        if (highCpuDuration > HIGH_CPU_THRESHOLD) {
                            testCompleted = true;
                            clearInterval(cpuCheckInterval);
                            if (timeoutHandle) clearTimeout(timeoutHandle);
                            reject(new Error(`Test appears to be stuck (high CPU usage >80% for ${Math.round(highCpuDuration/1000)}s). Test file: ${testFilePath}`));
                            return;
                        }
                    }
                } else {
                    highCpuStartTime = null;
                }
                
                lastUser = currentCpu.user;
                lastSystem = currentCpu.system;
                lastCpuCheck = Date.now();
            }, 1000); // Check every second
        };
        
        // Set timeout
        timeoutHandle = setTimeout(() => {
            if (!testCompleted) {
                testCompleted = true;
                clearInterval(cpuCheckInterval);
                reject(new Error(`Test timed out after ${timeoutMs}ms. Test file: ${testFilePath}`));
            }
        }, timeoutMs);
        
        // Start CPU monitoring
        startCpuMonitoring();
        
        try {
            await executeTestLogic(testFilePath, isCaseTest, suppressOutput);
            if (!testCompleted) {
                testCompleted = true;
                clearInterval(cpuCheckInterval);
                if (timeoutHandle) clearTimeout(timeoutHandle);
                resolve();
            }
        } catch (error) {
            if (!testCompleted) {
                testCompleted = true;
                clearInterval(cpuCheckInterval);
                if (timeoutHandle) clearTimeout(timeoutHandle);
                reject(error);
            }
        }
    });
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
        // If custom file is specified, run it
        if (customFile !== null) {
            // Resolve the file path (can be relative or absolute)
            const pathModule = await import('path');
            const { isAbsolute } = pathModule;
            let filePath = customFile;
            
            // If not absolute, try relative to scripts directory first, then current working directory
            if (!isAbsolute(filePath)) {
                const scriptsPath = join(scriptsDir, filePath);
                if (existsSync(scriptsPath)) {
                    filePath = scriptsPath;
                } else {
                    // Try as absolute path from current working directory
                    const cwdPath = join(process.cwd(), filePath);
                    if (existsSync(cwdPath)) {
                        filePath = cwdPath;
                    } else {
                        console.error('='.repeat(60));
                        console.error('Error: File not found:', customFile);
                        console.error('='.repeat(60));
                        console.error();
                        console.error('Tried locations:');
                        console.error(`  1. ${scriptsPath}`);
                        console.error(`  2. ${cwdPath}`);
                        console.error();
                        console.error('Usage: npm run test -- --file <file-path>');
                        console.error('Example: npm run test -- --file test.robin');
                        console.error('Example: npm run test -- --file test/scripts/test.robin');
                        process.exit(1);
                    }
                }
            }
            
            if (!existsSync(filePath)) {
                console.error('='.repeat(60));
                console.error('Error: File not found:', filePath);
                console.error('='.repeat(60));
                process.exit(1);
            }
            
            console.log('='.repeat(60));
            if (repeatCount > 1) {
                console.log(`Running Custom File: ${filePath} (${repeatCount} times)`);
            } else {
                console.log(`Running Custom File: ${filePath}`);
            }
            console.log('='.repeat(60));
            console.log();
            
            const executionTimes = [];
            let testPassed = true;
            let testError = null;
            
            // Run the test repeatCount times
            for (let run = 1; run <= repeatCount; run++) {
                const startTime = Date.now();
                
                try {
                    // Suppress console output when repeating
                    // Use timeout wrapper to detect stuck tests
                    await executeTestLogicWithTimeout(filePath, false, repeatCount > 1, 30000);
                    const endTime = Date.now();
                    const executionTime = endTime - startTime;
                    executionTimes.push(executionTime);
                    
                    if (repeatCount === 1) {
                        console.log(`  ? Passed (${executionTime}ms)`);
                    }
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
                    console.log(`? Custom File (${filePath}) - All ${repeatCount} runs passed`);
                    console.log(`  Total: ${totalTestTime}ms`);
                    console.log(`  Average: ${avgTime.toFixed(2)}ms`);
                    console.log(`  Min: ${minTime}ms | Max: ${maxTime}ms`);
                    console.log('='.repeat(60));
                } else {
                    console.log('='.repeat(60));
                    console.log(`? Custom File (${filePath}) completed in ${executionTimes[0]}ms`);
                    console.log('='.repeat(60));
                }
            } else {
                console.error('='.repeat(60));
                console.error(`? Custom File (${filePath}) FAILED`);
                console.error('='.repeat(60));
                if (testError) {
                    console.error('Error:', testError);
                }
                process.exit(1);
            }
            
            process.exit(0);
        }
        
        // If runAll is true, run all RP script tests, samples, then JavaScript case tests
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
                    // Use timeout wrapper to detect stuck tests
                    await executeTestLogicWithTimeout(testFilePath, false, false, 30000);
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
            
            // Phase 2: Running all RobinPath Sample Tests
            console.log('='.repeat(60));
            console.log('Phase 2: Running all RobinPath Sample Tests');
            console.log('='.repeat(60));
            console.log();
            
            let totalSampleTests = 0;
            let passedSampleTests = 0;
            let failedSampleTests = 0;
            const sampleTestResults = [];
            
            for (let i = 0; i < sampleFiles.length; i++) {
                const sampleFileName = sampleFiles[i];
                const sampleFilePath = join(samplesDir, sampleFileName);
                
                if (!existsSync(sampleFilePath)) {
                    console.error(`? Sample file not found: ${sampleFilePath}`);
                    failedSampleTests++;
                    sampleTestResults.push({ index: i, file: sampleFileName, passed: false, error: 'File not found' });
                    continue;
                }
                
                totalSampleTests++;
                console.log(`[s${i}/${sampleFiles.length - 1}] Running: ${sampleFileName}`);
                
                const startTime = Date.now();
                
                try {
                    await executeTestLogicWithTimeout(sampleFilePath, false, false, 30000);
                    const endTime = Date.now();
                    const executionTime = endTime - startTime;
                    passedSampleTests++;
                    sampleTestResults.push({ index: i, file: sampleFileName, passed: true, time: executionTime });
                    console.log(`  ? Passed (${executionTime}ms)`);
                } catch (error) {
                    failedSampleTests++;
                    sampleTestResults.push({ index: i, file: sampleFileName, passed: false, error: error.message });
                    console.error(`  ? Failed: ${error.message}`);
                }
            }
            
            console.log();
            console.log('='.repeat(60));
            console.log('RobinPath Sample Tests Summary');
            console.log('='.repeat(60));
            console.log(`Total: ${totalSampleTests} | Passed: ${passedSampleTests} | Failed: ${failedSampleTests}`);
            console.log('='.repeat(60));
            console.log();

            // Phase 3: Running all JavaScript Case Tests
            console.log('='.repeat(60));
            console.log('Phase 3: Running all JavaScript Case Tests');
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
                const prefix = caseFileName.includes('/') ? 'a' : 'c';
                const astIndex = caseFileName.includes('/') ? astTestCases.indexOf(caseFileName) : -1;
                const displayIndex = astIndex >= 0 ? astIndex : i;
                console.log(`[${prefix}${displayIndex}] Running: ${caseFileName}`);
                
                const startTime = Date.now();
                
                try {
                    // Use timeout wrapper to detect stuck tests
                    // Case tests should show their console output (suppressOutput = false)
                    await executeTestLogicWithTimeout(caseFilePath, true, false, 30000);
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
            
            if (failedRpTests > 0 || failedSampleTests > 0 || failedCaseTests > 0) {
                console.log('Failed tests:');
                rpTestResults.filter(r => !r.passed).forEach(r => {
                    console.log(`  ${r.index}: ${r.file} - ${r.error || 'Unknown error'}`);
                });
                sampleTestResults.filter(r => !r.passed).forEach(r => {
                    console.log(`  s${r.index}: ${r.file} - ${r.error || 'Unknown error'}`);
                });
                caseTestResults.filter(r => !r.passed).forEach(r => {
                    console.log(`  c${r.index}: ${r.file} - ${r.error || 'Unknown error'}`);
                });
                console.log();
            }
            
            // Final summary
            console.log('='.repeat(60));
            console.log('Final Summary');
            console.log('='.repeat(60));
            const totalTests = totalRpTests + totalSampleTests + totalCaseTests;
            const totalPassed = passedRpTests + passedSampleTests + passedCaseTests;
            const totalFailed = failedRpTests + failedSampleTests + failedCaseTests;
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
            
            for (let idx = 0; idx < testCaseNumbers.length; idx++) {
                const caseNum = testCaseNumbers[idx];
                const isAST = testCaseIsAST[idx] || false;
                const caseFileName = isAST ? astTestCases[caseNum] : testCases[caseNum];
                // Handle subdirectories like ast/
                const caseFilePath = caseFileName.includes('/') 
                    ? join(__dirname, caseFileName)
                    : join(__dirname, 'cases', caseFileName);
                
                if (!existsSync(caseFilePath)) {
                    console.error(`? Test case file not found: ${caseFilePath}`);
                    results.push({ caseNum, passed: false, error: 'File not found' });
                    totalFailed++;
                    continue;
                }
                
                const testPrefix = isAST ? 'a' : 'c';
                console.log('='.repeat(60));
                console.log(`Running JavaScript Case Test ${testPrefix}${caseNum}: ${caseFileName}`);
                console.log('='.repeat(60));
                console.log();
                console.log('Note: This is a JavaScript test that requires calling RobinPath class methods.');
                console.log();
                
                const startTime = Date.now();
                
                try {
                    // Use timeout wrapper to detect stuck tests
                    // Case tests should show their console output (suppressOutput = false)
                    await executeTestLogicWithTimeout(caseFilePath, true, false, 30000);
                    const endTime = Date.now();
                    const executionTime = endTime - startTime;
                    totalPassed++;
                    results.push({ caseNum, passed: true, time: executionTime });
                    console.log();
                    console.log('='.repeat(60));
                    console.log(`? JavaScript Case Test ${testPrefix}${caseNum} (${caseFileName}) completed in ${executionTime}ms`);
                    console.log('='.repeat(60));
                } catch (error) {
                    totalFailed++;
                    results.push({ caseNum, passed: false, error: error.message });
                    console.error();
                    console.error('='.repeat(60));
                    console.error(`? JavaScript Case Test ${testPrefix}${caseNum} (${caseFileName}) FAILED`);
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
            
            // If only case tests were run, exit
            if (testNumbers.length === 0 && sampleNumbers.length === 0) {
                process.exit(totalFailed > 0 ? 1 : 0);
            }
        }
        
        // If sample number(s) were provided, run them
        if (sampleNumbers.length > 0) {
            const results = [];
            let totalPassed = 0;
            let totalFailed = 0;
            const overallStartTime = Date.now();
            
            for (const sampleNum of sampleNumbers) {
                const sampleFileName = sampleFiles[sampleNum];
                const sampleFilePath = join(samplesDir, sampleFileName);
                
                if (!existsSync(sampleFilePath)) {
                    console.error(`? Sample file not found: ${sampleFilePath}`);
                    results.push({ sampleNum, passed: false, error: 'File not found' });
                    totalFailed++;
                    continue;
                }
                
                console.log('='.repeat(60));
                console.log(`Running RobinPath Sample ${sampleNum}: ${sampleFileName}`);
                console.log('='.repeat(60));
                console.log();
                
                const startTime = Date.now();
                
                try {
                    // Use timeout wrapper to detect stuck tests
                    await executeTestLogicWithTimeout(sampleFilePath, false, false, 30000);
                    const endTime = Date.now();
                    const executionTime = endTime - startTime;
                    totalPassed++;
                    results.push({ sampleNum, passed: true, time: executionTime });
                    console.log(`  ? Passed (${executionTime}ms)`);
                } catch (error) {
                    totalFailed++;
                    results.push({ sampleNum, passed: false, error: error.message });
                    console.error(`  ? Failed: ${error.message}`);
                }
                console.log();
            }
            
            // Summary if multiple samples
            if (sampleNumbers.length > 1) {
                const overallEndTime = Date.now();
                const totalWallClockTime = overallEndTime - overallStartTime;
                const totalRuntime = results.filter(r => r.passed).reduce((sum, r) => sum + (r.time || 0), 0);
                
                console.log('='.repeat(60));
                console.log('Sample Test Summary');
                console.log('='.repeat(60));
                console.log(`Total: ${sampleNumbers.length} | Passed: ${totalPassed} | Failed: ${totalFailed}`);
                console.log(`Total Runtime: ${totalRuntime.toFixed(2)}ms`);
                console.log('='.repeat(60));
                
                if (totalFailed > 0) {
                    console.log();
                    console.log('Failed samples:');
                    results.filter(r => !r.passed).forEach(r => {
                        console.log(`  s${r.sampleNum}: ${sampleFiles[r.sampleNum]} - ${r.error || 'Unknown error'}`);
                    });
                }
            }
            
            // If only samples were run, exit. 
            if (testNumbers.length === 0) {
                process.exit(totalFailed > 0 ? 1 : 0);
            }
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
                        // Use timeout wrapper to detect stuck tests
                        await executeTestLogicWithTimeout(testFilePath, false, repeatCount > 1, 30000);
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
