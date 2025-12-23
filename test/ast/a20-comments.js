// Test Case a20: Comments AST Structure tests
// Tests AST update accuracy and structure preservation for all types of comments

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Comments AST - Structure Preservation (a20)');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    const originalScript = `# Top level comment
# Another top level comment
def test_comments
  # Inside function comment
  log "test"  # inline comment

  # Another block
  do
    log "in do"  # in do inline
  enddo
enddef

# Comment after def
log "done" # final inline
`;
    
    const initialAST = await testRp.getAST(originalScript);
    const modifiedAST = JSON.parse(JSON.stringify(initialAST));
    
    const defNode = modifiedAST.find(node => node.type === 'define' && node.name === 'test_comments');
    if (defNode && defNode.body) {
        const log1 = defNode.body.find(node => node.type === 'command' && node.name === 'log' && node.args?.[0]?.value === 'test');
        if (log1) log1.args[0].value = "updated";
        const doBlock = defNode.body.find(node => node.type === 'do');
        if (doBlock && doBlock.body) {
            const logInDo = doBlock.body.find(node => node.type === 'command' && node.name === 'log');
            if (logInDo) logInDo.args[0].value = "updated in do";
        }
    }
    
    const regeneratedCode = await testRp.updateCodeFromAST(originalScript, modifiedAST);
    let replacedCode = originalScript.replace('"test"', '"updated"').replace('"in do"', '"updated in do"');
    
    console.log('\n--- COMMENTS COMPARISON ---');
    console.log('ORIGINAL:\n' + originalScript);
    console.log('\nREGENERATED:\n' + regeneratedCode);
    
    if (regeneratedCode !== replacedCode) throw new Error('Test FAILED: Comments mismatch.');
    console.log('\n✓ PASSED: All comments and spacing preserved.');
}
