// Test Case a11: Modules AST tests
// Tests AST update accuracy for module commands (math.*, string.*, array.*, etc.)

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Modules AST - Structure Preservation (a11)');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    
    // PART 1: math and string modules
    const script1 = `
math.add 5 10
string.substring "hello" 1 4
`;
    
    console.log('Code before update:');
    console.log(script1);
    
    const initialAST1 = await testRp.getAST(script1);
    const modifiedAST1 = JSON.parse(JSON.stringify(initialAST1));
    
    const addNode = modifiedAST1.find(node => node.type === 'command' && node.name === 'math.add');
    if (addNode) {
        addNode.args[0].value = 100;
        addNode.args[1].value = 200;
    }
    
    const subNode = modifiedAST1.find(node => node.type === 'command' && node.name === 'string.substring');
    if (subNode) {
        subNode.args[0].value = "Seoul";
        subNode.args[1].value = 0;
        subNode.args[2].value = 2;
    }
    
    const regenerated1 = await testRp.updateCodeFromAST(script1, modifiedAST1);
    let replaced1 = script1.replace('5 10', '100 200').replace('"hello" 1 4', '"Seoul" 0 2');
    
    console.log('\n--- MATH/STRING COMPARISON ---');
    console.log('REGENERATED:\n' + regenerated1);
    
    if (regenerated1 !== replaced1) throw new Error('Test FAILED: math/string mismatch.');
    console.log('✓ PASSED: math and string commands preserved.');

    // PART 2: array and json
    const script2 = `
array.push $arr 6
json.parse $jsonStr
`;
    
    console.log('\nCode before update:');
    console.log(script2);
    
    const initialAST2 = await testRp.getAST(script2);
    const modifiedAST2 = JSON.parse(JSON.stringify(initialAST2));
    
    const pushNode = modifiedAST2.find(node => node.type === 'command' && node.name === 'array.push');
    if (pushNode) pushNode.args[1].value = 999;
    
    const parseNode = modifiedAST2.find(node => node.type === 'command' && node.name === 'json.parse');
    if (parseNode) parseNode.args[0].name = "newJsonStr";
    
    const regenerated2 = await testRp.updateCodeFromAST(script2, modifiedAST2);
    let replaced2 = script2.replace(' 6', ' 999').replace('$jsonStr', '$newJsonStr');
    
    console.log('\n--- ARRAY/JSON COMPARISON ---');
    console.log('REGENERATED:\n' + regenerated2);
    
    if (regenerated2 !== replaced2) throw new Error('Test FAILED: array/json mismatch.');
    console.log('✓ PASSED: array and json commands preserved.');

    console.log('\n' + '='.repeat(60));
    console.log('✓ All Modules AST tests PASSED');
    console.log('='.repeat(60));
}
