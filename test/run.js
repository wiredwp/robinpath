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
        // Consecutive comments should be combined into a single comment object with \n
        const addNode = commentAST.find(node => node.type === 'command' && node.name === 'add');
        const commentTest1Passed = addNode && 
            Array.isArray(addNode.comments) && 
            addNode.comments.length === 2 &&
            addNode.comments[0].text === 'line 2\nline 3' && // Consecutive comments combined
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
        // Consecutive comments are combined into a single CommentWithPosition with \n-separated text
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
        // Consecutive comments are combined into a single CommentWithPosition with \n-separated text
        const groupedCommentNode8 = commentNodes8.find(node => 
            Array.isArray(node.comments) && 
            node.comments.length === 1 &&
            node.comments[0].text === 'line 1\nline 2\nline 3'
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
        // Consecutive comments are combined into a single CommentWithPosition with \n-separated text
        const group1Node = commentNodes9.find(node => 
            Array.isArray(node.comments) &&
            node.comments.length === 1 &&
            node.comments[0].text === 'group1 line 1\ngroup1 line 2'
        );
        const group2Node = commentNodes9.find(node => 
            Array.isArray(node.comments) &&
            node.comments.length === 1 &&
            node.comments[0].text === 'group2 line 1\ngroup2 line 2'
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
        
        // Test 10: Verify comment positions are correct
        const commentPosTestScript = `
# comment 1
log "test"
# comment 2
add 5 5  # inline comment
`;
        const commentPosAST = commentTestRp.getAST(commentPosTestScript);
        const commentPosLogNode = commentPosAST.find(node => node.type === 'command' && node.name === 'log');
        const commentPosAddNode = commentPosAST.find(node => node.type === 'command' && node.name === 'add');
        
        // Script breakdown (0-indexed):
        // Line 0: empty (leading newline)
        // Line 1: # comment 1
        // Line 2: log "test"
        // Line 3: # comment 2
        // Line 4: add 5 5  # inline comment
        
        // log command should have comment 1 attached (no blank line between comment and command)
        const commentPosTest10aPassed = commentPosLogNode && 
            commentPosLogNode.comments &&
            commentPosLogNode.comments.length === 1 &&
            commentPosLogNode.comments[0].text === 'comment 1' &&
            commentPosLogNode.comments[0].codePos &&
            typeof commentPosLogNode.comments[0].codePos.startRow === 'number' &&
            typeof commentPosLogNode.comments[0].codePos.startCol === 'number' &&
            typeof commentPosLogNode.comments[0].codePos.endRow === 'number' &&
            typeof commentPosLogNode.comments[0].codePos.endCol === 'number' &&
            commentPosLogNode.comments[0].codePos.startRow === 1 && // Line 1 in script
            commentPosLogNode.comments[0].codePos.startCol >= 0 &&
            commentPosLogNode.comments[0].codePos.endRow === 1 &&
            commentPosLogNode.comments[0].codePos.endCol >= commentPosLogNode.comments[0].codePos.startCol;
        
        // add command should have comment 2 and inline comment attached (no blank line between comment 2 and add)
        const commentPosTest10bPassed = commentPosAddNode && 
            commentPosAddNode.comments &&
            commentPosAddNode.comments.length === 2 &&
            commentPosAddNode.comments[0].text === 'comment 2' &&
            commentPosAddNode.comments[0].codePos &&
            typeof commentPosAddNode.comments[0].codePos.startRow === 'number' &&
            commentPosAddNode.comments[0].codePos.startRow === 3 && // Line 3 in script
            commentPosAddNode.comments[1].text === 'inline comment' &&
            commentPosAddNode.comments[1].codePos &&
            typeof commentPosAddNode.comments[1].codePos.startRow === 'number' &&
            commentPosAddNode.comments[1].codePos.startRow === 4 && // Line 4 in script
            commentPosAddNode.comments[1].codePos.startCol > 0; // Inline comment should be after the command
        
        const commentPosTest10Passed = commentPosTest10aPassed && commentPosTest10bPassed;
        
        if (commentPosTest10Passed) {
            console.log('✓ Test 10 PASSED - Comment positions are correct');
        } else {
            console.log('✗ Test 10 FAILED - Comment positions should be correct');
            console.log('  Log comment position:', commentPosTest10aPassed, commentPosLogNode?.comments?.[0]?.codePos);
            console.log('  Add comments position:', commentPosTest10bPassed, commentPosAddNode?.comments?.map(c => c.codePos));
            throw new Error('Comment Test 10 FAILED - Comment positions should be correct');
        }
        
        // Test 11: Verify multiple comments attached to a statement have correct positions
        // Consecutive comments should be combined into a single comment object
        const multiCommentTestScript = `
# comment above 1
# comment above 2
log "test"  # inline comment
`;
        const multiCommentAST = commentTestRp.getAST(multiCommentTestScript);
        const multiCommentLogNode = multiCommentAST.find(node => node.type === 'command' && node.name === 'log');
        
        const multiCommentTest11Passed = multiCommentLogNode && 
            multiCommentLogNode.comments &&
            multiCommentLogNode.comments.length === 2 &&
            multiCommentLogNode.comments[0].text === 'comment above 1\ncomment above 2' && // Consecutive comments combined
            multiCommentLogNode.comments[0].codePos &&
            typeof multiCommentLogNode.comments[0].codePos.startRow === 'number' &&
            typeof multiCommentLogNode.comments[0].codePos.endRow === 'number' &&
            multiCommentLogNode.comments[0].codePos.endRow > multiCommentLogNode.comments[0].codePos.startRow && // Should span multiple lines
            multiCommentLogNode.comments[1].text === 'inline comment' &&
            multiCommentLogNode.comments[1].codePos &&
            typeof multiCommentLogNode.comments[1].codePos.startRow === 'number' &&
            multiCommentLogNode.comments[1].codePos.startRow > multiCommentLogNode.comments[0].codePos.endRow && // Should be on a later line
            multiCommentLogNode.comments[1].codePos.startCol > 0; // Inline comment should be after the command
        
        if (multiCommentTest11Passed) {
            console.log('✓ Test 11 PASSED - Multiple comments have correct positions');
        } else {
            console.log('✗ Test 11 FAILED - Multiple comments should have correct positions');
            console.log('  Comments:', multiCommentLogNode?.comments);
            throw new Error('Comment Test 11 FAILED - Multiple comments should have correct positions');
        }
        
        // Test 12: Verify grouped comment nodes have correct positions
        const groupedCommentTestScript = `
# group comment 1
# group comment 2
# group comment 3

log "test"
`;
        const groupedCommentAST = commentTestRp.getAST(groupedCommentTestScript);
        const groupedCommentNodes = groupedCommentAST.filter(node => node.type === 'comment');
        // Consecutive comments are combined into a single CommentWithPosition with \n-separated text
        const groupedCommentNode = groupedCommentNodes.find(node => 
            Array.isArray(node.comments) && 
            node.comments.length === 1 &&
            node.comments[0].text === 'group comment 1\ngroup comment 2\ngroup comment 3'
        );
        
        const groupedCommentTest12Passed = groupedCommentNode &&
            groupedCommentNode.comments &&
            groupedCommentNode.comments[0].codePos &&
            typeof groupedCommentNode.comments[0].codePos.startRow === 'number';
        
        if (groupedCommentTest12Passed) {
            console.log('✓ Test 12 PASSED - Grouped comment nodes have correct positions');
        } else {
            console.log('✗ Test 12 FAILED - Grouped comment nodes should have correct positions');
            console.log('  Grouped node:', groupedCommentNode);
            throw new Error('Comment Test 12 FAILED - Grouped comment nodes should have correct positions');
        }
        
        // Summary
        const allCommentTestsPassed = commentTest1Passed && commentTest2Passed && commentTest3Passed && commentTest5Passed && commentTest7Passed && commentTest8Passed && commentTest9Passed && commentPosTest10Passed && multiCommentTest11Passed && groupedCommentTest12Passed;
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
        
        // Test 1: All statements should have codePos property (backward compatibility check)
        const allHaveCodePos = lineRangeAST.every(node => 
            node.codePos !== undefined && 
            typeof node.codePos === 'object' &&
            typeof node.codePos.startRow === 'number' &&
            typeof node.codePos.endRow === 'number'
        );
        
        if (allHaveCodePos) {
            console.log('✓ Line Range Test 1 PASSED - All statements have codePos property');
        } else {
            console.log('✗ Line Range Test 1 FAILED - Not all statements have codePos property');
            console.log('AST:', JSON.stringify(lineRangeAST, null, 2));
            throw new Error('Line Range Test 1 FAILED - Not all statements have codePos property');
        }
        
        // Test 2: Verify codePos row ranges are correct (0-indexed)
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
            firstLog && firstLog.codePos.startRow === 1 && firstLog.codePos.endRow === 1 &&
            secondLog && secondLog.codePos.startRow === 2 && secondLog.codePos.endRow === 2 &&
            assignment && assignment.codePos.startRow === 3 && assignment.codePos.endRow === 3 &&
            ifBlock && ifBlock.codePos.startRow === 4 && ifBlock.codePos.endRow === 6 &&
            insideIfLog && insideIfLog.codePos.startRow === 5 && insideIfLog.codePos.endRow === 5 &&
            afterIfLog && afterIfLog.codePos.startRow === 7 && afterIfLog.codePos.endRow === 7;
        
        if (lineRangeTest2Passed) {
            console.log('✓ Line Range Test 2 PASSED - CodePos row ranges are correct (0-indexed)');
        } else {
            console.log('✗ Line Range Test 2 FAILED - CodePos row ranges are incorrect');
            console.log('  first log:', firstLog?.codePos);
            console.log('  second log:', secondLog?.codePos);
            console.log('  assignment:', assignment?.codePos);
            console.log('  if block:', ifBlock?.codePos);
            console.log('  inside if log:', insideIfLog?.codePos);
            console.log('  after if log:', afterIfLog?.codePos);
            console.log('Full AST:', JSON.stringify(lineRangeAST, null, 2));
            throw new Error('Line Range Test 2 FAILED - CodePos row ranges are incorrect');
        }
        
        // Test 3: Verify codePos.endRow >= codePos.startRow
        // Comment nodes derive codePos from comments array
        const endGreaterThanStart = lineRangeAST.every(node => {
            if (node.type === 'comment') {
                // Check comments array codePos
                return !node.comments || node.comments.every(c => 
                    c.codePos && c.codePos.endRow >= c.codePos.startRow
                );
            }
            return node.codePos.endRow >= node.codePos.startRow;
        });
        
        if (endGreaterThanStart) {
            console.log('✓ Line Range Test 3 PASSED - All statements have endRow >= startRow');
        } else {
            console.log('✗ Line Range Test 3 FAILED - Some statements have endRow < startRow');
            console.log('AST:', JSON.stringify(lineRangeAST, null, 2));
            throw new Error('Line Range Test 3 FAILED - Some statements have endRow < startRow');
        }
        
        // Test 4: Test multi-line statements (if blocks should span multiple rows)
        const ifBlockSpansMultipleLines = ifBlock && ifBlock.codePos.endRow > ifBlock.codePos.startRow;
        
        if (ifBlockSpansMultipleLines) {
            console.log('✓ Line Range Test 4 PASSED - Multi-line statements span correct row range');
        } else {
            console.log('✗ Line Range Test 4 FAILED - Multi-line statements should span multiple rows');
            console.log('  if block codePos:', ifBlock?.codePos);
            throw new Error('Line Range Test 4 FAILED - Multi-line statements should span multiple rows');
        }
        
        // Test 5: Test with comments (comments should have codePos)
        const commentLineRangeScript = `
# comment 1
log "test"
# comment 2
`;
        const commentLineRangeAST = lineRangeTestRp.getAST(commentLineRangeScript);
        const commentNodes = commentLineRangeAST.filter(node => node.type === 'comment');
        const logNode = commentLineRangeAST.find(node => node.type === 'command' && node.name === 'log');
        
        // Comment nodes derive codePos from comments array
        const commentLineRangeTestPassed = 
            commentNodes.every(node => 
                node.comments && 
                Array.isArray(node.comments) && 
                node.comments.length > 0 &&
                node.comments.every(c => c.codePos && typeof c.codePos.startRow === 'number')
            ) &&
            logNode && logNode.codePos && logNode.codePos.startRow === 2 && logNode.codePos.endRow === 2;
        
        if (commentLineRangeTestPassed) {
            console.log('✓ Line Range Test 5 PASSED - Comments have correct codePos');
        } else {
            console.log('✗ Line Range Test 5 FAILED - Comments should have codePos');
            console.log('  Comment nodes:', commentNodes.map(n => ({ type: n.type, codePos: n.codePos })));
            console.log('  Log node:', logNode ? { type: logNode.type, codePos: logNode.codePos } : 'not found');
            throw new Error('Line Range Test 5 FAILED - Comments should have codePos');
        }
        
        console.log('✓ All line range tests PASSED!');
        console.log('='.repeat(60));
        
        // Test AST codePos tracking (row/column positions)
        console.log();
        console.log('='.repeat(60));
        console.log('Testing AST Code Position (codePos) Tracking');
        console.log('='.repeat(60));
        
        const codePosTestRp = new RobinPath();
        const codePosTestScript = `log "test"
$var = 10
if $var > 5
  log "inside"
endif`;
        const codePosAST = codePosTestRp.getAST(codePosTestScript);
        
        // Test 1: All statements should have codePos property
        // Comment nodes derive codePos from comments array
        const codePosAllHaveCodePos = codePosAST.every(node => {
            if (node.type === 'comment') {
                // Comment nodes derive codePos from comments array
                return node.comments && Array.isArray(node.comments) && node.comments.length > 0 &&
                    node.comments.every(c => c.codePos && typeof c.codePos.startRow === 'number');
            }
            return node.codePos !== undefined && 
                typeof node.codePos === 'object' &&
                typeof node.codePos.startRow === 'number' &&
                typeof node.codePos.startCol === 'number' &&
                typeof node.codePos.endRow === 'number' &&
                typeof node.codePos.endCol === 'number';
        });
        
        if (codePosAllHaveCodePos) {
            console.log('✓ CodePos Test 1 PASSED - All statements have codePos property');
        } else {
            console.log('✗ CodePos Test 1 FAILED - Not all statements have codePos property');
            console.log('AST:', JSON.stringify(codePosAST, null, 2));
            throw new Error('CodePos Test 1 FAILED - Not all statements have codePos property');
        }
        
        // Test 2: Verify codePos structure is correct
        // Note: Script starts at line 0 (no leading newline in this test)
        // Line 0: log "test"
        // Line 1: $var = 10
        // Line 2: if $var > 5
        // Line 3:   log "inside"
        // Line 4: endif
        const codePosFirstLog = codePosAST.find(node => node.type === 'command' && node.name === 'log' && node.args[0]?.value === 'test');
        const codePosAssignment = codePosAST.find(node => node.type === 'assignment' && node.targetName === 'var');
        const codePosIfBlock = codePosAST.find(node => node.type === 'ifBlock');
        
        const codePosTest2Passed = 
            codePosFirstLog && 
            codePosFirstLog.codePos.startRow === 0 && 
            codePosFirstLog.codePos.startCol >= 0 &&
            codePosFirstLog.codePos.endRow === 0 &&
            codePosFirstLog.codePos.endCol >= codePosFirstLog.codePos.startCol &&
            codePosAssignment &&
            codePosAssignment.codePos.startRow === 1 &&
            codePosAssignment.codePos.startCol >= 0 &&
            codePosAssignment.codePos.endRow === 1 &&
            codePosAssignment.codePos.endCol >= codePosAssignment.codePos.startCol &&
            codePosIfBlock &&
            codePosIfBlock.codePos.startRow === 2 &&
            codePosIfBlock.codePos.startCol >= 0 &&
            codePosIfBlock.codePos.endRow === 4 &&
            codePosIfBlock.codePos.endCol >= 0;
        
        if (codePosTest2Passed) {
            console.log('✓ CodePos Test 2 PASSED - CodePos structure is correct');
        } else {
            console.log('✗ CodePos Test 2 FAILED - CodePos structure is incorrect');
            console.log('  first log codePos:', codePosFirstLog?.codePos);
            console.log('  assignment codePos:', codePosAssignment?.codePos);
            console.log('  if block codePos:', codePosIfBlock?.codePos);
            console.log('Full AST:', JSON.stringify(codePosAST, null, 2));
            throw new Error('CodePos Test 2 FAILED - CodePos structure is incorrect');
        }
        
        // Test 3: Verify endRow >= startRow and endCol >= startCol
        const codePosEndGreaterThanStart = codePosAST.every(node => 
            node.codePos.endRow >= node.codePos.startRow &&
            node.codePos.endCol >= node.codePos.startCol
        );
        
        if (codePosEndGreaterThanStart) {
            console.log('✓ CodePos Test 3 PASSED - All statements have endRow >= startRow and endCol >= startCol');
        } else {
            console.log('✗ CodePos Test 3 FAILED - Some statements have invalid codePos ranges');
            console.log('AST:', JSON.stringify(codePosAST, null, 2));
            throw new Error('CodePos Test 3 FAILED - Some statements have invalid codePos ranges');
        }
        
        // Test 4: Test multi-line statements (if blocks should span multiple rows)
        const codePosIfBlockSpansMultipleRows = codePosIfBlock && codePosIfBlock.codePos.endRow > codePosIfBlock.codePos.startRow;
        
        if (codePosIfBlockSpansMultipleRows) {
            console.log('✓ CodePos Test 4 PASSED - Multi-line statements span correct row range');
        } else {
            console.log('✗ CodePos Test 4 FAILED - Multi-line statements should span multiple rows');
            console.log('  if block codePos:', codePosIfBlock?.codePos);
            throw new Error('CodePos Test 4 FAILED - Multi-line statements should span multiple rows');
        }
        
        // Test 5: Test nested statements have correct codePos
        const codePosInsideIfLog = codePosIfBlock?.thenBranch?.find(node => node.type === 'command' && node.name === 'log' && node.args[0]?.value === 'inside');
        
        const codePosTest5Passed = 
            codePosInsideIfLog &&
            codePosInsideIfLog.codePos.startRow === 3 &&
            codePosInsideIfLog.codePos.startCol >= 0 &&
            codePosInsideIfLog.codePos.endRow === 3 &&
            codePosInsideIfLog.codePos.endCol >= codePosInsideIfLog.codePos.startCol;
        
        if (codePosTest5Passed) {
            console.log('✓ CodePos Test 5 PASSED - Nested statements have correct codePos');
        } else {
            console.log('✗ CodePos Test 5 FAILED - Nested statements should have correct codePos');
            console.log('  inside if log codePos:', codePosInsideIfLog?.codePos);
            console.log('  if block thenBranch:', codePosIfBlock?.thenBranch);
            throw new Error('CodePos Test 5 FAILED - Nested statements should have correct codePos');
        }
        
        // Test 6: Test comments have codePos (comment nodes derive codePos from comments array)
        const commentCodePosScript = `
# comment 1
log "test"
# comment 2
`;
        const commentCodePosAST = codePosTestRp.getAST(commentCodePosScript);
        const codePosCommentNodes = commentCodePosAST.filter(node => node.type === 'comment');
        const codePosLogNode = commentCodePosAST.find(node => node.type === 'command' && node.name === 'log');
        
        // Note: Script has leading newline, so:
        // Line 0: empty
        // Line 1: # comment 1
        // Line 2: log "test"
        // Line 3: # comment 2
        const commentCodePosTestPassed = 
            codePosCommentNodes.every(node => 
                node.comments && 
                Array.isArray(node.comments) && 
                node.comments.length > 0 &&
                node.comments.every(c => 
                    c.codePos && 
                    typeof c.codePos.startRow === 'number' && 
                    typeof c.codePos.startCol === 'number' &&
                    typeof c.codePos.endRow === 'number' &&
                    typeof c.codePos.endCol === 'number'
                )
            ) &&
            codePosLogNode && 
            codePosLogNode.codePos && 
            codePosLogNode.codePos.startRow === 2 && 
            codePosLogNode.codePos.endRow === 2;
        
        if (commentCodePosTestPassed) {
            console.log('✓ CodePos Test 6 PASSED - Comments have correct codePos');
        } else {
            console.log('✗ CodePos Test 6 FAILED - Comments should have codePos');
            console.log('  Comment nodes:', codePosCommentNodes.map(n => ({ type: n.type, comments: n.comments })));
            console.log('  Log node:', codePosLogNode ? { type: codePosLogNode.type, codePos: codePosLogNode.codePos } : 'not found');
            throw new Error('CodePos Test 6 FAILED - Comments should have codePos');
        }
        
        console.log('✓ All codePos tests PASSED!');
        console.log('='.repeat(60));
        
        // Test AST-based code updates
        console.log();
        console.log('='.repeat(60));
        console.log('Testing AST-based Code Updates');
        console.log('='.repeat(60));
        
        {
            const updateTestRp = new RobinPath();
            
            // Test 1: Update a simple command
            const updateTestScript1 = `log "hello"`;
            const updateAst1 = updateTestRp.getAST(updateTestScript1);
            updateAst1[0].name = 'print';
            const updateUpdatedScript1 = updateTestRp.updateCodeFromAST(updateTestScript1, updateAst1);
            const updateTest1Passed = updateUpdatedScript1 === 'print "hello"';
            
            if (updateTest1Passed) {
                console.log('✓ Update Test 1 PASSED - Simple command update');
            } else {
                console.log('✗ Update Test 1 FAILED - Simple command update');
                console.log('  Original:', updateTestScript1);
                console.log('  Expected: print "hello"');
                console.log('  Got:', updateUpdatedScript1);
                throw new Error('Update Test 1 FAILED - Simple command update');
            }
            
            // Test 2: Update command arguments
            const updateTestScript2 = `log "hello" "world"`;
            const updateAst2 = updateTestRp.getAST(updateTestScript2);
            updateAst2[0].args[0].value = 'goodbye';
            const updateUpdatedScript2 = updateTestRp.updateCodeFromAST(updateTestScript2, updateAst2);
            const updateTest2Passed = updateUpdatedScript2 === 'log "goodbye" "world"';
            
            if (updateTest2Passed) {
                console.log('✓ Update Test 2 PASSED - Command argument update');
            } else {
                console.log('✗ Update Test 2 FAILED - Command argument update');
                console.log('  Original:', updateTestScript2);
                console.log('  Expected: log "goodbye" "world"');
                console.log('  Got:', updateUpdatedScript2);
                throw new Error('Update Test 2 FAILED - Command argument update');
            }
            
            // Test 3: Update assignment
            const updateTestScript3 = `$var = 10`;
            const updateAst3 = updateTestRp.getAST(updateTestScript3);
            updateAst3[0].literalValue = 20;
            const updateUpdatedScript3 = updateTestRp.updateCodeFromAST(updateTestScript3, updateAst3);
            const updateTest3Passed = updateUpdatedScript3 === '$var = 20';
            
            if (updateTest3Passed) {
                console.log('✓ Update Test 3 PASSED - Assignment value update');
            } else {
                console.log('✗ Update Test 3 FAILED - Assignment value update');
                console.log('  Original:', updateTestScript3);
                console.log('  Expected: $var = 20');
                console.log('  Got:', updateUpdatedScript3);
                throw new Error('Update Test 3 FAILED - Assignment value update');
            }
            
            // Test 4: Update multiple statements
            const updateTestScript4 = `log "first"
log "second"
$var = 10`;
            const updateAst4 = updateTestRp.getAST(updateTestScript4);
            updateAst4[0].name = 'print';
            updateAst4[1].args[0].value = 'updated';
            updateAst4[2].literalValue = 99;
            const updateUpdatedScript4 = updateTestRp.updateCodeFromAST(updateTestScript4, updateAst4);
            const updateExpected4 = `print "first"
log "updated"
$var = 99`;
            const updateTest4Passed = updateUpdatedScript4 === updateExpected4;
            
            if (updateTest4Passed) {
                console.log('✓ Update Test 4 PASSED - Multiple statement updates');
            } else {
                console.log('✗ Update Test 4 FAILED - Multiple statement updates');
                console.log('  Original:', updateTestScript4);
                console.log('  Expected:', updateExpected4);
                console.log('  Got:', updateUpdatedScript4);
                throw new Error('Update Test 4 FAILED - Multiple statement updates');
            }
            
            // Test 5: Update if block condition
            const updateTestScript5 = `if $var > 5
  log "inside"
endif`;
            const updateAst5 = updateTestRp.getAST(updateTestScript5);
            updateAst5[0].conditionExpr = '$var > 10';
            const updateUpdatedScript5 = updateTestRp.updateCodeFromAST(updateTestScript5, updateAst5);
            const updateExpected5 = `if $var > 10
  log "inside"
endif`;
            const updateTest5Passed = updateUpdatedScript5 === updateExpected5;
            
            if (updateTest5Passed) {
                console.log('✓ Update Test 5 PASSED - If block condition update');
            } else {
                console.log('✗ Update Test 5 FAILED - If block condition update');
                console.log('  Original:', updateTestScript5);
                console.log('  Expected:', updateExpected5);
                console.log('  Got:', updateUpdatedScript5);
                throw new Error('Update Test 5 FAILED - If block condition update');
            }
            
            // Test 6: Update nested command in if block
            const updateTestScript6 = `if $var > 5
  log "inside"
endif`;
            const updateAst6 = updateTestRp.getAST(updateTestScript6);
            updateAst6[0].thenBranch[0].name = 'print';
            updateAst6[0].thenBranch[0].args[0].value = 'nested';
            const updateUpdatedScript6 = updateTestRp.updateCodeFromAST(updateTestScript6, updateAst6);
            const updateExpected6 = `if $var > 5
  print "nested"
endif`;
            const updateTest6Passed = updateUpdatedScript6 === updateExpected6;
            
            if (updateTest6Passed) {
                console.log('✓ Update Test 6 PASSED - Nested command update in if block');
            } else {
                console.log('✗ Update Test 6 FAILED - Nested command update in if block');
                console.log('  Original:', updateTestScript6);
                console.log('  Expected:', updateExpected6);
                console.log('  Got:', updateUpdatedScript6);
                throw new Error('Update Test 6 FAILED - Nested command update in if block');
            }
            
            // Test 7: Update module prefix
            const updateTestScript7 = `math.add 5 10`;
            const updateAst7 = updateTestRp.getAST(updateTestScript7);
            updateAst7[0].module = 'calc';
            const updateUpdatedScript7 = updateTestRp.updateCodeFromAST(updateTestScript7, updateAst7);
            const updateTest7Passed = updateUpdatedScript7 === 'calc.add 5 10';
            
            if (updateTest7Passed) {
                console.log('✓ Update Test 7 PASSED - Module prefix update');
            } else {
                console.log('✗ Update Test 7 FAILED - Module prefix update');
                console.log('  Original:', updateTestScript7);
                console.log('  Expected: calc.add 5 10');
                console.log('  Got:', updateUpdatedScript7);
                throw new Error('Update Test 7 FAILED - Module prefix update');
            }
            
            // Test 8: Update comment
            // Use a comment separated by blank line to ensure it's a standalone comment node
            const updateTestScript8 = `# old comment

log "test"`;
            const updateAst8 = updateTestRp.getAST(updateTestScript8);
            const updateCommentNode = updateAst8.find(node => node.type === 'comment');
            if (updateCommentNode && updateCommentNode.comments && updateCommentNode.comments.length > 0) {
                // Update comment text in comments array
                updateCommentNode.comments[0].text = 'new comment';
                const updateUpdatedScript8 = updateTestRp.updateCodeFromAST(updateTestScript8, updateAst8);
                const updateExpected8 = `# new comment

log "test"`;
                const updateTest8Passed = updateUpdatedScript8 === updateExpected8;
                
                if (updateTest8Passed) {
                    console.log('✓ Update Test 8 PASSED - Comment update');
                } else {
                    console.log('✗ Update Test 8 FAILED - Comment update');
                    console.log('  Original:', updateTestScript8);
                    console.log('  Expected:', updateExpected8);
                    console.log('  Got:', updateUpdatedScript8);
                    console.log('  AST:', JSON.stringify(updateAst8, null, 2));
                    throw new Error('Update Test 8 FAILED - Comment update');
                }
            } else {
                console.log('✗ Update Test 8 FAILED - Comment node not found');
                console.log('  AST nodes:', updateAst8.map(n => ({ type: n.type, name: n.name })));
                console.log('  Full AST:', JSON.stringify(updateAst8, null, 2));
                throw new Error('Update Test 8 FAILED - Comment node not found');
            }
            
            // Test 9: Round-trip test (parse -> modify -> update -> parse again)
            const updateTestScript9 = `log "test"
$var = 42
if $var > 40
  log "big"
endif`;
            const updateAst9a = updateTestRp.getAST(updateTestScript9);
            updateAst9a[0].name = 'print';
            updateAst9a[1].literalValue = 100;
            updateAst9a[2].conditionExpr = '$var > 90';
            updateAst9a[2].thenBranch[0].args[0].value = 'huge';
            const updateUpdatedScript9 = updateTestRp.updateCodeFromAST(updateTestScript9, updateAst9a);
            const updateAst9b = updateTestRp.getAST(updateUpdatedScript9);
            
            const updateRoundTripPassed = 
                updateAst9b[0].name === 'print' &&
                updateAst9b[0].args[0].value === 'test' &&
                updateAst9b[1].literalValue === 100 &&
                updateAst9b[2].conditionExpr === '$var > 90' &&
                updateAst9b[2].thenBranch[0].args[0].value === 'huge';
            
            if (updateRoundTripPassed) {
                console.log('✓ Update Test 9 PASSED - Round-trip test (parse -> modify -> update -> parse)');
            } else {
                console.log('✗ Update Test 9 FAILED - Round-trip test');
                console.log('  Original AST:', JSON.stringify(updateAst9a, null, 2));
                console.log('  Updated script:', updateUpdatedScript9);
                console.log('  Parsed AST:', JSON.stringify(updateAst9b, null, 2));
                throw new Error('Update Test 9 FAILED - Round-trip test');
            }
            
            // Test 10: Update assign command with subexpression
            const updateTestScript10 = `assign $myVar $(array.create 1 2 3)`;
            const updateAst10 = updateTestRp.getAST(updateTestScript10);
            const updateAssignNode = updateAst10.find(node => node.type === 'command' && node.name === 'assign');
            
            if (updateAssignNode && updateAssignNode.args && updateAssignNode.args.length >= 2) {
                // Update the value argument (second arg) to a different subexpression
                updateAssignNode.args[1] = { type: 'subexpr', code: 'array.create 4 5 6' };
                const updateUpdatedScript10 = updateTestRp.updateCodeFromAST(updateTestScript10, updateAst10);
                const updateExpected10 = 'assign $myVar $(array.create 4 5 6)';
                const updateTest10Passed = updateUpdatedScript10 === updateExpected10;
                
                if (updateTest10Passed) {
                    console.log('✓ Update Test 10 PASSED - Assign command with subexpression update');
                } else {
                    console.log('✗ Update Test 10 FAILED - Assign command with subexpression update');
                    console.log('  Original:', updateTestScript10);
                    console.log('  Expected:', updateExpected10);
                    console.log('  Got:', updateUpdatedScript10);
                    console.log('  AST:', JSON.stringify(updateAssignNode, null, 2));
                    throw new Error('Update Test 10 FAILED - Assign command with subexpression update');
                }
                
                // Test 10b: Update assign command value to a string literal
                const updateAssignNode10b = updateTestRp.getAST(updateTestScript10);
                const updateAssignCmd10b = updateAssignNode10b.find(node => node.type === 'command' && node.name === 'assign');
                if (updateAssignCmd10b && updateAssignCmd10b.args && updateAssignCmd10b.args.length >= 2) {
                    updateAssignCmd10b.args[1] = { type: 'string', value: 'hello world' };
                    const updateUpdatedScript10b = updateTestRp.updateCodeFromAST(updateTestScript10, updateAssignNode10b);
                    const updateExpected10b = 'assign $myVar "hello world"';
                    const updateTest10bPassed = updateUpdatedScript10b === updateExpected10b;
                    
                    if (updateTest10bPassed) {
                        console.log('✓ Update Test 10b PASSED - Assign command value update to string');
                    } else {
                        console.log('✗ Update Test 10b FAILED - Assign command value update to string');
                        console.log('  Original:', updateTestScript10);
                        console.log('  Expected:', updateExpected10b);
                        console.log('  Got:', updateUpdatedScript10b);
                        throw new Error('Update Test 10b FAILED - Assign command value update to string');
                    }
                }
                
                // Test 10c: Update assign command value to object literal
                const updateAssignNode10c = updateTestRp.getAST(updateTestScript10);
                const updateAssignCmd10c = updateAssignNode10c.find(node => node.type === 'command' && node.name === 'assign');
                if (updateAssignCmd10c && updateAssignCmd10c.args && updateAssignCmd10c.args.length >= 2) {
                    updateAssignCmd10c.args[1] = { type: 'object', code: 'name: "John", age: 30' };
                    const updateUpdatedScript10c = updateTestRp.updateCodeFromAST(updateTestScript10, updateAssignNode10c);
                    const updateExpected10c = 'assign $myVar {name: "John", age: 30}';
                    const updateTest10cPassed = updateUpdatedScript10c === updateExpected10c;
                    
                    if (updateTest10cPassed) {
                        console.log('✓ Update Test 10c PASSED - Assign command value update to object literal');
                    } else {
                        console.log('✗ Update Test 10c FAILED - Assign command value update to object literal');
                        console.log('  Original:', updateTestScript10);
                        console.log('  Expected:', updateExpected10c);
                        console.log('  Got:', updateUpdatedScript10c);
                        throw new Error('Update Test 10c FAILED - Assign command value update to object literal');
                    }
                }
            } else {
                console.log('✗ Update Test 10 FAILED - Assign command node not found');
                console.log('  AST:', JSON.stringify(updateAst10, null, 2));
                throw new Error('Update Test 10 FAILED - Assign command node not found');
            }
        }
        
        console.log('✓ All AST update tests PASSED!');
        console.log('='.repeat(60));
        
        // Test comment updates with codePos
        console.log();
        console.log('='.repeat(60));
        console.log('Testing Comment Updates with CodePos');
        console.log('='.repeat(60));
        
        {
            const commentUpdateTestRp = new RobinPath();
            
            // Test 1: Update comment text
            const commentUpdateTestScript1 = `# old comment
log "test"`;
            const commentUpdateAst1 = commentUpdateTestRp.getAST(commentUpdateTestScript1);
            const logNode1 = commentUpdateAst1.find(node => node.type === 'command' && node.name === 'log');
            if (logNode1 && logNode1.comments && logNode1.comments.length > 0) {
                logNode1.comments[0].text = 'new comment';
                const commentUpdateUpdatedScript1 = commentUpdateTestRp.updateCodeFromAST(commentUpdateTestScript1, commentUpdateAst1);
                const commentUpdateTest1Passed = commentUpdateUpdatedScript1.includes('# new comment') && 
                    commentUpdateUpdatedScript1.includes('log "test"');
                
                if (commentUpdateTest1Passed) {
                    console.log('✓ Comment Update Test 1 PASSED - Comment text update');
                } else {
                    console.log('✗ Comment Update Test 1 FAILED - Comment text update');
                    console.log('  Original:', commentUpdateTestScript1);
                    console.log('  Got:', commentUpdateUpdatedScript1);
                    throw new Error('Comment Update Test 1 FAILED - Comment text update');
                }
            } else {
                throw new Error('Comment Update Test 1 FAILED - No comments found');
            }
            
            // Test 2: Add new line to consecutive comments
            const commentUpdateTestScript2 = `# comment 1
log "test"`;
            const commentUpdateAst2 = commentUpdateTestRp.getAST(commentUpdateTestScript2);
            const logNode2 = commentUpdateAst2.find(node => node.type === 'command' && node.name === 'log');
            if (logNode2 && logNode2.comments && logNode2.comments.length > 0) {
                // Add a new line to the comment (simulating adding a second comment line)
                logNode2.comments[0].text = 'comment 1\ncomment 2';
                // Update codePos to span both lines
                logNode2.comments[0].codePos.endRow = logNode2.comments[0].codePos.startRow + 1;
                logNode2.comments[0].codePos.endCol = 10; // Approximate end column for "comment 2"
                const commentUpdateUpdatedScript2 = commentUpdateTestRp.updateCodeFromAST(commentUpdateTestScript2, commentUpdateAst2);
                const commentUpdateTest2Passed = commentUpdateUpdatedScript2.includes('# comment 1') && 
                    commentUpdateUpdatedScript2.includes('# comment 2') &&
                    commentUpdateUpdatedScript2.includes('log "test"');
                
                if (commentUpdateTest2Passed) {
                    console.log('✓ Comment Update Test 2 PASSED - Add new line to comments');
                } else {
                    console.log('✗ Comment Update Test 2 FAILED - Add new line to comments');
                    console.log('  Original:', commentUpdateTestScript2);
                    console.log('  Got:', commentUpdateUpdatedScript2);
                    throw new Error('Comment Update Test 2 FAILED - Add new line to comments');
                }
            } else {
                throw new Error('Comment Update Test 2 FAILED - No comments found');
            }
            
            // Test 3: Update inline comment
            const commentUpdateTestScript3 = `log "test"  # old inline`;
            const commentUpdateAst3 = commentUpdateTestRp.getAST(commentUpdateTestScript3);
            const logNode3 = commentUpdateAst3.find(node => node.type === 'command' && node.name === 'log');
            if (logNode3 && logNode3.comments && logNode3.comments.length > 0) {
                const inlineComment = logNode3.comments.find(c => c.codePos.startCol > 0);
                if (inlineComment) {
                    inlineComment.text = 'new inline';
                    const commentUpdateUpdatedScript3 = commentUpdateTestRp.updateCodeFromAST(commentUpdateTestScript3, commentUpdateAst3);
                    const commentUpdateTest3Passed = commentUpdateUpdatedScript3.includes('log "test"') && 
                        commentUpdateUpdatedScript3.includes('# new inline');
                    
                    if (commentUpdateTest3Passed) {
                        console.log('✓ Comment Update Test 3 PASSED - Inline comment update');
                    } else {
                        console.log('✗ Comment Update Test 3 FAILED - Inline comment update');
                        console.log('  Original:', commentUpdateTestScript3);
                        console.log('  Got:', commentUpdateUpdatedScript3);
                        throw new Error('Comment Update Test 3 FAILED - Inline comment update');
                    }
                } else {
                    throw new Error('Comment Update Test 3 FAILED - No inline comment found');
                }
            } else {
                throw new Error('Comment Update Test 3 FAILED - No comments found');
            }
            
            // Test 4: Remove comment line (from consecutive comments)
            // Note: When removing a line, we need to update codePos.endRow to reflect the original range
            // that needs to be replaced, not just the new range
            const commentUpdateTestScript4 = `# comment 1
# comment 2
log "test"`;
            const commentUpdateAst4 = commentUpdateTestRp.getAST(commentUpdateTestScript4);
            const logNode4 = commentUpdateAst4.find(node => node.type === 'command' && node.name === 'log');
            if (logNode4 && logNode4.comments && logNode4.comments.length > 0) {
                // Remove one line from consecutive comments
                const comment = logNode4.comments[0];
                const originalEndRow = comment.codePos.endRow; // Save original end row
                if (comment.text.includes('\n')) {
                    // Remove the second line
                    comment.text = comment.text.split('\n')[0];
                    // Keep endRow the same to replace the entire original range
                    // The codePos.endRow should remain as the original to replace both lines
                    const commentUpdateUpdatedScript4 = commentUpdateTestRp.updateCodeFromAST(commentUpdateTestScript4, commentUpdateAst4);
                    const commentUpdateTest4Passed = commentUpdateUpdatedScript4.includes('# comment 1') && 
                        !commentUpdateUpdatedScript4.includes('# comment 2') &&
                        commentUpdateUpdatedScript4.includes('log "test"');
                    
                    if (commentUpdateTest4Passed) {
                        console.log('✓ Comment Update Test 4 PASSED - Remove comment line');
                    } else {
                        console.log('✗ Comment Update Test 4 FAILED - Remove comment line');
                        console.log('  Original:', commentUpdateTestScript4);
                        console.log('  Got:', commentUpdateUpdatedScript4);
                        throw new Error('Comment Update Test 4 FAILED - Remove comment line');
                    }
                } else {
                    throw new Error('Comment Update Test 4 FAILED - Comment does not have multiple lines');
                }
            } else {
                throw new Error('Comment Update Test 4 FAILED - No comments found');
            }
        }
        
        console.log('✓ All comment update tests PASSED!');
        console.log('='.repeat(60));
        
        // Test inline comment functionality and AST updates
        console.log();
        console.log('='.repeat(60));
        console.log('Testing Inline Comment Functionality and AST Updates');
        console.log('='.repeat(60));
        
        {
            const inlineCommentTestRp = new RobinPath();
            
            // Test 1: Verify inline property is set correctly when parsing
            const inlineTestScript1 = `# regular comment above
log "test"  # inline comment here`;
            const inlineAst1 = inlineCommentTestRp.getAST(inlineTestScript1);
            const logNode1 = inlineAst1.find(node => node.type === 'command' && node.name === 'log');
            
            if (!logNode1 || !logNode1.comments || logNode1.comments.length < 2) {
                throw new Error('Inline Comment Test 1 FAILED - Expected 2 comments (regular + inline)');
            }
            
            const regularComment1 = logNode1.comments.find(c => c.inline === false || c.inline === undefined);
            const inlineComment1 = logNode1.comments.find(c => c.inline === true);
            
            const inlineTest1Passed = regularComment1 && 
                regularComment1.text === 'regular comment above' &&
                (regularComment1.inline === false || regularComment1.inline === undefined) &&
                inlineComment1 &&
                inlineComment1.text === 'inline comment here' &&
                inlineComment1.inline === true;
            
            if (inlineTest1Passed) {
                console.log('✓ Inline Comment Test 1 PASSED - Inline property correctly set during parsing');
            } else {
                console.log('✗ Inline Comment Test 1 FAILED - Inline property not set correctly');
                console.log('  Regular comment:', regularComment1);
                console.log('  Inline comment:', inlineComment1);
                console.log('  All comments:', logNode1.comments);
                throw new Error('Inline Comment Test 1 FAILED - Inline property not set correctly');
            }
            
            // Test 2: Update inline comment via AST
            const inlineTestScript2 = `log "test"  # old inline`;
            const inlineAst2 = inlineCommentTestRp.getAST(inlineTestScript2);
            const logNode2 = inlineAst2.find(node => node.type === 'command' && node.name === 'log');
            
            if (!logNode2 || !logNode2.comments || logNode2.comments.length === 0) {
                throw new Error('Inline Comment Test 2 FAILED - No comments found');
            }
            
            const inlineComment2 = logNode2.comments.find(c => c.inline === true);
            if (!inlineComment2) {
                throw new Error('Inline Comment Test 2 FAILED - No inline comment found');
            }
            
            inlineComment2.text = 'new inline';
            const inlineUpdatedScript2 = inlineCommentTestRp.updateCodeFromAST(inlineTestScript2, inlineAst2);
            const inlineTest2Passed = inlineUpdatedScript2 === 'log "test"  # new inline';
            
            if (inlineTest2Passed) {
                console.log('✓ Inline Comment Test 2 PASSED - Inline comment updated via AST');
            } else {
                console.log('✗ Inline Comment Test 2 FAILED - Inline comment update failed');
                console.log('  Original:', inlineTestScript2);
                console.log('  Expected: log "test"  # new inline');
                console.log('  Got:', inlineUpdatedScript2);
                throw new Error('Inline Comment Test 2 FAILED - Inline comment update failed');
            }
            
            // Test 3: Update regular comment separately from inline comment
            const inlineTestScript3 = `# regular comment
log "test"  # inline comment`;
            const inlineAst3 = inlineCommentTestRp.getAST(inlineTestScript3);
            const logNode3 = inlineAst3.find(node => node.type === 'command' && node.name === 'log');
            
            if (!logNode3 || !logNode3.comments || logNode3.comments.length < 2) {
                throw new Error('Inline Comment Test 3 FAILED - Expected 2 comments');
            }
            
            const regularComment3 = logNode3.comments.find(c => c.inline !== true);
            const inlineComment3 = logNode3.comments.find(c => c.inline === true);
            
            if (!regularComment3 || !inlineComment3) {
                throw new Error('Inline Comment Test 3 FAILED - Could not find both comment types');
            }
            
            // Update only regular comment, inline should remain unchanged
            regularComment3.text = 'updated regular';
            const inlineUpdatedScript3 = inlineCommentTestRp.updateCodeFromAST(inlineTestScript3, inlineAst3);
            const inlineTest3Passed = inlineUpdatedScript3.includes('# updated regular') &&
                inlineUpdatedScript3.includes('# inline comment') &&
                inlineUpdatedScript3.includes('log "test"');
            
            if (inlineTest3Passed) {
                console.log('✓ Inline Comment Test 3 PASSED - Regular comment updated independently');
            } else {
                console.log('✗ Inline Comment Test 3 FAILED - Regular comment update affected inline');
                console.log('  Original:', inlineTestScript3);
                console.log('  Got:', inlineUpdatedScript3);
                throw new Error('Inline Comment Test 3 FAILED - Regular comment update affected inline');
            }
            
            // Test 4: Update inline comment separately from regular comment
            const inlineTestScript4 = `# regular comment
log "test"  # inline comment`;
            const inlineAst4 = inlineCommentTestRp.getAST(inlineTestScript4);
            const logNode4 = inlineAst4.find(node => node.type === 'command' && node.name === 'log');
            
            if (!logNode4 || !logNode4.comments || logNode4.comments.length < 2) {
                throw new Error('Inline Comment Test 4 FAILED - Expected 2 comments');
            }
            
            const regularComment4 = logNode4.comments.find(c => c.inline !== true);
            const inlineComment4 = logNode4.comments.find(c => c.inline === true);
            
            if (!regularComment4 || !inlineComment4) {
                throw new Error('Inline Comment Test 4 FAILED - Could not find both comment types');
            }
            
            // Update only inline comment, regular should remain unchanged
            inlineComment4.text = 'updated inline';
            const inlineUpdatedScript4 = inlineCommentTestRp.updateCodeFromAST(inlineTestScript4, inlineAst4);
            const inlineTest4Passed = inlineUpdatedScript4.includes('# regular comment') &&
                inlineUpdatedScript4.includes('# updated inline') &&
                inlineUpdatedScript4.includes('log "test"');
            
            if (inlineTest4Passed) {
                console.log('✓ Inline Comment Test 4 PASSED - Inline comment updated independently');
            } else {
                console.log('✗ Inline Comment Test 4 FAILED - Inline comment update affected regular');
                console.log('  Original:', inlineTestScript4);
                console.log('  Got:', inlineUpdatedScript4);
                throw new Error('Inline Comment Test 4 FAILED - Inline comment update affected regular');
            }
            
            // Test 5: Remove inline comment (set to empty)
            const inlineTestScript5 = `log "test"  # remove me`;
            const inlineAst5 = inlineCommentTestRp.getAST(inlineTestScript5);
            const logNode5 = inlineAst5.find(node => node.type === 'command' && node.name === 'log');
            
            if (!logNode5 || !logNode5.comments || logNode5.comments.length === 0) {
                throw new Error('Inline Comment Test 5 FAILED - No comments found');
            }
            
            const inlineComment5 = logNode5.comments.find(c => c.inline === true);
            if (!inlineComment5) {
                throw new Error('Inline Comment Test 5 FAILED - No inline comment found');
            }
            
            // Set inline comment text to empty (should remove it)
            inlineComment5.text = '';
            const inlineUpdatedScript5 = inlineCommentTestRp.updateCodeFromAST(inlineTestScript5, inlineAst5);
            const inlineTest5Passed = inlineUpdatedScript5 === 'log "test"' || 
                (inlineUpdatedScript5.includes('log "test"') && !inlineUpdatedScript5.includes('# remove me'));
            
            if (inlineTest5Passed) {
                console.log('✓ Inline Comment Test 5 PASSED - Inline comment removed when set to empty');
            } else {
                console.log('✗ Inline Comment Test 5 FAILED - Inline comment not removed');
                console.log('  Original:', inlineTestScript5);
                console.log('  Expected: log "test" (no comment)');
                console.log('  Got:', inlineUpdatedScript5);
                throw new Error('Inline Comment Test 5 FAILED - Inline comment not removed');
            }
            
            // Test 6: Add inline comment to node that doesn't have one
            const inlineTestScript6 = `log "test"`;
            const inlineAst6 = inlineCommentTestRp.getAST(inlineTestScript6);
            const logNode6 = inlineAst6.find(node => node.type === 'command' && node.name === 'log');
            
            if (!logNode6) {
                throw new Error('Inline Comment Test 6 FAILED - Node not found');
            }
            
            // Add inline comment
            if (!logNode6.comments) {
                logNode6.comments = [];
            }
            logNode6.comments.push({
                text: 'new inline comment',
                codePos: logNode6.codePos, // Use node's codePos as base
                inline: true
            });
            
            const inlineUpdatedScript6 = inlineCommentTestRp.updateCodeFromAST(inlineTestScript6, inlineAst6);
            const inlineTest6Passed = inlineUpdatedScript6.includes('log "test"') &&
                inlineUpdatedScript6.includes('# new inline comment');
            
            if (inlineTest6Passed) {
                console.log('✓ Inline Comment Test 6 PASSED - Inline comment added to node without one');
            } else {
                console.log('✗ Inline Comment Test 6 FAILED - Failed to add inline comment');
                console.log('  Original:', inlineTestScript6);
                console.log('  Expected: log "test"  # new inline comment');
                console.log('  Got:', inlineUpdatedScript6);
                throw new Error('Inline Comment Test 6 FAILED - Failed to add inline comment');
            }
            
            // Test 7: Update both regular and inline comments independently
            const inlineTestScript7 = `# regular 1
log "test"  # inline 1`;
            const inlineAst7 = inlineCommentTestRp.getAST(inlineTestScript7);
            const logNode7 = inlineAst7.find(node => node.type === 'command' && node.name === 'log');
            
            if (!logNode7 || !logNode7.comments || logNode7.comments.length < 2) {
                throw new Error('Inline Comment Test 7 FAILED - Expected 2 comments');
            }
            
            const regularComment7 = logNode7.comments.find(c => c.inline !== true);
            const inlineComment7 = logNode7.comments.find(c => c.inline === true);
            
            if (!regularComment7 || !inlineComment7) {
                throw new Error('Inline Comment Test 7 FAILED - Could not find both comment types');
            }
            
            // Update both independently
            regularComment7.text = 'regular 2';
            inlineComment7.text = 'inline 2';
            const inlineUpdatedScript7 = inlineCommentTestRp.updateCodeFromAST(inlineTestScript7, inlineAst7);
            const inlineTest7Passed = inlineUpdatedScript7.includes('# regular 2') &&
                inlineUpdatedScript7.includes('# inline 2') &&
                inlineUpdatedScript7.includes('log "test"');
            
            if (inlineTest7Passed) {
                console.log('✓ Inline Comment Test 7 PASSED - Both comments updated independently');
            } else {
                console.log('✗ Inline Comment Test 7 FAILED - Both comments not updated correctly');
                console.log('  Original:', inlineTestScript7);
                console.log('  Expected: # regular 2\\nlog "test"  # inline 2');
                console.log('  Got:', inlineUpdatedScript7);
                throw new Error('Inline Comment Test 7 FAILED - Both comments not updated correctly');
            }
            
            // Test 8: Add inline comment to assignment statement via AST update
            const inlineTestScript8 = `$a = 1`;
            const inlineAst8 = inlineCommentTestRp.getAST(inlineTestScript8);
            const assignmentNode8 = inlineAst8.find(node => node.type === 'assignment');
            
            if (!assignmentNode8) {
                throw new Error('Inline Comment Test 8 FAILED - Assignment node not found');
            }
            
            // Add inline comment to assignment
            if (!assignmentNode8.comments) {
                assignmentNode8.comments = [];
            }
            assignmentNode8.comments.push({
                text: 'this is a value',
                codePos: assignmentNode8.codePos, // Use node's codePos as base
                inline: true
            });
            
            const inlineUpdatedScript8 = inlineCommentTestRp.updateCodeFromAST(inlineTestScript8, inlineAst8);
            const inlineTest8Passed = inlineUpdatedScript8.includes('$a = 1') &&
                inlineUpdatedScript8.includes('# this is a value');
            
            if (inlineTest8Passed) {
                console.log('✓ Inline Comment Test 8 PASSED - Inline comment added to assignment via AST');
            } else {
                console.log('✗ Inline Comment Test 8 FAILED - Failed to add inline comment to assignment');
                console.log('  Original:', inlineTestScript8);
                console.log('  Expected: $a = 1  # this is a value');
                console.log('  Got:', inlineUpdatedScript8);
                throw new Error('Inline Comment Test 8 FAILED - Failed to add inline comment to assignment');
            }
            
            // Test 9: Update inline comment on assignment statement
            const inlineTestScript9 = `$a = 1  # old inline`;
            const inlineAst9 = inlineCommentTestRp.getAST(inlineTestScript9);
            const assignmentNode9 = inlineAst9.find(node => node.type === 'assignment');
            
            if (!assignmentNode9 || !assignmentNode9.comments || assignmentNode9.comments.length === 0) {
                throw new Error('Inline Comment Test 9 FAILED - Assignment node or comments not found');
            }
            
            const inlineComment9 = assignmentNode9.comments.find(c => c.inline === true);
            if (!inlineComment9) {
                throw new Error('Inline Comment Test 9 FAILED - No inline comment found on assignment');
            }
            
            // Update inline comment
            inlineComment9.text = 'updated inline';
            const inlineUpdatedScript9 = inlineCommentTestRp.updateCodeFromAST(inlineTestScript9, inlineAst9);
            const inlineTest9Passed = inlineUpdatedScript9.includes('$a = 1') &&
                inlineUpdatedScript9.includes('# updated inline') &&
                !inlineUpdatedScript9.includes('# old inline');
            
            if (inlineTest9Passed) {
                console.log('✓ Inline Comment Test 9 PASSED - Inline comment updated on assignment');
            } else {
                console.log('✗ Inline Comment Test 9 FAILED - Failed to update inline comment on assignment');
                console.log('  Original:', inlineTestScript9);
                console.log('  Expected: $a = 1  # updated inline');
                console.log('  Got:', inlineUpdatedScript9);
                throw new Error('Inline Comment Test 9 FAILED - Failed to update inline comment on assignment');
            }
            
            // Test 10: Add inline comment to assignment with variable reference ($a = $b)
            const inlineTestScript10 = `$a = $b`;
            const inlineAst10 = inlineCommentTestRp.getAST(inlineTestScript10);
            const assignmentNode10 = inlineAst10.find(node => node.type === 'assignment');
            
            if (!assignmentNode10) {
                throw new Error('Inline Comment Test 10 FAILED - Assignment node not found');
            }
            
            // Add inline comment to assignment
            if (!assignmentNode10.comments) {
                assignmentNode10.comments = [];
            }
            assignmentNode10.comments.push({
                text: 'copy from b',
                codePos: assignmentNode10.codePos, // Use node's codePos as base
                inline: true
            });
            
            const inlineUpdatedScript10 = inlineCommentTestRp.updateCodeFromAST(inlineTestScript10, inlineAst10);
            // Should be $a = $b  # copy from b (not $a = _var $b)
            const inlineTest10Passed = inlineUpdatedScript10.includes('$a = $b') &&
                inlineUpdatedScript10.includes('# copy from b') &&
                !inlineUpdatedScript10.includes('_var');
            
            if (inlineTest10Passed) {
                console.log('✓ Inline Comment Test 10 PASSED - Inline comment added to variable assignment');
            } else {
                console.log('✗ Inline Comment Test 10 FAILED - Failed to add inline comment to variable assignment');
                console.log('  Original:', inlineTestScript10);
                console.log('  Expected: $a = $b  # copy from b');
                console.log('  Got:', inlineUpdatedScript10);
                throw new Error('Inline Comment Test 10 FAILED - Failed to add inline comment to variable assignment');
            }
            
            // Test 11: Empty regular comment (comment above) via AST - should be completely removed
            const inlineTestScript11 = `# regular comment
log "test"`;
            const inlineAst11 = inlineCommentTestRp.getAST(inlineTestScript11);
            const logNode11 = inlineAst11.find(node => node.type === 'command' && node.name === 'log');
            
            if (!logNode11 || !logNode11.comments || logNode11.comments.length === 0) {
                throw new Error('Inline Comment Test 11 FAILED - Node or comments not found');
            }
            
            const regularComment11 = logNode11.comments.find(c => c.inline !== true);
            if (!regularComment11) {
                throw new Error('Inline Comment Test 11 FAILED - No regular comment found');
            }
            
            // Empty the regular comment
            regularComment11.text = '';
            const inlineUpdatedScript11 = inlineCommentTestRp.updateCodeFromAST(inlineTestScript11, inlineAst11);
            const inlineTest11Passed = inlineUpdatedScript11.includes('log "test"') &&
                !inlineUpdatedScript11.includes('# regular comment') &&
                !inlineUpdatedScript11.includes('#');
            
            if (inlineTest11Passed) {
                console.log('✓ Inline Comment Test 11 PASSED - Regular comment emptied and removed');
            } else {
                console.log('✗ Inline Comment Test 11 FAILED - Regular comment not removed when emptied');
                console.log('  Original:', inlineTestScript11);
                console.log('  Expected: log "test" (no comment)');
                console.log('  Got:', inlineUpdatedScript11);
                throw new Error('Inline Comment Test 11 FAILED - Regular comment not removed when emptied');
            }
            
            // Test 12: Empty inline comment via AST - should be completely removed
            const inlineTestScript12 = `log "test"  # inline comment`;
            const inlineAst12 = inlineCommentTestRp.getAST(inlineTestScript12);
            const logNode12 = inlineAst12.find(node => node.type === 'command' && node.name === 'log');
            
            if (!logNode12 || !logNode12.comments || logNode12.comments.length === 0) {
                throw new Error('Inline Comment Test 12 FAILED - Node or comments not found');
            }
            
            const inlineComment12 = logNode12.comments.find(c => c.inline === true);
            if (!inlineComment12) {
                throw new Error('Inline Comment Test 12 FAILED - No inline comment found');
            }
            
            // Empty the inline comment
            inlineComment12.text = '';
            const inlineUpdatedScript12 = inlineCommentTestRp.updateCodeFromAST(inlineTestScript12, inlineAst12);
            const inlineTest12Passed = inlineUpdatedScript12 === 'log "test"' ||
                (inlineUpdatedScript12.includes('log "test"') && !inlineUpdatedScript12.includes('# inline comment') && !inlineUpdatedScript12.includes('#'));
            
            if (inlineTest12Passed) {
                console.log('✓ Inline Comment Test 12 PASSED - Inline comment emptied and removed');
            } else {
                console.log('✗ Inline Comment Test 12 FAILED - Inline comment not removed when emptied');
                console.log('  Original:', inlineTestScript12);
                console.log('  Expected: log "test" (no comment)');
                console.log('  Got:', inlineUpdatedScript12);
                throw new Error('Inline Comment Test 12 FAILED - Inline comment not removed when emptied');
            }
            
            // Test 13: Empty both regular and inline comments via AST - both should be removed
            const inlineTestScript13 = `# regular comment
log "test"  # inline comment`;
            const inlineAst13 = inlineCommentTestRp.getAST(inlineTestScript13);
            const logNode13 = inlineAst13.find(node => node.type === 'command' && node.name === 'log');
            
            if (!logNode13 || !logNode13.comments || logNode13.comments.length < 2) {
                throw new Error('Inline Comment Test 13 FAILED - Node or comments not found');
            }
            
            const regularComment13 = logNode13.comments.find(c => c.inline !== true);
            const inlineComment13 = logNode13.comments.find(c => c.inline === true);
            
            if (!regularComment13 || !inlineComment13) {
                throw new Error('Inline Comment Test 13 FAILED - Both comment types not found');
            }
            
            // Empty both comments
            regularComment13.text = '';
            inlineComment13.text = '';
            const inlineUpdatedScript13 = inlineCommentTestRp.updateCodeFromAST(inlineTestScript13, inlineAst13);
            const inlineTest13Passed = inlineUpdatedScript13 === 'log "test"' ||
                (inlineUpdatedScript13.includes('log "test"') && 
                 !inlineUpdatedScript13.includes('# regular comment') && 
                 !inlineUpdatedScript13.includes('# inline comment') &&
                 !inlineUpdatedScript13.includes('#'));
            
            if (inlineTest13Passed) {
                console.log('✓ Inline Comment Test 13 PASSED - Both comments emptied and removed');
            } else {
                console.log('✗ Inline Comment Test 13 FAILED - Comments not removed when emptied');
                console.log('  Original:', inlineTestScript13);
                console.log('  Expected: log "test" (no comments)');
                console.log('  Got:', inlineUpdatedScript13);
                throw new Error('Inline Comment Test 13 FAILED - Comments not removed when emptied');
            }
            
            // Test 14: Empty regular comment on assignment statement via AST
            const inlineTestScript14 = `# comment above comment
$a = 1`;
            const inlineAst14 = inlineCommentTestRp.getAST(inlineTestScript14);
            const assignmentNode14 = inlineAst14.find(node => node.type === 'assignment');
            
            if (!assignmentNode14 || !assignmentNode14.comments || assignmentNode14.comments.length === 0) {
                throw new Error('Inline Comment Test 14 FAILED - Assignment node or comments not found');
            }
            
            const regularComment14 = assignmentNode14.comments.find(c => c.inline !== true);
            if (!regularComment14) {
                throw new Error('Inline Comment Test 14 FAILED - No regular comment found on assignment');
            }
            
            // Empty the regular comment
            regularComment14.text = '';
            const inlineUpdatedScript14 = inlineCommentTestRp.updateCodeFromAST(inlineTestScript14, inlineAst14);
            const inlineTest14Passed = inlineUpdatedScript14.includes('$a = 1') &&
                !inlineUpdatedScript14.includes('# above comment') &&
                !inlineUpdatedScript14.match(/^#/m); // No comment lines at start
            
            if (inlineTest14Passed) {
                console.log('✓ Inline Comment Test 14 PASSED - Regular comment emptied on assignment');
            } else {
                console.log('✗ Inline Comment Test 14 FAILED - Regular comment not removed from assignment');
                console.log('  Original:', inlineTestScript14);
                console.log('  Expected: $a = 1 (no comment above)');
                console.log('  Got:', inlineUpdatedScript14);
                throw new Error('Inline Comment Test 14 FAILED - Regular comment not removed from assignment');
            }
        }
        
        console.log('✓ All inline comment tests PASSED!');
        console.log('='.repeat(60));
        
        // Test literalValueType detection and conversion
        console.log();
        console.log('='.repeat(60));
        console.log('Testing Literal Value Type Detection and Conversion');
        console.log('='.repeat(60));
        
        {
            const typeTestRp = new RobinPath();
            
            // Test 1: Detect correct type for number literal
            const testScript1 = `$num = 42`;
            const ast1 = typeTestRp.getAST(testScript1);
            const assignment1 = ast1.find(node => node.type === 'assignment');
            
            if (!assignment1 || assignment1.literalValue === undefined) {
                throw new Error('Literal Type Test 1 FAILED - Assignment not found');
            }
            
            const test1Passed = assignment1.literalValue === 42 &&
                assignment1.literalValueType === 'number';
            
            if (test1Passed) {
                console.log('✓ Literal Type Test 1 PASSED - Number type detected correctly');
            } else {
                console.log('✗ Literal Type Test 1 FAILED - Number type not detected correctly');
                console.log('  Expected: literalValueType = "number", literalValue = 42');
                console.log('  Got: literalValueType =', assignment1.literalValueType, ', literalValue =', assignment1.literalValue);
                throw new Error('Literal Type Test 1 FAILED - Number type not detected correctly');
            }
            
            // Test 2: Detect correct type for string literal
            const testScript2 = `$str = "hello"`;
            const ast2 = typeTestRp.getAST(testScript2);
            const assignment2 = ast2.find(node => node.type === 'assignment');
            
            if (!assignment2 || assignment2.literalValue === undefined) {
                throw new Error('Literal Type Test 2 FAILED - Assignment not found');
            }
            
            const test2Passed = assignment2.literalValue === 'hello' &&
                assignment2.literalValueType === 'string';
            
            if (test2Passed) {
                console.log('✓ Literal Type Test 2 PASSED - String type detected correctly');
            } else {
                console.log('✗ Literal Type Test 2 FAILED - String type not detected correctly');
                console.log('  Expected: literalValueType = "string", literalValue = "hello"');
                console.log('  Got: literalValueType =', assignment2.literalValueType, ', literalValue =', assignment2.literalValue);
                throw new Error('Literal Type Test 2 FAILED - String type not detected correctly');
            }
            
            // Test 3: Detect correct type for boolean true
            const testScript3 = `$bool = true`;
            const ast3 = typeTestRp.getAST(testScript3);
            const assignment3 = ast3.find(node => node.type === 'assignment');
            
            if (!assignment3 || assignment3.literalValue === undefined) {
                throw new Error('Literal Type Test 3 FAILED - Assignment not found');
            }
            
            const test3Passed = assignment3.literalValue === true &&
                assignment3.literalValueType === 'boolean';
            
            if (test3Passed) {
                console.log('✓ Literal Type Test 3 PASSED - Boolean true type detected correctly');
            } else {
                console.log('✗ Literal Type Test 3 FAILED - Boolean true type not detected correctly');
                console.log('  Expected: literalValueType = "boolean", literalValue = true');
                console.log('  Got: literalValueType =', assignment3.literalValueType, ', literalValue =', assignment3.literalValue);
                throw new Error('Literal Type Test 3 FAILED - Boolean true type not detected correctly');
            }
            
            // Test 4: Detect correct type for boolean false
            const testScript4 = `$bool = false`;
            const ast4 = typeTestRp.getAST(testScript4);
            const assignment4 = ast4.find(node => node.type === 'assignment');
            
            if (!assignment4 || assignment4.literalValue === undefined) {
                throw new Error('Literal Type Test 4 FAILED - Assignment not found');
            }
            
            const test4Passed = assignment4.literalValue === false &&
                assignment4.literalValueType === 'boolean';
            
            if (test4Passed) {
                console.log('✓ Literal Type Test 4 PASSED - Boolean false type detected correctly');
            } else {
                console.log('✗ Literal Type Test 4 FAILED - Boolean false type not detected correctly');
                console.log('  Expected: literalValueType = "boolean", literalValue = false');
                console.log('  Got: literalValueType =', assignment4.literalValueType, ', literalValue =', assignment4.literalValue);
                throw new Error('Literal Type Test 4 FAILED - Boolean false type not detected correctly');
            }
            
            // Test 5: Detect correct type for null
            const testScript5 = `$null = null`;
            const ast5 = typeTestRp.getAST(testScript5);
            const assignment5 = ast5.find(node => node.type === 'assignment');
            
            if (!assignment5 || assignment5.literalValue === undefined) {
                throw new Error('Literal Type Test 5 FAILED - Assignment not found');
            }
            
            const test5Passed = assignment5.literalValue === null &&
                assignment5.literalValueType === 'null';
            
            if (test5Passed) {
                console.log('✓ Literal Type Test 5 PASSED - Null type detected correctly');
            } else {
                console.log('✗ Literal Type Test 5 FAILED - Null type not detected correctly');
                console.log('  Expected: literalValueType = "null", literalValue = null');
                console.log('  Got: literalValueType =', assignment5.literalValueType, ', literalValue =', assignment5.literalValue);
                throw new Error('Literal Type Test 5 FAILED - Null type not detected correctly');
            }
            
            // Test 6: Convert number to string via AST
            const testScript6 = `$num = 42`;
            const ast6 = typeTestRp.getAST(testScript6);
            const assignment6 = ast6.find(node => node.type === 'assignment');
            
            if (!assignment6 || assignment6.literalValue === undefined) {
                throw new Error('Literal Type Test 6 FAILED - Assignment not found');
            }
            
            // Change type to string
            assignment6.literalValueType = 'string';
            const updatedScript6 = typeTestRp.updateCodeFromAST(testScript6, ast6);
            const test6Passed = updatedScript6.includes('$num = "42"') || updatedScript6.includes('$num = 42');
            
            if (test6Passed) {
                console.log('✓ Literal Type Test 6 PASSED - Number converted to string via AST');
            } else {
                console.log('✗ Literal Type Test 6 FAILED - Number not converted to string');
                console.log('  Original:', testScript6);
                console.log('  Expected: $num = "42"');
                console.log('  Got:', updatedScript6);
                throw new Error('Literal Type Test 6 FAILED - Number not converted to string');
            }
            
            // Test 7: Convert string to number via AST (valid conversion)
            const testScript7 = `$str = "123"`;
            const ast7 = typeTestRp.getAST(testScript7);
            const assignment7 = ast7.find(node => node.type === 'assignment');
            
            if (!assignment7 || assignment7.literalValue === undefined) {
                throw new Error('Literal Type Test 7 FAILED - Assignment not found');
            }
            
            // Change type to number
            assignment7.literalValueType = 'number';
            const updatedScript7 = typeTestRp.updateCodeFromAST(testScript7, ast7);
            const test7Passed = updatedScript7.includes('$str = 123');
            
            if (test7Passed) {
                console.log('✓ Literal Type Test 7 PASSED - String "123" converted to number via AST');
            } else {
                console.log('✗ Literal Type Test 7 FAILED - String not converted to number');
                console.log('  Original:', testScript7);
                console.log('  Expected: $str = 123');
                console.log('  Got:', updatedScript7);
                throw new Error('Literal Type Test 7 FAILED - String not converted to number');
            }
            
            // Test 8: Convert string to number via AST (invalid conversion - should keep original)
            const testScript8 = `$str = "hello"`;
            const ast8 = typeTestRp.getAST(testScript8);
            const assignment8 = ast8.find(node => node.type === 'assignment');
            
            if (!assignment8 || assignment8.literalValue === undefined) {
                throw new Error('Literal Type Test 8 FAILED - Assignment not found');
            }
            
            // Change type to number (invalid conversion)
            assignment8.literalValueType = 'number';
            const updatedScript8 = typeTestRp.updateCodeFromAST(testScript8, ast8);
            // Should keep original value since conversion fails
            const test8Passed = updatedScript8.includes('$str = "hello"');
            
            if (test8Passed) {
                console.log('✓ Literal Type Test 8 PASSED - Invalid string-to-number conversion keeps original');
            } else {
                console.log('✗ Literal Type Test 8 FAILED - Invalid conversion should keep original');
                console.log('  Original:', testScript8);
                console.log('  Expected: $str = "hello" (kept original)');
                console.log('  Got:', updatedScript8);
                throw new Error('Literal Type Test 8 FAILED - Invalid conversion should keep original');
            }
            
            // Test 9: Convert number to boolean via AST
            const testScript9 = `$num = 1`;
            const ast9 = typeTestRp.getAST(testScript9);
            const assignment9 = ast9.find(node => node.type === 'assignment');
            
            if (!assignment9 || assignment9.literalValue === undefined) {
                throw new Error('Literal Type Test 9 FAILED - Assignment not found');
            }
            
            // Change type to boolean
            assignment9.literalValueType = 'boolean';
            const updatedScript9 = typeTestRp.updateCodeFromAST(testScript9, ast9);
            const test9Passed = updatedScript9.includes('$num = true');
            
            if (test9Passed) {
                console.log('✓ Literal Type Test 9 PASSED - Number 1 converted to boolean true via AST');
            } else {
                console.log('✗ Literal Type Test 9 FAILED - Number not converted to boolean');
                console.log('  Original:', testScript9);
                console.log('  Expected: $num = true');
                console.log('  Got:', updatedScript9);
                throw new Error('Literal Type Test 9 FAILED - Number not converted to boolean');
            }
            
            // Test 10: Convert number 0 to boolean false via AST
            const testScript10 = `$num = 0`;
            const ast10 = typeTestRp.getAST(testScript10);
            const assignment10 = ast10.find(node => node.type === 'assignment');
            
            if (!assignment10 || assignment10.literalValue === undefined) {
                throw new Error('Literal Type Test 10 FAILED - Assignment not found');
            }
            
            // Change type to boolean
            assignment10.literalValueType = 'boolean';
            const updatedScript10 = typeTestRp.updateCodeFromAST(testScript10, ast10);
            const test10Passed = updatedScript10.includes('$num = false');
            
            if (test10Passed) {
                console.log('✓ Literal Type Test 10 PASSED - Number 0 converted to boolean false via AST');
            } else {
                console.log('✗ Literal Type Test 10 FAILED - Number 0 not converted to boolean false');
                console.log('  Original:', testScript10);
                console.log('  Expected: $num = false');
                console.log('  Got:', updatedScript10);
                throw new Error('Literal Type Test 10 FAILED - Number 0 not converted to boolean false');
            }
            
            // Test 11: Convert string "true" to boolean via AST
            const testScript11 = `$str = "true"`;
            const ast11 = typeTestRp.getAST(testScript11);
            const assignment11 = ast11.find(node => node.type === 'assignment');
            
            if (!assignment11 || assignment11.literalValue === undefined) {
                throw new Error('Literal Type Test 11 FAILED - Assignment not found');
            }
            
            // Change type to boolean
            assignment11.literalValueType = 'boolean';
            const updatedScript11 = typeTestRp.updateCodeFromAST(testScript11, ast11);
            const test11Passed = updatedScript11.includes('$str = true');
            
            if (test11Passed) {
                console.log('✓ Literal Type Test 11 PASSED - String "true" converted to boolean via AST');
            } else {
                console.log('✗ Literal Type Test 11 FAILED - String "true" not converted to boolean');
                console.log('  Original:', testScript11);
                console.log('  Expected: $str = true');
                console.log('  Got:', updatedScript11);
                throw new Error('Literal Type Test 11 FAILED - String "true" not converted to boolean');
            }
            
            // Test 12: Convert string "false" to boolean via AST
            const testScript12 = `$str = "false"`;
            const ast12 = typeTestRp.getAST(testScript12);
            const assignment12 = ast12.find(node => node.type === 'assignment');
            
            if (!assignment12 || assignment12.literalValue === undefined) {
                throw new Error('Literal Type Test 12 FAILED - Assignment not found');
            }
            
            // Change type to boolean
            assignment12.literalValueType = 'boolean';
            const updatedScript12 = typeTestRp.updateCodeFromAST(testScript12, ast12);
            const test12Passed = updatedScript12.includes('$str = false');
            
            if (test12Passed) {
                console.log('✓ Literal Type Test 12 PASSED - String "false" converted to boolean via AST');
            } else {
                console.log('✗ Literal Type Test 12 FAILED - String "false" not converted to boolean');
                console.log('  Original:', testScript12);
                console.log('  Expected: $str = false');
                console.log('  Got:', updatedScript12);
                throw new Error('Literal Type Test 12 FAILED - String "false" not converted to boolean');
            }
            
            // Test 13: Convert boolean to string via AST
            const testScript13 = `$bool = true`;
            const ast13 = typeTestRp.getAST(testScript13);
            const assignment13 = ast13.find(node => node.type === 'assignment');
            
            if (!assignment13 || assignment13.literalValue === undefined) {
                throw new Error('Literal Type Test 13 FAILED - Assignment not found');
            }
            
            // Change type to string
            assignment13.literalValueType = 'string';
            const updatedScript13 = typeTestRp.updateCodeFromAST(testScript13, ast13);
            const test13Passed = updatedScript13.includes('$bool = "true"');
            
            if (test13Passed) {
                console.log('✓ Literal Type Test 13 PASSED - Boolean converted to string via AST');
            } else {
                console.log('✗ Literal Type Test 13 FAILED - Boolean not converted to string');
                console.log('  Original:', testScript13);
                console.log('  Expected: $bool = "true"');
                console.log('  Got:', updatedScript13);
                throw new Error('Literal Type Test 13 FAILED - Boolean not converted to string');
            }
        }
        
        console.log('✓ All literal value type tests PASSED!');
        console.log('='.repeat(60));
        
        // Test function metadata retrieval
        console.log();
        console.log('='.repeat(60));
        console.log('Testing Function Metadata Retrieval');
        console.log('='.repeat(60));
        
        {
            const metadataTestRp = new RobinPath();
            
            // Test 1: Get metadata for module function
            const mathAddMeta = metadataTestRp.getFunctionMetadata('math.add');
            const metadataTest1Passed = mathAddMeta !== null && 
                typeof mathAddMeta === 'object' &&
                mathAddMeta.description !== undefined;
            
            if (metadataTest1Passed) {
                console.log('✓ Metadata Test 1 PASSED - Module function metadata retrieved');
            } else {
                console.log('✗ Metadata Test 1 FAILED - Module function metadata not found');
                console.log('  Function: math.add');
                console.log('  Metadata:', mathAddMeta);
                throw new Error('Metadata Test 1 FAILED - Module function metadata not found');
            }
            
            // Test 2: Get metadata for global function (if it exists)
            const addMeta = metadataTestRp.getFunctionMetadata('add');
            const metadataTest2Passed = addMeta !== null && 
                typeof addMeta === 'object' &&
                addMeta.description !== undefined;
            
            if (metadataTest2Passed) {
                console.log('✓ Metadata Test 2 PASSED - Global function metadata retrieved');
            } else {
                console.log('✗ Metadata Test 2 FAILED - Global function metadata not found');
                console.log('  Function: add');
                console.log('  Metadata:', addMeta);
                throw new Error('Metadata Test 2 FAILED - Global function metadata not found');
            }
            
            // Test 3: Get module info
            const mathModuleInfo = metadataTestRp.getModuleInfo('math');
            const metadataTest3Passed = mathModuleInfo !== null && 
                typeof mathModuleInfo === 'object' &&
                mathModuleInfo.description !== undefined;
            
            if (metadataTest3Passed) {
                console.log('✓ Metadata Test 3 PASSED - Module info retrieved');
            } else {
                console.log('✗ Metadata Test 3 FAILED - Module info not found');
                console.log('  Module: math');
                console.log('  Info:', mathModuleInfo);
                throw new Error('Metadata Test 3 FAILED - Module info not found');
            }
            
            // Test 4: Verify metadata structure for function
            const logMeta = metadataTestRp.getFunctionMetadata('log');
            const metadataTest4Passed = logMeta !== null &&
                typeof logMeta === 'object' &&
                (logMeta.parameters === undefined || Array.isArray(logMeta.parameters)) &&
                typeof logMeta.description === 'string';
            
            if (metadataTest4Passed) {
                console.log('✓ Metadata Test 4 PASSED - Function metadata has correct structure');
            } else {
                console.log('✗ Metadata Test 4 FAILED - Function metadata structure incorrect');
                console.log('  Function: log');
                console.log('  Metadata:', logMeta);
                throw new Error('Metadata Test 4 FAILED - Function metadata structure incorrect');
            }
            
            // Test 5: Verify metadata for non-existent function returns null
            const nonExistentMeta = metadataTestRp.getFunctionMetadata('nonexistent.function');
            const metadataTest5Passed = nonExistentMeta === null;
            
            if (metadataTest5Passed) {
                console.log('✓ Metadata Test 5 PASSED - Non-existent function returns null');
            } else {
                console.log('✗ Metadata Test 5 FAILED - Non-existent function should return null');
                console.log('  Function: nonexistent.function');
                console.log('  Metadata:', nonExistentMeta);
                throw new Error('Metadata Test 5 FAILED - Non-existent function should return null');
            }
            
            // Test 6: Verify metadata for non-existent module returns null
            const nonExistentModuleInfo = metadataTestRp.getModuleInfo('nonexistent');
            const metadataTest6Passed = nonExistentModuleInfo === null;
            
            if (metadataTest6Passed) {
                console.log('✓ Metadata Test 6 PASSED - Non-existent module returns null');
            } else {
                console.log('✗ Metadata Test 6 FAILED - Non-existent module should return null');
                console.log('  Module: nonexistent');
                console.log('  Info:', nonExistentModuleInfo);
                throw new Error('Metadata Test 6 FAILED - Non-existent module should return null');
            }
            
            // Test 7: Verify that both module-prefixed and global function names work for global functions
            // This tests the fix we just made
            const addMetaGlobal = metadataTestRp.getFunctionMetadata('add');
            const addMetaModule = metadataTestRp.getFunctionMetadata('math.add');
            const metadataTest7Passed = addMetaGlobal !== null && addMetaModule !== null &&
                addMetaGlobal.description === addMetaModule.description;
            
            if (metadataTest7Passed) {
                console.log('✓ Metadata Test 7 PASSED - Global function metadata accessible via both names');
            } else {
                console.log('✗ Metadata Test 7 FAILED - Global function metadata should be accessible via both names');
                console.log('  Global (add):', addMetaGlobal);
                console.log('  Module (math.add):', addMetaModule);
                throw new Error('Metadata Test 7 FAILED - Global function metadata should be accessible via both names');
            }
        }
        
        console.log('✓ All metadata tests PASSED!');
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

