# RobinPath

A scripting language interpreter with a REPL interface and built-in modules for math, strings, JSON, time, arrays, and more.

## Installation

```bash
npm install
```

## Running

### CLI (REPL)

Start the interactive REPL:

```bash
npm run cli
```

This will start an interactive session where you can type commands and see results immediately.

**REPL Commands:**
- `help` or `.help` - Show help message
- `exit`, `quit`, `.exit`, `.quit` - Exit the REPL
- `clear` or `.clear` - Clear the screen
- `..` - Show all available commands

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

### Functions

Define custom functions:

```robinpath
def greet
$1
$2
log "Hello" $1
log "Your age is" $2
add $2 1
enddef

greet "Alice" 25
log "Next year:" $  # Prints 26
```

Functions can return values by leaving the last computed value on the stack:

```robinpath
def sum_and_double
add $1 $2
multiply $ 2
enddef

sum_and_double 10 20
log $  # Prints 60
```

### Modules

Use modules to access specialized functions:

```robinpath
use math
math.add 5 10

use string
string.length "hello"
string.toUpperCase "world"
```

**Available Modules:**
- `math` - Mathematical operations (add, subtract, multiply, divide, etc.)
- `string` - String manipulation (length, substring, replace, etc.)
- `json` - JSON parsing and manipulation
- `time` - Date and time operations
- `random` - Random number generation
- `array` - Array operations (push, pop, slice, etc.)

### Inline Subexpressions

Use `$( ... )` for inline subexpressions:

```robinpath
log "Result:" $(add 10 20)
```

### String Literals

Strings can use single quotes, double quotes, or backticks:

```robinpath
$msg1 = "Hello"
$msg2 = 'World'
$msg3 = `Template`
```

### Numbers

Numbers can be integers or decimals:

```robinpath
$int = 42
$float = 3.14
```

## Examples

### Basic Math

```robinpath
add 10 20
$result
log "Sum:" $result

multiply $result 2
log "Double:" $
```

### Conditional Logic

```robinpath
$age = 18
$citizen = "yes"
if ($age >= 18) && ($citizen == "yes") then log "Loan approved"
```

### Working with Arrays

```robinpath
$arr = range 1 5
for $num in $arr
  log "Number:" $num
endfor
```

### Function with Return Value

```robinpath
def calculate
multiply $1 $2
add $ 10
enddef

calculate 5 3
log "Result:" $  # Prints 25
```

## Testing

Run the test suite:

```bash
npm test
```

This will execute the test script located in `test/test.rp`.

## Building

Build the project:

```bash
npm run build
```

