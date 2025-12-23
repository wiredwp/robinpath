// Test Case a26: Title Decorator tests
// Tests that @title decorators are correctly parsed on do blocks

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Title Decorator AST (a26)');
    console.log('='.repeat(60));
    
    const rp = new RobinPath();
    const script = `# Test @title decorator on do block
@title "Step 1: Initialization"
do
  log "Initializing..."
enddo

@title "Step 2: Processing"
@desc "Processing data"
do
  log "Processing..."
enddo
`;
    
    const ast = await rp.getAST(script);
    
    console.log('\n--- Check @title on Do Blocks ---\n');
    
    const doBlocks = ast.filter(node => node.type === 'do');
    
    if (doBlocks.length !== 2) {
        throw new Error(`Expected 2 do blocks, got ${doBlocks.length}`);
    }
    
    // Check first do block
    const block1 = doBlocks[0];
    if (!block1.decorators || block1.decorators.length !== 1) {
        console.error('Block 1 AST:', JSON.stringify(block1, null, 2));
        throw new Error('Block 1 should have exactly 1 decorator');
    }
    
    if (block1.decorators[0].name !== 'title') {
        throw new Error(`Block 1 decorator should be 'title', got '${block1.decorators[0].name}'`);
    }
    
    if (block1.decorators[0].args[0].value !== 'Step 1: Initialization') {
        throw new Error(`Block 1 title should be 'Step 1: Initialization', got '${block1.decorators[0].args[0].value}'`);
    }
    
    console.log('✓ First do block has correct @title');
    
    // Check second do block
    const block2 = doBlocks[1];
    if (!block2.decorators || block2.decorators.length !== 2) {
        console.error('Block 2 AST:', JSON.stringify(block2, null, 2));
        throw new Error('Block 2 should have exactly 2 decorators');
    }
    
    const titleDec = block2.decorators.find(d => d.name === 'title');
    if (!titleDec) {
        throw new Error('Block 2 should have @title decorator');
    }
    
    if (titleDec.args[0].value !== 'Step 2: Processing') {
        throw new Error(`Block 2 title should be 'Step 2: Processing', got '${titleDec.args[0].value}'`);
    }
    
    const descDec = block2.decorators.find(d => d.name === 'desc');
    if (!descDec) {
        throw new Error('Block 2 should have @desc decorator');
    }
    
    if (descDec.args[0].value !== 'Processing data') {
        throw new Error(`Block 2 desc should be 'Processing data', got '${descDec.args[0].value}'`);
    }
    
    console.log('✓ Second do block has correct @title and @desc');
    
    console.log('\n' + '='.repeat(60));
    console.log('✓ All Title Decorator tests PASSED');
    console.log('='.repeat(60));
}
