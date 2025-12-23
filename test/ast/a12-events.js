// Test Case a12: Events AST tests
// Tests AST update accuracy for event handlers (on/endon) and trigger commands

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Events AST - Structure Preservation (a12)');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    
    // PART 1: on/endon handler
    const onScript = `
on "test1"
  log "Event Test 1"
endon
`;
    
    console.log('Code before update:');
    console.log(onScript);
    
    const initialOnAST = await testRp.getAST(onScript);
    const modifiedOnAST = JSON.parse(JSON.stringify(initialOnAST));
    
    const onNode = modifiedOnAST.find(node => node.type === 'onBlock' && node.eventName === 'test1');
    if (onNode) {
        onNode.eventName = 'updated_event';
        if (onNode.body?.[0]?.args?.[0]) onNode.body[0].args[0].value = "Event Updated";
    }
    
    const regeneratedOn = await testRp.updateCodeFromAST(onScript, modifiedOnAST);
    let replacedOn = onScript.replace('"test1"', '"updated_event"').replace('"Event Test 1"', '"Event Updated"');
    
    console.log('\n--- ON BLOCK COMPARISON ---');
    console.log('REGENERATED:\n' + regeneratedOn);
    
    if (regeneratedOn !== replacedOn) throw new Error('Test FAILED: on block mismatch.');
    console.log('✓ PASSED: on block preserved.');

    // PART 2: trigger command
    const triggerScript = `
trigger "test1" "arg1" "arg2"
`;
    
    console.log('\nCode before update:');
    console.log(triggerScript);
    
    const initialTriggerAST = await testRp.getAST(triggerScript);
    const modifiedTriggerAST = JSON.parse(JSON.stringify(initialTriggerAST));
    
    const triggerNode = modifiedTriggerAST.find(node => node.type === 'command' && node.name === 'trigger');
    if (triggerNode) {
        triggerNode.args[0].value = 'new_event';
        triggerNode.args[1].value = 'new_arg';
    }
    
    const regeneratedTrigger = await testRp.updateCodeFromAST(triggerScript, modifiedTriggerAST);
    let replacedTrigger = triggerScript.replace('"test1" "arg1"', '"new_event" "new_arg"');
    
    console.log('\n--- TRIGGER COMPARISON ---');
    console.log('REGENERATED:\n' + regeneratedTrigger);
    
    if (regeneratedTrigger !== replacedTrigger) throw new Error('Test FAILED: trigger mismatch.');
    console.log('✓ PASSED: trigger command preserved.');

    console.log('\n' + '='.repeat(60));
    console.log('✓ All Events AST tests PASSED');
    console.log('='.repeat(60));
}
