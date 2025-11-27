import type { 
    BuiltinHandler, 
    FunctionMetadata, 
    ModuleMetadata,
    ModuleAdapter
} from '../index';

/**
 * JSON module for RobinPath
 * Provides JSON parsing, stringification, and manipulation operations
 */

export const JsonFunctions: Record<string, BuiltinHandler> = {
    parse: (args) => {
        const str = String(args[0] ?? '');
        try {
            return JSON.parse(str);
        } catch (error) {
            throw new Error(`JSON parse error: ${error instanceof Error ? error.message : String(error)}`);
        }
    },

    stringify: (args) => {
        const value = args[0];
        const indent = args[1] !== undefined ? Number(args[1]) : undefined;
        try {
            if (indent !== undefined && indent >= 0) {
                return JSON.stringify(value, null, indent);
            }
            return JSON.stringify(value);
        } catch (error) {
            throw new Error(`JSON stringify error: ${error instanceof Error ? error.message : String(error)}`);
        }
    },

    isValid: (args) => {
        const str = String(args[0] ?? '');
        try {
            JSON.parse(str);
            return true;
        } catch {
            return false;
        }
    },

    get: (args) => {
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

    set: (args) => {
        const obj = args[0];
        const path = String(args[1] ?? '');
        const value = args[2];
        
        if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
            throw new Error('First argument must be a non-array object');
        }
        
        const keys = path.split('.');
        const lastKey = keys.pop();
        if (!lastKey) {
            throw new Error('Path cannot be empty');
        }
        
        let current: any = obj;
        for (const key of keys) {
            if (current[key] === null || current[key] === undefined || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }
        
        current[lastKey] = value;
        return obj;
    },

    keys: (args) => {
        const obj = args[0];
        if (typeof obj !== 'object' || obj === null) {
            return [];
        }
        return Object.keys(obj);
    },

    values: (args) => {
        const obj = args[0];
        if (typeof obj !== 'object' || obj === null) {
            return [];
        }
        return Object.values(obj);
    },

    entries: (args) => {
        const obj = args[0];
        if (typeof obj !== 'object' || obj === null) {
            return [];
        }
        return Object.entries(obj);
    },

    merge: (args) => {
        if (args.length === 0) {
            return {};
        }
        
        const result: any = {};
        for (const obj of args) {
            if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
                Object.assign(result, obj);
            }
        }
        return result;
    },

    clone: (args) => {
        const value = args[0];
        try {
            return JSON.parse(JSON.stringify(value));
        } catch {
            throw new Error('Unable to clone value');
        }
    }
};

export const JsonFunctionMetadata: Record<string, FunctionMetadata> = {
    parse: {
        description: 'Parses a JSON string into a JavaScript value',
        parameters: [
            {
                name: 'str',
                dataType: 'string',
                description: 'JSON string to parse',
                formInputType: 'textarea',
                required: true
            }
        ],
        returnType: 'any',
        returnDescription: 'Parsed JavaScript value (object, array, string, number, boolean, or null)',
        example: 'json.parse \'{"name": "John"}\'  # Returns {name: "John"}'
    },

    stringify: {
        description: 'Converts a JavaScript value to a JSON string',
        parameters: [
            {
                name: 'value',
                dataType: 'any',
                description: 'Value to stringify',
                formInputType: 'json',
                required: true
            },
            {
                name: 'indent',
                dataType: 'number',
                description: 'Number of spaces for indentation (optional, for pretty printing)',
                formInputType: 'number',
                required: false
            }
        ],
        returnType: 'string',
        returnDescription: 'JSON string representation of the value',
        example: 'json.stringify {name: "John"}  # Returns \'{"name":"John"}\''
    },

    isValid: {
        description: 'Checks if a string is valid JSON',
        parameters: [
            {
                name: 'str',
                dataType: 'string',
                description: 'String to validate',
                formInputType: 'textarea',
                required: true
            }
        ],
        returnType: 'boolean',
        returnDescription: 'True if the string is valid JSON',
        example: 'json.isValid \'{"valid": true}\'  # Returns true'
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
        example: 'json.get {user: {name: "John"}} "user.name"  # Returns "John"'
    },

    set: {
        description: 'Sets a value in an object using a dot-notation path',
        parameters: [
            {
                name: 'obj',
                dataType: 'object',
                description: 'Object to set value in',
                formInputType: 'json',
                required: true
            },
            {
                name: 'path',
                dataType: 'string',
                description: 'Dot-notation path (e.g., "user.name")',
                formInputType: 'text',
                required: true
            },
            {
                name: 'value',
                dataType: 'any',
                description: 'Value to set',
                formInputType: 'json',
                required: true
            }
        ],
        returnType: 'object',
        returnDescription: 'The modified object',
        example: 'json.set {user: {}} "user.name" "John"  # Returns {user: {name: "John"}}'
    },

    keys: {
        description: 'Returns an array of an object\'s own enumerable property names',
        parameters: [
            {
                name: 'obj',
                dataType: 'object',
                description: 'Object to get keys from',
                formInputType: 'json',
                required: true
            }
        ],
        returnType: 'array',
        returnDescription: 'Array of property names',
        example: 'json.keys {a: 1, b: 2}  # Returns ["a", "b"]'
    },

    values: {
        description: 'Returns an array of an object\'s own enumerable property values',
        parameters: [
            {
                name: 'obj',
                dataType: 'object',
                description: 'Object to get values from',
                formInputType: 'json',
                required: true
            }
        ],
        returnType: 'array',
        returnDescription: 'Array of property values',
        example: 'json.values {a: 1, b: 2}  # Returns [1, 2]'
    },

    entries: {
        description: 'Returns an array of an object\'s own enumerable [key, value] pairs',
        parameters: [
            {
                name: 'obj',
                dataType: 'object',
                description: 'Object to get entries from',
                formInputType: 'json',
                required: true
            }
        ],
        returnType: 'array',
        returnDescription: 'Array of [key, value] pairs',
        example: 'json.entries {a: 1, b: 2}  # Returns [["a", 1], ["b", 2]]'
    },

    merge: {
        description: 'Merges multiple objects into a single object',
        parameters: [
            {
                name: 'objects',
                dataType: 'array',
                description: 'Array of objects to merge (or multiple object arguments)',
                formInputType: 'json',
                required: true
            }
        ],
        returnType: 'object',
        returnDescription: 'Merged object (later objects override earlier ones)',
        example: 'json.merge {a: 1} {b: 2}  # Returns {a: 1, b: 2}'
    },

    clone: {
        description: 'Creates a deep copy of a value using JSON serialization',
        parameters: [
            {
                name: 'value',
                dataType: 'any',
                description: 'Value to clone',
                formInputType: 'json',
                required: true
            }
        ],
        returnType: 'any',
        returnDescription: 'Deep copy of the value',
        example: 'json.clone {a: 1, b: {c: 2}}  # Returns a deep copy'
    }
};

export const JsonModuleMetadata: ModuleMetadata = {
    description: 'JSON parsing, stringification, and object manipulation operations',
    methods: [
        'parse',
        'stringify',
        'isValid',
        'get',
        'set',
        'keys',
        'values',
        'entries',
        'merge',
        'clone'
    ]
};

// Module adapter for auto-loading
const JsonModule: ModuleAdapter = {
    name: 'json',
    functions: JsonFunctions,
    functionMetadata: JsonFunctionMetadata,
    moduleMetadata: JsonModuleMetadata,
    global: false
};

export default JsonModule;

