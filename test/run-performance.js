import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { RobinPath } from '../dist/index.js';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the test scripts
const testScriptPath = join(__dirname, 'test.rp');
const testScript = readFileSync(testScriptPath, 'utf-8');

const testNoCommentsScriptPath = join(__dirname, 'test-no-comments.rp');
const testNoCommentsScript = readFileSync(testNoCommentsScriptPath, 'utf-8');

(async () => {
    try {
        // Performance comparison: run scripts with and without comments 100 times
        console.log();
        console.log('='.repeat(60));
        console.log('Performance Comparison: Scripts with vs without comments');
        console.log('='.repeat(60));
        console.log();
        
        const iterations = 100;
        const withCommentsTimes = [];
        const withoutCommentsTimes = [];
        
        // Run test.rp (with comments) 100 times
        // IMPORTANT: Each iteration creates a fresh RobinPath instance to ensure
        // no caches (like comment parsing caches) persist between runs
        console.log(`Running test.rp (with comments) ${iterations} times...`);
        for (let i = 0; i < iterations; i++) {
            // Create a completely fresh RobinPath instance for each run
            // This ensures all caches (Parser caches, comment caches, etc.) are reset
            const rpWithComments = new RobinPath();
            const startTime = Date.now();
            await rpWithComments.executeScript(testScript);
            const endTime = Date.now();
            const executionTime = endTime - startTime;
            withCommentsTimes.push(executionTime);
            process.stdout.write(`  Run ${i + 1}/${iterations}: ${executionTime}ms\r`);
        }
        console.log();
        
        // Run test-no-comments.rp (without comments) 100 times
        // IMPORTANT: Each iteration creates a fresh RobinPath instance to ensure
        // no caches (like comment parsing caches) persist between runs
        console.log(`Running test-no-comments.rp (without comments) ${iterations} times...`);
        for (let i = 0; i < iterations; i++) {
            // Create a completely fresh RobinPath instance for each run
            // This ensures all caches (Parser caches, comment caches, etc.) are reset
            const rpWithoutComments = new RobinPath();
            const startTime = Date.now();
            await rpWithoutComments.executeScript(testNoCommentsScript);
            const endTime = Date.now();
            const executionTime = endTime - startTime;
            withoutCommentsTimes.push(executionTime);
            process.stdout.write(`  Run ${i + 1}/${iterations}: ${executionTime}ms\r`);
        }
        console.log();
        console.log();
        
        // Calculate averages
        const avgWithComments = withCommentsTimes.reduce((a, b) => a + b, 0) / iterations;
        const avgWithoutComments = withoutCommentsTimes.reduce((a, b) => a + b, 0) / iterations;
        const minWithComments = Math.min(...withCommentsTimes);
        const maxWithComments = Math.max(...withCommentsTimes);
        const minWithoutComments = Math.min(...withoutCommentsTimes);
        const maxWithoutComments = Math.max(...withoutCommentsTimes);
        
        // Display results
        console.log('='.repeat(60));
        console.log('Performance Results:');
        console.log('='.repeat(60));
        console.log();
        console.log(`test.rp (with comments):`);
        console.log(`  Average: ${avgWithComments.toFixed(2)}ms (${(avgWithComments / 1000).toFixed(3)}s)`);
        console.log(`  Min: ${minWithComments}ms (${(minWithComments / 1000).toFixed(3)}s)`);
        console.log(`  Max: ${maxWithComments}ms (${(maxWithComments / 1000).toFixed(3)}s)`);
        console.log();
        console.log(`test-no-comments.rp (without comments):`);
        console.log(`  Average: ${avgWithoutComments.toFixed(2)}ms (${(avgWithoutComments / 1000).toFixed(3)}s)`);
        console.log(`  Min: ${minWithoutComments}ms (${(minWithoutComments / 1000).toFixed(3)}s)`);
        console.log(`  Max: ${maxWithoutComments}ms (${(maxWithoutComments / 1000).toFixed(3)}s)`);
        console.log();
        
        const difference = avgWithComments - avgWithoutComments;
        const percentDiff = ((difference / avgWithoutComments) * 100).toFixed(2);
        if (difference > 0) {
            console.log(`Script with comments is ${difference.toFixed(2)}ms (${percentDiff}%) slower on average`);
        } else if (difference < 0) {
            console.log(`Script with comments is ${Math.abs(difference).toFixed(2)}ms (${Math.abs(percentDiff)}%) faster on average`);
        } else {
            console.log(`Both scripts have identical average execution time`);
        }
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error();
        console.error('='.repeat(60));
        console.error('Error executing performance test:');
        console.error(error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        console.error('='.repeat(60));
        process.exit(1);
    }
})();
