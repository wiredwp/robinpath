// Test Case a5: Functions AST tests
// Tests AST reading, code position checking, and AST updating (add/remove/modify)
// This test file matches test/scripts/05-functions.rp

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Functions AST');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    
    // ============================================================
    // PART 1: Read AST and Check Code Positions
    // ============================================================
    console.log('\n--- PART 1: Read AST and Check Code Positions ---\n');
    
    // SECTION 1: Basic Function Definitions
    console.log('\n--- SECTION 1: Basic Function Definitions ---\n');
    
    const basicFunctionScript = `
def greet
  log "Hello" $1
  log "Your age is" $2
enddef

def sum_and_double
  math.add $1 $2
  math.multiply $ 2
enddef
`;
    
    const basicFunctionAST = await testRp.getAST(basicFunctionScript);
    console.log(`Basic function AST nodes: ${basicFunctionAST.length}`);
    
    // Test 1: Verify basic function definition (def greet)
    // Function definitions use type 'define' in the AST
    const greetFunction = basicFunctionAST.find(node => 
        node.type === 'define' && 
        node.name === 'greet'
    );
    
    if (!greetFunction || !greetFunction.codePos) {
        throw new Error('Test 1 FAILED: def greet not found or missing codePos');
    }
    
    console.log(`✓ Test 1 PASSED - def greet found`);
    console.log(`  Code position: startRow=${greetFunction.codePos.startRow}, startCol=${greetFunction.codePos.startCol}`);
    console.log(`  Has body: ${greetFunction.body && Array.isArray(greetFunction.body)}`);
    
    console.log(`✓ Test 1 PASSED - def greet found`);
    console.log(`  Code position: startRow=${greetFunction.codePos.startRow}, startCol=${greetFunction.codePos.startCol}`);
    console.log(`  Has body: ${greetFunction.body && Array.isArray(greetFunction.body)}`);
    
    // Test 2: Verify function with return (sum_and_double)
    const sumFunction = basicFunctionAST.find(node => 
        node.type === 'define' && 
        node.name === 'sum_and_double'
    );
    
    if (!sumFunction || !sumFunction.codePos) {
        throw new Error('Test 2 FAILED: def sum_and_double not found or missing codePos');
    }
    
    console.log(`✓ Test 2 PASSED - def sum_and_double found`);
    console.log(`  Code position: startRow=${sumFunction.codePos.startRow}, startCol=${sumFunction.codePos.startCol}`);
    console.log(`  Body statements: ${sumFunction.body ? sumFunction.body.length : 0}`);
    
    // SECTION 2: Function with Parameters
    console.log('\n--- SECTION 2: Function with Parameters ---\n');
    
    const paramFunctionScript = `
def greetLog $name $age
  log "Hello" $name
  log "Age:" $age
enddef

def add $a $b
  math.add $a $b
enddef
`;
    
    const paramFunctionAST = await testRp.getAST(paramFunctionScript);
    console.log(`Parameter function AST nodes: ${paramFunctionAST.length}`);
    
    // Test 3: Verify function with parameters
    const greetLogFunction = paramFunctionAST.find(node => 
        node.type === 'define' && 
        node.name === 'greetLog'
    );
    
    if (!greetLogFunction || !greetLogFunction.codePos) {
        throw new Error('Test 3 FAILED: def greetLog with parameters not found or missing codePos');
    }
    
    const hasParams = greetLogFunction.params && Array.isArray(greetLogFunction.params) && greetLogFunction.params.length === 2;
    
    console.log(`✓ Test 3 PASSED - def greetLog with parameters found`);
    console.log(`  Code position: startRow=${greetLogFunction.codePos.startRow}, startCol=${greetLogFunction.codePos.startCol}`);
    console.log(`  Parameters: ${hasParams ? greetLogFunction.params.map(p => p.name).join(', ') : 'none'}`);
    
    // Test 4: Verify function with parameter aliases
    const addFunction = paramFunctionAST.find(node => 
        node.type === 'define' && 
        node.name === 'add'
    );
    
    if (!addFunction || !addFunction.codePos) {
        throw new Error('Test 4 FAILED: def add with parameters not found or missing codePos');
    }
    
    const hasParamAliases = addFunction.params && Array.isArray(addFunction.params) && addFunction.params.length === 2;
    
    console.log(`✓ Test 4 PASSED - def add with parameter aliases found`);
    console.log(`  Code position: startRow=${addFunction.codePos.startRow}, startCol=${addFunction.codePos.startCol}`);
    console.log(`  Parameters: ${hasParamAliases ? addFunction.params.map(p => p.name).join(', ') : 'none'}`);
    
    // SECTION 3: Function with Return Statements
    console.log('\n--- SECTION 3: Function with Return Statements ---\n');
    
    const returnFunctionScript = `
def return_value
  return 100
enddef

def return_variable
  $result = 200
  return $result
enddef

def return_expression
  math.add 10 20
  return $
enddef
`;
    
    const returnFunctionAST = await testRp.getAST(returnFunctionScript);
    console.log(`Return function AST nodes: ${returnFunctionAST.length}`);
    
    // Test 5: Verify function with return value
    const returnValueFunction = returnFunctionAST.find(node => 
        node.type === 'define' && 
        node.name === 'return_value'
    );
    
    if (!returnValueFunction || !returnValueFunction.codePos) {
        throw new Error('Test 5 FAILED: def return_value not found or missing codePos');
    }
    
    // Check if body contains return statement
    const hasReturn = returnValueFunction.body && 
        returnValueFunction.body.some(stmt => stmt.type === 'return');
    
    console.log(`✓ Test 5 PASSED - def return_value found`);
    console.log(`  Code position: startRow=${returnValueFunction.codePos.startRow}, startCol=${returnValueFunction.codePos.startCol}`);
    console.log(`  Has return statement: ${hasReturn}`);
    
    // Test 6: Verify function with return variable
    const returnVarFunction = returnFunctionAST.find(node => 
        node.type === 'define' && 
        node.name === 'return_variable'
    );
    
    if (!returnVarFunction || !returnVarFunction.codePos) {
        throw new Error('Test 6 FAILED: def return_variable not found or missing codePos');
    }
    
    const hasReturnVar = returnVarFunction.body && 
        returnVarFunction.body.some(stmt => stmt.type === 'return');
    
    console.log(`✓ Test 6 PASSED - def return_variable found`);
    console.log(`  Code position: startRow=${returnVarFunction.codePos.startRow}, startCol=${returnVarFunction.codePos.startCol}`);
    console.log(`  Has return statement: ${hasReturnVar}`);
    
    // SECTION 4: Function Calls
    console.log('\n--- SECTION 4: Function Calls ---\n');
    
    const callScript = `
def greet
  log "Hello" $1
enddef

greet "Alice" 25
greet("Bob" 30)
`;
    
    const callAST = await testRp.getAST(callScript);
    console.log(`Function call AST nodes: ${callAST.length}`);
    
    // Test 7: Verify function call (space-separated)
    const spaceCall = callAST.find(node => 
        node.type === 'command' && 
        node.name === 'greet' &&
        node.args && 
        node.args.length === 2
    );
    
    if (!spaceCall || !spaceCall.codePos) {
        throw new Error('Test 7 FAILED: Function call (space-separated) not found or missing codePos');
    }
    
    console.log(`✓ Test 7 PASSED - Function call (space-separated) found`);
    console.log(`  Code position: startRow=${spaceCall.codePos.startRow}, startCol=${spaceCall.codePos.startCol}`);
    console.log(`  Arguments: ${spaceCall.args.length}`);
    
    // Test 8: Verify function call (parenthesized)
    const parenCall = callAST.find(node => 
        node.type === 'command' && 
        node.name === 'greet' &&
        node.args && 
        node.args.length === 2 &&
        spaceCall !== node // Different from spaceCall
    );
    
    if (!parenCall || !parenCall.codePos) {
        throw new Error('Test 8 FAILED: Function call (parenthesized) not found or missing codePos');
    }
    
    console.log(`✓ Test 8 PASSED - Function call (parenthesized) found`);
    console.log(`  Code position: startRow=${parenCall.codePos.startRow}, startCol=${parenCall.codePos.startCol}`);
    console.log(`  Arguments: ${parenCall.args.length}`);
    
    // SECTION 4B: Multiline Function Calls
    console.log('\n--- SECTION 4B: Multiline Function Calls ---\n');
    
    const multilineCallScript = `
def fn $a $b
  string.concat $a $b
enddef

fn(
  "1"
  "2"
)
`;
    
    const multilineCallAST = await testRp.getAST(multilineCallScript);
    console.log(`Multiline call AST nodes: ${multilineCallAST.length}`);
    
    // Test 8B: Verify multiline function call
    const multilineCall = multilineCallAST.find(node => 
        node.type === 'command' && 
        node.name === 'fn' &&
        node.syntaxType === 'multiline-parentheses'
    );
    
    if (!multilineCall || !multilineCall.codePos) {
        throw new Error('Test 8B FAILED: Multiline function call not found or missing codePos');
    }
    
    if (multilineCall.syntaxType !== 'multiline-parentheses') {
        throw new Error(`Test 8B FAILED: Expected syntaxType 'multiline-parentheses', got '${multilineCall.syntaxType}'`);
    }
    
    console.log(`✓ Test 8B PASSED - Multiline function call found`);
    console.log(`  Code position: startRow=${multilineCall.codePos.startRow}, startCol=${multilineCall.codePos.startCol}`);
    console.log(`  Syntax type: ${multilineCall.syntaxType}`);
    console.log(`  Arguments: ${multilineCall.args.length}`);
    
    // SECTION 4C: Named Parameters Function Calls
    console.log('\n--- SECTION 4C: Named Parameters Function Calls ---\n');
    
    const namedParamsScript = `
def fn $a $b
  string.concat $a $b
enddef

fn($a="a" $b="b")
`;
    
    const namedParamsAST = await testRp.getAST(namedParamsScript);
    console.log(`Named params call AST nodes: ${namedParamsAST.length}`);
    
    // Test 8C: Verify named parameters function call
    const namedParamsCall = namedParamsAST.find(node => 
        node.type === 'command' && 
        node.name === 'fn' &&
        node.syntaxType === 'named-parentheses'
    );
    
    if (!namedParamsCall || !namedParamsCall.codePos) {
        throw new Error('Test 8C FAILED: Named parameters function call not found or missing codePos');
    }
    
    if (namedParamsCall.syntaxType !== 'named-parentheses') {
        throw new Error(`Test 8C FAILED: Expected syntaxType 'named-parentheses', got '${namedParamsCall.syntaxType}'`);
    }
    
    // Verify named args structure
    const namedArgs = namedParamsCall.args.find(arg => arg && arg.type === 'namedArgs');
    if (!namedArgs || !namedArgs.args) {
        throw new Error('Test 8C FAILED: Named arguments not found in function call');
    }
    
    console.log(`✓ Test 8C PASSED - Named parameters function call found`);
    console.log(`  Code position: startRow=${namedParamsCall.codePos.startRow}, startCol=${namedParamsCall.codePos.startCol}`);
    console.log(`  Syntax type: ${namedParamsCall.syntaxType}`);
    console.log(`  Named args: ${Object.keys(namedArgs.args).join(', ')}`);
    
    // SECTION 5: Define Alias
    console.log('\n--- SECTION 5: Define Alias ---\n');
    
    const defineScript = `
define test_define_alias
  return "define works"
enddef
`;
    
    const defineAST = await testRp.getAST(defineScript);
    console.log(`Define alias AST nodes: ${defineAST.length}`);
    
    // Test 9: Verify define alias
    const defineFunction = defineAST.find(node => 
        node.type === 'define' && 
        node.name === 'test_define_alias'
    );
    
    if (!defineFunction || !defineFunction.codePos) {
        throw new Error('Test 9 FAILED: define alias not found or missing codePos');
    }
    
    console.log(`✓ Test 9 PASSED - define alias found`);
    console.log(`  Code position: startRow=${defineFunction.codePos.startRow}, startCol=${defineFunction.codePos.startCol}`);
    console.log(`  Type: ${defineFunction.type}`);
    
    // SECTION 6: Function with "as" Keyword
    console.log('\n--- SECTION 6: Function with "as" Keyword ---\n');
    
    const asKeywordScript = `
def test_as_keyword $x $y as
  math.add $x $y
enddef

def test_as_keyword_no_params as
  return "no params with as"
enddef
`;
    
    const asKeywordAST = await testRp.getAST(asKeywordScript);
    console.log(`"as" keyword AST nodes: ${asKeywordAST.length}`);
    
    // Test 10: Verify function with "as" keyword after parameters
    const asWithParams = asKeywordAST.find(node => 
        node.type === 'define' && 
        node.name === 'test_as_keyword'
    );
    
    if (!asWithParams || !asWithParams.codePos) {
        throw new Error('Test 10 FAILED: def with "as" keyword after parameters not found or missing codePos');
    }
    
    console.log(`✓ Test 10 PASSED - def with "as" keyword after parameters found`);
    console.log(`  Code position: startRow=${asWithParams.codePos.startRow}, startCol=${asWithParams.codePos.startCol}`);
    
    // Test 11: Verify function with "as" keyword and no parameters
    const asNoParams = asKeywordAST.find(node => 
        node.type === 'define' && 
        node.name === 'test_as_keyword_no_params'
    );
    
    if (!asNoParams || !asNoParams.codePos) {
        throw new Error('Test 11 FAILED: def with "as" keyword and no params not found or missing codePos');
    }
    
    console.log(`✓ Test 11 PASSED - def with "as" keyword and no params found`);
    console.log(`  Code position: startRow=${asNoParams.codePos.startRow}, startCol=${asNoParams.codePos.startCol}`);
    
    // ============================================================
    // PART 2: Update AST and Check Code Positions
    // ============================================================
    console.log('\n--- PART 2: Update AST and Check Code Positions ---\n');
    
    const updateScript = `
def greet
  log "Hello" $1
enddef

def add $a $b
  math.add $a $b
enddef

greet "Alice"
add(10 20)
`;
    
    // IMPORTANT: Always log code before update
    console.log('Code before update:');
    console.log(updateScript);
    console.log('');
    
    const updateAST = await testRp.getAST(updateScript);
    const modifiedAST = JSON.parse(JSON.stringify(updateAST));
    
    // Test 12: Update function name
    const greetToUpdate = modifiedAST.find(node => 
        node.type === 'define' && 
        node.name === 'greet'
    );
    
    if (greetToUpdate) {
        greetToUpdate.name = 'greetUser';
        console.log('Test 12: Updated function name from "greet" to "greetUser"');
    } else {
        console.log('\n❌ Debug: Showing update AST nodes:');
        console.log(JSON.stringify(modifiedAST.map(n => ({ type: n.type, name: n.name })), null, 2));
        throw new Error('Test 12 FAILED: Could not find greet function to update');
    }
    
    // Test 13: Update function parameter
    const addToUpdate = modifiedAST.find(node => 
        node.type === 'define' && 
        node.name === 'add'
    );
    
    if (!addToUpdate) {
        console.log('\n❌ Debug: Showing update AST nodes:');
        console.log(JSON.stringify(modifiedAST.map(n => ({ type: n.type, name: n.name })), null, 2));
        throw new Error('Test 13 FAILED: Could not find add function to update');
    }
    
    // Check if params exist and update them
    // Parameters are stored in paramNames array
    if (!addToUpdate.paramNames || !Array.isArray(addToUpdate.paramNames) || addToUpdate.paramNames.length < 2) {
        console.log('\n❌ Debug: add function structure:');
        console.log(JSON.stringify(addToUpdate, null, 2));
        throw new Error('Test 13 FAILED: add function does not have paramNames array with at least 2 parameters');
    }
    
    addToUpdate.paramNames[0] = 'x';
    addToUpdate.paramNames[1] = 'y';
    console.log('Test 13: Updated function parameters from $a $b to $x $y');
    
    // Test 14: Add new function
    // Function structure: type='define', name, body (array of statements), paramNames (optional array), codePos
    // Note: paramNames are stored without $ prefix, but will be printed with $ prefix
    const newFunction = {
        type: 'define',
        name: 'multiply',
        paramNames: ['a', 'b'],
        body: [
            {
                type: 'command',
                name: 'math.multiply',
                args: [
                    { type: 'var', name: 'a' },
                    { type: 'var', name: 'b' }
                ],
                codePos: {
                    startRow: 11,
                    startCol: 2,
                    endRow: 11,
                    endCol: 20
                }
            }
        ],
        lastValue: null,
        codePos: {
            startRow: 10,
            startCol: 0,
            endRow: 12,
            endCol: 8
        }
    };
    
    modifiedAST.push(newFunction);
    console.log('Test 14: Added new function "multiply"');
    
    // Test 15: Remove function call
    // Find the first function call (not the definition)
    // We need to find the command node that calls "greet" with "Alice" argument
    const callToRemove = modifiedAST.findIndex(node => 
        node.type === 'command' && 
        node.name === 'greet' &&
        node.args && 
        node.args.length > 0 &&
        node.args[0].type === 'string' &&
        node.args[0].value === 'Alice'
    );
    
    if (callToRemove < 0) {
        // Try simpler match - just find any greet command
        const simpleIndex = modifiedAST.findIndex(node => 
            node.type === 'command' && 
            node.name === 'greet'
        );
        if (simpleIndex >= 0) {
            modifiedAST.splice(simpleIndex, 1);
            console.log('Test 15: Removed function call "greet"');
        } else {
            console.log('\n❌ Debug: Showing update AST nodes before removal:');
            console.log(JSON.stringify(modifiedAST.map(n => ({ type: n.type, name: n.name })), null, 2));
            throw new Error('Test 15 FAILED: Could not find function call "greet" to remove');
        }
    } else {
        modifiedAST.splice(callToRemove, 1);
        console.log('Test 15: Removed function call "greet" with "Alice" argument');
    }
    
    // Verify removal from AST
    const remainingGreetCommands = modifiedAST.filter(n => n.type === 'command' && n.name === 'greet');
    if (remainingGreetCommands.length > 0) {
        console.log('\n❌ Debug: greet command still in AST after removal:');
        console.log(JSON.stringify(remainingGreetCommands, null, 2));
        throw new Error('Test 15 FAILED: Function call "greet" was not properly removed from AST');
    }
    
    // Generate updated code
    let updatedCode;
    try {
        updatedCode = await testRp.updateCodeFromAST(updateScript, modifiedAST);
    } catch (error) {
        console.log('\n❌ Code generation failed. Showing AST and code for debugging:');
        console.log('\nModified AST:');
        console.log(JSON.stringify(modifiedAST, null, 2));
        console.log('\nOriginal code:');
        console.log(updateScript);
        throw new Error(`Code generation failed: ${error.message}`);
    }
    
    // Verify updates
    const updatedCodeLines = updatedCode.split('\n');
    
    // Verify Test 12: Function name updated
    const updatedFunctionName = updatedCodeLines.findIndex(line => 
        line.includes('def greetUser') || line.includes('greetUser')
    );
    if (updatedFunctionName >= 0) {
        console.log(`✓ Test 12 PASSED - Function name updated at line ${updatedFunctionName + 1}`);
    } else {
        console.log('\n❌ Test 12 FAILED. Showing AST and code for debugging:');
        console.log('\nModified AST:');
        console.log(JSON.stringify(modifiedAST, null, 2));
        console.log('\nGenerated code:');
        console.log(updatedCode);
        throw new Error('Test 12 FAILED: Function name was not updated in generated code');
    }
    
    // Verify Test 13: Function parameters updated
    // Parameters must always start with $ prefix
    const updatedParams = updatedCodeLines.findIndex(line => 
        line.includes('def add') && (line.includes(' $x ') || line.includes(' $x\n') || line.endsWith(' $x') || 
                                     line.includes(' $y ') || line.includes(' $y\n') || line.endsWith(' $y'))
    );
    if (updatedParams >= 0) {
        // Verify both parameters are present with $ prefix
        const paramLine = updatedCodeLines[updatedParams];
        const hasX = paramLine.includes(' $x ') || paramLine.includes(' $x\n') || paramLine.endsWith(' $x') || paramLine.includes('$x');
        const hasY = paramLine.includes(' $y ') || paramLine.includes(' $y\n') || paramLine.endsWith(' $y') || paramLine.includes('$y');
        if (hasX && hasY) {
            console.log(`✓ Test 13 PASSED - Function parameters updated at line ${updatedParams + 1}`);
        } else {
            console.log('\n❌ Test 13 FAILED. Showing AST and code for debugging:');
            console.log('\nModified AST:');
            console.log(JSON.stringify(addToUpdate, null, 2));
            console.log('\nGenerated code:');
            console.log(updatedCode);
            throw new Error('Test 13 FAILED: Function parameters were not correctly updated in generated code (missing $x or $y)');
        }
    } else {
        console.log('\n❌ Test 13 FAILED. Showing AST and code for debugging:');
        console.log('\nModified AST:');
        console.log(JSON.stringify(addToUpdate, null, 2));
        console.log('\nGenerated code:');
        console.log(updatedCode);
        throw new Error('Test 13 FAILED: Function parameters were not updated in generated code');
    }
    
    // Verify Test 14: New function added
    // Parameters must have $ prefix in generated code
    const newFunctionLine = updatedCodeLines.findIndex(line => 
        line.includes('def multiply') || (line.includes('multiply') && line.includes('def'))
    );
    if (newFunctionLine >= 0) {
        // Verify the function has the correct structure with $ prefix on parameters
        const funcLine = updatedCodeLines[newFunctionLine];
        const hasParams = funcLine.includes('$a') && funcLine.includes('$b');
        const hasBody = updatedCodeLines.slice(newFunctionLine).some((line, idx) => 
            idx > 0 && idx < 5 && line.includes('math.multiply')
        );
        if (hasParams && hasBody) {
            console.log(`✓ Test 14 PASSED - New function added at line ${newFunctionLine + 1}`);
        } else {
            console.log('\n❌ Test 14 FAILED. Showing AST and code for debugging:');
            console.log('\nModified AST:');
            console.log(JSON.stringify(newFunction, null, 2));
            console.log('\nGenerated code:');
            console.log(updatedCode);
            throw new Error('Test 14 FAILED: New function was added but structure is incorrect (missing $a/$b params or body)');
        }
    } else {
        console.log('\n❌ Test 14 FAILED. Showing AST and code for debugging:');
        console.log('\nModified AST:');
        console.log(JSON.stringify(newFunction, null, 2));
        console.log('\nGenerated code:');
        console.log(updatedCode);
        throw new Error('Test 14 FAILED: New function was not added to generated code');
    }
    
    // Verify Test 15: Function call removed
    // CRITICAL: AST->code conversion must be exact - if we remove from AST, it must be removed from code
    // This test verifies that the code generator properly handles node deletions
    const removedCall = updatedCodeLines.findIndex(line => 
        (line.trim() === 'greet "Alice"' || 
         (line.includes('greet') && line.includes('"Alice"') && !line.includes('def'))) &&
        !line.includes('greetUser') // Make sure we're not matching the renamed function
    );
    if (removedCall < 0) {
        console.log(`✓ Test 15 PASSED - Function call removed from code`);
    } else {
        // Verify the AST was actually modified (removal happened in AST)
        const commandCount = modifiedAST.filter(n => n.type === 'command' && n.name === 'greet').length;
        if (commandCount > 0) {
            // The node wasn't actually removed from AST - test logic error
            console.log('\n❌ Test 15 FAILED. Showing AST and code for debugging:');
            console.log('\nModified AST:');
            console.log(JSON.stringify(modifiedAST.map(n => ({ type: n.type, name: n.name })), null, 2));
            console.log('\nGenerated code:');
            console.log(updatedCode);
            throw new Error('Test 15 FAILED: Function call was not removed from AST');
        } else {
            // AST was modified (node removed) but code generation didn't reflect it
            // This is a CRITICAL BUG in the code generator - it doesn't handle deletions
            // The code generator only creates patches for existing nodes, not deletions
            console.log('\n❌ Test 15 FAILED. Showing AST and code for debugging:');
            console.log('\nModified AST (greet command should be removed):');
            console.log(JSON.stringify(modifiedAST.map(n => ({ type: n.type, name: n.name })), null, 2));
            console.log('\nGenerated code (greet "Alice" should not appear):');
            console.log(updatedCode);
            throw new Error('Test 15 FAILED: Function call was removed from AST but still appears in generated code - AST->code conversion is not exact. This is a bug in the code generator that needs to be fixed.');
        }
    }
    
    // Test 16: Update multiline function call arguments and verify syntaxType preservation
    console.log('\n--- Test 16: Update Multiline Function Call ---\n');
    
    const multilineUpdateScript = `
def fn $a $b
  string.concat $a $b
enddef

fn(
  "1"
  "2"
)
`;
    
    console.log('Code before update:');
    console.log(multilineUpdateScript);
    console.log('');
    
    const multilineUpdateAST = await testRp.getAST(multilineUpdateScript);
    const multilineUpdateModified = JSON.parse(JSON.stringify(multilineUpdateAST));
    
    // Find the multiline call
    const multilineCallToUpdate = multilineUpdateModified.find(node => 
        node.type === 'command' && 
        node.name === 'fn' &&
        node.syntaxType === 'multiline-parentheses'
    );
    
    if (!multilineCallToUpdate) {
        throw new Error('Test 16 FAILED: Could not find multiline function call');
    }
    
    // Verify syntaxType is set
    if (multilineCallToUpdate.syntaxType !== 'multiline-parentheses') {
        throw new Error(`Test 16 FAILED: Expected syntaxType 'multiline-parentheses', got '${multilineCallToUpdate.syntaxType}'`);
    }
    
    // Update both arguments
    if (multilineCallToUpdate.args && multilineCallToUpdate.args.length >= 2) {
        if (multilineCallToUpdate.args[0].type === 'string') {
            multilineCallToUpdate.args[0].value = 'updated1';
        }
        if (multilineCallToUpdate.args[1].type === 'string') {
            multilineCallToUpdate.args[1].value = 'updated2';
        }
    }
    
    console.log('Test 16: Updated multiline function call arguments');
    
    const multilineUpdateCode = await testRp.updateCodeFromAST(multilineUpdateScript, multilineUpdateModified);
    
    // Verify the syntaxType is preserved (multiline format)
    const hasMultilineFormat = multilineUpdateCode.includes('fn(\n') || multilineUpdateCode.includes('fn(\r\n');
    const hasIndentedArgs = multilineUpdateCode.includes('  "updated1"') && multilineUpdateCode.includes('  "updated2"');
    const hasClosingParen = multilineUpdateCode.includes('\n)') || multilineUpdateCode.includes('\r\n)');
    
    if (hasMultilineFormat && hasIndentedArgs && hasClosingParen) {
        console.log(`✓ Test 16 PASSED - Multiline syntaxType preserved after update`);
        console.log('\nCode after update:');
        console.log(multilineUpdateCode);
    } else {
        console.log('\n❌ Test 16 FAILED. Showing AST and code for debugging:');
        console.log('\nModified AST:');
        console.log(JSON.stringify(multilineCallToUpdate, null, 2));
        console.log('\nGenerated code:');
        console.log(multilineUpdateCode);
        throw new Error('Test 16 FAILED: Multiline syntaxType was not preserved after updating arguments');
    }
    
    // Test 17: Update named parameters function call and verify syntaxType preservation
    console.log('\n--- Test 17: Update Named Parameters Function Call ---\n');
    
    const namedUpdateScript = `
def fn $a $b
  string.concat $a $b
enddef

fn($a="a" $b="b")
`;
    
    console.log('Code before update:');
    console.log(namedUpdateScript);
    console.log('');
    
    const namedUpdateAST = await testRp.getAST(namedUpdateScript);
    const namedUpdateModified = JSON.parse(JSON.stringify(namedUpdateAST));
    
    // Find the named params call
    const namedCallToUpdate = namedUpdateModified.find(node => 
        node.type === 'command' && 
        node.name === 'fn' &&
        node.syntaxType === 'named-parentheses'
    );
    
    if (!namedCallToUpdate) {
        throw new Error('Test 17 FAILED: Could not find named parameters function call');
    }
    
    // Verify syntaxType is set
    if (namedCallToUpdate.syntaxType !== 'named-parentheses') {
        throw new Error(`Test 17 FAILED: Expected syntaxType 'named-parentheses', got '${namedCallToUpdate.syntaxType}'`);
    }
    
    // Update both named argument values
    const namedArgsNode = namedCallToUpdate.args.find(arg => arg && arg.type === 'namedArgs');
    if (namedArgsNode && namedArgsNode.args) {
        if (namedArgsNode.args.a && namedArgsNode.args.a.type === 'string') {
            namedArgsNode.args.a.value = 'updated_a';
        }
        if (namedArgsNode.args.b && namedArgsNode.args.b.type === 'string') {
            namedArgsNode.args.b.value = 'updated_b';
        }
    }
    
    console.log('Test 17: Updated named parameters function call arguments');
    
    const namedUpdateCode = await testRp.updateCodeFromAST(namedUpdateScript, namedUpdateModified);
    
    // Verify the syntaxType is preserved (named params format)
    // Check that it uses named-parentheses format: fn($a=... $b=...)
    const hasNamedFormat = namedUpdateCode.includes('fn($a=') || namedUpdateCode.includes('fn($b=');
    const hasUpdatedA = namedUpdateCode.includes('$a="updated_a"') || namedUpdateCode.includes('$a=\\"updated_a\\"');
    const hasUpdatedB = namedUpdateCode.includes('$b="updated_b"') || namedUpdateCode.includes('$b=\\"updated_b\\"');
    const hasParentheses = namedUpdateCode.includes('fn(') && namedUpdateCode.includes(')');
    
    if (hasNamedFormat && hasUpdatedA && hasUpdatedB && hasParentheses) {
        console.log(`✓ Test 17 PASSED - Named parameters syntaxType preserved after update`);
        console.log('\nCode after update:');
        console.log(namedUpdateCode);
    } else {
        console.log('\n❌ Test 17 FAILED. Showing AST and code for debugging:');
        console.log('\nModified AST:');
        console.log(JSON.stringify(namedCallToUpdate, null, 2));
        console.log('\nGenerated code:');
        console.log(namedUpdateCode);
        throw new Error('Test 17 FAILED: Named parameters syntaxType was not preserved after updating arguments');
    }
    
    // Test 18: Update multiline named parameters function call
    console.log('\n--- Test 18: Update Multiline Named Parameters Function Call ---\n');
    
    const multilineNamedScript = `
def fn $a $b
  string.concat $a $b
enddef

fn(
 $a="a" 
 $b="b"
)
`;
    
    console.log('Code before update:');
    console.log(multilineNamedScript);
    console.log('');
    
    const multilineNamedAST = await testRp.getAST(multilineNamedScript);
    const multilineNamedModified = JSON.parse(JSON.stringify(multilineNamedAST));
    
    // Find the multiline named params call
    const multilineNamedCall = multilineNamedModified.find(node => 
        node.type === 'command' && 
        node.name === 'fn' &&
        node.syntaxType === 'multiline-parentheses'
    );
    
    if (!multilineNamedCall) {
        throw new Error('Test 18 FAILED: Could not find multiline named parameters function call');
    }
    
    // Verify syntaxType is set
    if (multilineNamedCall.syntaxType !== 'multiline-parentheses') {
        throw new Error(`Test 18 FAILED: Expected syntaxType 'multiline-parentheses', got '${multilineNamedCall.syntaxType}'`);
    }
    
    // Verify it has named arguments
    const multilineNamedArgs = multilineNamedCall.args.find(arg => arg && arg.type === 'namedArgs');
    if (!multilineNamedArgs || !multilineNamedArgs.args) {
        throw new Error('Test 18 FAILED: Named arguments not found in multiline function call');
    }
    
    // Update both named argument values
    if (multilineNamedArgs.args.a && multilineNamedArgs.args.a.type === 'string') {
        multilineNamedArgs.args.a.value = 'updated_a';
    }
    if (multilineNamedArgs.args.b && multilineNamedArgs.args.b.type === 'string') {
        multilineNamedArgs.args.b.value = 'updated_b';
    }
    
    console.log('Test 18: Updated multiline named parameters function call arguments');
    
    const multilineNamedCode = await testRp.updateCodeFromAST(multilineNamedScript, multilineNamedModified);
    
    // Verify the syntaxType is preserved (multiline format with named params)
    const hasMultilineNamedFormat = multilineNamedCode.includes('fn(\n') || multilineNamedCode.includes('fn(\r\n');
    const hasMultilineNamedParams = multilineNamedCode.includes('$a=') && multilineNamedCode.includes('$b=');
    const hasMultilineUpdatedA = multilineNamedCode.includes('$a="updated_a"') || multilineNamedCode.includes('$a=\\"updated_a\\"');
    const hasMultilineUpdatedB = multilineNamedCode.includes('$b="updated_b"') || multilineNamedCode.includes('$b=\\"updated_b\\"');
    const hasMultilineIndented = multilineNamedCode.includes(' $a=') || multilineNamedCode.includes('  $a=');
    const hasMultilineClosing = multilineNamedCode.includes('\n)') || multilineNamedCode.includes('\r\n)');
    
    if (hasMultilineNamedFormat && hasMultilineNamedParams && hasMultilineUpdatedA && hasMultilineUpdatedB && hasMultilineIndented && hasMultilineClosing) {
        console.log(`✓ Test 18 PASSED - Multiline named parameters syntaxType preserved after update`);
        console.log('\nCode after update:');
        console.log(multilineNamedCode);
    } else {
        console.log('\n❌ Test 18 FAILED. Showing AST and code for debugging:');
        console.log('\nModified AST:');
        console.log(JSON.stringify(multilineNamedCall, null, 2));
        console.log('\nGenerated code:');
        console.log(multilineNamedCode);
        throw new Error('Test 18 FAILED: Multiline named parameters syntaxType was not preserved after updating arguments');
    }
    
    // Code after update - Always at the bottom, side by side with original code
    // This shows the final result from the main update script (Tests 12-15)
    console.log('\n' + '='.repeat(60));
    console.log('Code after update (from main update script - Tests 12-15):');
    console.log('='.repeat(60));
    console.log(updatedCode);
    
    console.log('\n' + '='.repeat(60));
    console.log('✓ All Functions AST tests PASSED');
    console.log('='.repeat(60));
}
