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
        }
        
        // Test 5: Comments separated by blank lines should NOT be attached but should be comment nodes
        const testScript5 = `
# test comment

# test comment 2

add 5 5
`;
        const astTest5 = commentTestRp.getAST(testScript5);
        const addNode5 = astTest5.find(node => node.type === 'command' && node.name === 'add');
        const commentTest5aPassed = addNode5 && 
            (!addNode5.comments || addNode5.comments.length === 0);
        
        const commentNode5a = astTest5.find(node => node.type === 'comment' && node.text === 'test comment');
        const commentNode5b = astTest5.find(node => node.type === 'comment' && node.text === 'test comment 2');
        const commentTest5bPassed = commentNode5a && commentNode5b;
        const commentTest5Passed = commentTest5aPassed && commentTest5bPassed;
        
        if (commentTest5Passed) {
            console.log('✓ Test 5 PASSED - Comments separated by blank lines are separate comment nodes');
        } else {
            console.log('✗ Test 5 FAILED - Comments separated by blank lines should be comment nodes');
            console.log('  Not attached to command:', commentTest5aPassed);
            console.log('  Are comment nodes:', commentTest5bPassed);
            console.log('  Comment node 1:', commentNode5a);
            console.log('  Comment node 2:', commentNode5b);
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
        }
        
        // Summary
        const allCommentTestsPassed = commentTest1Passed && commentTest2Passed && commentTest3Passed && commentTest5Passed && commentTest7Passed;
        if (allCommentTestsPassed) {
            console.log();
            console.log('✓ All comment attachment tests PASSED!');
        } else {
            console.log();
            console.log('✗ Some comment attachment tests FAILED');
            console.log();
            console.log('AST Structure:');
            console.log(JSON.stringify(commentAST, null, 2));
            if (!commentTest5Passed || !commentTest7Passed) {
                console.log();
                if (!commentTest5Passed) {
                    console.log('Test 5 AST Structure:');
                    console.log(JSON.stringify(astTest5, null, 2));
                }
                if (!commentTest7Passed) {
                    console.log('Test 7 AST Structure:');
                    console.log(JSON.stringify(astTest7, null, 2));
                }
            }
        }
        
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

