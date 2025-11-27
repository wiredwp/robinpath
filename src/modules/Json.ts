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
    }
};

export const JsonModuleMetadata: ModuleMetadata = {
    description: 'JSON parsing and stringification operations',
    methods: [
        'parse',
        'stringify',
        'isValid'
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

