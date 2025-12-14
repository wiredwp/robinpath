// Test Case c0: getAST method tests
// Tests for getAST method with module names

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing getAST method with module names');
    console.log('='.repeat(60));
    
    const astTestRp = new RobinPath();
    
    // Test 1: Commands with explicit module names
    const testScript1 = `
math.add 5 10
string.length "hello"
array.length [1, 2, 3]
`;
    const ast1 = await astTestRp.getAST(testScript1);

    // Verify module names are included
    const test1Passed = 
        ast1[0]?.module === 'math' &&
        ast1[1]?.module === 'string' &&
        ast1[2]?.module === 'array';
    
    if (test1Passed) {
        console.log('✓ Test 1 PASSED - Module names correctly extracted from explicit syntax');
    } else {
        console.log('✗ Test 1 FAILED - Commands with explicit module names');
        console.log('AST:', JSON.stringify(ast1, null, 2));
        console.log('  math.add module:', ast1[0]?.module);
        console.log('  string.length module:', ast1[1]?.module);
        console.log('  array.length module:', ast1[2]?.module);
        throw new Error('Test 1 FAILED - Module names incorrectly extracted from explicit syntax');
    }
    
    // Test 2: Commands without module names but with "use" command
    const testScript2 = `
use math
add 5 10
multiply 3 4
use string
length "test"
`;
    const ast2 = await astTestRp.getAST(testScript2);
    
    // Note: getAST doesn't execute, so "use" won't affect currentModule
    // But we should still be able to find modules by searching metadata
    const test2Passed = 
        ast2[1]?.module === 'math' && // add should be found in math module
        ast2[2]?.module === 'math' && // multiply should be found in math module
        ast2[4]?.module === 'string'; // length should be found in string module
    
    if (test2Passed) {
        console.log('✓ Test 2 PASSED - Module names correctly found from metadata lookup');
    } else {
        console.log('✗ Test 2 FAILED - Commands with "use" module context');
        console.log('AST:', JSON.stringify(ast2, null, 2));
        console.log('  add module:', ast2[1]?.module);
        console.log('  multiply module:', ast2[2]?.module);
        console.log('  length module:', ast2[4]?.module);
        throw new Error('Test 2 FAILED - Module names incorrectly found from metadata lookup');
    }
    
    // Test 3: Global commands (no module)
    const testScript3 = `
log "test"
$var = 10
`;
    const ast3 = await astTestRp.getAST(testScript3);
    
    // log should be a global command (no module)
    const test3Passed = ast3[0]?.module === null || ast3[0]?.module === undefined;
    
    if (test3Passed) {
        console.log('✓ Test 3 PASSED - Global commands correctly identified (no module)');
    } else {
        console.log('✗ Test 3 FAILED - Global commands');
        console.log('AST:', JSON.stringify(ast3, null, 2));
        console.log('  log module:', ast3[0]?.module);
        throw new Error('Test 3 FAILED - Global commands incorrectly identified');
    }
    
    console.log('='.repeat(60));
    console.log('✓ All getAST tests PASSED');
    console.log('='.repeat(60));
    
    // Test 4: getASTWithState method
    console.log();
    console.log('='.repeat(60));
    console.log('Testing getASTWithState method');
    console.log('='.repeat(60));
    
    const thread = astTestRp.createThread('ast-test-thread');
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
    
    // Verify structure
    if (!astResult || typeof astResult !== 'object') {
        throw new Error('getASTWithState should return an object');
    }
    
    if (!Array.isArray(astResult.ast)) {
        throw new Error('getASTWithState.ast should be an array');
    }
    
    if (!astResult.variables || typeof astResult.variables !== 'object') {
        throw new Error('getASTWithState.variables should be an object');
    }
    
    console.log('✓ Test 4 PASSED - getASTWithState structure is correct');
    console.log(`  AST nodes: ${astResult.ast.length}`);
    console.log(`  Variables: thread=${Object.keys(astResult.variables.thread || {}).length}, global=${Object.keys(astResult.variables.global || {}).length}`);
    console.log(`  Last Value ($): ${astResult.lastValue}`);
    console.log(`  Call Stack: ${astResult.callStack?.length || 0} frame(s)`);
    console.log('='.repeat(60));
    console.log('✓ All getAST and getASTWithState tests PASSED');
    console.log('='.repeat(60));
}
