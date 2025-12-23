// Test Case a13: Together AST tests
// Tests AST update accuracy for together blocks and leading comments

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Together AST - Structure Preservation (a13)');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    const originalScript = `
# This is a critical comment
together
  do
    log "Block 1"
  enddo
  do
    log "Block 2"
  enddo
endtogether
`;
    
    const initialAST = await testRp.getAST(originalScript);
    const modifiedAST = JSON.parse(JSON.stringify(initialAST));
    const togetherNode = modifiedAST.find(node => node.type === 'together');
    if (togetherNode && togetherNode.blocks) {
        if (togetherNode.blocks[0]?.body?.[0]?.args?.[0]) togetherNode.blocks[0].body[0].args[0].value = "Task A";
        if (togetherNode.blocks[1]?.body?.[0]?.args?.[0]) togetherNode.blocks[1].body[0].args[0].value = "Task B";
    }
    
    const regeneratedCode = await testRp.updateCodeFromAST(originalScript, modifiedAST);
    let replacedCode = originalScript.replace('"Block 1"', '"Task A"').replace('"Block 2"', '"Task B"');
    
    console.log('\n--- TOGETHER COMPARISON ---');
    console.log('ORIGINAL:\n' + originalScript);
    console.log('\nREGENERATED:\n' + regeneratedCode);
    
    if (regeneratedCode !== replacedCode) throw new Error('Test FAILED: Together block mismatch.');
    console.log('\n✓ PASSED: Together structure preserved.');
}
