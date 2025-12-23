// Test Case a9: Objects and Arrays AST tests
// Tests AST update accuracy for object and array literals

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Objects and Arrays AST - Structure Preservation (a9)');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    const originalScript = `
$obj = {name: "John", age: 30}
$arr = [1, 2, 3]
`;
    
    const initialAST = await testRp.getAST(originalScript);
    const modifiedAST = JSON.parse(JSON.stringify(initialAST));
    const assignObj = modifiedAST.find(node => node.type === 'assignment' && node.targetName === 'obj');
    if (assignObj && assignObj.command?.args?.[0]?.type === 'object') assignObj.command.args[0].code = 'name: "Jane", age: 25';
    const assignArr = modifiedAST.find(node => node.type === 'assignment' && node.targetName === 'arr');
    if (assignArr && assignArr.command?.args?.[0]?.type === 'array') assignArr.command.args[0].code = '10, 20, 30';
    
    const regeneratedCode = await testRp.updateCodeFromAST(originalScript, modifiedAST);
    let replacedCode = originalScript.replace('name: "John", age: 30', 'name: "Jane", age: 25').replace('1, 2, 3', '10, 20, 30');
    
    console.log('\n--- OBJECTS/ARRAYS COMPARISON ---');
    console.log('ORIGINAL:\n' + originalScript);
    console.log('\nREGENERATED:\n' + regeneratedCode);
    
    if (regeneratedCode !== replacedCode) throw new Error('Test FAILED: Objects/Arrays mismatch.');
    console.log('\n✓ PASSED: Object and Array literals preserved.');
}
