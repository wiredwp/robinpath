// Test Case a18: Template Strings AST tests
// Tests AST update accuracy for backtick template strings with interpolation

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Template Strings AST - Structure Preservation (a18)');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    const backtick = '`';
    const originalScript = `
$a = 5
$result1 = ${backtick}a is $a${backtick}
$result5 = ${backtick}a is $(math.add 3 3)${backtick}
`;
    
    console.log('Code before update:');
    console.log(originalScript);
    
    const initialAST = await testRp.getAST(originalScript);
    const modifiedAST = JSON.parse(JSON.stringify(initialAST));
    
    const assign1 = modifiedAST.find(node => node.type === 'assignment' && node.targetName === 'result1');
    // In AST, template string argument might be in literalValue as '\0TEMPLATE\0...'
    if (assign1 && typeof assign1.literalValue === 'string' && assign1.literalValue.includes('\0TEMPLATE\0')) {
        assign1.literalValue = '\0TEMPLATE\0' + 'value of a is $a';
    }
    
    const assign2 = modifiedAST.find(node => node.type === 'assignment' && node.targetName === 'result5');
    if (assign2 && typeof assign2.literalValue === 'string' && assign2.literalValue.includes('\0TEMPLATE\0')) {
        assign2.literalValue = '\0TEMPLATE\0' + 'sum is $(math.add 3 3)';
    }
    
    const regeneratedCode = await testRp.updateCodeFromAST(originalScript, modifiedAST);
    let replacedCode = originalScript.replace('a is $a', 'value of a is $a').replace('a is $(math.add 3 3)', 'sum is $(math.add 3 3)');
    
    console.log('\n--- TEMPLATE STRING COMPARISON ---');
    console.log('\nREGENERATED:\n' + regeneratedCode);
    
    if (regeneratedCode !== replacedCode) throw new Error('Test FAILED: Template string mismatch.');
    console.log('\n✓ PASSED: Template strings preserved.');
}