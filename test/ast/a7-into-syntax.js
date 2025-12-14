// Test Case a7: Into Syntax AST tests
// Tests AST reading, code position checking, and AST updating (add/remove/modify)
// This test file matches test/scripts/07-into-syntax.rp

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Into Syntax AST');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    
    // ============================================================
    // PART 1: Read AST and Check Code Positions
    // ============================================================
    console.log('\n--- PART 1: Read AST and Check Code Positions ---\n');
    
    // SECTION 1: Basic Command with Into
    console.log('\n--- SECTION 1: Basic Command with Into ---\n');
    
    const basicIntoScript = `
add 1 2 into $result1
math.add 10 20 into $result2
`;
    
    const basicIntoAST = await testRp.getAST(basicIntoScript);
    console.log(`Basic into AST nodes: ${basicIntoAST.length}`);
    
    // Test 1: Verify basic command with into
    const basicInto = basicIntoAST.find(node => 
        node.type === 'command' && 
        node.name === 'add' &&
        node.into
    );
    
    if (!basicInto || !basicInto.codePos) {
        throw new Error('Test 1 FAILED: Basic command with into not found or missing codePos');
    }
    
    if (!basicInto.into || !basicInto.into.targetName) {
        throw new Error('Test 1 FAILED: Command does not have into.targetName');
    }
    
    if (basicInto.into.targetName !== 'result1') {
        throw new Error(`Test 1 FAILED: Expected into.targetName 'result1', got '${basicInto.into.targetName}'`);
    }
    
    console.log(`✓ Test 1 PASSED - Basic command with into found`);
    console.log(`  Code position: startRow=${basicInto.codePos.startRow}, startCol=${basicInto.codePos.startCol}`);
    console.log(`  Into target: $${basicInto.into.targetName}`);
    
    // Test 2: Verify module function with into
    const moduleInto = basicIntoAST.find(node => 
        node.type === 'command' && 
        node.name === 'math.add' &&
        node.into
    );
    
    if (!moduleInto || !moduleInto.codePos) {
        throw new Error('Test 2 FAILED: Module function with into not found or missing codePos');
    }
    
    if (!moduleInto.into || moduleInto.into.targetName !== 'result2') {
        throw new Error(`Test 2 FAILED: Module function into.targetName is incorrect`);
    }
    
    console.log(`✓ Test 2 PASSED - Module function with into found`);
    console.log(`  Code position: startRow=${moduleInto.codePos.startRow}, startCol=${moduleInto.codePos.startCol}`);
    console.log(`  Into target: $${moduleInto.into.targetName}`);
    
    // SECTION 2: Do Block with Into
    console.log('\n--- SECTION 2: Do Block with Into ---\n');
    
    const doIntoScript = `
do into $result
  log "Inside do"
  math.add 20 30
enddo
`;
    
    const doIntoAST = await testRp.getAST(doIntoScript);
    console.log(`Do block with into AST nodes: ${doIntoAST.length}`);
    
    // Test 3: Verify do block with into
    const doInto = doIntoAST.find(node => node.type === 'do');
    
    if (!doInto || !doInto.codePos) {
        throw new Error('Test 3 FAILED: Do block with into not found or missing codePos');
    }
    
    if (!doInto.into || !doInto.into.targetName) {
        throw new Error('Test 3 FAILED: Do block does not have into.targetName');
    }
    
    if (doInto.into.targetName !== 'result') {
        throw new Error(`Test 3 FAILED: Expected into.targetName 'result', got '${doInto.into.targetName}'`);
    }
    
    console.log(`✓ Test 3 PASSED - Do block with into found`);
    console.log(`  Code position: startRow=${doInto.codePos.startRow}, startCol=${doInto.codePos.startCol}`);
    console.log(`  Into target: $${doInto.into.targetName}`);
    
    // SECTION 3: Do Block with Parameters and Into
    console.log('\n--- SECTION 3: Do Block with Parameters and Into ---\n');
    
    const doParamsIntoScript = `
do $a $b into $result
  math.add $a $b
enddo
`;
    
    const doParamsIntoAST = await testRp.getAST(doParamsIntoScript);
    console.log(`Do block with params and into AST nodes: ${doParamsIntoAST.length}`);
    
    // Test 4: Verify do block with parameters and into
    const doParamsInto = doParamsIntoAST.find(node => 
        node.type === 'do' &&
        node.paramNames &&
        node.paramNames.length === 2
    );
    
    if (!doParamsInto || !doParamsInto.codePos) {
        throw new Error('Test 4 FAILED: Do block with params and into not found or missing codePos');
    }
    
    if (!doParamsInto.into || doParamsInto.into.targetName !== 'result') {
        throw new Error('Test 4 FAILED: Do block with params does not have correct into.targetName');
    }
    
    if (doParamsInto.paramNames[0] !== 'a' || doParamsInto.paramNames[1] !== 'b') {
        throw new Error(`Test 4 FAILED: Do block parameters are incorrect`);
    }
    
    console.log(`✓ Test 4 PASSED - Do block with params and into found`);
    console.log(`  Code position: startRow=${doParamsInto.codePos.startRow}, startCol=${doParamsInto.codePos.startCol}`);
    console.log(`  Parameters: ${doParamsInto.paramNames.join(', ')}`);
    console.log(`  Into target: $${doParamsInto.into.targetName}`);
    
    // SECTION 4: Parenthesized Function Call with Into
    console.log('\n--- SECTION 4: Parenthesized Function Call with Into ---\n');
    
    const parenIntoScript = `
math.add(10 20) into $result
`;
    
    const parenIntoAST = await testRp.getAST(parenIntoScript);
    console.log(`Parenthesized call with into AST nodes: ${parenIntoAST.length}`);
    
    // Test 5: Verify parenthesized call with into
    const parenInto = parenIntoAST.find(node => 
        node.type === 'command' &&
        node.name === 'math.add' &&
        node.syntaxType === 'parentheses' &&
        node.into
    );
    
    if (!parenInto || !parenInto.codePos) {
        throw new Error('Test 5 FAILED: Parenthesized call with into not found or missing codePos');
    }
    
    if (!parenInto.into || parenInto.into.targetName !== 'result') {
        throw new Error('Test 5 FAILED: Parenthesized call does not have correct into.targetName');
    }
    
    if (parenInto.syntaxType !== 'parentheses') {
        throw new Error(`Test 5 FAILED: Expected syntaxType 'parentheses', got '${parenInto.syntaxType}'`);
    }
    
    console.log(`✓ Test 5 PASSED - Parenthesized call with into found`);
    console.log(`  Code position: startRow=${parenInto.codePos.startRow}, startCol=${parenInto.codePos.startCol}`);
    console.log(`  Syntax type: ${parenInto.syntaxType}`);
    console.log(`  Into target: $${parenInto.into.targetName}`);
    
    // SECTION 5: Multiline Parenthesized Call with Into
    console.log('\n--- SECTION 5: Multiline Parenthesized Call with Into ---\n');
    
    const multilineParenIntoScript = `
math.add(
  15
  25
) into $result
`;
    
    const multilineParenIntoAST = await testRp.getAST(multilineParenIntoScript);
    console.log(`Multiline parenthesized call with into AST nodes: ${multilineParenIntoAST.length}`);
    
    // Test 6: Verify multiline parenthesized call with into
    const multilineParenInto = multilineParenIntoAST.find(node => 
        node.type === 'command' &&
        node.name === 'math.add' &&
        node.syntaxType === 'multiline-parentheses' &&
        node.into
    );
    
    if (!multilineParenInto || !multilineParenInto.codePos) {
        throw new Error('Test 6 FAILED: Multiline parenthesized call with into not found or missing codePos');
    }
    
    if (!multilineParenInto.into || multilineParenInto.into.targetName !== 'result') {
        throw new Error('Test 6 FAILED: Multiline parenthesized call does not have correct into.targetName');
    }
    
    if (multilineParenInto.syntaxType !== 'multiline-parentheses') {
        throw new Error(`Test 6 FAILED: Expected syntaxType 'multiline-parentheses', got '${multilineParenInto.syntaxType}'`);
    }
    
    console.log(`✓ Test 6 PASSED - Multiline parenthesized call with into found`);
    console.log(`  Code position: startRow=${multilineParenInto.codePos.startRow}, startCol=${multilineParenInto.codePos.startCol}`);
    console.log(`  Syntax type: ${multilineParenInto.syntaxType}`);
    console.log(`  Into target: $${multilineParenInto.into.targetName}`);
    
    // SECTION 6: Named Parameters with Into
    console.log('\n--- SECTION 6: Named Parameters with Into ---\n');
    
    const namedIntoScript = `
def fn $a $b
  math.add $a $b
enddef

fn($a=10 $b=20) into $result
`;
    
    const namedIntoAST = await testRp.getAST(namedIntoScript);
    console.log(`Named params with into AST nodes: ${namedIntoAST.length}`);
    
    // Test 7: Verify named parameters call with into
    const namedInto = namedIntoAST.find(node => 
        node.type === 'command' &&
        node.name === 'fn' &&
        node.syntaxType === 'named-parentheses' &&
        node.into
    );
    
    if (!namedInto || !namedInto.codePos) {
        throw new Error('Test 7 FAILED: Named parameters call with into not found or missing codePos');
    }
    
    if (!namedInto.into || namedInto.into.targetName !== 'result') {
        throw new Error('Test 7 FAILED: Named parameters call does not have correct into.targetName');
    }
    
    if (namedInto.syntaxType !== 'named-parentheses') {
        throw new Error(`Test 7 FAILED: Expected syntaxType 'named-parentheses', got '${namedInto.syntaxType}'`);
    }
    
    console.log(`✓ Test 7 PASSED - Named parameters call with into found`);
    console.log(`  Code position: startRow=${namedInto.codePos.startRow}, startCol=${namedInto.codePos.startCol}`);
    console.log(`  Syntax type: ${namedInto.syntaxType}`);
    console.log(`  Into target: $${namedInto.into.targetName}`);
    
    // SECTION 7: Into with Attribute Path
    console.log('\n--- SECTION 7: Into with Attribute Path ---\n');
    
    const pathIntoScript = `
math.add 10 20 into $obj.result
`;
    
    const pathIntoAST = await testRp.getAST(pathIntoScript);
    console.log(`Into with attribute path AST nodes: ${pathIntoAST.length}`);
    
    // Test 8: Verify into with attribute path
    const pathInto = pathIntoAST.find(node => 
        node.type === 'command' &&
        node.name === 'math.add' &&
        node.into
    );
    
    if (!pathInto || !pathInto.codePos) {
        throw new Error('Test 8 FAILED: Command with into and attribute path not found or missing codePos');
    }
    
    if (!pathInto.into || pathInto.into.targetName !== 'obj') {
        throw new Error('Test 8 FAILED: Command does not have correct into.targetName');
    }
    
    if (!pathInto.into.targetPath || pathInto.into.targetPath.length === 0) {
        throw new Error('Test 8 FAILED: Command does not have into.targetPath');
    }
    
    const firstPathSegment = pathInto.into.targetPath[0];
    if (!firstPathSegment || firstPathSegment.type !== 'property' || firstPathSegment.name !== 'result') {
        throw new Error('Test 8 FAILED: into.targetPath is incorrect');
    }
    
    console.log(`✓ Test 8 PASSED - Into with attribute path found`);
    console.log(`  Code position: startRow=${pathInto.codePos.startRow}, startCol=${pathInto.codePos.startCol}`);
    console.log(`  Into target: $${pathInto.into.targetName}.${firstPathSegment.name}`);
    
    // ============================================================
    // PART 2: Update AST and Check Code Positions
    // ============================================================
    console.log('\n--- PART 2: Update AST and Check Code Positions ---\n');
    
    const updateScript = `
add 1 2 into $result1
math.add 10 20 into $result2

do into $result3
  math.add 5 5
enddo

math.add(15 25) into $result4
`;
    
    // IMPORTANT: Always log code before update
    console.log('Code before update:');
    console.log(updateScript);
    console.log('');
    
    const updateAST = await testRp.getAST(updateScript);
    const modifiedAST = JSON.parse(JSON.stringify(updateAST));
    
    // Test 9: Update into target name
    const intoToUpdate = modifiedAST.find(node => 
        node.type === 'command' &&
        node.name === 'add' &&
        node.into &&
        node.into.targetName === 'result1'
    );
    
    if (!intoToUpdate || !intoToUpdate.into) {
        throw new Error('Test 9 FAILED: Could not find command with into to update');
    }
    
    intoToUpdate.into.targetName = 'updated_result';
    console.log('Test 9: Updated into target name from $result1 to $updated_result');
    
    // Test 10: Update do block into target
    const doIntoToUpdate = modifiedAST.find(node => 
        node.type === 'do' &&
        node.into &&
        node.into.targetName === 'result3'
    );
    
    if (!doIntoToUpdate || !doIntoToUpdate.into) {
        throw new Error('Test 10 FAILED: Could not find do block with into to update');
    }
    
    doIntoToUpdate.into.targetName = 'updated_do_result';
    console.log('Test 10: Updated do block into target from $result3 to $updated_do_result');
    
    // Test 11: Update into with attribute path
    const pathIntoToUpdate = modifiedAST.find(node => 
        node.type === 'command' &&
        node.name === 'math.add' &&
        node.into &&
        node.into.targetName === 'result4'
    );
    
    if (!pathIntoToUpdate || !pathIntoToUpdate.into) {
        throw new Error('Test 11 FAILED: Could not find command with into to add path');
    }
    
    // Add attribute path
    pathIntoToUpdate.into.targetPath = [
        { type: 'property', name: 'value' }
    ];
    console.log('Test 11: Added attribute path to into target ($result4.value)');
    
    // Test 12: Add new command with into
    const originalScriptLines = updateScript.split('\n').length;
    const newCommandWithInto = {
        type: 'command',
        name: 'math.multiply',
        module: 'math',
        args: [
            { type: 'number', value: 3 },
            { type: 'number', value: 4 }
        ],
        into: {
            targetName: 'new_result',
            targetPath: []
        },
        codePos: {
            startRow: originalScriptLines,
            startCol: 0,
            endRow: originalScriptLines,
            endCol: 35
        },
        lastValue: null
    };
    
    modifiedAST.push(newCommandWithInto);
    console.log('Test 12: Added new command with into');
    
    // Test 13: Remove command with into
    const intoToRemove = modifiedAST.findIndex(node => 
        node.type === 'command' &&
        node.name === 'math.add' &&
        node.into &&
        node.into.targetName === 'result2'
    );
    
    if (intoToRemove < 0) {
        throw new Error('Test 13 FAILED: Could not find command with into to remove');
    }
    
    modifiedAST.splice(intoToRemove, 1);
    console.log('Test 13: Removed command with into ($result2)');
    
    // Generate updated code
    // IMPORTANT: updateCodeFromAST is async and must be awaited
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
    
    // Verify Test 9: Into target name updated
    const updatedInto = updatedCodeLines.findIndex(line => 
        line.includes('into $updated_result')
    );
    if (updatedInto >= 0) {
        console.log(`✓ Test 9 PASSED - Into target name updated at line ${updatedInto + 1}`);
    } else {
        console.log('\n❌ Test 9 FAILED. Showing AST and code for debugging:');
        console.log('\nModified AST:');
        console.log(JSON.stringify(intoToUpdate, null, 2));
        console.log('\nGenerated code:');
        console.log(updatedCode);
        throw new Error('Test 9 FAILED: Into target name was not updated in generated code');
    }
    
    // Verify Test 10: Do block into target updated
    const updatedDoInto = updatedCodeLines.findIndex(line => 
        line.includes('do into $updated_do_result')
    );
    if (updatedDoInto >= 0) {
        console.log(`✓ Test 10 PASSED - Do block into target updated at line ${updatedDoInto + 1}`);
    } else {
        console.log('\n❌ Test 10 FAILED. Showing AST and code for debugging:');
        console.log('\nModified AST:');
        console.log(JSON.stringify(doIntoToUpdate, null, 2));
        console.log('\nGenerated code:');
        console.log(updatedCode);
        throw new Error('Test 10 FAILED: Do block into target was not updated in generated code');
    }
    
    // Verify Test 11: Attribute path added
    const updatedPath = updatedCodeLines.findIndex(line => 
        line.includes('into $result4.value')
    );
    if (updatedPath >= 0) {
        console.log(`✓ Test 11 PASSED - Attribute path added at line ${updatedPath + 1}`);
    } else {
        console.log('\n❌ Test 11 FAILED. Showing AST and code for debugging:');
        console.log('\nModified AST:');
        console.log(JSON.stringify(pathIntoToUpdate, null, 2));
        console.log('\nGenerated code:');
        console.log(updatedCode);
        throw new Error('Test 11 FAILED: Attribute path was not added to generated code');
    }
    
    // Verify Test 12: New command with into added
    const newCommandLine = updatedCodeLines.findIndex(line => 
        line.includes('math.multiply') && line.includes('into $new_result')
    );
    if (newCommandLine >= 0) {
        console.log(`✓ Test 12 PASSED - New command with into added at line ${newCommandLine + 1}`);
    } else {
        console.log('\n❌ Test 12 FAILED. Showing AST and code for debugging:');
        console.log('\nModified AST:');
        console.log(JSON.stringify(newCommandWithInto, null, 2));
        console.log('\nGenerated code:');
        console.log(updatedCode);
        throw new Error('Test 12 FAILED: New command with into was not added to generated code');
    }
    
    // Verify Test 13: Command with into removed
    const removedInto = updatedCodeLines.findIndex(line => 
        line.includes('math.add') && line.includes('into $result2')
    );
    if (removedInto < 0) {
        console.log(`✓ Test 13 PASSED - Command with into removed from code`);
    } else {
        // Verify the AST was actually modified
        const commandCount = modifiedAST.filter(n => 
            n.type === 'command' && 
            n.name === 'math.add' && 
            n.into && 
            n.into.targetName === 'result2'
        ).length;
        if (commandCount > 0) {
            console.log('\n❌ Test 13 FAILED. Showing AST and code for debugging:');
            console.log('\nModified AST:');
            console.log(JSON.stringify(modifiedAST.map(n => ({ type: n.type, name: n.name, into: n.into })), null, 2));
            console.log('\nGenerated code:');
            console.log(updatedCode);
            throw new Error('Test 13 FAILED: Command with into was not removed from AST');
        } else {
            // AST was modified but code generation didn't reflect it - this is a critical error
            console.log('\n❌ Test 13 FAILED. Showing AST and code for debugging:');
            console.log('\nModified AST (command with into $result2 should be removed):');
            console.log(JSON.stringify(modifiedAST.map(n => ({ type: n.type, name: n.name, into: n.into })), null, 2));
            console.log('\nGenerated code (math.add ... into $result2 should not appear):');
            console.log(updatedCode);
            throw new Error('Test 13 FAILED: Command with into was removed from AST but still appears in generated code - AST->code conversion is not exact');
        }
    }
    
    // Test 14: Update multiline parenthesized call with into
    console.log('\n--- Test 14: Update Multiline Parenthesized Call with Into ---\n');
    
    const multilineIntoUpdateScript = `
math.add(
  10
  20
) into $result
`;
    
    console.log('Code before update:');
    console.log(multilineIntoUpdateScript);
    console.log('');
    
    const multilineIntoUpdateAST = await testRp.getAST(multilineIntoUpdateScript);
    const multilineIntoUpdateModified = JSON.parse(JSON.stringify(multilineIntoUpdateAST));
    
    // Find the multiline call with into
    const multilineIntoCall = multilineIntoUpdateModified.find(node => 
        node.type === 'command' &&
        node.name === 'math.add' &&
        node.syntaxType === 'multiline-parentheses' &&
        node.into
    );
    
    if (!multilineIntoCall) {
        throw new Error('Test 14 FAILED: Could not find multiline call with into');
    }
    
    // Update into target name
    multilineIntoCall.into.targetName = 'updated_multiline_result';
    console.log('Test 14: Updated multiline call into target name');
    
    const multilineIntoUpdateCode = await testRp.updateCodeFromAST(multilineIntoUpdateScript, multilineIntoUpdateModified);
    
    // Verify syntaxType and into are preserved
    const hasMultilineFormat = multilineIntoUpdateCode.includes('math.add(\n') || multilineIntoUpdateCode.includes('math.add(\r\n');
    const hasUpdatedTarget = multilineIntoUpdateCode.includes('into $updated_multiline_result');
    const hasClosingParen = multilineIntoUpdateCode.includes('\n)') || multilineIntoUpdateCode.includes('\r\n)');
    
    if (hasMultilineFormat && hasUpdatedTarget && hasClosingParen) {
        console.log(`✓ Test 14 PASSED - Multiline call with into syntaxType preserved after update`);
        console.log('\nCode after update:');
        console.log(multilineIntoUpdateCode);
    } else {
        console.log('\n❌ Test 14 FAILED. Showing AST and code for debugging:');
        console.log('\nModified AST:');
        console.log(JSON.stringify(multilineIntoCall, null, 2));
        console.log('\nGenerated code:');
        console.log(multilineIntoUpdateCode);
        throw new Error('Test 14 FAILED: Multiline call with into syntaxType was not preserved after update');
    }
    
    // Test 15: Update named parameters call with into
    console.log('\n--- Test 15: Update Named Parameters Call with Into ---\n');
    
    const namedIntoUpdateScript = `
def fn $a $b
  math.add $a $b
enddef

fn($a=10 $b=20) into $result
`;
    
    console.log('Code before update:');
    console.log(namedIntoUpdateScript);
    console.log('');
    
    const namedIntoUpdateAST = await testRp.getAST(namedIntoUpdateScript);
    const namedIntoUpdateModified = JSON.parse(JSON.stringify(namedIntoUpdateAST));
    
    // Find the named params call with into
    const namedIntoCall = namedIntoUpdateModified.find(node => 
        node.type === 'command' &&
        node.name === 'fn' &&
        node.syntaxType === 'named-parentheses' &&
        node.into
    );
    
    if (!namedIntoCall) {
        throw new Error('Test 15 FAILED: Could not find named params call with into');
    }
    
    // Update into target name
    namedIntoCall.into.targetName = 'updated_named_result';
    console.log('Test 15: Updated named params call into target name');
    
    const namedIntoUpdateCode = await testRp.updateCodeFromAST(namedIntoUpdateScript, namedIntoUpdateModified);
    
    // Verify syntaxType and into are preserved
    const hasNamedFormat = namedIntoUpdateCode.includes('fn($a=') || namedIntoUpdateCode.includes('fn($b=');
    const hasUpdatedNamedTarget = namedIntoUpdateCode.includes('into $updated_named_result');
    const hasParentheses = namedIntoUpdateCode.includes('fn(') && namedIntoUpdateCode.includes(')');
    
    if (hasNamedFormat && hasUpdatedNamedTarget && hasParentheses) {
        console.log(`✓ Test 15 PASSED - Named params call with into syntaxType preserved after update`);
        console.log('\nCode after update:');
        console.log(namedIntoUpdateCode);
    } else {
        console.log('\n❌ Test 15 FAILED. Showing AST and code for debugging:');
        console.log('\nModified AST:');
        console.log(JSON.stringify(namedIntoCall, null, 2));
        console.log('\nGenerated code:');
        console.log(namedIntoUpdateCode);
        throw new Error('Test 15 FAILED: Named params call with into syntaxType was not preserved after update');
    }
    
    // Test 16: Update do block with parameters and into
    console.log('\n--- Test 16: Update Do Block with Parameters and Into ---\n');
    
    const doParamsIntoUpdateScript = `
do $a $b into $result
  math.add $a $b
enddo
`;
    
    console.log('Code before update:');
    console.log(doParamsIntoUpdateScript);
    console.log('');
    
    const doParamsIntoUpdateAST = await testRp.getAST(doParamsIntoUpdateScript);
    const doParamsIntoUpdateModified = JSON.parse(JSON.stringify(doParamsIntoUpdateAST));
    
    // Find the do block with params and into
    const doParamsIntoCall = doParamsIntoUpdateModified.find(node => 
        node.type === 'do' &&
        node.paramNames &&
        node.paramNames.length === 2 &&
        node.into
    );
    
    if (!doParamsIntoCall) {
        throw new Error('Test 16 FAILED: Could not find do block with params and into');
    }
    
    // Update into target name
    doParamsIntoCall.into.targetName = 'updated_do_params_result';
    console.log('Test 16: Updated do block with params into target name');
    
    const doParamsIntoUpdateCode = await testRp.updateCodeFromAST(doParamsIntoUpdateScript, doParamsIntoUpdateModified);
    
    // Verify into is preserved
    const hasDoParamsInto = doParamsIntoUpdateCode.includes('do $a $b into $updated_do_params_result');
    
    if (hasDoParamsInto) {
        console.log(`✓ Test 16 PASSED - Do block with params and into preserved after update`);
        console.log('\nCode after update:');
        console.log(doParamsIntoUpdateCode);
    } else {
        console.log('\n❌ Test 16 FAILED. Showing AST and code for debugging:');
        console.log('\nModified AST:');
        console.log(JSON.stringify(doParamsIntoCall, null, 2));
        console.log('\nGenerated code:');
        console.log(doParamsIntoUpdateCode);
        throw new Error('Test 16 FAILED: Do block with params and into was not preserved after update');
    }
    
    // Code after update - Always at the bottom, side by side with original code
    console.log('\n' + '='.repeat(60));
    console.log('Code after update (from main update script - Tests 9-13):');
    console.log('='.repeat(60));
    console.log(updatedCode);
    
    console.log('\n' + '='.repeat(60));
    console.log('✓ All Into Syntax AST tests PASSED');
    console.log('='.repeat(60));
}
