// Test Case c5: getEventAST method tests

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing getEventAST method');
    console.log('='.repeat(60));
    
    const eventASTTestScript = `
on "test1"
  log "Event test1"
on "test2"
  log "Event test2"
  log "Event test2 - second log"
on "test3"
  log "Event test3"
`;

    const eventASTTestRp = new RobinPath();
    await eventASTTestRp.executeScript(eventASTTestScript);
    
    // Get event AST
    const eventAST = eventASTTestRp.getEventAST();
    
    // Verify event AST structure
    if (!Array.isArray(eventAST)) {
        console.error('✗ Event AST Test FAILED - getEventAST should return an array');
        throw new Error('getEventAST test failed - not an array');
    }
    
    if (eventAST.length !== 3) {
        console.error(`✗ Event AST Test FAILED - Expected 3 event handlers, got ${eventAST.length}`);
        throw new Error(`getEventAST test failed - expected 3 handlers, got ${eventAST.length}`);
    }
    
    // Verify each event handler has correct structure
    for (let i = 0; i < eventAST.length; i++) {
        const handler = eventAST[i];
        if (handler.type !== 'onBlock') {
            console.error(`✗ Event AST Test FAILED - Handler ${i} should have type 'onBlock', got '${handler.type}'`);
            throw new Error(`getEventAST test failed - handler ${i} has wrong type`);
        }
        if (!handler.eventName) {
            console.error(`✗ Event AST Test FAILED - Handler ${i} missing eventName`);
            throw new Error(`getEventAST test failed - handler ${i} missing eventName`);
        }
        if (!Array.isArray(handler.body)) {
            console.error(`✗ Event AST Test FAILED - Handler ${i} body should be an array`);
            throw new Error(`getEventAST test failed - handler ${i} body not an array`);
        }
    }
    
    // Verify event names
    const eventNames = eventAST.map(h => h.eventName);
    if (!eventNames.includes('test1') || !eventNames.includes('test2') || !eventNames.includes('test3')) {
        console.error(`✗ Event AST Test FAILED - Missing expected event names. Got: ${eventNames.join(', ')}`);
        throw new Error('getEventAST test failed - missing expected event names');
    }
    
    console.log(`✓ Event AST Test PASSED - Found ${eventAST.length} event handlers`);
    console.log(`  Event names: ${eventNames.join(', ')}`);
    console.log('='.repeat(60));
    console.log();
    
    // Test getEventAST in thread scenario
    console.log('='.repeat(60));
    console.log('Testing getEventAST method in thread scenario');
    console.log('='.repeat(60));
    
    const threadEventASTTestScript = `
on "thread-event1"
  log "Thread event handler 1"
  log "Received:" $1
on "thread-event2"
  log "Thread event handler 2"
  math.add $1 10
  log "Result:" $
on "thread-event3"
  log "Thread event handler 3"
`;

    const threadEventASTTestRp = new RobinPath({ threadControl: true });
    const threadEventASTTestThread = threadEventASTTestRp.createThread('event-ast-test-thread');
    
    // Execute script in thread
    await threadEventASTTestThread.executeScript(threadEventASTTestScript);
    
    // Get event AST from thread
    const threadEventAST = threadEventASTTestThread.getEventAST();
    
    // Verify thread event AST structure
    if (!Array.isArray(threadEventAST)) {
        console.error('✗ Thread Event AST Test FAILED - getEventAST should return an array');
        throw new Error('Thread getEventAST test failed - not an array');
    }
    
    if (threadEventAST.length !== 3) {
        console.error(`✗ Thread Event AST Test FAILED - Expected 3 event handlers, got ${threadEventAST.length}`);
        throw new Error(`Thread getEventAST test failed - expected 3 handlers, got ${threadEventAST.length}`);
    }
    
    // Verify each event handler has correct structure
    for (let i = 0; i < threadEventAST.length; i++) {
        const handler = threadEventAST[i];
        if (handler.type !== 'onBlock') {
            console.error(`✗ Thread Event AST Test FAILED - Handler ${i} should have type 'onBlock', got '${handler.type}'`);
            throw new Error(`Thread getEventAST test failed - handler ${i} has wrong type`);
        }
        if (!handler.eventName) {
            console.error(`✗ Thread Event AST Test FAILED - Handler ${i} missing eventName`);
            throw new Error(`Thread getEventAST test failed - handler ${i} missing eventName`);
        }
        if (!Array.isArray(handler.body)) {
            console.error(`✗ Thread Event AST Test FAILED - Handler ${i} body should be an array`);
            throw new Error(`Thread getEventAST test failed - handler ${i} body not an array`);
        }
    }
    
    // Verify event names
    const threadEventNames = threadEventAST.map(h => h.eventName);
    if (!threadEventNames.includes('thread-event1') || !threadEventNames.includes('thread-event2') || !threadEventNames.includes('thread-event3')) {
        console.error(`✗ Thread Event AST Test FAILED - Missing expected event names. Got: ${threadEventNames.join(', ')}`);
        throw new Error('Thread getEventAST test failed - missing expected event names');
    }
    
    // Verify thread isolation - main instance should not have thread's events
    const mainEventAST = threadEventASTTestRp.getEventAST();
    if (mainEventAST.length !== 0) {
        console.error(`✗ Thread Event AST Test FAILED - Main instance should not have thread's events. Got ${mainEventAST.length} handlers`);
        throw new Error('Thread getEventAST test failed - main instance should not have thread events');
    }
    
    console.log(`✓ Thread Event AST Test PASSED - Found ${threadEventAST.length} event handlers in thread`);
    console.log(`  Thread event names: ${threadEventNames.join(', ')}`);
    console.log(`  Main instance handlers: ${mainEventAST.length} (correctly isolated)`);
    console.log('='.repeat(60));
}
