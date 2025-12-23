// Test Case a3: Conditionals AST tests
// Tests AST update accuracy for inline and block conditionals

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Conditionals AST - Structure Preservation (a3)');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    
    // SECTION 1: Inline If
    const inlineScript = `
$balance = 1000
if $balance > 0 then log "Positive"
`;
    const initialAST = await testRp.getAST(inlineScript);
    const modifiedInlineAST = JSON.parse(JSON.stringify(initialAST));
    const balNode = modifiedInlineAST.find(node => node.type === 'assignment' && node.targetName === 'balance');
    if (balNode) balNode.literalValue = 9999;
    const ifNode = modifiedInlineAST.find(node => node.type === 'inlineIf');
    if (ifNode && ifNode.command?.args?.[0]) ifNode.command.args[0].value = "Balance updated";
    
    const regeneratedInline = await testRp.updateCodeFromAST(inlineScript, modifiedInlineAST);
    let replacedInline = inlineScript.replace('1000', '9999').replace('"Positive"', '"Balance updated"');
    
    console.log('\n--- INLINE IF COMPARISON ---');
    console.log('\nORIGINAL:\n' + inlineScript);
    console.log('\nREGENERATED:\n' + regeneratedInline);
    
    if (regeneratedInline !== replacedInline) throw new Error('Test FAILED: Inline If mismatch.');
    console.log('✓ PASSED: Inline If structure preserved.');

    // SECTION 2: Block If
    const blockScript = `
$score = 85
if $score >= 90
  log "Grade A"
else
  log "Grade F"
endif
`;
    const blockAST = await testRp.getAST(blockScript);
    const modifiedBlockAST = JSON.parse(JSON.stringify(blockAST));
    const scoreNode = modifiedBlockAST.find(node => node.type === 'assignment' && node.targetName === 'score');
    if (scoreNode) scoreNode.literalValue = 95;
    const ifBlock = modifiedBlockAST.find(node => node.type === 'ifBlock');
    if (ifBlock && ifBlock.thenBranch?.[0]?.args?.[0]) ifBlock.thenBranch[0].args[0].value = "Excellent";
    
    const regeneratedBlock = await testRp.updateCodeFromAST(blockScript, modifiedBlockAST);
    let replacedBlock = blockScript.replace('85', '95').replace('"Grade A"', '"Excellent"');
    
    console.log('\n--- BLOCK IF COMPARISON ---');
    console.log('\nORIGINAL:\n' + blockScript);
    console.log('\nREGENERATED:\n' + regeneratedBlock);
    
    if (regeneratedBlock !== replacedBlock) throw new Error('Test FAILED: Block If mismatch.');
    console.log('✓ PASSED: Block If structure preserved.');
}