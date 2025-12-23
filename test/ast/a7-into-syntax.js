// Test Case a7: Into Syntax AST tests
// Tests AST update accuracy for into syntax with commands and parenthesized calls

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Into Syntax AST - Structure Preservation (a7)');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    const originalScript = `
math.add 11 22 into $r
math.add(33 44) into $obj.path
`;
    
    const initialAST = await testRp.getAST(originalScript);
    const modifiedAST = JSON.parse(JSON.stringify(initialAST));
    const cmd1 = modifiedAST.find(node => node.type === 'command' && node.into?.targetName === 'r');
    if (cmd1 && cmd1.into) cmd1.into.targetName = 'final_val';
    const cmd2 = modifiedAST.find(node => node.type === 'command' && node.into?.targetName === 'obj');
    if (cmd2 && cmd2.into) { cmd2.into.targetName = 'data'; if (cmd2.into.targetPath) cmd2.into.targetPath[0].name = 'result'; }
    
    const regeneratedCode = await testRp.updateCodeFromAST(originalScript, modifiedAST);
    let replacedCode = originalScript.replace('into $r', 'into $final_val').replace('into $obj.path', 'into $data.result');
    
    console.log('\n--- INTO SYNTAX COMPARISON ---');
    console.log('\nORIGINAL:\n' + originalScript);
    console.log('\nREGENERATED:\n' + regeneratedCode);
    
    if (regeneratedCode !== replacedCode) throw new Error('Test FAILED: Into Syntax mismatch.');
    console.log('\n✓ PASSED: Into Syntax structure preserved.');
}
