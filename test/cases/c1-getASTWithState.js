// Test Case c1: getASTWithState method tests

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing getASTWithState method');
    console.log('='.repeat(60));
    
    const astTestRp = new RobinPath();
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
    
    console.log('✓ getASTWithState test PASSED - Structure is correct');
    console.log(`  AST nodes: ${astResult.ast.length}`);
    console.log(`  Variables: thread=${Object.keys(astResult.variables.thread || {}).length}, global=${Object.keys(astResult.variables.global || {}).length}`);
    console.log(`  Last Value ($): ${astResult.lastValue}`);
    console.log(`  Call Stack: ${astResult.callStack?.length || 0} frame(s)`);
    console.log('='.repeat(60));
}
