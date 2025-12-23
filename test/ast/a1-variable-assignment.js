// Test Case a1: Variable Assignment AST tests
// Tests AST update accuracy by comparing regenerated code with string-replaced code

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Variable Assignment AST - Structure Preservation (a1)');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    
    const originalScript = `
$str = "hello"
$num = 42
$city = "New York"
`;
    
    const initialAST = await testRp.getAST(originalScript);
    const modifiedAST = JSON.parse(JSON.stringify(initialAST));
    
    const strNode = modifiedAST.find(node => node.type === 'assignment' && node.targetName === 'str');
    if (strNode) strNode.literalValue = "hello_updated";
    const numNode = modifiedAST.find(node => node.type === 'assignment' && node.targetName === 'num');
    if (numNode) {
        numNode.literalValue = 4242;
        numNode.literalValueType = 'number';
    }
    const cityNode = modifiedAST.find(node => node.type === 'assignment' && node.targetName === 'city');
    if (cityNode) cityNode.literalValue = "Seoul";
    
    const regeneratedCode = await testRp.updateCodeFromAST(originalScript, modifiedAST);
    
    let replacedCode = originalScript;
    replacedCode = replacedCode.replace('"hello"', '"hello_updated"');
    replacedCode = replacedCode.replace('42', '4242');
    replacedCode = replacedCode.replace('"New York"', '"Seoul"');
    
    console.log('\n--- SIDE-BY-SIDE COMPARISON ---');
    console.log('ORIGINAL:\n' + originalScript);
    console.log('\nREGENERATED (AST Update):\n' + regeneratedCode);
    
    if (regeneratedCode !== replacedCode) {
        throw new Error('Test FAILED: AST regeneration mismatch.');
    }
    console.log('✓ PASSED: Basic variable assignments preserved.');

    // PART 2: Nested/Path
    const nestedScript = `
$user.profile.name = "John Doe"
$user.age = 30
`;
    const initialNestedAST = await testRp.getAST(nestedScript);
    const modifiedNestedAST = JSON.parse(JSON.stringify(initialNestedAST));
    
    const nameNode = modifiedNestedAST.find(node => node.type === 'assignment' && node.targetName === 'user' && node.targetPath?.[1]?.name === 'name');
    if (nameNode) nameNode.literalValue = "Jane Doe";
    const ageNode = modifiedNestedAST.find(node => node.type === 'assignment' && node.targetName === 'user' && node.targetPath?.[0]?.name === 'age');
    if (ageNode) {
        ageNode.literalValue = 25;
        ageNode.literalValueType = 'number';
    }
    
    const regeneratedNested = await testRp.updateCodeFromAST(nestedScript, modifiedNestedAST);
    let replacedNested = nestedScript;
    replacedNested = replacedNested.replace('"John Doe"', '"Jane Doe"');
    replacedNested = replacedNested.replace('30', '25');
    
    console.log('\n--- NESTED PATH COMPARISON ---');
    console.log('ORIGINAL:\n' + nestedScript);
    console.log('\nREGENERATED:\n' + regeneratedNested);
    
    if (regeneratedNested !== replacedNested) {
        throw new Error('Test FAILED: Nested path mismatch.');
    }
    console.log('✓ PASSED: Nested path assignments preserved.');
}
