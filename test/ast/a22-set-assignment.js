// Test Case a22: Set Assignment AST tests
// Tests AST update accuracy for the new 'set' assignment syntax

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Set Assignment AST - Structure Preservation (a22)');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    const originalScript = `
set $name as "Ryan"
set $age = 30
$location = "Seoul"
`;
    
    console.log('Code before update:');
    console.log(originalScript);
    
    const initialAST = await testRp.getAST(originalScript);
    const modifiedAST = JSON.parse(JSON.stringify(initialAST));
    
    const nameNode = modifiedAST.find(node => node.type === 'assignment' && node.targetName === 'name');
    if (nameNode) {
        nameNode.literalValue = "Alice";
        nameNode.hasAs = false; // Change 'as' to '='
        nameNode.isSet = true;
    }
    
    const ageNode = modifiedAST.find(node => node.type === 'assignment' && node.targetName === 'age');
    if (ageNode) {
        ageNode.literalValue = 25;
        ageNode.literalValueType = 'number';
        ageNode.isSet = true;
        ageNode.hasAs = false;
    }
    
    const locNode = modifiedAST.find(node => node.type === 'assignment' && node.targetName === 'location');
    if (locNode) {
        locNode.literalValue = "NYC";
    }
    
    const regeneratedCode = await testRp.updateCodeFromAST(originalScript, modifiedAST);
    
    // Manual construction of expected output based on Printer logic
    // set $name = "Alice"  (isSet: true, hasAs: false -> " = ")
    // set $age = 25       (isSet: true, hasAs: false -> " = ")
    // $location = "NYC"    (isSet: false, hasAs: false -> " = ")
    let expectedCode = `
set $name = "Alice"
set $age = 25
$location = "NYC"
`;
    
    console.log('\n--- SET ASSIGNMENT COMPARISON ---');
    console.log('REGENERATED:\n' + regeneratedCode);
    
    if (regeneratedCode.trim() !== expectedCode.trim()) {
        console.log('\n❌ Mismatch found! Comparing exact output:');
        console.log(`REGEN: [${JSON.stringify(regeneratedCode)}]`);
        console.log(`EXPEC: [${JSON.stringify(expectedCode)}]`);
        throw new Error('Test FAILED: Set assignment mismatch.');
    }
    console.log('\n✓ PASSED: Set assignment syntax preserved.');
}