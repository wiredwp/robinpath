// Test Case a6: Do Blocks AST tests
// Tests AST update accuracy for do blocks and into syntax

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Do Blocks AST - Structure Preservation (a6)');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    const originalScript = `
do $a $b into $res
  math.add $a $b
enddo
`;
    
    const initialAST = await testRp.getAST(originalScript);
    const modifiedAST = JSON.parse(JSON.stringify(initialAST));
    const doNode = modifiedAST.find(node => node.type === 'do');
    if (doNode) {
        if (doNode.paramNames) { doNode.paramNames[0] = 'x'; doNode.paramNames[1] = 'y'; }
        if (doNode.into) doNode.into.targetName = 'output';
        const addCmd = doNode.body?.find(node => node.name === 'math.add' || node.name === 'add');
        if (addCmd) { addCmd.name = 'math.multiply'; if (addCmd.args) { addCmd.args[0].name = 'x'; addCmd.args[1].name = 'y'; } }
    }
    
    const regeneratedCode = await testRp.updateCodeFromAST(originalScript, modifiedAST);
    let replacedCode = originalScript.replace('do $a $b into $res', 'do $x $y into $output').replace('math.add $a $b', 'math.multiply $x $y');
    
    console.log('\n--- DO BLOCK COMPARISON ---');
    console.log('ORIGINAL:\n' + originalScript);
    console.log('\nREGENERATED:\n' + regeneratedCode);
    
    if (regeneratedCode !== replacedCode) throw new Error('Test FAILED: Do Block mismatch.');
    console.log('\n✓ PASSED: Do Block structure preserved.');
}
