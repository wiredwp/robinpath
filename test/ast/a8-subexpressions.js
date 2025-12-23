// Test Case a8: Subexpressions AST tests
// Tests AST update accuracy for subexpressions and nested subexpressions

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Subexpressions AST - Structure Preservation (a8)');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    const originalScript = `
$test1 = $(math.add 1 2)
$test2 = $(math.multiply $(math.add 3 4) 2)
`;
    
    const initialAST = await testRp.getAST(originalScript);
    const modifiedAST = JSON.parse(JSON.stringify(initialAST));
    const assign1 = modifiedAST.find(node => node.type === 'assignment' && node.targetName === 'test1');
    if (assign1 && assign1.command?.args?.[0]?.body?.[0]?.args) {
        const subCmd = assign1.command.args[0].body[0];
        subCmd.args[0].value = 10; subCmd.args[1].value = 20;
    }
    const assign2 = modifiedAST.find(node => node.type === 'assignment' && node.targetName === 'test2');
    if (assign2 && assign2.command?.args?.[0]?.body?.[0]?.args) {
        const multiplyCmd = assign2.command.args[0].body[0];
        if (multiplyCmd.args[0]?.type === 'subexpression' && multiplyCmd.args[0].body?.[0]?.args) {
            const innerAddCmd = multiplyCmd.args[0].body[0];
            innerAddCmd.args[0].value = 30; innerAddCmd.args[1].value = 40;
        }
    }
    
    const regeneratedCode = await testRp.updateCodeFromAST(originalScript, modifiedAST);
    let replacedCode = originalScript.replace('math.add 1 2', 'math.add 10 20').replace('math.add 3 4', 'math.add 30 40');
    
    console.log('\n--- SUBEXPRESSION COMPARISON ---');
    console.log('ORIGINAL:\n' + originalScript);
    console.log('\nREGENERATED:\n' + regeneratedCode);
    
    if (regeneratedCode !== replacedCode) throw new Error('Test FAILED: Subexpression mismatch.');
    console.log('\n✓ PASSED: Subexpression nesting preserved.');
}
