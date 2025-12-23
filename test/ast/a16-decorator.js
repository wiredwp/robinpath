// Test Case a16: Decorator AST tests
// Tests AST update accuracy for decorated functions and variables

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Decorator AST - Structure Preservation (a16)');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    const originalScript = `
@desc "Decorated Function"
def decorated_fn $x
  log "Hello" $x
enddef

@deprecated
var $oldVar 1
`;
    
    const initialAST = await testRp.getAST(originalScript);
    const modifiedAST = JSON.parse(JSON.stringify(initialAST));
    
    const defNode = modifiedAST.find(node => node.type === 'define' && node.name === 'decorated_fn');
    if (defNode) {
        defNode.name = 'power_fn';
        if (defNode.paramNames) defNode.paramNames[0] = 'p';
        if (defNode.decorators?.[0]?.args?.[0]) defNode.decorators[0].args[0].value = "Updated Title";
        if (defNode.body?.[0]?.args) { defNode.body[0].args[0].value = "Run"; defNode.body[0].args[1].name = "p"; }
    }
    const varCmd = modifiedAST.find(node => node.type === 'command' && node.name === 'var');
    if (varCmd && varCmd.args?.[0]?.type === 'var') {
        varCmd.args[0].name = 'newVar';
        if (varCmd.args[1]) varCmd.args[1].value = 99;
    }
    
    const regeneratedCode = await testRp.updateCodeFromAST(originalScript, modifiedAST);
    let replacedCode = originalScript.replace("Decorated Function", "Updated Title")
        .replace('def decorated_fn $x', 'def power_fn $p')
        .replace('"Hello" $x', '"Run" $p')
        .replace('$oldVar 1', '$newVar 99');
    
    console.log('\n--- DECORATOR COMPARISON ---');
    console.log('ORIGINAL:\n' + originalScript);
    console.log('\nREGENERATED:\n' + regeneratedCode);
    
    if (regeneratedCode !== replacedCode) throw new Error('Test FAILED: Decorator mismatch.');
    console.log('\n✓ PASSED: Decorators preserved.');
}
