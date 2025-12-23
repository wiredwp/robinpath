// Test Case a5: Functions AST tests
// Tests AST update accuracy for function definitions and parameters

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Functions AST - Structure Preservation (a5)');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    const originalScript = `
def greet $name
  log "Hello" $name
enddef
`;
    
    const initialAST = await testRp.getAST(originalScript);
    const modifiedAST = JSON.parse(JSON.stringify(initialAST));
    const defNode = modifiedAST.find(node => node.type === 'define' && node.name === 'greet');
    if (defNode) {
        defNode.name = 'welcome';
        if (defNode.paramNames) defNode.paramNames[0] = 'user';
        if (defNode.body?.[0]?.args?.[0]) defNode.body[0].args[0].value = "Hi";
        if (defNode.body?.[0]?.args?.[1]) defNode.body[0].args[1].name = "user";
    }
    
    const regeneratedCode = await testRp.updateCodeFromAST(originalScript, modifiedAST);
    let replacedCode = originalScript.replace('def greet $name', 'def welcome $user').replace('"Hello" $name', '"Hi" $user');
    
    console.log('\n--- FUNCTION COMPARISON ---');
    console.log('ORIGINAL:\n' + originalScript);
    console.log('\nREGENERATED:\n' + regeneratedCode);
    
    if (regeneratedCode !== replacedCode) throw new Error('Test FAILED: Function mismatch.');
    console.log('\n✓ PASSED: Function structure preserved.');
}
