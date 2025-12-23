// Test Case a23: Do Block Decorator tests
// Tests that decorators are correctly parsed on top-level and nested do blocks

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Do Block Decorators AST (a23)');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    const originalScript = `# Test decorators on do blocks
log "Starting decorator tests"
@desc "Top level do block"
do
  log "Inside top level do"
enddo
def test_nested_decorators
  log "Inside function"
  @desc "Nested do block"
  do
    log "Inside nested do"
  enddo
enddef
test_nested_decorators
log "Decorator tests complete"
`;
    
    const initialAST = await testRp.getAST(originalScript);
    
    console.log('\n--- PART 1: Check Top-level Do Decorator ---\n');
    
    const topLevelDo = initialAST.find(node => node.type === 'do');
    if (!topLevelDo) {
        throw new Error('Top-level do block not found in AST');
    }
    
    if (!topLevelDo.decorators || topLevelDo.decorators.length === 0) {
        console.error('AST structure for top-level do:', JSON.stringify(topLevelDo, null, 2));
        throw new Error('Top-level do block is missing decorators');
    }
    
    console.log('✓ Top-level do block has decorators');
    console.log(`  Decorator: @${topLevelDo.decorators[0].name} "${topLevelDo.decorators[0].args[0].value}"`);
    
    console.log('\n--- PART 2: Check Nested Do Decorator ---\n');
    
    const testFn = initialAST.find(node => node.type === 'define' && node.name === 'test_nested_decorators');
    if (!testFn) {
        throw new Error('Function test_nested_decorators not found in AST');
    }
    
    const nestedDo = testFn.body.find(node => node.type === 'do');
    if (!nestedDo) {
        throw new Error('Nested do block not found inside function body');
    }
    
    if (!nestedDo.decorators || nestedDo.decorators.length === 0) {
        console.error('AST structure for nested do:', JSON.stringify(nestedDo, null, 2));
        throw new Error('Nested do block is missing decorators');
    }
    
    console.log('✓ Nested do block has decorators');
    console.log(`  Decorator: @${nestedDo.decorators[0].name} "${nestedDo.decorators[0].args[0].value}"`);
    
    console.log('\n--- PART 3: Bit-perfect AST Update Test ---\n');
    
    const modifiedAST = JSON.parse(JSON.stringify(initialAST));
    
    // Find the nested do block in the modified AST
    const modTestFn = modifiedAST.find(node => node.type === 'define' && node.name === 'test_nested_decorators');
    const modNestedDo = modTestFn.body.find(node => node.type === 'do');
    
    // Update the decorator value
    modNestedDo.decorators[0].args[0].value = "Task Updated";
    
    // Regenerate code
    const regeneratedCode = await testRp.updateCodeFromAST(originalScript, modifiedAST);
    
    // Expected code: original script with manual replacement
    const expectedCode = originalScript.replace('"Nested do block"', '"Task Updated"');
    
    console.log('REGENERATED CODE:');
    console.log(regeneratedCode);
    
    if (regeneratedCode !== expectedCode) {
        console.log('\n❌ Mismatch found! Comparing exact output:');
        for (let i = 0; i < Math.max(regeneratedCode.length, expectedCode.length); i++) {
            if (regeneratedCode[i] !== expectedCode[i]) {
                console.log(`\nFirst difference at index ${i}:`);
                console.log(`Regen: [${JSON.stringify(regeneratedCode.substring(i, i+20))}]`);
                console.log(`Expec: [${JSON.stringify(expectedCode.substring(i, i+20))}]`);
                break;
            }
        }
        throw new Error('Bit-perfect update failed for do block decorator');
    }
    
    console.log('✓ Bit-perfect update successful');

    console.log('\n' + '='.repeat(60));
    console.log('✓ All Do Block Decorator tests PASSED');
    console.log('='.repeat(60));
}