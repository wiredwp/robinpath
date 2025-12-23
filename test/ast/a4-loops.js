// Test Case a4: Loops AST tests
// Tests AST update accuracy for for-loops and preservation of comments

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Loops AST - Structure Preservation (a4)');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    const originalScript = `
for $i in range 1 5
  if $i == 3
    continue  # keep this comment
  endif
  log "Iteration:" $i
endfor
`;
    
    const initialAST = await testRp.getAST(originalScript);
    const modifiedAST = JSON.parse(JSON.stringify(initialAST));
    const forLoop = modifiedAST.find(node => node.type === 'forLoop');
    if (forLoop && forLoop.iterable?.args) forLoop.iterable.args[1].value = 99;
    if (forLoop && forLoop.body) {
        const logNode = forLoop.body.find(node => node.type === 'command' && node.name === 'log');
        if (logNode && logNode.args?.[0]) logNode.args[0].value = "Looping:";
    }
    
    const regeneratedCode = await testRp.updateCodeFromAST(originalScript, modifiedAST);
    let replacedCode = originalScript.replace(' 5', ' 99').replace('"Iteration:"', '"Looping:"');
    
    console.log('\n--- LOOP COMPARISON ---');
    console.log('\nORIGINAL:\n' + originalScript);
    console.log('\nREGENERATED:\n' + regeneratedCode);
    
    if (regeneratedCode !== replacedCode) throw new Error('Test FAILED: Loop mismatch.');
    console.log('\n✓ PASSED: Loop structure and comments preserved.');
}