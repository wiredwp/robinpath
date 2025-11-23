import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { RobinPath } from '../dist/index.js';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the test script
const testScriptPath = join(__dirname, 'test.rp');
const testScript = readFileSync(testScriptPath, 'utf-8');

console.log('='.repeat(60));
console.log('Running RobinPath Test Script');
console.log('='.repeat(60));
console.log();

// Create interpreter instance
const rp = new RobinPath();

(async () => {
    try {
        // Execute the test script
        const result = await rp.executeScript(testScript);
        
        console.log();
        console.log('='.repeat(60));
        console.log('Test execution completed successfully!');
        console.log('Final result ($):', result);
        console.log('='.repeat(60));
        
        // Test getASTWithState
        console.log();
        console.log('='.repeat(60));
        console.log('Testing getASTWithState method');
        console.log('='.repeat(60));
        
        const thread = rp.createThread('ast-test-thread');
        const testScriptForAST = `
add 5 5
$result = $
log 'Result:' $result
if $result > 5
  multiply $result 2
  log 'Doubled:' $
endif
`;
        
        const astResult = await thread.getASTWithState(testScriptForAST);
        
        console.log('AST Structure:');
        console.log(JSON.stringify(astResult.ast, null, 2));
        console.log();
        console.log('Variables:');
        console.log('  Thread:', astResult.variables.thread);
        console.log('  Global:', astResult.variables.global);
        console.log();
        console.log('Last Value ($):', astResult.lastValue);
        console.log();
        console.log('Call Stack:', astResult.callStack.length, 'frame(s)');
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error();
        console.error('='.repeat(60));
        console.error('Error executing test script:');
        console.error(error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        console.error('='.repeat(60));
        process.exit(1);
    }
})();

