// Test Case a24: Nested Var Decorator tests
// Tests that decorators on vars inside blocks correctly register metadata

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Nested Var Decorators (a24)');
    console.log('='.repeat(60));
    
    const rp = new RobinPath();
    const script = `
do
  @desc "Nested variable description"
  var $nestedVar "value"
  
  log $nestedVar
enddo
`;
    
    // We need to use executeScript to trigger parse-time decorators
    await rp.executeScript(script);
    
    console.log('\n--- Check Metadata for Nested Var ---\n');
    
    // Metadata for variables is stored in rp.environment.variableMetadata
    // We can use getMeta command to check it if we want, or use the internal API
    
    // Test via script
    await rp.executeScript('getMeta $nestedVar description');
    const metaValue = rp.getLastValue();
    
    console.log(`Metadata value: ${metaValue}`);
    
    if (metaValue !== "Nested variable description") {
        throw new Error(`Expected "Nested variable description", got "${metaValue}"`);
    }
    
    console.log('✓ Nested variable has correct metadata');
    
    console.log('\n' + '='.repeat(60));
    console.log('✓ All Nested Var Decorator tests PASSED');
    console.log('='.repeat(60));
}
