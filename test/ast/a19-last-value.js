// Test Case a19: Last Value AST Structure tests
// Tests AST update accuracy and structure preservation for last value ($) and subexpressions

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Last Value AST - Structure Preservation (a19)');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    const originalScript = `
# Basic update
math.add 5 5 into $result

# Subexpression with last value
10
$(math.multiply $ 3)

# Subexpression with conditional
$(if true then
  math.add 10 20
else
  math.add 5 5
endif)
`;
    
    const initialAST = await testRp.getAST(originalScript);
    const modifiedAST = JSON.parse(JSON.stringify(initialAST));
    
    const addNode = modifiedAST.find(node => node.type === 'command' && node.name === 'math.add' && node.args?.[0]?.value === 5);
    if (addNode && addNode.args) { addNode.args[0].value = 11; addNode.args[1].value = 22; if (addNode.into) addNode.into.targetName = 'output'; }
    const subexpr1 = modifiedAST.find(node => node.type === 'command' && node.name === '_subexpr' && node.args?.[0]?.body?.[0]?.name === 'math.multiply');
    if (subexpr1 && subexpr1.args?.[0]?.body?.[0]?.args) subexpr1.args[0].body[0].args[1].value = 9;
    const subexpr2 = modifiedAST.find(node => node.type === 'command' && node.name === '_subexpr' && node.args?.[0]?.body?.[0]?.type === 'ifBlock');
    if (subexpr2 && subexpr2.args?.[0]?.body?.[0]) subexpr2.args[0].body[0].condition.value = false;
    
    const regeneratedCode = await testRp.updateCodeFromAST(originalScript, modifiedAST);
    let replacedCode = originalScript.replace('add 5 5 into $result', 'add 11 22 into $output')
        .replace('math.multiply $ 3', 'math.multiply $ 9')
        .replace('if true then', 'if false then');
    
    console.log('\n--- LAST VALUE COMPARISON ---');
    console.log('\nORIGINAL:\n' + originalScript);
    console.log('\nREGENERATED:\n' + regeneratedCode);
    
    if (regeneratedCode !== replacedCode) throw new Error('Test FAILED: Last Value mismatch.');
    console.log('\n✓ PASSED: Last value and subexpressions preserved.');
}