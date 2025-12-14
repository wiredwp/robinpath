# Test Generation Guideline

This document provides guidelines for creating AST (Abstract Syntax Tree) tests in the `test/ast/` directory.

## File Naming Convention

- **AST test files must match their corresponding script files in `test/scripts/`**
- Test files should be named with the pattern: `a{N}-{feature-name}.js` to match `{NN}-{feature-name}.rp`
- Examples:
  - `a1-variable-assignment.js` - Matches `01-variable-assignment.rp`
  - `a2-functions.js` - Would match `02-functions.rp` (if it existed)
  - `a3-control-flow.js` - Would match `03-control-flow.rp` (if it existed)
  
**Important**: All test cases for a given script file should be in a single AST test file. For example, all variable assignment tests (basic assignments, set commands, object/array assignments, shorthand, do blocks, etc.) should all be in `a1-variable-assignment.js` to match `01-variable-assignment.rp`.

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
const updatedCode = testRp.updateCodeFromAST(originalScript, modifiedAST);
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
    let updatedCode;
    try {
        updatedCode = testRp.updateCodeFromAST(updateScript, modifiedAST);
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

2. **After Update**: Log the generated code **at the very bottom**, after all verifications are complete
   ```javascript
   // Code after update - Always at the bottom, side by side with original code
   console.log('\n' + '='.repeat(60));
   console.log('Code after update:');
   console.log('='.repeat(60));
   console.log(updatedCode);
   ```

**CRITICAL**: The "Code after update" section must always be placed at the very end of the test function, after all verifications. This ensures the original code (logged at the top) and the updated code (logged at the bottom) appear side by side in the console output for easy visual comparison.

## Error Handling Pattern

**IMPORTANT**: When verification fails, always throw an error (not a warning):

```javascript
// ❌ WRONG - Don't use warnings
if (updatedLine < 0) {
    console.log('⚠ Test failed - update may not be visible');
}

// ✅ CORRECT - Throw errors
if (updatedLine < 0) {
    throw new Error('Test FAILED: Node was not updated in generated code');
}
```

**Exception**: Code generation failures should also throw errors, but **always log AST and code for debugging**:
```javascript
let updatedCode;
try {
    updatedCode = testRp.updateCodeFromAST(updateScript, modifiedAST);
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

1. **Isolation**: Each test should be independent and not rely on other tests
2. **Clarity**: Use descriptive test names and console.log messages
3. **Verification**: Always verify both AST structure and generated code
4. **Positions**: Always check code positions, not just content
5. **Error Handling**: Always throw errors (not warnings) when tests fail - this ensures tests properly fail
6. **Code Logging**: 
   - Always log code before update (at the top, before AST modifications)
   - Always log code after update (at the very bottom, after all verifications)
   - This ensures original and updated code appear side by side in console output
7. **Error Debugging**: When errors occur (code generation failures or verification failures), always log both the modified AST and the generated code to help with debugging
8. **Coverage**: Test edge cases and various scenarios

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

- All line numbers in `codePos` are 0-indexed
- All column numbers in `codePos` are 0-indexed
- When adding new nodes, ensure `codePos` is set correctly
- When updating nodes, code positions may need adjustment
- Always use `JSON.parse(JSON.stringify())` to deep clone AST before modifying
