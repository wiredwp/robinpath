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

## Creating Custom Modules

You can extend RobinPath by creating your own custom modules. Modules provide a way to organize related functions and make them available through the `use` command.

### Module Structure

A module consists of three main parts:

1. **Functions** - The actual function implementations
2. **Function Metadata** - Documentation and type information for each function
3. **Module Metadata** - Overall module description and method list

### Step-by-Step Guide

#### 1. Create a Module File

Create a new TypeScript file in `src/modules/` directory, for example `src/modules/MyModule.ts`:

```typescript
import type { 
    BuiltinHandler, 
    FunctionMetadata, 
    ModuleMetadata,
    ModuleAdapter
} from '../index';

/**
 * MyModule for RobinPath
 * Provides custom functionality
 */

// 1. Define your functions
export const MyModuleFunctions: Record<string, BuiltinHandler> = {
    greet: (args) => {
        const name = String(args[0] ?? 'World');
        return `Hello, ${name}!`;
    },

    double: (args) => {
        const num = Number(args[0]) || 0;
        return num * 2;
    },

    // Functions can be async
    delay: async (args) => {
        const ms = Number(args[0]) || 1000;
        await new Promise(resolve => setTimeout(resolve, ms));
        return `Waited ${ms}ms`;
    }
};

// 2. Define function metadata (for documentation and type checking)
export const MyModuleFunctionMetadata: Record<string, FunctionMetadata> = {
    greet: {
        description: 'Greets a person by name',
        parameters: [
            {
                name: 'name',
                dataType: 'string',
                description: 'Name of the person to greet',
                formInputType: 'text',
                required: false,
                defaultValue: 'World'
            }
        ],
        returnType: 'string',
        returnDescription: 'Greeting message',
        example: 'mymodule.greet "Alice"  # Returns "Hello, Alice!"'
    },

    double: {
        description: 'Doubles a number',
        parameters: [
            {
                name: 'value',
                dataType: 'number',
                description: 'Number to double',
                formInputType: 'number',
                required: true
            }
        ],
        returnType: 'number',
        returnDescription: 'The input number multiplied by 2',
        example: 'mymodule.double 5  # Returns 10'
    },

    delay: {
        description: 'Waits for a specified number of milliseconds',
        parameters: [
            {
                name: 'ms',
                dataType: 'number',
                description: 'Number of milliseconds to wait',
                formInputType: 'number',
                required: true
            }
        ],
        returnType: 'string',
        returnDescription: 'Confirmation message',
        example: 'mymodule.delay 1000  # Waits 1 second'
    }
};

// 3. Define module metadata
export const MyModuleModuleMetadata: ModuleMetadata = {
    description: 'Custom module providing greeting and utility functions',
    methods: [
        'greet',
        'double',
        'delay'
    ]
};

// 4. Create and export the module adapter
const MyModule: ModuleAdapter = {
    name: 'mymodule',
    functions: MyModuleFunctions,
    functionMetadata: MyModuleFunctionMetadata,
    moduleMetadata: MyModuleModuleMetadata
};

export default MyModule;
```

#### 2. Register the Module

In `src/index.ts`, import your module and add it to the `NATIVE_MODULES` array:

```typescript
// Add import at the top with other module imports
import MyModule from './modules/MyModule';

// Add to NATIVE_MODULES array (around line 2504)
private static readonly NATIVE_MODULES: ModuleAdapter[] = [
    MathModule,
    StringModule,
    JsonModule,
    TimeModule,
    RandomModule,
    ArrayModule,
    TestModule,
    MyModule  // Add your module here
];
```

#### 3. Use Your Module

Once registered, you can use your module in RobinPath scripts:

```robinpath
use mymodule
mymodule.greet "Alice"
mymodule.double 7
mymodule.delay 500
```

### Function Implementation Guidelines

1. **Function Signature**: Functions must match the `BuiltinHandler` type:
   ```typescript
   (args: Value[]) => Value | Promise<Value>
   ```

2. **Argument Handling**: Always handle missing or undefined arguments:
   ```typescript
   const value = args[0] ?? defaultValue;
   const num = Number(args[0]) || 0;  // For numbers
   const str = String(args[0] ?? ''); // For strings
   ```

3. **Error Handling**: Throw descriptive errors:
   ```typescript
   if (num < 0) {
       throw new Error('Number must be non-negative');
   }
   ```

4. **Async Functions**: Functions can return `Promise<Value>` for async operations:
   ```typescript
   asyncFunction: async (args) => {
       await someAsyncOperation();
       return result;
   }
   ```

### Metadata Guidelines

1. **Parameter Metadata**: Each parameter should include:
   - `name`: Parameter name
   - `dataType`: One of `'string' | 'number' | 'boolean' | 'object' | 'array' | 'null' | 'any'`
   - `description`: Human-readable description
   - `formInputType`: UI input type (see `FormInputType` in code)
   - `required`: Whether parameter is required (defaults to `true`)
   - `defaultValue`: Optional default value

2. **Function Metadata**: Each function should include:
   - `description`: What the function does
   - `parameters`: Array of parameter metadata
   - `returnType`: Return data type
   - `returnDescription`: What the function returns
   - `example`: Optional usage example

3. **Module Metadata**: Should include:
   - `description`: Overall module description
   - `methods`: Array of all function names in the module

### Example: Complete Custom Module

Here's a complete example of a utility module:

```typescript
import type { 
    BuiltinHandler, 
    FunctionMetadata, 
    ModuleMetadata,
    ModuleAdapter
} from '../index';

export const UtilFunctions: Record<string, BuiltinHandler> = {
    reverse: (args) => {
        const str = String(args[0] ?? '');
        return str.split('').reverse().join('');
    },

    capitalize: (args) => {
        const str = String(args[0] ?? '');
        if (str.length === 0) return str;
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    },

    isEmpty: (args) => {
        const value = args[0];
        if (value === null || value === undefined) return true;
        if (typeof value === 'string') return value.length === 0;
        if (Array.isArray(value)) return value.length === 0;
        if (typeof value === 'object') return Object.keys(value).length === 0;
        return false;
    }
};

export const UtilFunctionMetadata: Record<string, FunctionMetadata> = {
    reverse: {
        description: 'Reverses a string',
        parameters: [
            {
                name: 'str',
                dataType: 'string',
                description: 'String to reverse',
                formInputType: 'text',
                required: true
            }
        ],
        returnType: 'string',
        returnDescription: 'Reversed string',
        example: 'util.reverse "hello"  # Returns "olleh"'
    },
    // ... other function metadata
};

export const UtilModuleMetadata: ModuleMetadata = {
    description: 'Utility functions for common operations',
    methods: ['reverse', 'capitalize', 'isEmpty']
};

const UtilModule: ModuleAdapter = {
    name: 'util',
    functions: UtilFunctions,
    functionMetadata: UtilFunctionMetadata,
    moduleMetadata: UtilModuleMetadata
};

export default UtilModule;
```

### Best Practices

1. **Naming**: Use lowercase module names (e.g., `mymodule`, `util`, `custom`)
2. **Organization**: Group related functions together
3. **Documentation**: Provide clear descriptions and examples
4. **Error Messages**: Use descriptive error messages
5. **Type Safety**: Validate input types and handle edge cases
6. **Consistency**: Follow the same patterns as existing modules

### Testing Your Module

After creating your module, test it in the REPL:

```bash
npm run cli
```

Then try:
```robinpath
use mymodule
mymodule.greet "Test"
```

You can also check available modules:
```robinpath
module list
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

