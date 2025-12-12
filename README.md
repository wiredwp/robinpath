# RobinPath

A scripting language interpreter with a REPL interface and built-in modules for math, strings, JSON, time, arrays, and more.

## Installation

Install RobinPath as a dependency in your project:

```bash
npm i @wiredwp/robinpath
```

## Integration

### Basic Usage

Import and create a `RobinPath` instance to execute scripts in your application:

```typescript
import { RobinPath } from '@wiredwp/robinpath';

// Create an interpreter instance
const rp = new RobinPath();

// Execute a script
const result = await rp.executeScript(`
  add 10 20
  multiply $ 2
`);

console.log('Result:', result); // 60
```

### REPL Mode (Persistent State)

Use `executeLine()` for REPL-like behavior where state persists between calls:

```typescript
const rp = new RobinPath();

// First line - sets $result
await rp.executeLine('$result = add 10 20');
console.log(rp.getLastValue()); // 30

// Second line - uses previous result
await rp.executeLine('multiply $result 2');
console.log(rp.getLastValue()); // 60
```

### Working with Variables

Get and set variables programmatically:

```typescript
const rp = new RobinPath();

// Set a variable from JavaScript
rp.setVariable('name', 'Alice');
rp.setVariable('age', 25);

// Execute script that uses the variable
await rp.executeScript(`
  log "Hello" $name
  log "Age:" $age
`);

// Get a variable value
const name = rp.getVariable('name');
console.log(name); // "Alice"
```

### Threads (Isolated Execution Contexts)

Create isolated execution contexts with threads:

```typescript
const rp = new RobinPath({ threadControl: true });

// Create a new thread
const thread1 = rp.createThread('user-123');
await thread1.executeScript('$count = 10');

// Create another thread with separate variables
const thread2 = rp.createThread('user-456');
await thread2.executeScript('$count = 20');

// Each thread maintains its own state
console.log(thread1.getVariable('count')); // 10
console.log(thread2.getVariable('count')); // 20

// Switch between threads
rp.useThread('user-123');
console.log(rp.currentThread?.getVariable('count')); // 10
```

### Registering Custom Functions

Extend RobinPath with your own builtin functions:

```typescript
const rp = new RobinPath();

// Register a simple builtin
rp.registerBuiltin('greet', (args) => {
  const name = String(args[0] ?? 'World');
  return `Hello, ${name}!`;
});

// Use it in scripts
await rp.executeScript('greet "Alice"');
console.log(rp.getLastValue()); // "Hello, Alice!"
```

### Registering Custom Modules

Create and register custom modules:

```typescript
const rp = new RobinPath();

// Register module functions
rp.registerModule('myapp', {
  process: (args) => {
    const data = args[0];
    // Process data...
    return processedData;
  },
  validate: (args) => {
    const input = args[0];
    return isValid(input);
  }
});

// Register function metadata for documentation
rp.registerModuleFunctionMeta('myapp', 'process', {
  description: 'Processes input data',
  parameters: [
    {
      name: 'data',
      dataType: 'object',
      description: 'Data to process',
      formInputType: 'json',
      required: true
    }
  ],
  returnType: 'object',
  returnDescription: 'Processed data'
});

// Register module-level metadata
rp.registerModuleInfo('myapp', {
  description: 'Custom application module',
  methods: ['process', 'validate']
});

// Use in scripts
await rp.executeScript(`
  use myapp
  myapp.process $data
`);
```

### Getting Available Commands

Query available commands for autocomplete or help:

```typescript
const rp = new RobinPath();

const commands = rp.getAvailableCommands();
console.log(commands.native);      // Native commands (if, def, etc.)
console.log(commands.builtin);     // Root-level builtins
console.log(commands.modules);     // Available modules
console.log(commands.moduleFunctions); // Module.function names
console.log(commands.userFunctions);   // User-defined functions
```

### AST with Execution State

Get the AST with execution state for debugging or visualization:

```typescript
const rp = new RobinPath({ threadControl: true });
const thread = rp.createThread('debug');

const script = `
  add 5 5
  $result = $
  if $result > 5
    multiply $result 2
  endif
`;

const astResult = await thread.getASTWithState(script);
console.log(astResult.ast);        // AST with lastValue at each node
console.log(astResult.variables);  // Thread and global variables
console.log(astResult.lastValue);  // Final result
console.log(astResult.callStack);  // Call stack frames
```

### Checking for Incomplete Blocks

Check if a script needs more input (useful for multi-line input):

```typescript
const rp = new RobinPath();

const check1 = rp.needsMoreInput('if $x > 5');
console.log(check1); // { needsMore: true, waitingFor: 'endif' }

const check2 = rp.needsMoreInput('if $x > 5\n  log "yes"\nendif');
console.log(check2); // { needsMore: false }
```

### Error Handling

Handle errors from script execution:

```typescript
const rp = new RobinPath();

try {
  await rp.executeScript('unknown_function 123');
} catch (error) {
  console.error('Script error:', error.message);
  // "Unknown function: unknown_function"
}
```

## CLI Usage

### Installation

Install globally to use the `robinpath` command:

```bash
npm i -g @wiredwp/robinpath
```

Or use it directly with `npx`:

```bash
npx @wiredwp/robinpath
```

### Starting the REPL

Start the interactive REPL:

```bash
robinpath
```

Or if installed locally:

```bash
npm run cli
```

This will start an interactive session where you can type commands and see results immediately.

### REPL Commands

- `help` or `.help` - Show help message
- `exit`, `quit`, `.exit`, `.quit` - Exit the REPL
- `clear` or `.clear` - Clear the screen
- `..` - Show all available commands as JSON

### REPL Features

**Multi-line Blocks:**
The REPL automatically detects incomplete blocks and waits for completion:

```robinpath
> if $x > 5
...   log "yes"
... endif
```

**Backslash Line Continuation:**
Use `\` at the end of a line to continue the command on the next line:

```robinpath
> log "this is a very long message " \
...     "that continues on the next line"
```

The backslash continuation works with any statement type and can be chained across multiple lines.

**Thread Management:**
When thread control is enabled, the prompt shows the current thread and module:

```robinpath
default@math> add 5 5
10
default@math> use clear
Cleared module context
default> thread list
Threads:
  - default (current)
  - user-123
default> thread use user-123
Switched to thread: user-123
user-123>
```

**Module Context:**
The prompt shows the current module when using `use`:

```robinpath
> use math
Using module: math
default@math> add 5 5
10
default@math> use clear
Cleared module context
default>
```

## Basic Syntax

### Commands

Commands are executed by typing the command name followed by arguments:

```robinpath
add 10 20
log "Hello, World!"
multiply 5 3
```

### Variables

Variables are prefixed with `$`:

```robinpath
$name = "Alice"
$age = 25
log $name $age
```

You can declare variables with `var` (mutable) or `const` (immutable):

```robinpath
var $count 0
const $MAX_RETRIES 5
```

### Last Value Reference

Use `$` to reference the last computed value:

```robinpath
add 10 20
multiply $ 2    # Uses 30 (result of add)
log $           # Prints 60
```

### Shorthand Assignment

Assign the last value to a variable by simply referencing it:

```robinpath
add 5 3
$sum            # Assigns 8 to $sum
log $sum        # Prints 8
```

### Variable-to-Variable Assignment

Assign the value of one variable to another, including chained assignments:

```robinpath
$city = "New York"
$city2 = $city  # Copies "New York" to $city2
log $city2      # Prints "New York"

$number1 = 42
$number2 = $number1  # Copies 42 to $number2
$number3 = $number2  # Can chain assignments
```

### Into Syntax

Use `into $variable` to assign the result of a command, block, or function call directly to a variable:

```robinpath
math.add 10 20 into $sum
log $sum  # Prints 30

# Works with functions
myFunction(1 2) into $result

# Works with do blocks
do into $blockResult
  math.add 5 5
  math.multiply $ 2
enddo

# Works with repeat loops
repeat 3 with into $total
   add $2 10
endwith

# Works with object property assignment
math.add 1 2 into $obj.sum
```

### Attribute Access and Array Indexing

RobinPath supports accessing object properties and array elements directly using dot notation and bracket notation:

**Property Access:**
```robinpath
json.parse '{"name": "John", "age": 30, "address": {"city": "NYC"}}'
$user = $

# Access properties using dot notation
log $user.name           # Prints "John"
log $user.age            # Prints 30
log $user.address.city   # Prints "NYC" (nested property access)

# Use in expressions
if $user.age >= 18
  log "Adult"
endif

# Use as function arguments
math.add $user.age 5     # Adds 30 + 5 = 35
```

**Array Indexing:**
```robinpath
$arr = range 10 15
log $arr[0]              # Prints 10 (first element)
log $arr[2]              # Prints 12 (third element)
log $arr[5]              # Prints 15 (last element)

# Out of bounds access returns null
log $arr[10]             # Prints null

# Use in expressions
if $arr[0] == 10
  log "First is 10"
endif
```

**Combined Access:**
You can combine property access and array indexing:
```robinpath
json.parse '{"items": [{"name": "item1", "price": 10}, {"name": "item2", "price": 20}]}'
$data = $

log $data.items[0].name   # Prints "item1"
log $data.items[0].price  # Prints 10
log $data.items[1].name   # Prints "item2"

# Assign to variables
$firstItem = $data.items[0].name
log $firstItem            # Prints "item1"
```

**Error Handling:**
- Accessing a property of `null` or `undefined` throws an error.
- Accessing a property of a non-object throws an error.
- Array indexing on a non-array throws an error.
- Out-of-bounds array access returns `null`.

**Note:** Assignment targets must be simple variable names or object/array paths:
```robinpath
$user.name = "Jane"       # Supported
$arr[0] = 42              # Supported
$data.items[0].price = 99 # Deep assignment supported
```

### Native Reserved Methods

RobinPath includes several built-in reserved methods:

**`log` - Output values:**
```robinpath
log "Hello, World!"
log $name $age
log "Result:" $(add 5 5)
```

**`obj` - Create objects using JSON5 syntax or builder pattern:**
```robinpath
# Create empty object
obj
$empty = $

# Create object with JSON5 syntax
obj '{name: "John", age: 30}'
$user = $

# Create object with key-value pairs (builder style)
obj name "John" age 30
```

**`array` - Create arrays from arguments:**
```robinpath
# Create empty array
array
$empty = $

# Create array with elements
array 1 2 3
$numbers = $
```

**`set` - Assign a value:**
```robinpath
set $var "value"
set $var as "value"   # 'as' is optional
set $obj.prop "value" # path assignment

# Set with fallback (used if value is null/empty)
set $var $maybeNull "default value"
```

**`get` - Get a value by path:**
```robinpath
get $user "address.city"
```

**`assign` - Assign a value to a variable (with optional fallback):**
```robinpath
# Basic assignment
assign $myVar "hello"

# Assignment with fallback (3rd parameter used if 2nd is empty/null)
assign $result $maybeEmpty "default value"
```

**`empty` - Clear/empty a variable:**
```robinpath
$myVar = "some value"
empty $myVar
log $myVar  # Prints null
```

**`fallback` - Return variable value or fallback if empty/null:**
```robinpath
$maybeEmpty = null
fallback $maybeEmpty "default value"  # Returns "default value"
```

**`meta` / `getMeta` - Manage metadata:**
```robinpath
# Set metadata for variables, functions, or constants
meta $var description "Description"
meta myFunction author "Author"
meta $const version "1.0"

# Get metadata
getMeta $var description
getMeta myFunction author
```

**`clear` - Clear the last return value ($):**
```robinpath
math.add 10 20
clear
log $  # Prints null
```

**`forget` - Hide a variable or function in the current scope:**
```robinpath
$val = 10
do
  forget $val
  log $val # Prints null
enddo
```

**`getType` - Get the type of a variable:**
```robinpath
getType "hello" # "string"
getType 42      # "number"
getType true    # "boolean"
getType null    # "null"
getType []      # "array"
getType {}      # "object"
```

**`has` - Check if a variable or function exists:**
```robinpath
has $var
has myFunction
has math.add
```

**`end` - Stop script execution:**
```robinpath
log "Start"
end
log "This is never reached"
```

### Do Blocks (Scopes)

`do` blocks create a new scope. Variables defined inside are local to the scope.

```robinpath
do
  $local = 10
enddo
log $local # Prints null (if not defined globally)
```

**Isolated Scopes with Parameters:**
Scopes can be declared with parameters to create **isolated** execution contexts. Unlike regular `do` blocks, isolated scopes **do not inherit** variables from parent scopes unless they are explicitly passed as arguments.

```robinpath
$outer = 100
do $a $b
  # $outer is NOT accessible here (returns null)
  # $a and $b are initialized from arguments passed to the block
  $inner = 20
enddo
```

### Comments

Lines starting with `#` are comments:

```robinpath
# This is a comment
add 1 2  # Inline comment
```

### Conditionals

**Inline if:**
```robinpath
if $age >= 18 then log "Adult"
```

**Block if:**
```robinpath
if $score >= 90
  log "Grade: A"
elseif $score >= 80
  log "Grade: B"
else
  log "Grade: F"
endif
```

### Loops

**For loops:**
```robinpath
for $i in range 1 5
  log "Iteration:" $i
endfor
```

**For loop with array:**
```robinpath
$numbers = range 10 12
for $num in $numbers
  log "Number:" $num
endfor
```

**Repeat loop:**
The `repeat` loop runs a block `N` times. Inside the block:
- `$1` is the current iteration index (0-based).
- `$2` is the result of the previous iteration (or `null` for the first).

```robinpath
repeat 5 with
  log "Iteration:" $1 # 0, 1, 2, 3, 4
endwith

# Accumulate values
repeat 5 with
  if $2 == null
    return 0
  endif
  math.add $2 $1  # Adds current index to sum
endwith
# Result: 10 (0+1+2+3+4)
```

**Break and Continue:**
Use `break` to exit a loop early, and `continue` to skip to the next iteration.

```robinpath
for $i in range 1 10
  if $i == 5
    break
  endif
endfor
```

### Functions

Define custom functions with `def` (or `define`):

```robinpath
def greet $name
  log "Hello" $name
enddef

# 'define' alias works too
define sum $a $b
  math.add $a $b
enddef
```

**Named Parameters:**
You can optionally use `as` after parameters.

```robinpath
def greet $name $age as
  # $name is alias for $1
  # $age is alias for $2
  log "Hello" $name "Age" $age
enddef
```

**Call Syntax:**
```robinpath
# CLI-style
greet "Alice" 25

# Parenthesized style (commas optional)
greet("Alice" 25)
greet(
  "Alice"
  25
)
```

**Named Arguments:**
```robinpath
def config $env
  log "Env:" $env "Key:" $args.key
enddef

config("prod" key="123")
config(
  "prod" 
  key="123"
)
```

**Decorators:**
Use decorators to add metadata to functions and variables:
```robinpath
@desc "Calculates sum"
@param number $a "First number"
@param number $b "Second number"
@return number "The sum"
def add $a $b
  math.add $a $b
enddef
```

Common decorators: `@desc`, `@title`, `@param`, `@arg`, `@required`, `@return`, `@deprecated`.

### Events

Define event handlers with `on`. Multiple handlers can be defined for the same event.

```robinpath
on "user_login"
  log "User logged in:" $1
endon

# Trigger an event
trigger "user_login" "Alice"
```

### Parallel Execution

Use `together` to run blocks in parallel:

```robinpath
together
  do
    # Task 1
    wait 1000
    log "Task 1 done"
  enddo
  do
    # Task 2
    log "Task 2 done"
  enddo
endtogether
```

### Modules

Use modules to access specialized functions:

```robinpath
use math
math.add 5 10
```

**Available Modules:**
- **`math`**: `add`, `subtract`, `multiply`, `divide`, `modulo`, `power`, `sqrt`, `abs`, `round`, `floor`, `ceil`, `min`, `max`.
- **`string`**: `length`, `substring`, `toUpperCase`, `toLowerCase`, `trim`, `replace`, `replaceAll`, `split`, `startsWith`, `endsWith`, `contains`, `indexOf`, `lastIndexOf`, `charAt`, `padStart`, `padEnd`, `repeat`, `concat`.
- **`json`**: `parse`, `stringify`, `isValid`.
- **`object`**: `keys`, `values`, `entries`, `merge`, `clone`. (Global commands like `keys` also available).
- **`time`**: `now`, `timestamp`, `format`, `addDays`, `diffDays`.
- **`random`**: `int`, `float`, `uuid`, `choice`.
- **`array`**: `create`, `length`, `get`, `slice`, `push`, `concat`, `join`.
- **`dom`**: `click` (with callback support), etc.

### Inline Subexpressions

Use `$( ... )` for inline subexpressions. Subexpressions can be multi-line and contain multiple statements (returns result of the last one).

```robinpath
log "Result:" $(math.add 10 20)

$val = $(
  math.add 5 5
  math.multiply $ 2
)
# $val is 20
```

### Comparison Functions

RobinPath provides built-in comparison functions useful for testing and assertions:
- `test.assertEqual`
- `test.isEqual`
- `test.isBigger`
- `test.isSmaller`
- `test.isEqualOrBigger`
- `test.isEqualOrSmaller`
- `test.assertTrue`
- `test.assertFalse`
- `test.assertNull`
- `test.assertNotNull`
- `test.assertType`
- `test.assertContains`

## Creating Custom Modules

(Refer to "Creating Custom Modules" in the previous section of documentation for details on extending RobinPath with TypeScript).
