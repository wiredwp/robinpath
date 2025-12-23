// Test Case a2: Expressions AST tests
// Tests AST update accuracy for commands and chained operations

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Expressions AST - Structure Preservation (a2)');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    
    const originalScript = `
math.add 111 222
$res = $
math.multiply $res 555
`;
    
    const initialAST = await testRp.getAST(originalScript);
    const modifiedAST = JSON.parse(JSON.stringify(initialAST));
    
    const addNode = modifiedAST.find(node => node.type === 'command' && (node.name === 'math.add' || node.name === 'add'));
    if (addNode && addNode.args) {
        addNode.args[0].value = 333;
        addNode.args[1].value = 444;
    }
    const assignNode = modifiedAST.find(node => node.type === 'assignment' && node.targetName === 'res');
    if (assignNode) assignNode.targetName = 'final_result';
    const multNode = modifiedAST.find(node => node.type === 'command' && (node.name === 'math.multiply' || node.name === 'multiply'));
    if (multNode && multNode.args) {
        if (multNode.args[0].type === 'var') multNode.args[0].name = 'final_result';
        multNode.args[1].value = 777;
    }
    
    const regeneratedCode = await testRp.updateCodeFromAST(originalScript, modifiedAST);
    
    let replacedCode = originalScript;
    replacedCode = replacedCode.replace('111', '333');
    replacedCode = replacedCode.replace('222', '444');
    replacedCode = replacedCode.replace('$res = $', '$final_result = $');
    replacedCode = replacedCode.replace('$res', '$final_result');
    replacedCode = replacedCode.replace('555', '777');
    
    console.log('\n--- EXPRESSION COMPARISON ---');
    console.log('ORIGINAL:\n' + originalScript);
    console.log('\nREGENERATED (AST Update):\n' + regeneratedCode);
    
    if (regeneratedCode !== replacedCode) {
        throw new Error('Test FAILED: Expression regeneration mismatch.');
    }
    console.log('\n✓ PASSED: Expression AST regeneration successful.');
}
