// Test Case a14: With Syntax AST tests
// Tests AST update accuracy for commands with 'with' callbacks

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing With Syntax AST - Structure Preservation (a14)');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    const originalScript = `
repeat 123 with
  log "Repeating"
endwith
`;
    
    const initialAST = await testRp.getAST(originalScript);
    const modifiedAST = JSON.parse(JSON.stringify(initialAST));
    const repeatNode = modifiedAST.find(node => node.name === 'repeat');
    if (repeatNode && repeatNode.args?.[0]) {
        repeatNode.args[0].value = 999;
        if (repeatNode.callback?.body?.[0]?.args?.[0]) repeatNode.callback.body[0].args[0].value = "Processing";
    }
    
    const regeneratedCode = await testRp.updateCodeFromAST(originalScript, modifiedAST);
    let replacedCode = originalScript.replace('123', '999').replace('"Repeating"', '"Processing"');
    
    console.log('\n--- WITH CALLBACK COMPARISON ---');
    console.log('\nORIGINAL:\n' + originalScript);
    console.log('\nREGENERATED:\n' + regeneratedCode);
    
    if (regeneratedCode !== replacedCode) throw new Error('Test FAILED: With syntax mismatch.');
    console.log('\n✓ PASSED: With syntax preserved.');
}
