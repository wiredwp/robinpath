// Test Case c4: Together AST node serialization tests

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Together AST Node Serialization');
    console.log('='.repeat(60));
    
    const togetherAstTestRp = new RobinPath();
    const togetherAstTestScript = `
together
  do
    log "do block 1"
    add 1 2
  enddo
  do
    log "do block 2"
    multiply 3 4
  enddo
endtogether
log "after together"`;
    
    const togetherAst = togetherAstTestRp.getAST(togetherAstTestScript);
    
    // Find the together node
    const togetherNode = togetherAst.find(node => node.type === 'together');
    
    if (!togetherNode) {
        console.log('✗ Together AST Test FAILED - Together node not found in AST');
        console.log('  AST nodes:', togetherAst.map(n => ({ type: n.type })));
        throw new Error('Together AST Test FAILED - Together node not found in AST');
    }
    
    // Verify together node has blocks property
    if (!togetherNode.blocks || !Array.isArray(togetherNode.blocks)) {
        console.log('✗ Together AST Test FAILED - Together node missing blocks property or blocks is not an array');
        console.log('  Together node:', JSON.stringify(togetherNode, null, 2));
        throw new Error('Together AST Test FAILED - Together node missing blocks property');
    }
    
    // Verify blocks array is not empty
    if (togetherNode.blocks.length === 0) {
        console.log('✗ Together AST Test FAILED - Together node has empty blocks array');
        throw new Error('Together AST Test FAILED - Together node has empty blocks array');
    }
    
    // Verify we have 2 blocks
    if (togetherNode.blocks.length !== 2) {
        console.log('✗ Together AST Test FAILED - Expected 2 blocks, got', togetherNode.blocks.length);
        throw new Error(`Together AST Test FAILED - Expected 2 blocks, got ${togetherNode.blocks.length}`);
    }
    
    // Verify each block is a do block with body
    const block1 = togetherNode.blocks[0];
    const block2 = togetherNode.blocks[1];
    
    if (!block1 || block1.type !== 'do') {
        console.log('✗ Together AST Test FAILED - Block 1 is not a do block');
        throw new Error('Together AST Test FAILED - Block 1 is not a do block');
    }
    
    if (!block2 || block2.type !== 'do') {
        console.log('✗ Together AST Test FAILED - Block 2 is not a do block');
        throw new Error('Together AST Test FAILED - Block 2 is not a do block');
    }
    
    // Verify blocks have body arrays
    if (!block1.body || !Array.isArray(block1.body) || block1.body.length === 0) {
        console.log('✗ Together AST Test FAILED - Block 1 missing body or body is empty');
        throw new Error('Together AST Test FAILED - Block 1 missing body or body is empty');
    }
    
    if (!block2.body || !Array.isArray(block2.body) || block2.body.length === 0) {
        console.log('✗ Together AST Test FAILED - Block 2 missing body or body is empty');
        throw new Error('Together AST Test FAILED - Block 2 missing body or body is empty');
    }
    
    // Verify block 1 contains log and add commands
    const block1Log = block1.body.find((node) => node.type === 'command' && node.name === 'log');
    const block1Add = block1.body.find((node) => node.type === 'command' && node.name === 'add');
    
    if (!block1Log) {
        console.log('✗ Together AST Test FAILED - Block 1 missing log command');
        throw new Error('Together AST Test FAILED - Block 1 missing log command');
    }
    
    if (!block1Add) {
        console.log('✗ Together AST Test FAILED - Block 1 missing add command');
        throw new Error('Together AST Test FAILED - Block 1 missing add command');
    }
    
    // Verify block 2 contains log and multiply commands
    const block2Log = block2.body.find((node) => node.type === 'command' && node.name === 'log');
    const block2Multiply = block2.body.find((node) => node.type === 'command' && node.name === 'multiply');
    
    if (!block2Log) {
        console.log('✗ Together AST Test FAILED - Block 2 missing log command');
        throw new Error('Together AST Test FAILED - Block 2 missing log command');
    }
    
    if (!block2Multiply) {
        console.log('✗ Together AST Test FAILED - Block 2 missing multiply command');
        throw new Error('Together AST Test FAILED - Block 2 missing multiply command');
    }
    
    console.log('✓ Together AST Test PASSED - Together node has blocks with proper structure');
    console.log(`  Blocks count: ${togetherNode.blocks.length}`);
    console.log(`  Block 1 body statements: ${block1.body.length}`);
    console.log(`  Block 2 body statements: ${block2.body.length}`);
    console.log('='.repeat(60));
}
