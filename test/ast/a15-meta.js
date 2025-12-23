// Test Case a15: Metadata AST tests
// Tests AST update accuracy for metadata commands (meta, setMeta, getMeta)

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Metadata AST - Structure Preservation (a15)');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    
    // PART 1: meta and getMeta
    const metaScript = `
meta $testVar1 description "A variable to store test values"
getMeta $testVar1 description
`;
    
    console.log('Code before update:');
    console.log(metaScript);
    
    const initialMetaAST = await testRp.getAST(metaScript);
    const modifiedMetaAST = JSON.parse(JSON.stringify(initialMetaAST));
    
    const metaNode = modifiedMetaAST.find(node => node.type === 'command' && node.name === 'meta');
    if (metaNode) {
        metaNode.args[2].value = "Updated description";
    }
    
    const getMetaNode = modifiedMetaAST.find(node => node.type === 'command' && node.name === 'getMeta');
    if (getMetaNode) {
        getMetaNode.args[1].value = "author";
    }
    
    const regeneratedMeta = await testRp.updateCodeFromAST(metaScript, modifiedMetaAST);
    
    // Manual replacement to match the specific updates
    let expectedMeta = metaScript.replace('"A variable to store test values"', '"Updated description"')
                                 .replace('getMeta $testVar1 description', 'getMeta $testVar1 author');
    
    console.log('\n--- META COMMAND COMPARISON ---');
    console.log('REGENERATED:\n' + regeneratedMeta);
    
    if (regeneratedMeta !== expectedMeta) throw new Error('Test FAILED: meta command mismatch.');
    console.log('✓ PASSED: meta command preserved.');

    // PART 2: setMeta
    const setMetaScript = `
setMeta $testVar2a description "A test variable"
setMeta testFn8 author "Test Author"
`;
    
    console.log('\nCode before update:');
    console.log(setMetaScript);
    
    const initialSetMetaAST = await testRp.getAST(setMetaScript);
    const modifiedSetMetaAST = JSON.parse(JSON.stringify(initialSetMetaAST));
    
    const setMetaNode1 = modifiedSetMetaAST.find(node => node.type === 'command' && node.name === 'setMeta' && node.args?.[0]?.type === 'var');
    if (setMetaNode1) setMetaNode1.args[2].value = "New Var Desc";
    
    // testFn8 is parsed as 'literal' because it's unquoted
    const setMetaNode2 = modifiedSetMetaAST.find(node => node.type === 'command' && node.name === 'setMeta' && node.args?.[0]?.type === 'literal');
    if (setMetaNode2) setMetaNode2.args[2].value = "New Author";
    
    const regeneratedSetMeta = await testRp.updateCodeFromAST(setMetaScript, modifiedSetMetaAST);
    let replacedSetMeta = setMetaScript.replace('"A test variable"', '"New Var Desc"').replace('"Test Author"', '"New Author"');
    
    console.log('\n--- SETMETACOMPARISON ---');
    console.log('REGENERATED:\n' + regeneratedSetMeta);
    
    if (regeneratedSetMeta !== replacedSetMeta) throw new Error('Test FAILED: setMeta mismatch.');
    console.log('✓ PASSED: setMeta command preserved.');

    console.log('\n' + '='.repeat(60));
    console.log('✓ All Metadata AST tests PASSED');
    console.log('='.repeat(60));
}