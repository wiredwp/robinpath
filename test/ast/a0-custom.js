// Test Case a0: Custom AST Structure tests
// Tests that updating only one node in the TRUE original script preserves all flavors exactly

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Custom AST - TRUE Original Flavor Preservation (a0)');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    
    // TRUE ORIGINAL VERSION provided by user
    const originalScript = `# why there are some comments here?
# because we want it!
log "this is good!"

log "here is another one!"

set $name as "Ryan!"

set $say as "Hello, world!"

add 5 5 into $result

if $name == "Ryan" then
---
This person is $ryan and he wants to say:
$say 
---
 elseif $name == "Alice" then
 ---
  
 ---
endif

log "hello" $
`;
    
    const initialAST = await testRp.getAST(originalScript);
    const modifiedAST = JSON.parse(JSON.stringify(initialAST));
    
    // 1. UPDATE ONLY ONE NODE
    // Change only the FIRST log message.
    const log1 = modifiedAST.find(node => node.type === 'command' && node.name === 'log' && node.args?.[0]?.value === 'this is good!');
    if (log1) {
        log1.args[0].value = "this is updated!";
    } else {
        throw new Error('Test setup error: could not find the target log node.');
    }
    
    // 2. Regenerate code
    const regeneratedCode = await testRp.updateCodeFromAST(originalScript, modifiedAST);
    
    // 3. Create expected code (TRUE original with one manual replacement)
    let replacedCode = originalScript.replace('"this is good!"', '"this is updated!"');
    
    console.log('\n--- SIDE-BY-SIDE COMPARISON ---');
    console.log('TRUE ORIGINAL:');
    console.log(originalScript);
    console.log('\nREGENERATED (AST UPDATED):');
    console.log(regeneratedCode);
    
    if (regeneratedCode !== replacedCode) {
        console.log('\n❌ Mismatch found! Comparing exact output:');
        
        // Detailed analysis to show exactly where it fails
        for (let i = 0; i < Math.max(regeneratedCode.length, replacedCode.length); i++) {
            if (regeneratedCode[i] !== replacedCode[i]) {
                console.log(`\nFirst difference found at index ${i}:`);
                console.log(`Regen chars around diff: [${JSON.stringify(regeneratedCode.substring(i, i+30))}]`);
                console.log(`Expec chars around diff: [${JSON.stringify(replacedCode.substring(i, i+30))}]`);
                break;
            }
        }
        
        throw new Error('Test FAILED: Flavor preservation on TRUE original failed.');
    }
    
    console.log('\n✓ PASSED: Only the first log was changed. All "flavors" (set...as, into, then, elseif-indent) were perfectly preserved.');
}