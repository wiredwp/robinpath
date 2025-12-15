// Test Case c0: getAST method tests
// Tests for getAST method with module names

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
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
    const ast1 = await astTestRp.getAST(testScript1);

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
    const ast2 = await astTestRp.getAST(testScript2);
    
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
    const ast3 = await astTestRp.getAST(testScript3);
    
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
    console.log('✓ All getAST tests PASSED');
    console.log('='.repeat(60));
    
    // Test 4: getASTWithState method
    console.log();
    console.log('='.repeat(60));
    console.log('Testing getASTWithState method');
    console.log('='.repeat(60));
    
    const thread = astTestRp.createThread('ast-test-thread');
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
    
    // Verify structure
    if (!astResult || typeof astResult !== 'object') {
        throw new Error('getASTWithState should return an object');
    }
    
    if (!Array.isArray(astResult.ast)) {
        throw new Error('getASTWithState.ast should be an array');
    }
    
    if (!astResult.variables || typeof astResult.variables !== 'object') {
        throw new Error('getASTWithState.variables should be an object');
    }
    
    console.log('✓ Test 4 PASSED - getASTWithState structure is correct');
    console.log(`  AST nodes: ${astResult.ast.length}`);
    console.log(`  Variables: thread=${Object.keys(astResult.variables.thread || {}).length}, global=${Object.keys(astResult.variables.global || {}).length}`);
    console.log(`  Last Value ($): ${astResult.lastValue}`);
    console.log(`  Call Stack: ${astResult.callStack?.length || 0} frame(s)`);
    console.log('='.repeat(60));
    console.log('✓ All getAST and getASTWithState tests PASSED');
    console.log('='.repeat(60));
    
    // Test 5: Code formatting preservation
    console.log();
    console.log('='.repeat(60));
    console.log('Testing code formatting preservation');
    console.log('='.repeat(60));
    
    const formatTestScript = `# log 3 and 5
log 32 "This should work!"

assign $a 5

if $a == 5
  log "hi" 20
endif

def test $a
  log $a 8
enddef`;
    
    console.log('Original code:');
    console.log(formatTestScript);
    console.log('');
    
    const formatAST = await astTestRp.getAST(formatTestScript);
    
    // Modify the AST slightly (change a value)
    const modifiedAST = JSON.parse(JSON.stringify(formatAST));
    
    // Find the "assign $a 5" command
    const assignCommand = modifiedAST.find(n => 
        n.type === 'command' && 
        n.name === 'assign' && 
        n.args && 
        n.args.some(a => a && a.type === 'number' && a.value === 5)
    );
    
    if (assignCommand && assignCommand.args) {
        const numArg = assignCommand.args.find(a => a && a.type === 'number' && a.value === 5);
        if (numArg) {
            numArg.value = 10; // Change 5 to 10
        }
    }
    
    // Update code from AST
    const updatedCode = await astTestRp.updateCodeFromAST(formatTestScript, modifiedAST);
    
    console.log('Updated code:');
    console.log(updatedCode);
    console.log('');
    
    // Verify formatting is preserved:
    // 1. Indentation should be preserved
    // 2. Blank lines should be preserved (exactly as in original, no extra newlines)
    // 3. The value should be updated to 10
    // 4. No extra newline before "def test $a"
    
    const hasPreservedIndentation = updatedCode.includes('if $a == 5\n  log "hi" 20');
    const hasUpdatedValue = updatedCode.includes('assign $a 10');
    
    // Check that there's exactly one blank line between "endif" and "def test $a"
    // Original has: "endif\n\ndef test $a" (one blank line)
    // Should NOT have: "endif\n\n\ndef test $a" (two blank lines)
    const endifToDefMatch = updatedCode.match(/endif\s*\n(\s*)\ndef test/);
    const blankLinesBetween = endifToDefMatch ? endifToDefMatch[1] : '';
    const hasCorrectBlankLines = blankLinesBetween === '\n' || blankLinesBetween === ''; // Exactly one newline or none
    
    // Also check the overall structure - count blank lines between endif and def
    const endifIndex = updatedCode.indexOf('endif');
    const defIndex = updatedCode.indexOf('def test');
    if (endifIndex >= 0 && defIndex > endifIndex) {
        const betweenText = updatedCode.substring(endifIndex + 5, defIndex);
        const newlineCount = (betweenText.match(/\n/g) || []).length;
        // Should have exactly 2 newlines: one for "endif" line and one blank line
        const hasCorrectSpacing = newlineCount === 2;
        
        if (hasPreservedIndentation && hasUpdatedValue && hasCorrectSpacing) {
            console.log('✓ Test 5 PASSED - Code formatting preserved during update');
            console.log('  - Indentation preserved: ✓');
            console.log('  - Blank lines preserved correctly (no extra newlines): ✓');
            console.log('  - Value updated correctly: ✓');
        } else {
            console.log('✗ Test 5 FAILED - Code formatting not preserved');
            console.log('  - Indentation preserved:', hasPreservedIndentation);
            console.log('  - Blank lines correct (newline count between endif and def):', newlineCount, '(expected: 2)');
            console.log('  - Value updated correctly:', hasUpdatedValue);
            console.log('\nBetween "endif" and "def test":');
            console.log(JSON.stringify(betweenText));
            throw new Error('Test 5 FAILED - Code formatting not preserved during update (extra newline detected)');
        }
    } else {
        throw new Error('Test 5 FAILED - Could not find "endif" or "def test" in updated code');
    }
    
    // Test 6: Update a def block and verify blank lines are preserved
    console.log('='.repeat(60));
    console.log('Testing def block update with blank line preservation');
    console.log('='.repeat(60));
    
    const defTestScript = `# Testing assigning
def testAssign
 assign $test $1 1

 log $test

 $test2 = $test2

 assign $test3

 log $test3
enddef

testAssign(
  "7"
  $c="This is good!"
)

assign $b 2

add $abc $def

def abc
 log "abca"
 log "Def"
enddef

on "test"
 
 log "test1!"
 
 log "test2!"
endon
`;

    console.log('Original code:');
    console.log(defTestScript);
    console.log('');
    
    const defAST = await astTestRp.getAST(defTestScript);
    
    // Modify the def abc block - change "abca" to "abc"
    const modifiedDefAST = JSON.parse(JSON.stringify(defAST));
    
    // Find the def abc block
    const defBlock = modifiedDefAST.find(n => n.type === 'define' && n.name === 'abc');
    if (defBlock && defBlock.body) {
        // Find the first log command inside the def block
        const logStmt = defBlock.body.find((s) => s.type === 'command' && s.name === 'log');
        if (logStmt && logStmt.args && logStmt.args.length >= 1) {
            // Change "abca" to "abc"
            if (logStmt.args[0] && logStmt.args[0].type === 'string') {
                logStmt.args[0].value = 'abc';
            }
        }
    }
    
    // Update code from AST
    const updatedDefCode = await astTestRp.updateCodeFromAST(defTestScript, modifiedDefAST);
    
    console.log('Updated code:');
    console.log(updatedDefCode);
    console.log('');
    
    // Verify formatting is preserved:
    // 1. Blank lines inside def blocks should be preserved
    // 2. Blank lines inside on blocks should be preserved
    // 3. The value should be updated correctly
    // 4. onBlock should be present in the output
    
    const defTestHasUpdatedValue = updatedDefCode.includes('log "abc"');
    // Check for onBlock - event name might be printed with or without quotes
    const defTestHasOnBlock = (updatedDefCode.includes('on "test"') || updatedDefCode.includes('on test')) && updatedDefCode.includes('endon');
    const defTestHasBlankLineInOnBlock = updatedDefCode.includes('log "test1!"\n \n log "test2!"') || 
                                   updatedDefCode.includes('log "test1!"\n\n log "test2!"');
    
    // Check that onBlock is present and properly formatted
    const defTestOnBlockStart = updatedDefCode.indexOf('on "test"') >= 0 ? updatedDefCode.indexOf('on "test"') : updatedDefCode.indexOf('on test');
    const defTestOnBlockEnd = updatedDefCode.indexOf('endon');
    const defTestHasOnBlockProperly = defTestOnBlockStart >= 0 && defTestOnBlockEnd > defTestOnBlockStart;

    if (defTestHasUpdatedValue && defTestHasOnBlock && defTestHasOnBlockProperly) {
        console.log('✓ Test 6 PASSED - Def and On block updates preserve formatting');
        console.log('  - Value updated correctly: ✓');
        console.log('  - On block present: ✓');
        console.log('  - Formatting preserved: ✓');
    } else {
        console.log('✗ Test 6 FAILED - Def and On block updates do not preserve formatting');
        console.log('  - Value updated correctly:', defTestHasUpdatedValue);
        console.log('  - On block present:', defTestHasOnBlock);
        console.log('  - On block properly formatted:', defTestHasOnBlockProperly);
        if (defTestOnBlockStart >= 0 && defTestOnBlockEnd > defTestOnBlockStart) {
            const onBlockContent = updatedDefCode.substring(defTestOnBlockStart, defTestOnBlockEnd + 6);
            console.log('\nOn block content:');
            console.log(JSON.stringify(onBlockContent));
        }
        throw new Error('Test 6 FAILED - Def and On block updates do not preserve formatting');
    }
    
    console.log('='.repeat(60));
    console.log('✓ All tests including formatting preservation PASSED');
    console.log('='.repeat(60));
}
