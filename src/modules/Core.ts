import type { 
    BuiltinHandler, 
    FunctionMetadata, 
    ModuleMetadata,
    ModuleAdapter
} from '../index';
import JSON5 from 'json5';

/**
 * Core module for RobinPath
 * Provides core built-in functions like log, obj, array, tag, range, etc.
 */

export const CoreFunctions: Record<string, BuiltinHandler> = {
    log: (args) => {
        console.log(...args);
        return null; // log should not affect the last value
    },

    obj: (args) => {
        if (args.length === 0) {
            return {};
        }
        const jsonString = String(args[0]);
        try {
            // Parse JSON5 string into object
            return JSON5.parse(jsonString);
        } catch (error) {
            throw new Error(`Invalid JSON5: ${error instanceof Error ? error.message : String(error)}`);
        }
    },

    array: (args) => {
        // Return all arguments as an array
        return [...args];
    },

    tag: (args) => {
        // Tag command: tag [type] [name] [description]
        // Used to declare meaningful info/metadata
        // Does nothing (no-op) but accepts the arguments
        if (args.length < 3) {
            throw new Error('tag requires 3 arguments: type, name, and description');
        }
        // All arguments are accepted but not used
        // This is a no-op command for declaring metadata
        return null;
    },

    meta: (args) => {
        // Meta command: meta [fn/variable] [meta key] [value]
        // Used to add metadata for functions or variables
        // Examples:
        //   meta $a description "A variable to add number"
        //   meta fn description "function to do something"
        //   meta $a version 5
        // Note: The actual implementation is in executeCommand for special handling
        // This registration ensures it's recognized as a valid command
        if (args.length < 3) {
            throw new Error('meta requires 3 arguments: target (fn/variable), meta key, and value');
        }
        // The actual metadata storage is handled in executeCommand
        return null;
    },

    getMeta: (args) => {
        // getMeta command: getMeta [fn/variable] [key?]
        // Used to retrieve metadata for functions or variables
        // Examples:
        //   getMeta $a           # Returns all metadata as object
        //   getMeta $a description # Returns specific metadata value
        //   getMeta fn description # Returns function metadata value
        // Note: The actual implementation is in executeCommand for special handling
        // This registration ensures it's recognized as a valid command
        if (args.length < 1) {
            throw new Error('getMeta requires at least 1 argument: target (fn/variable)');
        }
        // The actual metadata retrieval is handled in executeCommand
        return null;
    },

    getType: (args) => {
        // getType command: getType <variable>
        // Returns the type of a variable as a string
        // Examples:
        //   getType $myVar  # Returns "string", "number", "boolean", "object", "array", or "null"
        // Note: The actual implementation is in executeCommand for special handling
        // This registration ensures it's recognized as a valid command
        if (args.length < 1) {
            throw new Error('getType requires 1 argument: variable name');
        }
        // The actual type detection is handled in executeCommand
        return null;
    },

    clear: () => {
        // clear command: clear
        // Clears the last return value ($)
        // Example:
        //   math.add 10 20  # $ = 30
        //   clear           # $ = null
        // Note: The actual implementation is in executeCommand for special handling
        // This registration ensures it's recognized as a valid command
        // The actual clearing is handled in executeCommand
        return null;
    },

    forget: () => {
        // forget command: forget <variable|function>
        // Ignores a variable or function in the current scope only
        // Example:
        //   $x = 10
        //   scope
        //     forget $x
        //     $x  # Returns null (ignored in this scope)
        //   endscope
        //   $x  # Returns 10 (still exists in outer scope)
        // Note: The actual implementation is in executeCommand for special handling
        // This registration ensures it's recognized as a valid command
        return null;
    },

    set: () => {
        // set command: set <variable> <value> [fallback]
        // Assigns a value to a variable, with optional fallback if value is empty/null
        // Examples:
        //   set $myVar "hello"           # $myVar = "hello"
        //   set $user.name "John"       # $user.name = "John" (attribute path)
        //   set $x "" "default"         # $x = "default" (fallback used)
        // Note: The actual implementation is in executeCommand for special handling
        // This registration ensures it's recognized as a valid command
        return null;
    },

    get: (args) => {
        // get command: get <object> <path>
        // Gets a value from an object using a dot-notation path
        // Examples:
        //   get {user: {name: "John"}} "user.name"  # Returns "John"
        //   get $myObj "property.subproperty"        # Returns value at path
        const obj = args[0];
        const path = String(args[1] ?? '');
        
        if (typeof obj !== 'object' || obj === null) {
            throw new Error('First argument must be an object');
        }
        
        const keys = path.split('.');
        let current: any = obj;
        
        for (const key of keys) {
            if (current === null || current === undefined) {
                return null;
            }
            if (typeof current !== 'object') {
                return null;
            }
            current = current[key];
        }
        
        return current;
    },

    range: (args) => {
        const start = Number(args[0]) || 0;
        const end = Number(args[1]) || 0;
        const step = args.length >= 3 ? Number(args[2]) : undefined;
        const result: number[] = [];
        
        // If step is provided, use it
        if (step !== undefined) {
            if (step === 0) {
                throw new Error('range step cannot be zero');
            }
            
            // Determine direction based on step sign and start/end relationship
            if (step > 0) {
                // Positive step: count up from start to end
                // If start > end, this will produce empty array (correct behavior)
                for (let i = start; i <= end; i += step) {
                    result.push(i);
                }
            } else {
                // Negative step: count down from start to end
                // If start < end, this will produce empty array (correct behavior)
                for (let i = start; i >= end; i += step) {
                    result.push(i);
                }
            }
        } else {
            // No step provided: use default behavior (step of 1 or -1)
            if (start <= end) {
                for (let i = start; i <= end; i++) {
                    result.push(i);
                }
            } else {
                // Reverse range
                for (let i = start; i >= end; i--) {
                    result.push(i);
                }
            }
        }
        
        return result;
    }
};

export const CoreFunctionMetadata: Record<string, FunctionMetadata> = {
    log: {
        description: 'Logs values to the console',
        parameters: [
            {
                name: 'args',
                label: 'Arguments',
                dataType: 'any',
                description: 'Values to log (any number of arguments)',
                formInputType: 'json',
                required: false,
                children: {
                    name: 'value',
                    dataType: 'any',
                    description: 'Value to log',
                    formInputType: 'json',
                    required: false
                }
            }
        ],
        returnType: 'null',
        returnDescription: 'Always returns null (does not affect last value)',
        example: 'log "Hello" "World"  # Prints: Hello World'
    },

    obj: {
        description: 'Creates an object from a JSON5 string, or returns an empty object if no arguments',
        parameters: [
            {
                name: 'jsonString',
                dataType: 'string',
                description: 'JSON5 string to parse into an object (optional)',
                formInputType: 'textarea',
                required: false
            }
        ],
        returnType: 'object',
        returnDescription: 'Parsed object or empty object',
        example: 'obj \'{name: "John", age: 30}\'  # Returns {name: "John", age: 30}'
    },

    array: {
        description: 'Creates an array from the given arguments',
        parameters: [
            {
                name: 'args',
                label: 'Arguments',
                dataType: 'any',
                description: 'Values to include in the array (any number of arguments)',
                formInputType: 'json',
                required: false,
                children: {
                    name: 'value',
                    dataType: 'any',
                    description: 'Value to include in the array',
                    formInputType: 'json',
                    required: false
                }
            }
        ],
        returnType: 'array',
        returnDescription: 'New array containing all provided values',
        example: 'array 1 2 3 "hello"  # Returns [1, 2, 3, "hello"]'
    },

    tag: {
        description: 'Declares metadata for types, names, and descriptions (no-op command)',
        parameters: [
            {
                name: 'type',
                dataType: 'string',
                description: 'Type of the tag',
                formInputType: 'text',
                required: true
            },
            {
                name: 'name',
                dataType: 'string',
                description: 'Name of the tag',
                formInputType: 'text',
                required: true
            },
            {
                name: 'description',
                dataType: 'string',
                description: 'Description of the tag',
                formInputType: 'textarea',
                required: true
            }
        ],
        returnType: 'null',
        returnDescription: 'Always returns null',
        example: 'tag type "User" "Represents a user object"'
    },

    meta: {
        description: 'Adds metadata for functions or variables (actual implementation handled by executeCommand)',
        parameters: [
            {
                name: 'target',
                dataType: 'string',
                description: 'Target to add metadata to (fn/variable name)',
                formInputType: 'text',
                required: true
            },
            {
                name: 'key',
                dataType: 'string',
                description: 'Metadata key',
                formInputType: 'text',
                required: true
            },
            {
                name: 'value',
                dataType: 'any',
                description: 'Metadata value',
                formInputType: 'json',
                required: true
            }
        ],
        returnType: 'null',
        returnDescription: 'Always returns null',
        example: 'meta $a description "A variable to add number"'
    },

    getMeta: {
        description: 'Retrieves metadata for functions or variables (actual implementation handled by executeCommand)',
        parameters: [
            {
                name: 'target',
                dataType: 'string',
                description: 'Target to get metadata from (fn/variable name)',
                formInputType: 'text',
                required: true
            },
            {
                name: 'key',
                dataType: 'string',
                description: 'Metadata key (optional, if omitted returns all metadata)',
                formInputType: 'text',
                required: false
            }
        ],
        returnType: 'any',
        returnDescription: 'Metadata value or object containing all metadata',
        example: 'getMeta $a description  # Returns metadata value'
    },

    getType: {
        description: 'Returns the type of a variable as a string (actual implementation handled by executeCommand)',
        parameters: [
            {
                name: 'variable',
                dataType: 'string',
                description: 'Variable name to get type of',
                formInputType: 'text',
                required: true
            }
        ],
        returnType: 'string',
        returnDescription: 'Type string: "string", "number", "boolean", "object", "array", or "null"',
        example: 'getType $myVar  # Returns "string"'
    },

    clear: {
        description: 'Clears the last return value ($) (actual implementation handled by executeCommand)',
        parameters: [],
        returnType: 'null',
        returnDescription: 'Always returns null',
        example: 'math.add 10 20  # $ = 30\nclear  # $ = null'
    },

    forget: {
        description: 'Ignores a variable or function in the current scope only (actual implementation handled by executeCommand)',
        parameters: [
            {
                name: 'target',
                dataType: 'string',
                description: 'Variable or function name to forget',
                formInputType: 'text',
                required: true
            }
        ],
        returnType: 'null',
        returnDescription: 'Always returns null',
        example: 'scope\n  forget $x\n  $x  # Returns null\nendscope'
    },

    set: {
        description: 'Assigns a value to a variable, with optional fallback if value is empty/null (actual implementation handled by executeCommand)',
        parameters: [
            {
                name: 'variable',
                dataType: 'string',
                description: 'Variable name to assign to (e.g., $myVar or $user.name)',
                formInputType: 'text',
                required: true
            },
            {
                name: 'value',
                dataType: 'any',
                description: 'Value to assign',
                formInputType: 'code',
                required: true
            },
            {
                name: 'fallback',
                dataType: 'any',
                description: 'Fallback value to use if value is empty/null (optional)',
                formInputType: 'code',
                required: false
            }
        ],
        returnType: 'null',
        returnDescription: 'Always returns null (does not affect last value)',
        example: 'set $myVar "hello"  # $myVar = "hello"\nset $x "" "default"  # $x = "default" (fallback used)'
    },

    get: {
        description: 'Gets a value from an object using a dot-notation path',
        parameters: [
            {
                name: 'obj',
                dataType: 'object',
                description: 'Object to get value from',
                formInputType: 'json',
                required: true
            },
            {
                name: 'path',
                dataType: 'string',
                description: 'Dot-notation path (e.g., "user.name")',
                formInputType: 'text',
                required: true
            }
        ],
        returnType: 'any',
        returnDescription: 'Value at the specified path, or null if not found',
        example: 'get {user: {name: "John"}} "user.name"  # Returns "John"'
    },

    range: {
        description: 'Generates an array of numbers from start to end (inclusive)',
        parameters: [
            {
                name: 'start',
                dataType: 'number',
                description: 'Start value (inclusive)',
                formInputType: 'number',
                required: true
            },
            {
                name: 'end',
                dataType: 'number',
                description: 'End value (inclusive)',
                formInputType: 'number',
                required: true
            },
            {
                name: 'step',
                dataType: 'number',
                description: 'Step size (optional, defaults to 1 or -1 based on direction)',
                formInputType: 'number',
                required: false
            }
        ],
        returnType: 'array',
        returnDescription: 'Array of numbers from start to end',
        example: 'range 1 5  # Returns [1, 2, 3, 4, 5]'
    }
};

export const CoreModuleMetadata: ModuleMetadata = {
    description: 'Core built-in functions including logging, object creation, arrays, metadata, and utilities',
    methods: [
        'log',
        'obj',
        'array',
        'tag',
        'meta',
        'getMeta',
        'getType',
        'clear',
        'forget',
        'set',
        'get',
        'range'
    ]
};

// Module adapter for auto-loading
const CoreModule: ModuleAdapter = {
    name: 'core',
    functions: CoreFunctions,
    functionMetadata: CoreFunctionMetadata,
    moduleMetadata: CoreModuleMetadata,
    global: true // Register functions globally (without module prefix)
};

export default CoreModule;
