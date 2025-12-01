import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';
import { RobinPath } from '../dist/index.js';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the test script
const testScriptPath = join(__dirname, 'test.rp');
const testScript = readFileSync(testScriptPath, 'utf-8');

console.log('='.repeat(60));
console.log('Running RobinPath Test Script');
console.log('='.repeat(60));
console.log();

// Create a simple HTTP server for fetch tests
const testServer = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const method = req.method;
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // Handle different endpoints
    if (url.pathname === '/test/get') {
        if (method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'GET request successful', method: 'GET', path: '/test/get' }));
        } else {
            res.writeHead(405);
            res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
    } else if (url.pathname === '/test/post') {
        if (method === 'POST') {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                try {
                    const parsedBody = body ? JSON.parse(body) : {};
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        message: 'POST request successful', 
                        method: 'POST', 
                        path: '/test/post',
                        receivedBody: parsedBody
                    }));
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid JSON' }));
                }
            });
        } else {
            res.writeHead(405);
            res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
    } else if (url.pathname === '/test/put') {
        if (method === 'PUT') {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                try {
                    const parsedBody = body ? JSON.parse(body) : {};
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        message: 'PUT request successful', 
                        method: 'PUT', 
                        path: '/test/put',
                        receivedBody: parsedBody
                    }));
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid JSON' }));
                }
            });
        } else {
            res.writeHead(405);
            res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
    } else if (url.pathname === '/test/delete') {
        if (method === 'DELETE') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'DELETE request successful', method: 'DELETE', path: '/test/delete' }));
        } else {
            res.writeHead(405);
            res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
    } else if (url.pathname === '/test/echo') {
        // Echo endpoint that returns request info
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const parsedBody = body ? JSON.parse(body) : null;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    method: method,
                    path: url.pathname,
                    query: Object.fromEntries(url.searchParams),
                    headers: req.headers,
                    body: parsedBody
                }));
            } catch (e) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    method: method,
                    path: url.pathname,
                    query: Object.fromEntries(url.searchParams),
                    headers: req.headers,
                    body: body
                }));
            }
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found', path: url.pathname }));
    }
});

// Start the test server and run tests
const PORT = 3005;

(async () => {
    try {
        // Start the test server
        await new Promise((resolve, reject) => {
            testServer.listen(PORT, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log(`Test server started on http://localhost:${PORT}`);
                    resolve();
                }
            });
        });
        
        // Create interpreter instance
        const rp = new RobinPath();
        // Record start time
        const startTime = Date.now();
        
        // Execute the test script
        const result = await rp.executeScript(testScript);
        
        // Calculate execution time
        const endTime = Date.now();
        const executionTime = endTime - startTime;
        
        console.log();
        console.log('='.repeat(60));
        console.log('Test execution completed successfully!');
        console.log('Final result ($):', result);
        console.log(`Total execution time: ${executionTime}ms (${(executionTime / 1000).toFixed(3)}s)`);
        console.log('='.repeat(60));
        
        // Test getASTWithState
        console.log();
        console.log('='.repeat(60));
        console.log('Testing getASTWithState method');
        console.log('='.repeat(60));
        
        const thread = rp.createThread('ast-test-thread');
        const testScriptForAST = `
add 5 5
$result = $
log 'Result:' $result
if $result > 5
  multiply $result 2
  log 'Doubled:' $
endif
`;
        
        const astResult = await thread.getASTWithState(testScriptForAST);
       
        /*
        console.log('AST Structure:');
        console.log(JSON.stringify(astResult.ast, null, 2));
        console.log('Variables:');
        console.log('  Thread:', astResult.variables.thread);
        console.log('  Global:', astResult.variables.global);
        console.log();
        console.log('Last Value ($):', astResult.lastValue);
        console.log();        
        console.log('Call Stack:', astResult.callStack.length, 'frame(s)');
        console.log('='.repeat(60));
        */
       
        // Test getAST method with module names
        console.log();
        console.log('='.repeat(60));
        console.log('Testing getAST method with module names');
        console.log('='.repeat(60));
        
        const astTestRp = new RobinPath();
        
        // Test 1: Commands with explicit module names
        const testScript1 = `
math.add 5 10
string.length "hello"
array.length [1, 2, 3]
`;
        const ast1 = astTestRp.getAST(testScript1);
        
        // Verify module names are included
        const test1Passed = 
            ast1[0]?.module === 'math' &&
            ast1[1]?.module === 'string' &&
            ast1[2]?.module === 'array';
        
        if (test1Passed) {
            console.log('✓ Test 1 PASSED - Module names correctly extracted from explicit syntax');
        } else {
            console.log('✗ Test 1 FAILED - Commands with explicit module names');
            console.log('AST:', JSON.stringify(ast1, null, 2));
            console.log('  math.add module:', ast1[0]?.module);
            console.log('  string.length module:', ast1[1]?.module);
            console.log('  array.length module:', ast1[2]?.module);
            throw new Error('Test 1 FAILED - Module names incorrectly extracted from explicit syntax');
        }
        
        // Test 2: Commands without module names but with "use" command
        const testScript2 = `
use math
add 5 10
multiply 3 4
use string
length "test"
`;
        const ast2 = astTestRp.getAST(testScript2);
        
        // Note: getAST doesn't execute, so "use" won't affect currentModule
        // But we should still be able to find modules by searching metadata
        const test2Passed = 
            ast2[1]?.module === 'math' && // add should be found in math module
            ast2[2]?.module === 'math' && // multiply should be found in math module
            ast2[4]?.module === 'string'; // length should be found in string module
        
        if (test2Passed) {
            console.log('✓ Test 2 PASSED - Module names correctly found from metadata lookup');
        } else {
            console.log('✗ Test 2 FAILED - Commands with "use" module context');
            console.log('AST:', JSON.stringify(ast2, null, 2));
            console.log('  add module:', ast2[1]?.module);
            console.log('  multiply module:', ast2[2]?.module);
            console.log('  length module:', ast2[4]?.module);
            throw new Error('Test 2 FAILED - Module names incorrectly found from metadata lookup');
        }
        
        // Test 3: Global commands (no module)
        const testScript3 = `
log "test"
$var = 10
`;
        const ast3 = astTestRp.getAST(testScript3);
        
        // log should be a global command (no module)
        const test3Passed = ast3[0]?.module === null || ast3[0]?.module === undefined;
        
        if (test3Passed) {
            console.log('✓ Test 3 PASSED - Global commands correctly identified (no module)');
        } else {
            console.log('✗ Test 3 FAILED - Global commands');
            console.log('AST:', JSON.stringify(ast3, null, 2));
            console.log('  log module:', ast3[0]?.module);
            throw new Error('Test 3 FAILED - Global commands incorrectly identified');
        }
        
        console.log('='.repeat(60));
       
        // Test "end" command
        console.log();
        console.log('='.repeat(60));
        console.log('Testing "end" command');
        console.log('='.repeat(60));

        
        const endTestScript = `
log "Before end"
$beforeEnd = 100
math.add 5 10
end
log "This should not execute"
$afterEnd = 200
`;
        
        const endTestRp = new RobinPath();
        const endResult = await endTestRp.executeScript(endTestScript);
        
        console.log('Script executed with "end" command');
        console.log('Final result ($):', endResult);
        console.log('Variable $beforeEnd:', endTestRp.getVariable('beforeEnd'));
        console.log('Variable $afterEnd:', endTestRp.getVariable('afterEnd'));
        
        // Verify that execution stopped and last value is preserved
        const beforeEndSet = endTestRp.getVariable('beforeEnd') === 100;
        const afterEndNotSet = endTestRp.getVariable('afterEnd') === null;
        const lastValuePreserved = endResult === 15; // math.add 5 10 = 15
        
        if (beforeEndSet && afterEndNotSet && lastValuePreserved) {
            console.log('✓ "end" command test PASSED - script stopped correctly and last value preserved');
        } else {
            console.log('✗ "end" command test FAILED');
            console.log('  beforeEnd set:', beforeEndSet);
            console.log('  afterEnd not set:', afterEndNotSet);
            console.log('  last value preserved:', lastValuePreserved);
            throw new Error('end command did not work correctly');
        }
        
        console.log('='.repeat(60));
        
        // List all extracted functions from test.rp
        console.log();
        console.log('='.repeat(60));
        console.log('Extracted Functions from test.rp');
        console.log('='.repeat(60));
        
        const functionsRp = new RobinPath();
        const extractedFunctions = functionsRp.getExtractedFunctions(testScript);
        
        if (extractedFunctions.length === 0) {
            console.log('No functions defined in test.rp');
        } else {
            console.log(`Total: ${extractedFunctions.length} function(s)`);
            
            // Sort functions alphabetically by name
            const sortedFunctions = [...extractedFunctions].sort((a, b) => 
                a.name.localeCompare(b.name)
            );
            
            // Join function names with commas
            const functionNames = sortedFunctions.map(func => func.name).join(', ');
            console.log(functionNames);
        }
        
        console.log('='.repeat(60));
        
        // Test comment attachment in AST
        console.log();
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
            addNode.comments.length === 3 &&
            addNode.comments[0] === 'line 2' &&
            addNode.comments[1] === 'line 3' &&
            addNode.comments[2] === 'inline comment';
        
        if (commentTest1Passed) {
            console.log('✓ Test 1 PASSED - Comments above and inline for "add" command');
        } else {
            console.log('✗ Test 1 FAILED - Comments for "add" command');
            console.log('  Expected: ["line 2", "line 3", "inline comment"]');
            console.log('  Got:', addNode?.comments);
            throw new Error('Comment Test 1 FAILED - Comments above and inline for "add" command');
        }
        
        // Test 2: Comment above "multiply" command (line 4) should be attached
        const multiplyNode = commentAST.find(node => node.type === 'command' && node.name === 'multiply');
        const commentTest2Passed = multiplyNode && 
            Array.isArray(multiplyNode.comments) && 
            multiplyNode.comments.length === 1 &&
            multiplyNode.comments[0] === 'line 4';
        
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
            node.comments.includes('line 1')
        );
        
        const commentNode1 = commentAST.find(node => node.type === 'comment' && node.text === 'line 1');
        const commentTest3bPassed = commentNode1 && commentNode1.type === 'comment' && commentNode1.text === 'line 1';
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
        
        // Test 5: Consecutive orphaned comments separated by blank lines should be grouped into a single comment node
        const testScript5 = `
# test comment
# test comment 2

add 5 5
`;
        const astTest5 = commentTestRp.getAST(testScript5);
        const addNode5 = astTest5.find(node => node.type === 'command' && node.name === 'add');
        const commentTest5aPassed = addNode5 && 
            (!addNode5.comments || addNode5.comments.length === 0);
        
        // Should be grouped into a single comment node with comments array
        const commentNodes5 = astTest5.filter(node => node.type === 'comment');
        const groupedCommentNode5 = commentNodes5.find(node => 
            Array.isArray(node.comments) && 
            node.comments.length === 2 &&
            node.comments[0] === 'test comment' &&
            node.comments[1] === 'test comment 2'
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
            console.log('  Comment nodes:', commentNodes5);
            console.log('  Expected comments: ["test comment", "test comment 2"]');
            console.log('  Got comments:', groupedCommentNode5?.comments);
            throw new Error('Comment Test 5 FAILED - Consecutive orphaned comments should be grouped');
        }
        
        
        // Test 7: Comment "line 1" should be a standalone comment node (separated by blank line, not consecutive with any statement)
        const testScript7 = `
# line 1

add 5 3
`;
        const astTest7 = commentTestRp.getAST(testScript7);
        const addNode7 = astTest7.find(node => node.type === 'command' && node.name === 'add');
        const commentNode7 = astTest7.find(node => node.type === 'comment' && node.text === 'line 1');
        
        const commentTest7aPassed = addNode7 && (!addNode7.comments || addNode7.comments.length === 0);
        const commentTest7bPassed = commentNode7 && commentNode7.type === 'comment' && commentNode7.text === 'line 1';
        const commentTest7Passed = commentTest7aPassed && commentTest7bPassed;
        
        if (commentTest7Passed) {
            console.log('✓ Test 7 PASSED - Comment "line 1" is a standalone comment node (separated by blank line)');
        } else {
            console.log('✗ Test 7 FAILED - Comment "line 1" should be a standalone comment node');
            console.log('  Not attached to command:', commentTest7aPassed);
            console.log('  Is comment node:', commentTest7bPassed);
            console.log('  Comment node:', commentNode7);
            console.log('  Add node comments:', addNode7?.comments);
            throw new Error('Comment Test 7 FAILED - Comment "line 1" should be a standalone comment node');
        }
        
        // Test 8: Consecutive orphaned comments should be grouped into a single comment node
        const testScript8 = `
# line 1
# line 2
# line 3

add 5 5
`;
        const astTest8 = commentTestRp.getAST(testScript8);
        const addNode8 = astTest8.find(node => node.type === 'command' && node.name === 'add');
        
        // Find all comment nodes - should be only ONE grouped comment node
        const commentNodes8 = astTest8.filter(node => node.type === 'comment');
        const groupedCommentNode8 = commentNodes8.find(node => 
            Array.isArray(node.comments) && 
            node.comments.length === 3 &&
            node.comments[0] === 'line 1' &&
            node.comments[1] === 'line 2' &&
            node.comments[2] === 'line 3'
        );
        
        const commentTest8aPassed = addNode8 && (!addNode8.comments || addNode8.comments.length === 0);
        const commentTest8bPassed = commentNodes8.length === 1; // Should be only one comment node
        const commentTest8cPassed = groupedCommentNode8 !== undefined;
        const commentTest8Passed = commentTest8aPassed && commentTest8bPassed && commentTest8cPassed;
        
        if (commentTest8Passed) {
            console.log('✓ Test 8 PASSED - Consecutive orphaned comments are grouped into single node with comments array');
        } else {
            console.log('✗ Test 8 FAILED - Consecutive orphaned comments should be grouped');
            console.log('  Not attached to command:', commentTest8aPassed);
            console.log('  Only one comment node:', commentTest8bPassed, `(found ${commentNodes8.length})`);
            console.log('  Correct comments array:', commentTest8cPassed);
            console.log('  Comment nodes:', commentNodes8);
            console.log('  Expected comments: ["line 1", "line 2", "line 3"]');
            console.log('  Got comments:', groupedCommentNode8?.comments);
            throw new Error('Comment Test 8 FAILED - Consecutive orphaned comments should be grouped');
        }
        
        // Test 9: Multiple groups of consecutive orphaned comments
        const testScript9 = `
# group1 line 1
# group1 line 2

add 5 5

# group2 line 1
# group2 line 2

multiply 3 4
`;
        const astTest9 = commentTestRp.getAST(testScript9);
        const commentNodes9 = astTest9.filter(node => node.type === 'comment');
        const group1Node = commentNodes9.find(node => 
            Array.isArray(node.comments) &&
            node.comments.length === 2 &&
            node.comments[0] === 'group1 line 1' &&
            node.comments[1] === 'group1 line 2'
        );
        const group2Node = commentNodes9.find(node => 
            Array.isArray(node.comments) &&
            node.comments.length === 2 &&
            node.comments[0] === 'group2 line 1' &&
            node.comments[1] === 'group2 line 2'
        );
        
        const commentTest9Passed = 
            commentNodes9.length === 2 && // Should be exactly 2 comment nodes
            group1Node !== undefined && 
            group2Node !== undefined;
        
        if (commentTest9Passed) {
            console.log('✓ Test 9 PASSED - Multiple groups of consecutive orphaned comments are correctly grouped');
        } else {
            console.log('✗ Test 9 FAILED - Multiple groups should be correctly grouped');
            console.log('  Expected 2 comment nodes, got:', commentNodes9.length);
            console.log('  Group 1 node:', group1Node);
            console.log('  Group 2 node:', group2Node);
            console.log('  All comment nodes:', commentNodes9);
            throw new Error('Comment Test 9 FAILED - Multiple groups of consecutive orphaned comments should be correctly grouped');
        }
        
        // Summary
        const allCommentTestsPassed = commentTest1Passed && commentTest2Passed && commentTest3Passed && commentTest5Passed && commentTest7Passed && commentTest8Passed && commentTest9Passed;
        if (allCommentTestsPassed) {
            console.log();
            console.log('✓ All comment attachment tests PASSED!');
        } else {
            console.log();
            console.log('✗ Some comment attachment tests FAILED');
            console.log();
            console.log('AST Structure:');
            console.log(JSON.stringify(commentAST, null, 2));
            if (!commentTest5Passed || !commentTest7Passed || !commentTest8Passed || !commentTest9Passed) {
                console.log();
                if (!commentTest5Passed) {
                    console.log('Test 5 AST Structure:');
                    console.log(JSON.stringify(astTest5, null, 2));
                }
                if (!commentTest7Passed) {
                    console.log('Test 7 AST Structure:');
                    console.log(JSON.stringify(astTest7, null, 2));
                }
                if (!commentTest8Passed) {
                    console.log('Test 8 AST Structure:');
                    console.log(JSON.stringify(astTest8, null, 2));
                }
                if (!commentTest9Passed) {
                    console.log('Test 9 AST Structure:');
                    console.log(JSON.stringify(astTest9, null, 2));
                }
            }
            throw new Error('Some comment attachment tests FAILED');
        }
        
        console.log('='.repeat(60));
        
        // Test AST line range tracking
        console.log();
        console.log('='.repeat(60));
        console.log('Testing AST Line Range Tracking');
        console.log('='.repeat(60));
        
        const lineRangeTestRp = new RobinPath();
        const lineRangeTestScript = `
log "first"
log "second"
$var = 10
if $var > 5
  log "inside if"
endif
log "after if"
`;
        const lineRangeAST = lineRangeTestRp.getAST(lineRangeTestScript);
        
        // Test 1: All statements should have lineRange property
        const allHaveLineRange = lineRangeAST.every(node => 
            node.lineRange !== undefined && 
            typeof node.lineRange === 'object' &&
            typeof node.lineRange.start === 'number' &&
            typeof node.lineRange.end === 'number'
        );
        
        if (allHaveLineRange) {
            console.log('✓ Line Range Test 1 PASSED - All statements have lineRange property');
        } else {
            console.log('✗ Line Range Test 1 FAILED - Not all statements have lineRange property');
            console.log('AST:', JSON.stringify(lineRangeAST, null, 2));
            throw new Error('Line Range Test 1 FAILED - Not all statements have lineRange property');
        }
        
        // Test 2: Verify line ranges are correct (0-indexed)
        // Script breakdown:
        // Line 0: empty
        // Line 1: log "first"
        // Line 2: log "second"
        // Line 3: $var = 10
        // Line 4: if $var > 5
        // Line 5:   log "inside if"
        // Line 6: endif
        // Line 7: log "after if"
        
        const firstLog = lineRangeAST.find(node => node.type === 'command' && node.name === 'log' && node.args[0]?.value === 'first');
        const secondLog = lineRangeAST.find(node => node.type === 'command' && node.name === 'log' && node.args[0]?.value === 'second');
        const assignment = lineRangeAST.find(node => node.type === 'assignment' && node.targetName === 'var');
        const ifBlock = lineRangeAST.find(node => node.type === 'ifBlock');
        // insideIfLog is nested inside the ifBlock's thenBranch
        const insideIfLog = ifBlock?.thenBranch?.find(node => node.type === 'command' && node.name === 'log' && node.args[0]?.value === 'inside if');
        const afterIfLog = lineRangeAST.find(node => node.type === 'command' && node.name === 'log' && node.args[0]?.value === 'after if');
        
        const lineRangeTest2Passed = 
            firstLog && firstLog.lineRange.start === 1 && firstLog.lineRange.end === 1 &&
            secondLog && secondLog.lineRange.start === 2 && secondLog.lineRange.end === 2 &&
            assignment && assignment.lineRange.start === 3 && assignment.lineRange.end === 3 &&
            ifBlock && ifBlock.lineRange.start === 4 && ifBlock.lineRange.end === 6 &&
            insideIfLog && insideIfLog.lineRange.start === 5 && insideIfLog.lineRange.end === 5 &&
            afterIfLog && afterIfLog.lineRange.start === 7 && afterIfLog.lineRange.end === 7;
        
        if (lineRangeTest2Passed) {
            console.log('✓ Line Range Test 2 PASSED - Line ranges are correct (0-indexed)');
        } else {
            console.log('✗ Line Range Test 2 FAILED - Line ranges are incorrect');
            console.log('  first log:', firstLog?.lineRange);
            console.log('  second log:', secondLog?.lineRange);
            console.log('  assignment:', assignment?.lineRange);
            console.log('  if block:', ifBlock?.lineRange);
            console.log('  inside if log:', insideIfLog?.lineRange);
            console.log('  after if log:', afterIfLog?.lineRange);
            console.log('Full AST:', JSON.stringify(lineRangeAST, null, 2));
            throw new Error('Line Range Test 2 FAILED - Line ranges are incorrect');
        }
        
        // Test 3: Verify lineRange.end >= lineRange.start
        const endGreaterThanStart = lineRangeAST.every(node => 
            node.lineRange.end >= node.lineRange.start
        );
        
        if (endGreaterThanStart) {
            console.log('✓ Line Range Test 3 PASSED - All statements have end >= start');
        } else {
            console.log('✗ Line Range Test 3 FAILED - Some statements have end < start');
            console.log('AST:', JSON.stringify(lineRangeAST, null, 2));
            throw new Error('Line Range Test 3 FAILED - Some statements have end < start');
        }
        
        // Test 4: Test multi-line statements (if blocks should span multiple lines)
        const ifBlockSpansMultipleLines = ifBlock && ifBlock.lineRange.end > ifBlock.lineRange.start;
        
        if (ifBlockSpansMultipleLines) {
            console.log('✓ Line Range Test 4 PASSED - Multi-line statements span correct range');
        } else {
            console.log('✗ Line Range Test 4 FAILED - Multi-line statements should span multiple lines');
            console.log('  if block lineRange:', ifBlock?.lineRange);
            throw new Error('Line Range Test 4 FAILED - Multi-line statements should span multiple lines');
        }
        
        // Test 5: Test with comments (comments should have lineRange)
        const commentLineRangeScript = `
# comment 1
log "test"
# comment 2
`;
        const commentLineRangeAST = lineRangeTestRp.getAST(commentLineRangeScript);
        const commentNodes = commentLineRangeAST.filter(node => node.type === 'comment');
        const logNode = commentLineRangeAST.find(node => node.type === 'command' && node.name === 'log');
        
        const commentLineRangeTestPassed = 
            commentNodes.every(node => node.lineRange && typeof node.lineRange.start === 'number' && typeof node.lineRange.end === 'number') &&
            logNode && logNode.lineRange && logNode.lineRange.start === 2 && logNode.lineRange.end === 2;
        
        if (commentLineRangeTestPassed) {
            console.log('✓ Line Range Test 5 PASSED - Comments have correct lineRange');
        } else {
            console.log('✗ Line Range Test 5 FAILED - Comments should have lineRange');
            console.log('  Comment nodes:', commentNodes.map(n => ({ type: n.type, lineRange: n.lineRange })));
            console.log('  Log node:', logNode ? { type: logNode.type, lineRange: logNode.lineRange } : 'not found');
            throw new Error('Line Range Test 5 FAILED - Comments should have lineRange');
        }
        
        console.log('✓ All line range tests PASSED!');
        console.log('='.repeat(60));
        
        // Close the test server
        await new Promise((resolve) => {
            testServer.close(() => {
                console.log('Test server closed');
                resolve();
            });
        });
        
    } catch (error) {
        console.error();
        console.error('='.repeat(60));
        console.error('Error executing test script:');
        console.error(error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        console.error('='.repeat(60));
        
        // Close the test server on error
        await new Promise((resolve) => {
            testServer.close(() => {
                console.log('Test server closed');
                resolve();
            });
        });
        
        process.exit(1);
    }
})();

