// Test Case c6: End Command Tests
// Tests for the "end" command that stops script execution

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing end command');
    console.log('='.repeat(60));
    
    const rp = new RobinPath();
    
    // Test 1: Basic end command - execution stops and last value is preserved
    const testScript1 = `
log "Before end"
$beforeEnd = 100
math.add 5 10
end
log "This should not execute"
$afterEnd = 200
`;
    
    const result1 = await rp.executeScript(testScript1);
    
    // Verify last value is preserved (15 from math.add 5 10)
    if (result1 !== 15) {
        console.error(`✗ Test 1 FAILED - Expected last value to be 15, got ${result1}`);
        throw new Error(`Test 1 FAILED - Last value should be 15, got ${result1}`);
    }
    
    // Verify $beforeEnd is set
    const beforeEnd = rp.getVariable('beforeEnd');
    if (beforeEnd !== 100) {
        console.error(`✗ Test 1 FAILED - Expected $beforeEnd to be 100, got ${beforeEnd}`);
        throw new Error(`Test 1 FAILED - $beforeEnd should be 100, got ${beforeEnd}`);
    }
    
    // Verify $afterEnd is NOT set (should be null/undefined)
    const afterEnd = rp.getVariable('afterEnd');
    if (afterEnd !== null && afterEnd !== undefined) {
        console.error(`✗ Test 1 FAILED - Expected $afterEnd to be null/undefined, got ${afterEnd}`);
        throw new Error(`Test 1 FAILED - $afterEnd should not be set, got ${afterEnd}`);
    }
    
    console.log('✓ Test 1 PASSED - Basic end command stops execution correctly');
    console.log(`  Last value ($): ${result1}`);
    console.log(`  $beforeEnd: ${beforeEnd}`);
    console.log(`  $afterEnd: ${afterEnd === null || afterEnd === undefined ? 'null (not set)' : afterEnd}`);
    
    // Test 2: End command with no previous last value
    const rp2 = new RobinPath();
    const testScript2 = `
$test = 42
end
$shouldNotExist = 99
`;
    
    const result2 = await rp2.executeScript(testScript2);
    
    // When end is called with no previous operation, last value should be null or undefined
    // (or could be the value from the last statement before end)
    const test = rp2.getVariable('test');
    if (test !== 42) {
        console.error(`✗ Test 2 FAILED - Expected $test to be 42, got ${test}`);
        throw new Error(`Test 2 FAILED - $test should be 42, got ${test}`);
    }
    
    const shouldNotExist = rp2.getVariable('shouldNotExist');
    if (shouldNotExist !== null && shouldNotExist !== undefined) {
        console.error(`✗ Test 2 FAILED - Expected $shouldNotExist to be null/undefined, got ${shouldNotExist}`);
        throw new Error(`Test 2 FAILED - $shouldNotExist should not be set, got ${shouldNotExist}`);
    }
    
    console.log('✓ Test 2 PASSED - End command with variable assignment before it');
    console.log(`  $test: ${test}`);
    console.log(`  $shouldNotExist: ${shouldNotExist === null || shouldNotExist === undefined ? 'null (not set)' : shouldNotExist}`);
    
    // Test 3: End command in the middle of multiple operations
    const rp3 = new RobinPath();
    const testScript3 = `
math.add 1 1
math.multiply $ 2
math.add $ 3
end
math.add $ 100
log "This should not execute"
`;
    
    const result3 = await rp3.executeScript(testScript3);
    
    // Last value should be 7 (1+1=2, *2=4, +3=7)
    if (result3 !== 7) {
        console.error(`✗ Test 3 FAILED - Expected last value to be 7, got ${result3}`);
        throw new Error(`Test 3 FAILED - Last value should be 7, got ${result3}`);
    }
    
    console.log('✓ Test 3 PASSED - End command stops execution in middle of operations');
    console.log(`  Last value ($): ${result3}`);
    
    console.log('='.repeat(60));
    console.log('✓ All end command tests PASSED');
    console.log('='.repeat(60));
}

