// Test Case a6: Do Blocks AST tests
// Tests AST reading, code position checking, and AST updating (add/remove/modify)
// This test file matches test/scripts/06-do-blocks.robin

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Do Blocks AST');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    
    // ============================================================
    // PART 1: Read AST and Check Code Positions
    // ============================================================
    console.log('\n--- PART 1: Read AST and Check Code Positions ---\n');
    
    // SECTION 1: Basic Do Block
    console.log('\n--- SECTION 1: Basic Do Block ---\n');
    
    const basicDoScript = `
do
  log "Inside do block"
  math.add 5 10
enddo
`;
    
    const basicDoAST = await testRp.getAST(basicDoScript);
    console.log(`Basic do block AST nodes: ${basicDoAST.length}`);
    
    // Test 1: Verify basic do block
    const basicDo = basicDoAST.find(node => node.type === 'do');
    
    if (!basicDo || !basicDo.codePos) {
        throw new Error('Test 1 FAILED: Basic do block not found or missing codePos');
    }
    
    console.log(`✓ Test 1 PASSED - Basic do block found`);
    console.log(`  Code position: startRow=${basicDo.codePos.startRow}, startCol=${basicDo.codePos.startCol}`);
    console.log(`  Has body: ${basicDo.body && Array.isArray(basicDo.body)}`);
    console.log(`  Body statements: ${basicDo.body ? basicDo.body.length : 0}`);
    
    // Test 2: Verify do block body
    if (!basicDo.body || !Array.isArray(basicDo.body) || basicDo.body.length === 0) {
        throw new Error('Test 2 FAILED: Do block body is missing or empty');
    }
    
    const logCommand = basicDo.body.find(node => node.type === 'command' && node.name === 'log');
    if (!logCommand || !logCommand.codePos) {
        throw new Error('Test 2 FAILED: Log command in do block body not found or missing codePos');
    }
    
    console.log(`✓ Test 2 PASSED - Do block body found with ${basicDo.body.length} statement(s)`);
    console.log(`  Log command code position: startRow=${logCommand.codePos.startRow}, startCol=${logCommand.codePos.startCol}`);
    
    // SECTION 2: Do Block with Parameters
    console.log('\n--- SECTION 2: Do Block with Parameters ---\n');
    
    // Use exact format from test script (do $x $y)
    const paramDoScript = `do $x $y
  log "Parameters:" $x $y
  math.add $x $y
enddo
`;
    
    const paramDoAST = await testRp.getAST(paramDoScript);
    console.log(`Parameter do block AST nodes: ${paramDoAST.length}`);
    
    // Test 3: Verify do block with parameters
    const paramDo = paramDoAST.find(node => node.type === 'do');
    
    if (!paramDo || !paramDo.codePos) {
        throw new Error('Test 3 FAILED: Do block with parameters not found or missing codePos');
    }
    
    const hasParams = paramDo.paramNames && Array.isArray(paramDo.paramNames) && paramDo.paramNames.length === 2;
    
    if (!hasParams) {
        console.log('\n❌ Debug: Do block structure:');
        console.log(JSON.stringify(paramDo, null, 2));
        throw new Error(`Test 3 FAILED: Do block does not have paramNames array with 2 parameters. Got: ${JSON.stringify(paramDo.paramNames)}`);
    }
    
    console.log(`✓ Test 3 PASSED - Do block with parameters found`);
    console.log(`  Code position: startRow=${paramDo.codePos.startRow}, startCol=${paramDo.codePos.startCol}`);
    console.log(`  Parameters: ${paramDo.paramNames.join(', ')}`);
    
    // Test 4: Verify parameter names (check for x and y)
    if (paramDo.paramNames[0] !== 'x' || paramDo.paramNames[1] !== 'y') {
        throw new Error(`Test 4 FAILED: Do block parameters are incorrect. Expected ['x', 'y'], got [${paramDo.paramNames.join(', ')}]`);
    }
    
    console.log(`✓ Test 4 PASSED - Do block parameters are correct: ${paramDo.paramNames.join(', ')}`);
    
    // SECTION 3: Nested Do Blocks
    console.log('\n--- SECTION 3: Nested Do Blocks ---\n');
    
    const nestedDoScript = `
do $a
  log "Outer do"
  do $b
    log "Inner do"
  enddo
enddo
`;
    
    const nestedDoAST = await testRp.getAST(nestedDoScript);
    console.log(`Nested do block AST nodes: ${nestedDoAST.length}`);
    
    // Test 5: Verify outer do block
    const outerDo = nestedDoAST.find(node => node.type === 'do');
    
    if (!outerDo || !outerDo.codePos) {
        throw new Error('Test 5 FAILED: Outer do block not found or missing codePos');
    }
    
    // Test 6: Verify nested do block in body
    const innerDo = outerDo.body.find(node => node.type === 'do');
    
    if (!innerDo || !innerDo.codePos) {
        throw new Error('Test 6 FAILED: Nested do block not found or missing codePos');
    }
    
    console.log(`✓ Test 5 PASSED - Outer do block found`);
    console.log(`  Code position: startRow=${outerDo.codePos.startRow}, startCol=${outerDo.codePos.startCol}`);
    console.log(`✓ Test 6 PASSED - Nested do block found`);
    console.log(`  Code position: startRow=${innerDo.codePos.startRow}, startCol=${innerDo.codePos.startCol}`);
    console.log(`  Inner do parameters: ${innerDo.paramNames && innerDo.paramNames.length > 0 ? innerDo.paramNames.join(', ') : 'none'}`);
    
    // SECTION 4: Do Block with "into" Assignment
    console.log('\n--- SECTION 4: Do Block with "into" Assignment ---\n');
    
    const intoDoScript = `
do
  math.add 10 20
enddo into $result
`;
    
    const intoDoAST = await testRp.getAST(intoDoScript);
    console.log(`Do block with "into" AST nodes: ${intoDoAST.length}`);
    
    // Test 7: Verify do block with "into"
    const intoDo = intoDoAST.find(node => node.type === 'do');
    
    if (!intoDo || !intoDo.codePos) {
        throw new Error('Test 7 FAILED: Do block with "into" not found or missing codePos');
    }
    
    const hasInto = intoDo.into && intoDo.into.targetName;
    
    console.log(`✓ Test 7 PASSED - Do block with "into" found`);
    console.log(`  Code position: startRow=${intoDo.codePos.startRow}, startCol=${intoDo.codePos.startCol}`);
    console.log(`  Has "into" assignment: ${hasInto}`);
    if (hasInto) {
        console.log(`  Target variable: ${intoDo.into.targetName}`);
    }
    
    // ============================================================
    // PART 2: Update AST and Check Code Positions
    // ============================================================
    console.log('\n--- PART 2: Update AST and Check Code Positions ---\n');
    
    const updateScript = `
do
  log "Original message"
  math.add 5 5
enddo

do $x
  log "Parameter do"
enddo

do $y
  log "To be removed"
enddo
`;
    
    // IMPORTANT: Always log code before update
    console.log('Code before update:');
    console.log(updateScript);
    console.log('');
    
    const updateAST = await testRp.getAST(updateScript);
    const modifiedAST = JSON.parse(JSON.stringify(updateAST));
    
    // Test 8: Update do block body
    const doToUpdate = modifiedAST.find(node => 
        node.type === 'do' && 
        (!node.paramNames || node.paramNames.length === 0)
    );
    
    if (!doToUpdate || !doToUpdate.body || !Array.isArray(doToUpdate.body)) {
        throw new Error('Test 8 FAILED: Could not find do block to update');
    }
    
    // Update log message in body
    const logInBody = doToUpdate.body.find(node => node.type === 'command' && node.name === 'log');
    if (logInBody && logInBody.args && logInBody.args.length > 0 && logInBody.args[0].type === 'string') {
        logInBody.args[0].value = 'Updated message';
        console.log('Test 8: Updated log message in do block body');
    } else {
        throw new Error('Test 8 FAILED: Could not find log command in do block body to update');
    }
    
    // Test 9: Update do block parameters
    const paramDoToUpdate = modifiedAST.find(node => 
        node.type === 'do' && 
        node.paramNames && 
        node.paramNames.length === 1 &&
        node.paramNames[0] === 'x'
    );
    
    if (!paramDoToUpdate || !paramDoToUpdate.paramNames) {
        throw new Error('Test 9 FAILED: Could not find do block with parameters to update');
    }
    
    paramDoToUpdate.paramNames[0] = 'z';
    console.log('Test 9: Updated do block parameter from $x to $z');
    
    // Test 10: Add new do block
    // Note: For new nodes, codePos.startRow should be beyond the original script length
    const originalScriptLines = updateScript.split('\n').length;
    const newDoBlock = {
        type: 'do',
        paramNames: ['a', 'b'],
        body: [
            {
                type: 'command',
                name: 'math.add',
                module: 'math',
                args: [
                    { type: 'var', name: 'a' },
                    { type: 'var', name: 'b' }
                ],
                codePos: {
                    startRow: originalScriptLines + 1,
                    startCol: 2,
                    endRow: originalScriptLines + 1,
                    endCol: 15
                },
                lastValue: null
            }
        ],
        codePos: {
            startRow: originalScriptLines,
            startCol: 0,
            endRow: originalScriptLines + 2,
            endCol: 5
        },
        lastValue: null
    };
    
    // Test 11: Remove do block (do this BEFORE adding new block to avoid patch overlap issues)
    const doToRemove = modifiedAST.findIndex(node => 
        node.type === 'do' && 
        node.paramNames && 
        node.paramNames.length === 1 &&
        node.paramNames[0] === 'y'
    );
    
    if (doToRemove < 0) {
        throw new Error('Test 11 FAILED: Could not find do block to remove');
    }
    
    modifiedAST.splice(doToRemove, 1);
    console.log('Test 11: Removed do block with parameter $y');
    
    // Test 10: Add new do block (after removal to avoid patch overlap)
    modifiedAST.push(newDoBlock);
    console.log('Test 10: Added new do block with parameters $a $b');
    
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
    
    // Verify Test 8: Log message updated
    const updatedLog = updatedCodeLines.findIndex(line => 
        line.includes('log') && line.includes('Updated message')
    );
    if (updatedLog >= 0) {
        console.log(`✓ Test 8 PASSED - Log message updated at line ${updatedLog + 1}`);
    } else {
        console.log('\n❌ Test 8 FAILED. Showing AST and code for debugging:');
        console.log('\nModified AST:');
        console.log(JSON.stringify(doToUpdate, null, 2));
        console.log('\nGenerated code:');
        console.log(updatedCode);
        throw new Error('Test 8 FAILED: Log message was not updated in generated code');
    }
    
    // Verify Test 9: Parameter updated
    const paramZDo = updatedCodeLines.findIndex(line => 
        line.includes('do') && line.includes('$z')
    );
    if (paramZDo >= 0) {
        console.log(`✓ Test 9 PASSED - Do block parameter updated at line ${paramZDo + 1}`);
    } else {
        console.log('\n❌ Test 9 FAILED. Showing AST and code for debugging:');
        console.log('\nModified AST:');
        console.log(JSON.stringify(paramDoToUpdate, null, 2));
        console.log('\nGenerated code:');
        console.log(updatedCode);
        throw new Error('Test 9 FAILED: Do block parameter was not updated in generated code');
    }
    
    // Verify Test 10: New do block added
    // Parameters must have $ prefix in generated code
    // Check for both complete "do $a $b" and incomplete "o $a $b" (to detect bug)
    const newDoLine = updatedCodeLines.findIndex(line => 
        (line.includes('do') && line.includes('$a') && line.includes('$b')) ||
        (line.includes('$a') && line.includes('$b') && line.trim().startsWith('o'))
    );
    if (newDoLine >= 0) {
        // Verify both parameters are present with $ prefix and 'do' keyword is complete
        const doLine = updatedCodeLines[newDoLine];
        const hasA = doLine.includes('$a');
        const hasB = doLine.includes('$b');
        const hasCompleteDo = doLine.trim().startsWith('do');
        const hasIncompleteDo = doLine.trim().startsWith('o') && !doLine.includes('do');
        const hasBody = updatedCodeLines.slice(newDoLine).some((line, idx) => 
            idx > 0 && idx < 5 && line.includes('math.add')
        );
        
        if (hasIncompleteDo) {
            // This is a bug - first character 'd' is missing
            console.log('\n❌ Test 10 FAILED. Showing AST and code for debugging:');
            console.log('\nModified AST:');
            console.log(JSON.stringify(newDoBlock, null, 2));
            console.log('\nGenerated code:');
            console.log(updatedCode);
            throw new Error('Test 10 FAILED: New do block was added but "do" keyword is incomplete (first character "d" missing) - code generation bug that must be fixed');
        }
        
        if (hasA && hasB && hasCompleteDo && hasBody) {
            console.log(`✓ Test 10 PASSED - New do block added at line ${newDoLine + 1}`);
        } else {
            console.log('\n❌ Test 10 FAILED. Showing AST and code for debugging:');
            console.log('\nModified AST:');
            console.log(JSON.stringify(newDoBlock, null, 2));
            console.log('\nGenerated code:');
            console.log(updatedCode);
            throw new Error('Test 10 FAILED: New do block was added but structure is incorrect (missing $a/$b params, complete "do" keyword, or body)');
        }
    } else {
        console.log('\n❌ Test 10 FAILED. Showing AST and code for debugging:');
        console.log('\nModified AST:');
        console.log(JSON.stringify(newDoBlock, null, 2));
        console.log('\nGenerated code:');
        console.log(updatedCode);
        throw new Error('Test 10 FAILED: New do block was not added to generated code');
    }
    
    // Verify Test 11: Do block removed
    const removedDo = updatedCodeLines.findIndex(line => 
        line.includes('do') && line.includes('$y') && !line.includes('$a') && !line.includes('$b')
    );
    if (removedDo < 0) {
        console.log(`✓ Test 11 PASSED - Do block removed from code`);
    } else {
        // Verify the AST was actually modified
        const doCount = modifiedAST.filter(n => n.type === 'do' && n.paramNames && n.paramNames.length === 1 && n.paramNames[0] === 'y').length;
        if (doCount > 0) {
            console.log('\n❌ Test 11 FAILED. Showing AST and code for debugging:');
            console.log('\nModified AST:');
            console.log(JSON.stringify(modifiedAST.map(n => ({ type: n.type, paramNames: n.paramNames })), null, 2));
            console.log('\nGenerated code:');
            console.log(updatedCode);
            throw new Error('Test 11 FAILED: Do block was not removed from AST');
        } else {
            // AST was modified but code generation didn't reflect it - this is a critical error
            console.log('\n❌ Test 11 FAILED. Showing AST and code for debugging:');
            console.log('\nModified AST (do block with $y should be removed):');
            console.log(JSON.stringify(modifiedAST.map(n => ({ type: n.type, paramNames: n.paramNames })), null, 2));
            console.log('\nGenerated code (do $y should not appear):');
            console.log(updatedCode);
            throw new Error('Test 11 FAILED: Do block was removed from AST but still appears in generated code - AST->code conversion is not exact');
        }
    }
    
    // Code after update - Always at the bottom, side by side with original code
    console.log('\n' + '='.repeat(60));
    console.log('Code after update:');
    console.log('='.repeat(60));
    console.log(updatedCode);
    
    console.log('\n' + '='.repeat(60));
    console.log('✓ All Do Blocks AST tests PASSED');
    console.log('='.repeat(60));
}
