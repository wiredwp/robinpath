// Test Case a21: Fenced Blocks AST Structure tests
// Tests AST update accuracy and structure preservation for chunks, cells, and prompt blocks

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Fenced Blocks AST - Structure Preservation (a21)');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    const originalScript = `# Test chunk
--- chunk:main_logic ---
$val = "original"

# Test cell
---cell code id:config---
$timeout = 30
---end---

# Test prompt
if true then
---
Execute: $val
---
endif
`;
    
    const initialAST = await testRp.getAST(originalScript);
    const modifiedAST = JSON.parse(JSON.stringify(initialAST));
    
    const chunkNode = modifiedAST.find(node => node.type === 'chunk_marker');
    if (chunkNode) chunkNode.id = 'updated_logic';
    const assignNode = modifiedAST.find(node => node.type === 'assignment' && node.targetName === 'val');
    if (assignNode) assignNode.literalValue = "updated";
    const cellNode = modifiedAST.find(node => node.type === 'cell');
    if (cellNode && cellNode.meta) cellNode.meta.id = 'settings';
    const ifNode = modifiedAST.find(node => node.type === 'ifBlock' || node.type === 'inlineIf');
    const promptNode = ifNode?.thenBranch?.find(n => n.type === 'prompt_block');
    if (promptNode) promptNode.rawText = "Run command: $val\n";
    
    const regeneratedCode = await testRp.updateCodeFromAST(originalScript, modifiedAST);
    let replacedCode = originalScript.replace('chunk:main_logic', 'chunk:updated_logic')
        .replace('"original"', '"updated"')
        .replace('id:config', 'id:settings')
        .replace('Execute: $val', 'Run command: $val');
    
    console.log('\n--- FENCED BLOCKS COMPARISON ---');
    console.log('ORIGINAL:\n' + originalScript);
    console.log('\nREGENERATED:\n' + regeneratedCode);
    
    if (regeneratedCode !== replacedCode) throw new Error('Test FAILED: Fenced blocks mismatch.');
    console.log('\n✓ PASSED: Fenced blocks, chunks, and cells preserved.');
}