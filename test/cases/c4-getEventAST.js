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
    
    // Get unique event handlers by eventName (in case of duplicates)
    const uniqueHandlers = [];
    const seenEventNames = new Set();
    for (const handler of eventAST) {
        if (!seenEventNames.has(handler.eventName)) {
            uniqueHandlers.push(handler);
            seenEventNames.add(handler.eventName);
        }
    }
    
    if (uniqueHandlers.length !== 3) {
        console.error(`✗ Event AST Test FAILED - Expected 3 unique event handlers, got ${uniqueHandlers.length} (total: ${eventAST.length})`);
        console.error(`  Found handlers: ${JSON.stringify(eventAST.map(h => ({ type: h.type, eventName: h.eventName })), null, 2)}`);
        throw new Error(`getEventAST test failed - expected 3 unique handlers, got ${uniqueHandlers.length}`);
    }
    
    // Use unique handlers for rest of test
    const eventASTToUse = uniqueHandlers;
    
    // Verify each event handler has correct structure
    for (let i = 0; i < eventASTToUse.length; i++) {
        const handler = eventASTToUse[i];
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
    const eventNames = eventASTToUse.map(h => h.eventName);
    if (!eventNames.includes('test1') || !eventNames.includes('test2') || !eventNames.includes('test3')) {
        console.error(`✗ Event AST Test FAILED - Missing expected event names. Got: ${eventNames.join(', ')}`);
        throw new Error('getEventAST test failed - missing expected event names');
    }
    
    console.log(`✓ Event AST Test PASSED - Found ${eventASTToUse.length} unique event handlers (total: ${eventAST.length})`);
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
    
    // Get unique event handlers by eventName (in case of duplicates)
    const uniqueThreadHandlers = [];
    const seenThreadEventNames = new Set();
    for (const handler of threadEventAST) {
        if (!seenThreadEventNames.has(handler.eventName)) {
            uniqueThreadHandlers.push(handler);
            seenThreadEventNames.add(handler.eventName);
        }
    }
    
    if (uniqueThreadHandlers.length !== 3) {
        console.error(`✗ Thread Event AST Test FAILED - Expected 3 unique event handlers, got ${uniqueThreadHandlers.length} (total: ${threadEventAST.length})`);
        throw new Error(`Thread getEventAST test failed - expected 3 unique handlers, got ${uniqueThreadHandlers.length}`);
    }
    
    // Use unique handlers for rest of test
    const threadEventASTToUse = uniqueThreadHandlers;
    
    // Verify each event handler has correct structure
    for (let i = 0; i < threadEventASTToUse.length; i++) {
        const handler = threadEventASTToUse[i];
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
    const threadEventNames = threadEventASTToUse.map(h => h.eventName);
    if (!threadEventNames.includes('thread-event1') || !threadEventNames.includes('thread-event2') || !threadEventNames.includes('thread-event3')) {
        console.error(`✗ Thread Event AST Test FAILED - Missing expected event names. Got: ${threadEventNames.join(', ')}`);
        throw new Error('Thread getEventAST test failed - missing expected event names');
    }
    
    // Verify thread isolation - main instance should not have thread's events
    const mainEventAST = threadEventASTTestRp.getEventAST();
    // Get unique handlers from main instance too
    const uniqueMainHandlers = [];
    const seenMainEventNames = new Set();
    for (const handler of mainEventAST) {
        if (!seenMainEventNames.has(handler.eventName)) {
            uniqueMainHandlers.push(handler);
            seenMainEventNames.add(handler.eventName);
        }
    }
    
    if (uniqueMainHandlers.length !== 0) {
        console.error(`✗ Thread Event AST Test FAILED - Main instance should not have thread's events. Got ${uniqueMainHandlers.length} unique handlers (total: ${mainEventAST.length})`);
        throw new Error('Thread getEventAST test failed - main instance should not have thread events');
    }
    
    console.log(`✓ Thread Event AST Test PASSED - Found ${threadEventASTToUse.length} unique event handlers in thread (total: ${threadEventAST.length})`);
    console.log(`  Thread event names: ${threadEventNames.join(', ')}`);
    console.log(`  Main instance handlers: ${uniqueMainHandlers.length} (correctly isolated)`);
    console.log('='.repeat(60));
}
