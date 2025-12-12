# Executor.ts Refactoring Plan

Based on the AST refactor guide, this document outlines the changes needed in `Executor.ts` to work with the new `Expression`-based AST.

## Current State

Executor.ts currently handles:
1. **String-based expressions**: `conditionExpr: string`, `iterableExpr: string`
2. **Code strings in Args**: `subexpr.code`, `object.code`, `array.code`
3. **Runtime parsing**: Creates new `Parser()` instances for subexpressions
4. **JSON5 parsing**: Parses object/array literal code strings at runtime

## Target State

After refactoring, Executor.ts should:
1. **Evaluate Expression nodes directly**: No string parsing
2. **Walk AST tree**: Evaluate structured Expression nodes
3. **No runtime parsing**: All parsing happens once during initial parse
4. **No JSON5**: Object/array literals are structured AST nodes

## Key Changes Needed

### 1. Expression Evaluation

**Current:**
```ts
// InlineIf
const evaluator = new ExpressionEvaluator(frame, this.environment, this);
const condition = await evaluator.evaluate(ifStmt.conditionExpr); // string
```

**Target:**
```ts
// InlineIf
const condition = await this.evaluateExpression(ifStmt.condition); // Expression
```

### 2. Subexpression Handling

**Current:**
```ts
case 'subexpr':
    return await this.executeSubexpression(arg.code); // parses code string
```

**Target:**
```ts
case 'subexpression': // Expression type
    return await this.executeSubexpressionStatements(expr.body); // Statement[]
```

### 3. Object/Array Literal Handling

**Current:**
```ts
case 'object':
    const interpolatedCode = await this.interpolateObjectLiteral(arg.code, frameOverride);
    return JSON5.parse(`{${interpolatedCode}}`);
```

**Target:**
```ts
case 'objectLiteral': // Expression type
    return await this.evaluateObjectLiteral(expr.properties, frameOverride);
```

### 4. For Loop Iterable

**Current:**
```ts
const iterable = await this.evaluateIterableExpr(forLoop.iterableExpr); // string
```

**Target:**
```ts
const iterable = await this.evaluateExpression(forLoop.iterable); // Expression
```

## Methods to Add/Modify

### New Methods (for Expression evaluation)

1. `evaluateExpression(expr: Expression, frameOverride?: Frame): Promise<Value>`
   - Main entry point for evaluating any Expression node
   - Dispatches to specific evaluators based on expression type

2. `evaluateVarExpression(expr: VarExpression, frameOverride?: Frame): Promise<Value>`
   - Evaluates variable references

3. `evaluateObjectLiteral(expr: ObjectLiteralExpression, frameOverride?: Frame): Promise<Record<string, Value>>`
   - Evaluates object literal properties
   - Replaces `interpolateObjectLiteral` + JSON5.parse

4. `evaluateArrayLiteral(expr: ArrayLiteralExpression, frameOverride?: Frame): Promise<Value[]>`
   - Evaluates array literal elements
   - Replaces `interpolateObjectLiteral` + JSON5.parse

5. `evaluateSubexpressionStatements(statements: Statement[], frameOverride?: Frame): Promise<Value>`
   - Executes subexpression body statements
   - Replaces `executeSubexpression(code: string)`

6. `evaluateBinaryExpression(expr: BinaryExpression, frameOverride?: Frame): Promise<Value>`
   - Evaluates binary operations (==, !=, <, >, and, or, +, -, *, /, %)

7. `evaluateUnaryExpression(expr: UnaryExpression, frameOverride?: Frame): Promise<Value>`
   - Evaluates unary operations (not, -, +)

8. `evaluateCallExpression(expr: CallExpression, frameOverride?: Frame): Promise<Value>`
   - Evaluates function/command calls within expressions

### Methods to Modify

1. `evaluateArg(arg: Arg, ...)` → Should work with `Expression | NamedArgsExpression`
   - Remove handling of `subexpr.code`, `object.code`, `array.code`
   - Add handling for Expression types

2. `executeInlineIf(ifStmt: InlineIf, ...)`
   - Change from `evaluator.evaluate(ifStmt.conditionExpr)` to `evaluateExpression(ifStmt.condition)`

3. `executeIfBlock(ifStmt: IfBlock, ...)`
   - Change from `evaluator.evaluate(ifStmt.conditionExpr)` to `evaluateExpression(ifStmt.condition)`
   - Change `branch.condition` evaluation similarly

4. `executeForLoop(forLoop: ForLoop, ...)`
   - Change from `evaluateIterableExpr(forLoop.iterableExpr)` to `evaluateExpression(forLoop.iterable)`

5. `executeSubexpression(code: string, ...)` → `executeSubexpressionStatements(statements: Statement[], ...)`
   - Remove Parser instantiation
   - Execute statements directly

### Methods to Remove

1. `interpolateObjectLiteral(code: string, ...)` - No longer needed
2. `evaluateIterableExpr(expr: string, ...)` - Replaced by `evaluateExpression`

## Migration Strategy

### Phase 1: Add Expression Evaluation Infrastructure
- Add `evaluateExpression()` and helper methods
- Keep existing string-based methods for backward compatibility
- Add TODO comments marking old code paths

### Phase 2: Update AST Types
- Update `Ast.type.ts` with Expression union
- Add Expression nodes to Arg type
- Update statement types to use Expression

### Phase 3: Update Parser
- Parser generates Expression nodes instead of code strings
- Update all parsers (AssignmentParser, CommandParser, etc.)

### Phase 4: Update Executor
- Replace string-based evaluation with Expression evaluation
- Remove old string-based methods
- Remove JSON5 dependency

## Benefits

1. **Performance**: No runtime parsing overhead
2. **Portability**: AST can be serialized and executed in other languages
3. **Clarity**: Clear separation between parsing and execution
4. **Type Safety**: Expression types ensure correct evaluation
5. **Error Handling**: Better error messages with structured AST nodes

