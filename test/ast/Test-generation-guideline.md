# Test Generation Guideline

This document provides guidelines for creating AST (Abstract Syntax Tree) tests in the `test/ast/` directory.

## File Naming Convention

- **AST test files must match their corresponding script files in `test/scripts/`**
- Test files should be named with the pattern: `a{N}-{feature-name}.js` to match `{NN}-{feature-name}.robin`
- Examples:
  - `a1-variable-assignment.js` - Matches `01-variable-assignment.robin`
  - `a2-functions.js` - Would match `02-functions.robin` (if it existed)
  - `a3-control-flow.js` - Would match `03-control-flow.robin` (if it existed)
  
**Important**: All test cases for a given script file should be in a single AST test file. For example, all variable assignment tests (basic assignments, set commands, object/array assignments, shorthand, do blocks, etc.) should all be in `a1-variable-assignment.js` to match `01-variable-assignment.robin`.

## Test Structure

Each test file should follow this structure and include **all test cases** that match the corresponding script file. Organize tests into sections that correspond to the test sections in the original script file.

### 1. Read AST and Check Code Positions

**Purpose**: Verify that AST nodes are correctly parsed and have accurate code position information.

**What to test**:
- AST nodes are correctly identified
- Each node has a `codePos` property with:
  - `startRow` (0-indexed line number)
  - `startCol` (0-indexed column number)
  - `endRow` (0-indexed line number)
  - `endCol` (0-indexed column number)
- Code positions match the actual location in source code

**Example**:
```javascript
const assignment = initialAST.find(node => 
    node.type === 'assignment' && 
    node.variable === '$str'
);

if (!assignment || !assignment.codePos) {
    throw new Error('Assignment not found or missing codePos');
}

console.log(`Code position: startRow=${assignment.codePos.startRow}, startCol=${assignment.codePos.startCol}`);
```

### 2. Update AST and Check Code Positions

**Purpose**: Verify that AST modifications are correctly reflected in the generated code and positions are maintained.

**What to test**:
- **Update**: Modify existing AST nodes (change values, properties, etc.)
- **Add**: Add new AST nodes to the tree
- **Remove**: Remove AST nodes from the tree
- Verify updated code contains the changes
- Verify code positions are correct after updates

**IMPORTANT**: `updateCodeFromAST()` is **async** and must be awaited. Always use `await` when calling it.

**Example**:
```javascript
// Update
const nodeToUpdate = modifiedAST.find(node => node.variable === '$str');
nodeToUpdate.value.value = 'updated value';

// Add
const newNode = {
    type: 'assignment',
    variable: '$newVar',
    value: { type: 'string', value: 'new' },
    codePos: { startRow: 5, startCol: 0, endRow: 5, endCol: 15 }
};
modifiedAST.push(newNode);

// Remove
const indexToRemove = modifiedAST.findIndex(node => node.variable === '$oldVar');
modifiedAST.splice(indexToRemove, 1);

// Generate and verify
// CRITICAL: updateCodeFromAST is async - must use await
const updatedCode = await testRp.updateCodeFromAST(originalScript, modifiedAST);
// Check positions and content
```

## Test Categories

### Basic Operations
- Variable assignments (`$var = value`)
- Variable-to-variable assignments (`$var2 = $var1`)
- Shorthand assignments (`$var = $`)

### Complex Operations
- Object assignments (`$obj = { key: value }`)
- Array assignments (`$arr = [1, 2, 3]`)
- Nested assignments
- Assignments within blocks (`do...enddo`)

### Commands
- `set` command (with and without `as` keyword)
- `set` with object paths
- `set` with fallback values

## Verification Checklist

For each test, verify:

1. **AST Reading**:
   - [ ] Node is found in AST
   - [ ] Node has correct type
   - [ ] Node has `codePos` property
   - [ ] `codePos` values are correct (match source code)

2. **AST Updating**:
   - [ ] Update: Modified value appears in generated code
   - [ ] Update: Code position is correct after update
   - [ ] Add: New node appears in generated code
   - [ ] Add: Code position is correct for new node
   - [ ] Remove: Node is removed from generated code
   - [ ] Remove: No orphaned code remains

3. **Code Position Verification**:
   - [ ] Line numbers match (0-indexed)
   - [ ] Column numbers match (0-indexed)
   - [ ] Start and end positions are accurate
   - [ ] Positions are correct after modifications

## Example Test Template

```javascript
// Test Case a{N}: {Feature Name} AST tests

import { RobinPath } from '../../dist/index.js';

export async function runTest() {
    console.log('='.repeat(60));
    console.log('Testing {Feature Name} AST');
    console.log('='.repeat(60));
    
    const testRp = new RobinPath();
    const testScript = `
# Your test script here
`;
    
    // PART 1: Read AST and Check Code Positions
    console.log('\n--- PART 1: Read AST and Check Code Positions ---\n');
    
    const initialAST = await testRp.getAST(testScript);
    
    // Test 1: Find and verify node
    const node = initialAST.find(node => /* condition */);
    if (!node || !node.codePos) {
        throw new Error('Test 1 FAILED: Node not found or missing codePos');
    }
    console.log(`✓ Test 1 PASSED - Node found`);
    console.log(`  Code position: startRow=${node.codePos.startRow}, startCol=${node.codePos.startCol}`);
    
    // PART 2: Update AST and Check Code Positions
    console.log('\n--- PART 2: Update AST and Check Code Positions ---\n');
    
    const updateScript = `
# Your update test script here
`;
    
    // IMPORTANT: Always log code before update
    console.log('Code before update:');
    console.log(updateScript);
    console.log('');
    
    const updateAST = await testRp.getAST(updateScript);
    const modifiedAST = JSON.parse(JSON.stringify(updateAST));
    
    // Test 2: Update
    const nodeToUpdate = modifiedAST.find(node => /* condition */);
    if (nodeToUpdate) {
        // Modify node
        console.log('Test 2: Updated node');
    }
    
    // Test 3: Add
    const newNode = { /* new node structure */ };
    modifiedAST.push(newNode);
    console.log('Test 3: Added new node');
    
    // Test 4: Remove
    const indexToRemove = modifiedAST.findIndex(node => /* condition */);
    if (indexToRemove >= 0) {
        modifiedAST.splice(indexToRemove, 1);
        console.log('Test 4: Removed node');
    }
    
    // Generate updated code
    // IMPORTANT: updateCodeFromAST is async and must be awaited
    let updatedCode;
    try {
        updatedCode = await testRp.updateCodeFromAST(updateScript, modifiedAST);
    } catch (error) {
        throw new Error(`Code generation failed: ${error.message}`);
    }
    
    // Verify updates
    const updatedCodeLines = updatedCode.split('\n');
    
    // Verify Test 2
    const updatedLine = updatedCodeLines.findIndex(line => /* condition */);
    if (updatedLine >= 0) {
        console.log(`✓ Test 2 PASSED - Node updated at line ${updatedLine + 1}`);
    } else {
        throw new Error('Test 2 FAILED: Node was not updated in generated code');
    }
    
    // Verify Test 3
    const newLine = updatedCodeLines.findIndex(line => /* condition */);
    if (newLine >= 0) {
        console.log(`✓ Test 3 PASSED - Node added at line ${newLine + 1}`);
    } else {
        throw new Error('Test 3 FAILED: Node was not added to generated code');
    }
    
    // Verify Test 4
    const removedLine = updatedCodeLines.findIndex(line => /* condition */);
    if (removedLine < 0) {
        console.log(`✓ Test 4 PASSED - Node removed from code`);
    } else {
        throw new Error('Test 4 FAILED: Node was not removed from generated code');
    }
    
    // Code after update - Always at the bottom, side by side with original code
    console.log('\n' + '='.repeat(60));
    console.log('Code after update:');
    console.log('='.repeat(60));
    console.log(updatedCode);
    
    console.log('\n' + '='.repeat(60));
    console.log('✓ All {Feature Name} AST tests PASSED');
    console.log('='.repeat(60));
}
```

## Code Logging Pattern

**IMPORTANT**: When testing AST updates, always follow this pattern:

1. **Before Update**: Log the original code before making any AST modifications
   ```javascript
   console.log('Code before update:');
   console.log(updateScript);
   console.log('');
   ```

2. **After Update (Individual Tests)**: For each individual test that updates AST and generates code, log the generated code immediately after verification passes
   ```javascript
   if (verificationPasses) {
       console.log(`✓ Test N PASSED - Description`);
       console.log('\nCode after update:');
       console.log(updatedCode);
   } else {
       // Error handling with AST and code logging
   }
   ```

3. **After Update (Final Summary)**: Log the generated code **at the very bottom**, after all verifications are complete
   ```javascript
   // Code after update - Always at the bottom, side by side with original code
   // This shows the final result from the main update script
   console.log('\n' + '='.repeat(60));
   console.log('Code after update (from main update script):');
   console.log('='.repeat(60));
   console.log(updatedCode);
   ```

**CRITICAL PATTERN**: 
- **Every test that has "Code before update:" MUST also have "Code after update:"**
- For individual update tests (like Test 16, 17, 18), log the "after" code immediately after the test passes
- For the main update script (Tests 12-15), log the "after" code at the very end of the test function
- This ensures the original code (logged at the top) and the updated code (logged after verification) appear side by side in the console output for easy visual comparison

**Example Pattern**:
```javascript
// Test 16: Update multiline function call
console.log('Code before update:');
console.log(multilineUpdateScript);
console.log('');

// ... AST modifications ...

const multilineUpdateCode = await testRp.updateCodeFromAST(multilineUpdateScript, multilineUpdateModified);

// Verify
if (verificationPasses) {
    console.log(`✓ Test 16 PASSED - Multiline syntaxType preserved after update`);
    console.log('\nCode after update:');
    console.log(multilineUpdateCode);  // ← Always log after code here
} else {
    // Error handling
}
```

## Critical Requirement: Exact AST->Code Conversion

**CRITICAL**: AST->code conversion is a very serious operation. The generated code must be **exactly** what the AST represents. If the generated code does not match the AST, it is a **critical error** and must throw an error, not a warning.

**NEVER** use warnings or skip tests for AST->code conversion issues. These are bugs that must be fixed:

```javascript
// ❌ WRONG - Never use warnings or skip tests
if (updatedLine < 0) {
    console.log('⚠ Test failed - update may not be visible');
    // or
    console.log('⚠ Skipped - code generation limitation');
}

// ❌ WRONG - Never skip verification
console.log('⚠ Test skipped - parameter structure differs');

// ✅ CORRECT - Always throw errors
if (updatedLine < 0) {
    console.log('\n❌ Test FAILED. Showing AST and code for debugging:');
    console.log('\nModified AST:');
    console.log(JSON.stringify(modifiedAST, null, 2));
    console.log('\nGenerated code:');
    console.log(updatedCode);
    throw new Error('Test FAILED: Node was not updated in generated code - AST->code conversion is not exact');
}
```

**Key Principles:**
1. **Exact Match**: Generated code must exactly match what the AST represents
2. **No Warnings**: Never use warnings for AST->code conversion failures
3. **No Skipping**: Never skip tests or verifications for AST->code conversion
4. **Always Debug**: When failures occur, always log both AST and generated code for debugging
5. **Throw Errors**: All failures must throw errors to ensure tests properly fail

## Error Handling Pattern

**IMPORTANT**: When verification fails, always throw an error (not a warning):

```javascript
// ❌ WRONG - Don't use warnings
if (updatedLine < 0) {
    console.log('⚠ Test failed - update may not be visible');
}

// ✅ CORRECT - Throw errors
if (updatedLine < 0) {
    console.log('\n❌ Test FAILED. Showing AST and code for debugging:');
    console.log('\nModified AST:');
    console.log(JSON.stringify(modifiedAST, null, 2));
    console.log('\nGenerated code:');
    console.log(updatedCode);
    throw new Error('Test FAILED: Node was not updated in generated code');
}
```

**Exception**: Code generation failures should also throw errors, but **always log AST and code for debugging**:
```javascript
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
```

**IMPORTANT**: When verification fails, also log AST and code:
```javascript
if (verificationPasses) {
    console.log(`✓ Test PASSED`);
} else {
    console.log('\n❌ Test FAILED. Showing AST and code for debugging:');
    console.log('\nModified AST:');
    console.log(JSON.stringify(modifiedAST, null, 2));
    console.log('\nGenerated code:');
    console.log(updatedCode);
    throw new Error('Test FAILED: Verification failed');
}
```

## Best Practices

1. **Exact AST->Code Conversion**: The generated code must exactly match the AST. Never accept approximations or "close enough" results. This is a critical requirement.
2. **Async Code Generation**: `updateCodeFromAST()` is async and **must be awaited**. Always use `await` when calling it.
3. **Isolation**: Each test should be independent and not rely on other tests
4. **Clarity**: Use descriptive test names and console.log messages
5. **Verification**: Always verify both AST structure and generated code
6. **Positions**: Always check code positions, not just content
7. **Error Handling**: Always throw errors (not warnings) when tests fail - this ensures tests properly fail
8. **No Skipping**: Never skip tests or verifications. If AST->code conversion doesn't work, it's a bug that must be fixed.
9. **Code Logging**: 
   - Always log code before update (at the top, before AST modifications)
   - Always log code after update (at the very bottom, after all verifications)
   - This ensures original and updated code appear side by side in console output
10. **Error Debugging**: When errors occur (code generation failures or verification failures), always log both the modified AST and the generated code to help with debugging
11. **Coverage**: Test edge cases and various scenarios

## Running Tests

Tests in the `ast/` directory should be added to `test/run.js` in the `testCases` array:

```javascript
const testCases = [
    'c0-getAST.js',
    // ... other tests
    'ast/a1-variable-assignment.js',
    'ast/a2-functions.js',
    // ... more AST tests
];
```

Then run with:
```bash
npm run test -- a1
```

## Notes

- **Async Code Generation**: `updateCodeFromAST()` is async and **must be awaited**. Never call it without `await`.
- All line numbers in `codePos` are 0-indexed
- All column numbers in `codePos` are 0-indexed
- When adding new nodes, ensure `codePos` is set correctly
- When updating nodes, code positions may need adjustment
- Always use `JSON.parse(JSON.stringify())` to deep clone AST before modifying
- **Deletion Support**: The code generator now properly handles node deletions. When a node is removed from the AST, it will be removed from the generated code.
