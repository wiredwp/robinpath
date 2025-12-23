// Test Case a10: Builtin Commands AST tests
// Tests AST update accuracy for builtin commands (set, get, empty, fallback, etc.)

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Builtin Commands AST - Structure Preservation (a10)');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    
    // PART 1: set command (parsed as assignment)
    const setScript = `
set $testVar "assigned"
`;
    
    console.log('Code before update:');
    console.log(setScript);
    
    const initialSetAST = await testRp.getAST(setScript);
    const modifiedSetAST = JSON.parse(JSON.stringify(initialSetAST));
    
    const setNode1 = modifiedSetAST.find(node => node.type === 'assignment' && node.targetName === 'testVar');
    if (setNode1) setNode1.literalValue = "updated";
    
    const regeneratedSet = await testRp.updateCodeFromAST(setScript, modifiedSetAST);
    let replacedSet = setScript.replace('"assigned"', '"updated"');
    
    console.log('\n--- SET COMMAND COMPARISON ---');
    console.log('REGENERATED:\n' + regeneratedSet);
    
    if (regeneratedSet !== replacedSet) throw new Error('Test FAILED: set command mismatch.');
    console.log('✓ PASSED: set command preserved.');

    // PART 2: get and fallback
    const getScript = `
get $user "address.city"
fallback $maybeEmpty "default value"
empty $toEmpty
`;
    
    console.log('\nCode before update:');
    console.log(getScript);
    
    const initialGetAST = await testRp.getAST(getScript);
    const modifiedGetAST = JSON.parse(JSON.stringify(initialGetAST));
    
    const getNode = modifiedGetAST.find(node => node.type === 'command' && node.name === 'get');
    if (getNode) getNode.args[1].value = "profile.name";
    
    const fallbackNode = modifiedGetAST.find(node => node.type === 'command' && node.name === 'fallback');
    if (fallbackNode) fallbackNode.args[1].value = "new default";
    
    const emptyNode = modifiedGetAST.find(node => node.type === 'command' && node.name === 'empty');
    if (emptyNode) emptyNode.args[0].name = "newEmpty";
    
    const regeneratedGet = await testRp.updateCodeFromAST(getScript, modifiedGetAST);
    let replacedGet = getScript.replace('"address.city"', '"profile.name"')
        .replace('"default value"', '"new default"')
        .replace('$toEmpty', '$newEmpty');
    
    console.log('\n--- GET/FALLBACK/EMPTY COMPARISON ---');
    console.log('REGENERATED:\n' + regeneratedGet);
    
    if (regeneratedGet !== replacedGet) throw new Error('Test FAILED: get/fallback mismatch.');
    console.log('✓ PASSED: get, fallback, and empty commands preserved.');

    // PART 3: var and const
    const varScript = `
var $testVar7b 42
const $TEST_CONST_7c 100
`;
    
    console.log('\nCode before update:');
    console.log(varScript);
    
    const initialVarAST = await testRp.getAST(varScript);
    const modifiedVarAST = JSON.parse(JSON.stringify(initialVarAST));
    
    const varNode = modifiedVarAST.find(node => node.type === 'command' && node.name === 'var');
    if (varNode) varNode.args[1].value = 99;
    
    const constNode = modifiedVarAST.find(node => node.type === 'command' && node.name === 'const');
    if (constNode) constNode.args[1].value = 200;
    
    const regeneratedVar = await testRp.updateCodeFromAST(varScript, modifiedVarAST);
    let replacedVar = varScript.replace('42', '99').replace('100', '200');
    
    console.log('\n--- VAR/CONST COMPARISON ---');
    console.log('REGENERATED:\n' + regeneratedVar);
    
    if (regeneratedVar !== replacedVar) throw new Error('Test FAILED: var/const mismatch.');
    console.log('✓ PASSED: var and const commands preserved.');

    console.log('\n' + '='.repeat(60));
    console.log('✓ All Builtin Commands AST tests PASSED');
    console.log('='.repeat(60));
}