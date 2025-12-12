// Test Case c3: Comment attachment in AST tests

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Comment Attachment in AST');
    console.log('='.repeat(60));
    
    const commentTestRp = new RobinPath();
    const commentTestThread = commentTestRp.createThread('comment-test-thread');
    
    const commentTestScript = `
# line 1

# line 2
# line 3
add 2 3  # inline comment

# line 4
multiply 5 10
`;
    
    // Use getASTWithState from the thread to test comment attachment
    const astWithState = await commentTestThread.getASTWithState(commentTestScript);
    const commentAST = astWithState.ast;
    
    // Test 1: Comments above "add" command (line 2, 3) should be attached
    const addNode = commentAST.find(node => node.type === 'command' && node.name === 'add');
    const commentTest1Passed = addNode && 
        Array.isArray(addNode.comments) && 
        addNode.comments.length === 2 &&
        addNode.comments[0].text === 'line 2\nline 3' &&
        addNode.comments[0].codePos &&
        addNode.comments[0].codePos.startRow >= 0 &&
        addNode.comments[0].codePos.endRow >= addNode.comments[0].codePos.startRow &&
        addNode.comments[1].text === 'inline comment' &&
        typeof addNode.comments[1].codePos === 'object';
    
    if (commentTest1Passed) {
        console.log('✓ Test 1 PASSED - Comments above and inline for "add" command');
    } else {
        console.log('✗ Test 1 FAILED - Comments for "add" command');
        console.log('  Expected: [{text: "line 2\\nline 3", ...}, {text: "inline comment", ...}]');
        console.log('  Got:', addNode?.comments);
        throw new Error('Comment Test 1 FAILED - Comments above and inline for "add" command');
    }
    
    // Test 2: Comment above "multiply" command (line 4) should be attached
    const multiplyNode = commentAST.find(node => node.type === 'command' && node.name === 'multiply');
    const commentTest2Passed = multiplyNode && 
        Array.isArray(multiplyNode.comments) && 
        multiplyNode.comments.length === 1 &&
        multiplyNode.comments[0].text === 'line 4' &&
        typeof multiplyNode.comments[0].codePos === 'object';
    
    if (commentTest2Passed) {
        console.log('✓ Test 2 PASSED - Comment above "multiply" command');
    } else {
        console.log('✗ Test 2 FAILED - Comments for "multiply" command');
        console.log('  Expected: ["line 4"]');
        console.log('  Got:', multiplyNode?.comments);
        throw new Error('Comment Test 2 FAILED - Comment above "multiply" command');
    }
    
    // Test 3: Comment "line 1" should NOT be attached but should be a separate comment node
    const commentTest3aPassed = !commentAST.some(node => 
        node.type === 'command' && 
        node.comments && 
        node.comments.some(c => c.text === 'line 1')
    );
    
    const commentNode1 = commentAST.find(node => 
        node.type === 'comment' && 
        node.comments && 
        Array.isArray(node.comments) && 
        node.comments.length > 0 && 
        node.comments[0].text === 'line 1'
    );
    const commentTest3bPassed = commentNode1 && 
        commentNode1.type === 'comment' && 
        commentNode1.comments && 
        Array.isArray(commentNode1.comments) && 
        commentNode1.comments.length > 0 && 
        commentNode1.comments[0].text === 'line 1';
    const commentTest3Passed = commentTest3aPassed && commentTest3bPassed;
    
    if (commentTest3Passed) {
        console.log('✓ Test 3 PASSED - Comment "line 1" is a separate comment node (not attached)');
    } else {
        console.log('✗ Test 3 FAILED - Comment "line 1" should be a separate comment node');
        console.log('  Not attached to command:', commentTest3aPassed);
        console.log('  Is comment node:', commentTest3bPassed);
        console.log('  Comment node:', commentNode1);
        throw new Error('Comment Test 3 FAILED - Comment "line 1" should be a separate comment node');
    }
    
    // Test 5: Consecutive orphaned comments separated by blank lines should be grouped
    const testScript5 = `
# test comment
# test comment 2

add 5 5
`;
    const astTest5 = commentTestRp.getAST(testScript5);
    const addNode5 = astTest5.find(node => node.type === 'command' && node.name === 'add');
    const commentTest5aPassed = addNode5 && 
        (!addNode5.comments || addNode5.comments.length === 0);
    
    const commentNodes5 = astTest5.filter(node => node.type === 'comment');
    const groupedCommentNode5 = commentNodes5.find(node => 
        Array.isArray(node.comments) && 
        node.comments.length === 1 &&
        node.comments[0].text === 'test comment\ntest comment 2'
    );
    const commentTest5bPassed = commentNodes5.length === 1 && groupedCommentNode5 !== undefined;
    const commentTest5Passed = commentTest5aPassed && commentTest5bPassed;
    
    if (commentTest5Passed) {
        console.log('✓ Test 5 PASSED - Consecutive orphaned comments are grouped into single comment node');
    } else {
        console.log('✗ Test 5 FAILED - Consecutive orphaned comments should be grouped');
        console.log('  Not attached to command:', commentTest5aPassed);
        console.log('  Grouped correctly:', commentTest5bPassed);
        console.log('  Expected 1 comment node, got:', commentNodes5.length);
        throw new Error('Comment Test 5 FAILED - Consecutive orphaned comments should be grouped');
    }
    
    // Test 7: Comment "line 1" should be a standalone comment node
    const testScript7 = `
# line 1

add 5 3
`;
    const astTest7 = commentTestRp.getAST(testScript7);
    const addNode7 = astTest7.find(node => node.type === 'command' && node.name === 'add');
    const commentNode7 = astTest7.find(node => 
        node.type === 'comment' && 
        node.comments && 
        Array.isArray(node.comments) && 
        node.comments.length > 0 && 
        node.comments[0].text === 'line 1'
    );
    
    const commentTest7aPassed = addNode7 && (!addNode7.comments || addNode7.comments.length === 0);
    const commentTest7bPassed = commentNode7 && 
        commentNode7.type === 'comment' && 
        commentNode7.comments && 
        Array.isArray(commentNode7.comments) && 
        commentNode7.comments.length > 0 && 
        commentNode7.comments[0].text === 'line 1';
    const commentTest7Passed = commentTest7aPassed && commentTest7bPassed;
    
    if (commentTest7Passed) {
        console.log('✓ Test 7 PASSED - Comment "line 1" is a standalone comment node (separated by blank line)');
    } else {
        console.log('✗ Test 7 FAILED - Comment "line 1" should be a standalone comment node');
        throw new Error('Comment Test 7 FAILED - Comment "line 1" should be a standalone comment node');
    }
    
    // Test 8: Consecutive orphaned comments should be grouped
    const testScript8 = `
# line 1
# line 2
# line 3

add 5 5
`;
    const astTest8 = commentTestRp.getAST(testScript8);
    const addNode8 = astTest8.find(node => node.type === 'command' && node.name === 'add');
    
    const commentNodes8 = astTest8.filter(node => node.type === 'comment');
    const groupedCommentNode8 = commentNodes8.find(node => 
        Array.isArray(node.comments) && 
        node.comments.length === 1 &&
        node.comments[0].text === 'line 1\nline 2\nline 3'
    );
    
    const commentTest8aPassed = addNode8 && (!addNode8.comments || addNode8.comments.length === 0);
    const commentTest8bPassed = commentNodes8.length === 1;
    const commentTest8cPassed = groupedCommentNode8 !== undefined;
    const commentTest8Passed = commentTest8aPassed && commentTest8bPassed && commentTest8cPassed;
    
    if (commentTest8Passed) {
        console.log('✓ Test 8 PASSED - Consecutive orphaned comments are grouped into single node');
    } else {
        console.log('✗ Test 8 FAILED - Consecutive orphaned comments should be grouped');
        throw new Error('Comment Test 8 FAILED - Consecutive orphaned comments should be grouped');
    }
    
    console.log('='.repeat(60));
    console.log('✓ All comment AST tests PASSED');
    console.log('='.repeat(60));
}
