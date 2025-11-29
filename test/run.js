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

