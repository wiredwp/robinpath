# RobinPath Language Syntax Guide

A comprehensive guide for AI agents to write RobinPath scripts.

## Table of Contents

1. [Overview](#overview)
2. [Variables and Data Types](#variables-and-data-types)
3. [Comments](#comments)
4. [Operators and Expressions](#operators-and-expressions)
5. [Conditionals](#conditionals)
6. [Loops](#loops)
7. [Functions](#functions)
8. [Do Blocks](#do-blocks)
9. [Events](#events)
10. [Together (Parallel Execution)](#together-parallel-execution)
11. [With Blocks (Callbacks)](#with-blocks-callbacks)
12. [Built-in Commands](#built-in-commands)
13. [Modules](#modules)
14. [Objects and Arrays](#objects-and-arrays)
15. [Subexpressions](#subexpressions)
16. [Template Strings](#template-strings)
17. [Into Syntax](#into-syntax)
18. [Last Value ($)](#last-value-)
19. [Metadata](#metadata)
20. [Decorators](#decorators)
21. [Line Continuation](#line-continuation)
22. [Fenced Blocks](#fenced-blocks)

---

## Overview

RobinPath is a scripting language designed for workflow automation and data processing. Key features:

- **Command-based syntax**: Commands are called without parentheses by default
- **Last value tracking**: The special `$` variable holds the result of the last operation
- **Flexible function calls**: Support for positional, named, and multi-line arguments
- **Event-driven**: Built-in event system with `on`/`trigger`
- **Parallel execution**: `together` blocks for concurrent operations

---

## Variables and Data Types

### Variable Declaration and Assignment

Variables are prefixed with `$`:

```robinpath
# Direct assignment
$str = "hello"
$num = 42
$bool = true
$nullVar = null

# Variable to variable assignment
$copy = $original

# Using last value
math.add 5 3
$result = $  # $result = 8

# Object literal assignment
$obj = { name: "John", age: 30 }

# Array literal assignment
$arr = [1, 2, 3]
```

### Using `set` Command

```robinpath
# Without "as" keyword
set $var "value"
set $var 42

# With "as" keyword
set $var as "value"

# With object path
set $obj.property "value"
set $obj.nested.deep as "nested value"

# With fallback (use fallback if first value is empty/null)
set $var "" "default"
set $var as "" "default value"
```

### Using `var` and `const`

```robinpath
# Variable declaration
var $myVar           # null by default
var $myVar 42        # with default value

# Constant declaration
const $MY_CONST 100
```

### Supported Data Types

| Type | Examples |
|------|----------|
| String | `"hello"`, `'world'`, `` `template` `` |
| Number | `42`, `3.14`, `-10` |
| Boolean | `true`, `false` |
| Null | `null` |
| Array | `[1, 2, 3]`, `["a", "b"]` |
| Object | `{ key: "value" }`, `{ nested: { prop: 1 } }` |

---

## Comments

```robinpath
# This is a single-line comment

log "hello"  # Inline comment after code

# Multi-line comments are just multiple single-line comments
# Like this
# And this
```

---

## Operators and Expressions

### Comparison Operators

```robinpath
$a == $b    # Equal
$a != $b    # Not equal
$a > $b     # Greater than
$a < $b     # Less than
$a >= $b    # Greater than or equal
$a <= $b    # Less than or equal
```

### Logical Operators

```robinpath
$a && $b    # Logical AND
$a || $b    # Logical OR
not $a      # Logical NOT
!$a         # Alternative NOT syntax
```

### Arithmetic Operators

```robinpath
$a + $b     # Addition
$a - $b     # Subtraction
$a * $b     # Multiplication
$a / $b     # Division
$a % $b     # Modulo
```

### Grouping

```robinpath
($a >= 18) && ($citizen == "yes")
```

---

## Conditionals

### Inline If (Single Line)

```robinpath
if $balance > 0 then log "Positive balance"
```

### Block If/Elseif/Else

```robinpath
if $score >= 90
  log "Grade: A"
elseif $score >= 80
  log "Grade: B"
elseif $score >= 70
  log "Grade: C"
else
  log "Grade: F"
endif
```

### Nested Conditionals

```robinpath
if $value > 0
  if $value < 50
    log "Value is between 0 and 50"
  else
    log "Value is 50 or greater"
  endif
else
  log "Value is negative or zero"
endif
```

### If with Then on New Line

```robinpath
if $value > 5 then
  math.multiply $value 2
endif
```

### If Blocks Return Last Value

```robinpath
$a = 10
if $a > 5
  "high"
else
  "low"
endif
# $ is now "high"
```

---

## Loops

### Basic For Loop

```robinpath
for $i in range 1 5
  log "Iteration:" $i
endfor
```

### For Loop with Array

```robinpath
$numbers = [10, 20, 30]
for $num in $numbers
  log "Number:" $num
endfor
```

### Range Function

```robinpath
# range start end
range 1 5          # [1, 2, 3, 4, 5]

# range start end step
range 0 10 2       # [0, 2, 4, 6, 8, 10]
range 5 0 -1       # [5, 4, 3, 2, 1, 0]
```

### Break Statement

```robinpath
for $i in range 1 10
  if $i == 5
    break
  endif
  log $i
endfor
# Outputs: 1, 2, 3, 4
```

### Continue Statement

```robinpath
for $i in range 1 10
  if $i % 2 == 0
    continue
  endif
  log $i
endfor
# Outputs: 1, 3, 5, 7, 9 (odd numbers only)
```

### Nested Loops

```robinpath
for $i in range 1 3
  for $j in range 1 2
    log "Nested:" $i $j
  endfor
endfor
```

---

## Functions

### Basic Function Definition

```robinpath
def greet
  log "Hello" $1      # $1 = first argument
  log "Age:" $2       # $2 = second argument
  math.add $2 1       # Return value is last expression
enddef

greet "Alice" 25
```

### Function with Named Parameters

```robinpath
def greetUser $name $age
  log "Hello" $name
  log "Age:" $age
enddef

# Call with positional arguments
greetUser("Alice" 25)

# Call with named arguments
greetUser $name="Alice" $age=25
greetUser($name="Alice" $age=25)
```

### Return Statement

```robinpath
def getValue
  return 100
  log "This won't execute"
enddef

def getValueOrDefault $val
  if $val == null
    return "default"
  endif
  return $val
enddef

# Return without value returns null
def noReturn
  $temp = 50
  return
enddef
```

### Multi-line Function Calls

```robinpath
# Arguments on separate lines (no commas needed)
math.add(
  10
  20
)

# With named arguments
myFunc(
  $a="hello"
  $b="world"
)
```

### Space-separated Arguments

```robinpath
# Without parentheses
math.add 5 5

# With parentheses
math.add(5 5)
```

### `define` as Alias for `def`

```robinpath
define myFunction
  return "works"
enddef
```

### Optional `as` Keyword

```robinpath
def myFunc $x $y as
  math.add $x $y
enddef
```

### Objects and Arrays as Arguments

```robinpath
def processData $obj $arr
  log $obj.name
  array.length $arr
enddef

processData {
  name: "Test"
} [1, 2, 3]

# Or with named arguments
processData $obj={
  name: "Alice",
  age: 30
} $arr=[1, 2, 3, 4, 5]
```

---

## Do Blocks

### Basic Do Block

```robinpath
do
  math.add 5 10
  log "Result:" $
enddo
```

### Do Block with `into` (Capture Result)

```robinpath
do into $result
  math.add 20 30
  math.multiply $ 2
enddo
# $result = 100
```

### Isolated Do Block (With Parameters)

```robinpath
$outerVar = 300

do $a $b
  # Cannot access $outerVar here (isolated scope)
  log $outerVar    # null
  log $a $b        # Parameters are accessible
  $localVar = 400  # Local to this block
enddo

# $localVar not accessible here
```

### Do Block with Parameters and Into

```robinpath
do $a $b into $result
  set $a 5
  set $b 3
  math.add $a $b
enddo
# $result = 8
```

### Return in Do Block

```robinpath
do into $result
  math.add 10 20
  return 100       # Returns 100, not 30
enddo
# $result = 100
```

---

## Events

### Event Handler Definition

```robinpath
on "eventName"
  log "Event received:" $1 $2 $3
endon

# Orphaned on blocks (auto-closing at end of file)
on "orphanEvent"
  log "This works without endon"
```

### Triggering Events

```robinpath
trigger "eventName" "arg1" "arg2" "arg3"

# With object argument
$data = { name: "Alice", age: 30 }
trigger "userEvent" $data
```

### Multiple Handlers

```robinpath
on "myEvent"
  log "Handler 1"
endon

on "myEvent"
  log "Handler 2"
endon

trigger "myEvent" "test"
# Both handlers execute
```

---

## Together (Parallel Execution)

### Basic Together Block

```robinpath
together
  do
    math.add 10 20
    log "Task 1:" $
  enddo
  do
    math.multiply 5 6
    log "Task 2:" $
  enddo
endtogether
```

### Together with Into

```robinpath
together
  do into $result1
    math.add 5 5
  enddo
  do into $result2
    math.multiply 6 7
  enddo
endtogether
# $result1 = 10, $result2 = 42
```

---

## With Blocks (Callbacks)

### Repeat with Callback

```robinpath
# $1 = iteration index (0-based)
# $2 = accumulated value from previous iteration

repeat 5 with
  if $2 == null
    return 1        # Initial value
  endif
  add $2 1          # Accumulate
endwith
# Result: 5

# With into
repeat 4 with into $result
  if $2 == null
    return 2
  endif
  math.multiply $2 2
endwith
# $result = 16 (2 * 2 * 2 * 2)
```

---

## Built-in Commands

### Variable Operations

| Command | Description | Example |
|---------|-------------|---------|
| `set` | Set variable value | `set $var "value"` |
| `get` | Get property from object | `get $obj "name"` |
| `empty` | Set variable to null | `empty $var` |
| `fallback` | Return value or fallback | `fallback $var "default"` |
| `clear` | Clear last value ($) | `clear` |
| `forget` | Forget variable in current scope | `forget $var` |
| `var` | Declare variable | `var $x 10` |
| `const` | Declare constant | `const $PI 3.14` |
| `has` | Check if variable/function exists | `has $var` |
| `getType` | Get type of value | `getType $var` |

### Output Commands

| Command | Description | Example |
|---------|-------------|---------|
| `log` | Log to console | `log "Hello" $name` |
| `say` | Output and set $ | `say "Hello"` |

### Object/Array Commands

| Command | Description | Example |
|---------|-------------|---------|
| `obj` | Create object | `obj '{name: "John"}'` |
| `array` | Create array | `array 1 2 3` |
| `keys` | Get object keys | `keys $obj` |
| `values` | Get object values | `values $obj` |
| `entries` | Get key-value pairs | `entries $obj` |
| `merge` | Merge objects | `merge $obj1 $obj2` |
| `clone` | Clone object | `clone $obj` |

---

## Modules

### Math Module

```robinpath
math.add 1 2 3 4        # 10 (variadic)
math.subtract 10 3      # 7
math.multiply 2 3 4     # 24 (variadic)
math.divide 15 3        # 5
math.modulo 17 5        # 2
math.power 2 8          # 256
math.sqrt 16            # 4
math.abs -5             # 5
math.round 3.7          # 4
math.floor 3.7          # 3
math.ceil 3.2           # 4
math.min 5 2 8 1        # 1
math.max 5 2 8 1        # 8
```

### String Module

```robinpath
string.length "hello"                    # 5
string.substring "hello" 1 4             # "ell"
string.toUpperCase "hello"               # "HELLO"
string.toLowerCase "HELLO"               # "hello"
string.trim "  hello  "                  # "hello"
string.replace "hello world" "world" "universe"  # "hello universe"
string.replaceAll "a b a" "a" "x"        # "x b x"
string.split "a,b,c" ","                 # ["a", "b", "c"]
string.concat "hello" " " "world"        # "hello world"
string.startsWith "hello" "he"           # true
string.endsWith "hello" "lo"             # true
string.contains "hello" "ell"            # true
string.indexOf "hello" "l"               # 2
string.lastIndexOf "hello" "l"           # 3
string.charAt "hello" 1                  # "e"
string.padStart "5" 3 "0"                # "005"
string.padEnd "5" 3 "0"                  # "500"
string.repeat "ha" 3                     # "hahaha"
```

### Array Module

```robinpath
array.length $arr                        # Get length
array.get $arr 2                         # Get element at index
array.slice $arr 1 4                     # Slice array
array.push $arr 6                        # Add element (returns new array)
array.concat $arr1 $arr2                 # Concatenate arrays
array.join $arr ","                      # Join with separator
array.create 1 2 3                       # Create array
```

### JSON Module

```robinpath
json.parse '{"name": "John"}'            # Parse JSON string
json.stringify $obj                       # Convert to JSON string
json.isValid $jsonStr                     # Check if valid JSON
```

### Time Module

```robinpath
time.now                                  # Current timestamp string
time.timestamp                            # Current Unix timestamp
time.format "2024-01-15"                  # Format date
time.addDays "2024-01-15T00:00:00Z" 7    # Add days
time.diffDays "2024-01-01" "2024-01-08"  # Difference in days (7)
```

### Random Module

```robinpath
random.int 1 10                          # Random integer between 1-10
random.float                             # Random float 0-1
random.uuid                              # Generate UUID
random.choice $arr                       # Random element from array
```

---

## Objects and Arrays

### Object Literals

```robinpath
# Empty object
{}
$empty = $

# Basic object
{ name: "John", age: 30 }

# Nested object
{ nested: { key: "value" }, array: [1, 2, 3] }

# Multi-line object
{
  name: "Multi",
  age: 25,
  city: "NYC"
}

# Variable interpolation
$name = "Alice"
$obj = { name: $name, age: 30 }

# Computed property name
$key = "myKey"
$obj = { [$key]: "value" }
# $obj.myKey = "value"
```

### Array Literals

```robinpath
# Empty array
[]

# Basic array
[1, 2, 3]

# Mixed types
["hello", 42, true, null]

# Multi-line array
[
  1,
  2,
  3
]

# Variable interpolation
$num = 42
$arr = [$num, 43]
```

### Property Access

```robinpath
$user.name                    # Dot notation
$user.address.city            # Nested access
$arr[0]                       # Array index
$data.items[0].name           # Combined access
```

### Property Assignment

```robinpath
$user.city = "London"         # Assign to property
$user.address.city = "NYC"    # Nested assignment
$arr[0] = 100                 # Array index assignment
$data.items[0].price = 50     # Combined assignment

# Creates intermediate objects
$animal.cat = 5               # Creates $animal if not exists
$config.database.host = "localhost"
```

---

## Subexpressions

### Basic Subexpression `$(...)`

```robinpath
$result = $(math.add 5 3)     # $result = 8
```

### With Variables

```robinpath
$a = 10
$b = $(math.add $a 5)         # $b = 15
```

### Nested Subexpressions

```robinpath
$result = $(math.add $(math.multiply 2 3) $(math.add 1 1))
# (2*3) + (1+1) = 6 + 2 = 8
```

### Multi-line Subexpression

```robinpath
$result = $(
  math.add 10 20
  math.multiply $ 2
)
# (10+20) * 2 = 60
```

### In Function Arguments

```robinpath
math.add $(math.multiply 2 5) $(math.add 3 2)
# 10 + 5 = 15
```

### In Conditionals

```robinpath
if $(math.add 5 5) == 10
  log "Equals 10"
endif
```

---

## Template Strings

### Basic Interpolation

```robinpath
$name = "Alice"
$greeting = `Hello, $name!`   # "Hello, Alice!"
```

### Last Value Interpolation

```robinpath
math.add 10 20
$result = `Result is $`       # "Result is 30"
```

### Subexpression Interpolation

```robinpath
$msg = `Sum: $(math.add 10 20)`  # "Sum: 30"
```

### Multiple Interpolations

```robinpath
$a = 5
$b = 10
$msg = `$a + $b = $(math.add $a $b)`  # "5 + 10 = 15"
```

### Object Property Access

```robinpath
$user = { name: "Test", age: 25 }
$msg = `Name: $user.name, Age: $user.age`
```

### Array Access

```robinpath
$arr = [10, 20, 30]
$msg = `First: $arr[0], Second: $arr[1]`
```

### Escape Sequences

```robinpath
`Dollar: \$5`                 # "Dollar: $5"
`Backtick: \``                # "Backtick: `"
`Newline: \\n`                # "Newline: \n"
`Paren: \(not evaluated)`     # "Paren: (not evaluated)"
```

### Multi-line Template Strings

```robinpath
$name = "Alice"
$msg = `
Hello, $name!
This is a multi-line
template string.
`
```

---

## Into Syntax

### Basic Into

```robinpath
add 1 2 into $result          # $result = 3
math.add 10 20 into $sum      # $sum = 30
```

### Into Does Not Affect Last Value

```robinpath
math.add 10 20                # $ = 30
add 5 5 into $result          # $result = 10, $ still = 30
```

### With Parenthesized Calls

```robinpath
math.add(10 20) into $result

math.add(
  15
  25
) into $result
```

### With Do Blocks

```robinpath
do into $result
  math.add 20 30
  math.multiply $ 2
enddo
# $result = 100
```

### With Attribute Path

```robinpath
$obj = { value: 0 }
math.add 10 20 into $obj.result
# $obj.result = 30
```

---

## Last Value ($)

### Literals Set Last Value

```robinpath
"hello"           # $ = "hello"
42                # $ = 42
true              # $ = true
[1, 2, 3]         # $ = [1, 2, 3]
{ key: "value" }  # $ = { key: "value" }
```

### Commands Set Last Value

```robinpath
math.add 10 20    # $ = 30
string.concat "a" "b"  # $ = "ab"
```

### Chaining Operations

```robinpath
10
math.add $ 5      # 10 + 5 = 15
math.multiply $ 2 # 15 * 2 = 30
math.subtract $ 3 # 30 - 3 = 27
```

### Clear Last Value

```robinpath
math.add 5 5      # $ = 10
clear             # $ = null
```

### Assignment Does NOT Change $

```robinpath
"original"
$a = "assigned"
# $ is still "original"
```

---

## Metadata

### Setting Metadata

```robinpath
# Using meta (alias for setMeta)
$var = 100
meta $var description "A test variable"
meta $var version 1

# Using setMeta
setMeta $var author "John"
```

### Getting Metadata

```robinpath
# Get specific key
getMeta $var description    # Returns the description

# Get all metadata
getMeta $var                # Returns object with all metadata
```

### Metadata for Functions

```robinpath
def myFunc
  return 42
enddef

meta myFunc description "A test function"
meta myFunc category "utility"

getMeta myFunc description  # "A test function"
```

---

## Decorators

### Function Decorators

```robinpath
@desc "A test function with description"
def myFunc
  log "Hello"
enddef

@description "Another function"
@title "My Function"
def anotherFunc
  return 42
enddef
```

### Parameter Decorators

```robinpath
@param string $name "User's name"
@param number $age 25 "User's age (default 25)"
@desc "Greet a user"
def greetUser
  log "Hello" $1
enddef

# @arg for variadic arguments
@arg number
@desc "Add multiple numbers"
def addNumbers
  math.add $1 $2 $3
enddef

# @required
@param string $name "User name"
@required $name
def requireName
  log $1
enddef
```

### Variable/Constant Decorators

```robinpath
@desc "A decorated variable"
var $myVar 42

@desc "A decorated constant"
const $MY_CONST 300
```

### Block Decorators

```robinpath
@desc "This is a conditional block"
@title "Check Value"
if $value > 10
  log "Greater than 10"
endif

@desc "This is a loop"
for $i in range 1 5
  log $i
endfor

@desc "Event handler"
on "myEvent"
  log "Event received"
endon
```

---

## Line Continuation

Use backslash `\` to continue a line:

```robinpath
log "this is a very long message " \
    "that continues on the next line"

$long = "hello " \
        "world " \
        "from RobinPath"
```

---

## Fenced Blocks

### Chunk Markers

```robinpath
--- chunk:main ---
$age = 18

--- chunk:extract_invoice tags:llm cache=content_hash ---
log "processing invoice"
```

### Cell Blocks

```robinpath
---cell code id:main---
$name = "Alice"
log "Hello, " $name
---end---

---cell prompt id:sys role:system---
You are a helpful assistant.
Please be concise and clear.
---end---

---cell schema id:Invoice format:json---
{
  "type": "object",
  "properties": {
    "amount": { "type": "number" }
  }
}
---end---
```

### Prompt Blocks

```robinpath
---
You are a helpful assistant.
This is a prompt block.
It can contain multiple lines.
---
```

---

## Quick Reference

### Common Patterns

```robinpath
# Assign command result to variable
math.add 5 5
$result = $

# Or using into
math.add 5 5 into $result

# Conditional assignment
if $value > 10
  $status = "high"
else
  $status = "low"
endif

# Loop with accumulator
$sum = 0
for $i in range 1 10
  math.add $sum $i
  $sum = $
endfor

# Process array
$items = [1, 2, 3, 4, 5]
for $item in $items
  math.multiply $item 2
  log $
endfor

# Object manipulation
$user = { name: "John", age: 30 }
$user.city = "NYC"
get $user "name"
log $

# Event handling
on "dataReceived"
  log "Got data:" $1
  process $1
endon

trigger "dataReceived" { id: 1, value: "test" }
```

### Best Practices

1. **Use meaningful variable names**: `$userName` instead of `$u`
2. **Group related code with do blocks**: Isolate scope when needed
3. **Use comments liberally**: Document complex logic
4. **Prefer `into` for clarity**: Makes assignment explicit
5. **Use template strings for complex output**: Cleaner than concatenation
6. **Define functions at top of script**: They're extracted first anyway
7. **Use decorators for documentation**: `@desc`, `@param` help document APIs
