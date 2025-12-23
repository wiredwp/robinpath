// Test Case a25: Together Block Decorator tests
// Tests that decorators on do blocks inside together are correctly parsed

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Together Block Decorators (a25)');
    console.log('='.repeat(60));
    
    const rp = new RobinPath();
    const script = `# Test decorators inside together blocks
together
  @desc "Task 1"
  do
    log "Task 1"
  enddo
  
  @desc "Task 2"
  do
    log "Task 2"
  enddo
endtogether
`;
    
    const initialAST = await rp.getAST(script);
    
    console.log('\n--- Check Decorators in Together Block ---\n');
    
    const together = initialAST.find(node => node.type === 'together');
    if (!together) {
        throw new Error('Together block not found in AST');
    }
    
    if (!together.blocks || together.blocks.length !== 2) {
        throw new Error(`Expected 2 blocks in together, got ${together.blocks?.length}`);
    }
    
    const block1 = together.blocks[0];
    const block2 = together.blocks[1];
    
    if (!block1.decorators || block1.decorators[0].args[0].value !== "Task 1") {
        console.error('Block 1 AST:', JSON.stringify(block1, null, 2));
        throw new Error('Block 1 is missing or has incorrect decorator');
    }
    
    if (!block2.decorators || block2.decorators[0].args[0].value !== "Task 2") {
        console.error('Block 2 AST:', JSON.stringify(block2, null, 2));
        throw new Error('Block 2 is missing or has incorrect decorator');
    }
    
    console.log('✓ Both do blocks inside together have correct decorators');
    
    console.log('\n' + '='.repeat(60));
    console.log('✓ All Together Block Decorator tests PASSED');
    console.log('='.repeat(60));
}
