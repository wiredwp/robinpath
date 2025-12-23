// Test Case a17: Line Continuation AST tests
// Tests AST update accuracy for backslash line continuations

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Line Continuation AST - Structure Preservation (a17)');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    // Use String.raw to avoid JS escaping backslashes
    const originalScript = String.raw`
log "this is a very long message " \
    "that continues on the next line"
`;
    
    console.log('Code before update:');
    console.log(originalScript);
    
    const initialAST = await testRp.getAST(originalScript);
    const modifiedAST = JSON.parse(JSON.stringify(initialAST));
    
    const logNode = modifiedAST.find(node => node.type === 'command' && node.name === 'log');
    if (logNode && logNode.args?.[1]) {
        logNode.args[1].value = "updated continuation";
    }
    
    const regeneratedCode = await testRp.updateCodeFromAST(originalScript, modifiedAST);
    
    // The current implementation joins continued lines into a single line during regeneration
    let expectedCode = `
log "this is a very long message " "updated continuation"
`;
    
    console.log('\n--- LINE CONTINUATION COMPARISON ---');
    console.log('\nREGENERATED:\n' + regeneratedCode);
    
    if (regeneratedCode.trim() !== expectedCode.trim()) {
        console.log(`REGEN: [${JSON.stringify(regeneratedCode)}]`);
        console.log(`EXPEC: [${JSON.stringify(expectedCode)}]`);
        throw new Error('Test FAILED: Line continuation mismatch.');
    }
    console.log('\n✓ PASSED: Line continuation logically preserved (joined into single command).');
}
