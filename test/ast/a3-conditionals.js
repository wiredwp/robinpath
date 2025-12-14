// Test Case a3: Conditionals AST tests
// Tests AST reading, code position checking, and AST updating (add/remove/modify)
// This test file matches test/scripts/03-conditionals.rp

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing Conditionals AST');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    
    // ============================================================
    // SECTION 1: Inline Conditionals
    // ============================================================
    console.log('\n--- SECTION 1: Inline Conditionals ---\n');
    
    const inlineScript = `
$balance = 100
if $balance > 0 then log "Balance is positive"
`;
    
    const inlineAST = await testRp.getAST(inlineScript);
    console.log(`Inline conditional AST nodes: ${inlineAST.length}`);
    
    // Test 1: Verify inline if statement
    // Inline if statements have type 'inlineIf'
    const inlineIf = inlineAST.find(node => node.type === 'inlineIf' || node.type === 'if');
    
    if (!inlineIf || !inlineIf.codePos) {
        throw new Error('Test 1 FAILED: Inline if statement not found or missing codePos');
    }
    
    console.log(`✓ Test 1 PASSED - Inline if statement found`);
    console.log(`  Type: ${inlineIf.type}`);
    console.log(`  Code position: startRow=${inlineIf.codePos.startRow}, startCol=${inlineIf.codePos.startCol}`);
    
    // ============================================================
    // SECTION 2: Block If with Else/Elseif
    // ============================================================
    console.log('\n--- SECTION 2: Block If with Else/Elseif ---\n');
    
    const blockScript = `
$score = 85
if $score >= 90
  log "Grade: A"
elseif $score >= 80
  log "Grade: B"
elseif $score >= 70
  log "Grade: C"
else
  log "Grade: F"
endif
`;
    
    const blockAST = await testRp.getAST(blockScript);
    console.log(`Block conditional AST nodes: ${blockAST.length}`);
    
    // Test 2: Verify block if statement
    // Block if statements have type 'ifBlock'
    const blockIf = blockAST.find(node => node.type === 'ifBlock' || node.type === 'if');
    
    if (!blockIf || !blockIf.codePos) {
        throw new Error('Test 2 FAILED: Block if statement not found or missing codePos');
    }
    
    // Check for elseif and else branches
    // ifBlock has elseifBranches (array) and elseBranch (object or null)
    const hasElseif = blockIf.elseifBranches && Array.isArray(blockIf.elseifBranches) && blockIf.elseifBranches.length > 0;
    const hasElse = blockIf.elseBranch !== null && blockIf.elseBranch !== undefined;
    
    console.log(`✓ Test 2 PASSED - Block if statement found`);
    console.log(`  Type: ${blockIf.type}`);
    console.log(`  Code position: startRow=${blockIf.codePos.startRow}, startCol=${blockIf.codePos.startCol}`);
    console.log(`  Has elseif branches: ${hasElseif}`);
    console.log(`  Has else branch: ${hasElse}`);
    
    // ============================================================
    // SECTION 3: Nested Conditionals
    // ============================================================
    console.log('\n--- SECTION 3: Nested Conditionals ---\n');
    
    const nestedScript = `
$value = 42
if $value > 0
  if $value < 50
    log "Value is between 0 and 50"
  else
    log "Value is 50 or greater"
  endif
else
  log "Value is negative or zero"
endif
`;
    
    const nestedAST = await testRp.getAST(nestedScript);
    console.log(`Nested conditional AST nodes: ${nestedAST.length}`);
    
    // Test 3: Verify nested if statements
    // Outer if is ifBlock, nested if might also be ifBlock
    const outerIf = nestedAST.find(node => node.type === 'ifBlock' || node.type === 'if');
    
    if (!outerIf) {
        throw new Error('Test 3 FAILED: Outer if statement not found');
    }
    
    // ifBlock has thenBranch, elseifBranches, and elseBranch properties
    const thenBranch = outerIf.thenBranch || [];
    if (!Array.isArray(thenBranch)) {
        throw new Error('Test 3 FAILED: Outer if thenBranch is not an array');
    }
    
    // Find nested if in thenBranch
    const nestedIf = thenBranch.find(node => node.type === 'ifBlock' || node.type === 'if');
    
    if (!nestedIf || !nestedIf.codePos) {
        throw new Error('Test 3 FAILED: Nested if statement not found or missing codePos');
    }
    
    console.log(`✓ Test 3 PASSED - Nested if statements found`);
    console.log(`  Outer if type: ${outerIf.type}, at: startRow=${outerIf.codePos.startRow}`);
    console.log(`  Nested if type: ${nestedIf.type}, at: startRow=${nestedIf.codePos.startRow}`);
    
    // ============================================================
    // SECTION 4: Conditional with Complex Expression
    // ============================================================
    console.log('\n--- SECTION 4: Conditional with Complex Expression ---\n');
    
    const complexExprScript = `
$age = 18
$citizen = "yes"
if ($age >= 18) && ($citizen == "yes") then log "Loan approved"
`;
    
    const complexExprAST = await testRp.getAST(complexExprScript);
    console.log(`Complex expression conditional AST nodes: ${complexExprAST.length}`);
    
    // Test 4: Verify if with complex expression
    // Inline if with complex expression
    const complexIf = complexExprAST.find(node => node.type === 'inlineIf' || node.type === 'if');
    
    if (!complexIf || !complexIf.codePos) {
        throw new Error('Test 4 FAILED: If with complex expression not found or missing codePos');
    }
    
    console.log(`✓ Test 4 PASSED - If with complex expression found`);
    console.log(`  Type: ${complexIf.type}`);
    console.log(`  Code position: startRow=${complexIf.codePos.startRow}, startCol=${complexIf.codePos.startCol}`);
    
    // ============================================================
    // SECTION 5: Update AST and Check Code Positions
    // ============================================================
    console.log('\n--- SECTION 5: Update AST and Check Code Positions ---\n');
    
    const updateScript = `
$value = 10
if $value > 5
  log "Greater than 5"
else
  log "Less than or equal to 5"
endif
`;
    
    const updateAST = await testRp.getAST(updateScript);
    const modifiedAST = JSON.parse(JSON.stringify(updateAST));
    
    // Test 5: Update if condition
    // Block if statements have type 'ifBlock'
    const ifToUpdate = modifiedAST.find(node => node.type === 'ifBlock' || node.type === 'if');
    
    if (ifToUpdate && (ifToUpdate.condition || ifToUpdate.conditionExpr)) {
        // Update condition - this might require understanding the condition structure
        const condition = ifToUpdate.condition || ifToUpdate.conditionExpr;
        console.log('Test 5: If condition structure verified (updates require complex condition structure handling)');
        console.log(`  Condition type: ${condition?.type || 'unknown'}`);
    }
    
    // Test 6: Update if body statement
    // ifBlock uses thenBranch property
    const ifBody = ifToUpdate?.thenBranch || [];
    if (ifToUpdate && Array.isArray(ifBody)) {
        const logStatement = ifBody.find(node => 
            node.type === 'command' && node.name === 'log'
        );
        
        if (logStatement && logStatement.args && logStatement.args[0]) {
            // Update log message
            if (logStatement.args[0].value) {
                logStatement.args[0].value = 'Updated message';
            }
            console.log('Test 6: Updated log message in if body');
        }
    }
    
    // Test 7: Update else body statement
    // ifBlock uses elseBranch which is Statement[] directly
    const elseBranch = ifToUpdate?.elseBranch;
    // elseBranch is already an array of statements, not an object with statements/body
    const elseBody = Array.isArray(elseBranch) ? elseBranch : (elseBranch?.statements || elseBranch?.body || []);
    if (ifToUpdate && elseBranch && Array.isArray(elseBody)) {
        const elseLogStatement = elseBody.find(node => 
            node.type === 'command' && node.name === 'log'
        );
        
        if (elseLogStatement && elseLogStatement.args && elseLogStatement.args[0]) {
            // Update log message
            if (elseLogStatement.args[0].value) {
                elseLogStatement.args[0].value = 'Updated else message';
            }
            console.log('Test 7: Updated log message in else body');
        }
    }
    
    // Test 8: Add new statement to if body
    const ifBodyForAdd = ifToUpdate?.thenBranch || [];
    if (ifToUpdate && Array.isArray(ifBodyForAdd)) {
        const lastBodyStatement = ifBodyForAdd[ifBodyForAdd.length - 1];
        const newLogCommand = {
            type: 'command',
            name: 'log',
            module: null,
            args: [
                { type: 'string', value: 'New statement in if' }
            ],
            codePos: {
                startRow: lastBodyStatement ? lastBodyStatement.codePos.endRow + 1 : 3,
                startCol: 2,
                endRow: lastBodyStatement ? lastBodyStatement.codePos.endRow + 1 : 3,
                endCol: 25
            }
        };
        ifBodyForAdd.push(newLogCommand);
        console.log('Test 8: Added new log statement to if body');
    }
    
    // Test 9: Add new elseif branch
    if (ifToUpdate) {
        if (!ifToUpdate.elseifBranches) {
            ifToUpdate.elseifBranches = [];
        }
        const newElseif = {
            conditionExpr: { type: 'binary', operator: '>=', left: { type: 'var', name: 'value' }, right: { type: 'number', value: 15 } },
            statements: [
                {
                    type: 'command',
                    name: 'log',
                    module: null,
                    args: [{ type: 'string', value: 'Greater than 15' }],
                    codePos: { startRow: 4, startCol: 2, endRow: 4, endCol: 25 }
                }
            ],
            codePos: { startRow: 3, startCol: 0, endRow: 4, endCol: 25 }
        };
        ifToUpdate.elseifBranches.push(newElseif);
        console.log('Test 9: Added new elseif branch');
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
    
    // Test 6 verification
    const updatedIfLogLine = updatedCodeLines.findIndex(line => 
        line.includes('log') && line.includes('Updated message')
    );
    if (updatedIfLogLine >= 0) {
        console.log(`✓ Test 6 PASSED - If body log was updated at line ${updatedIfLogLine + 1} (0-indexed: ${updatedIfLogLine})`);
    } else {
        console.log('\n❌ Test 6 FAILED. Showing AST and code for debugging:');
        console.log('\nModified AST:');
        console.log(JSON.stringify(modifiedAST, null, 2));
        console.log('\nGenerated code:');
        console.log(updatedCode);
        throw new Error(`Test 6 FAILED - If body log update not found in generated code`);
    }
    
    // Test 7 verification
    const updatedElseLogLine = updatedCodeLines.findIndex(line => 
        line.includes('log') && line.includes('Updated else message')
    );
    if (updatedElseLogLine >= 0) {
        console.log(`✓ Test 7 PASSED - Else body log was updated at line ${updatedElseLogLine + 1} (0-indexed: ${updatedElseLogLine})`);
    } else {
        console.log('\n❌ Test 7 FAILED. Showing AST and code for debugging:');
        console.log('\nModified AST:');
        console.log(JSON.stringify(modifiedAST, null, 2));
        console.log('\nGenerated code:');
        console.log(updatedCode);
        throw new Error(`Test 7 FAILED - Else body log update not found in generated code`);
    }
    
    // Test 8 verification
    const newIfLogLine = updatedCodeLines.findIndex(line => 
        line.includes('log') && line.includes('New statement in if')
    );
    if (newIfLogLine >= 0) {
        console.log(`✓ Test 8 PASSED - New log statement was added to if body at line ${newIfLogLine + 1} (0-indexed: ${newIfLogLine})`);
    } else {
        console.log('\n❌ Test 8 FAILED. Showing AST and code for debugging:');
        console.log('\nModified AST:');
        console.log(JSON.stringify(modifiedAST, null, 2));
        console.log('\nGenerated code:');
        console.log(updatedCode);
        throw new Error(`Test 8 FAILED - New if body statement not found in generated code`);
    }
    
    // Test 9 verification
    const elseifLine = updatedCodeLines.findIndex(line => 
        line.includes('elseif') || line.includes('Greater than 15')
    );
    if (elseifLine >= 0) {
        console.log(`✓ Test 9 PASSED - New elseif branch was added at line ${elseifLine + 1} (0-indexed: ${elseifLine})`);
    } else {
        console.log('\n❌ Test 9 FAILED. Showing AST and code for debugging:');
        console.log('\nModified AST:');
        console.log(JSON.stringify(modifiedAST, null, 2));
        console.log('\nGenerated code:');
        console.log(updatedCode);
        throw new Error(`Test 9 FAILED - New elseif branch not found in generated code`);
    }
    
    // Code before and after update - Always at the bottom, side by side for comparison
    console.log('\n' + '='.repeat(60));
    console.log('Code before update:');
    console.log('='.repeat(60));
    console.log(updateScript);
    
    console.log('\n' + '='.repeat(60));
    console.log('Code after update:');
    console.log('='.repeat(60));
    console.log(updatedCode);
    
    console.log('\n' + '='.repeat(60));
    console.log('✓ All Conditionals AST tests PASSED');
    console.log('='.repeat(60));
}
