import type { 
    BuiltinHandler, 
    FunctionMetadata, 
    ModuleMetadata,
    ModuleAdapter
} from '../index';

/**
 * Object module for RobinPath
 * Provides object manipulation operations (get, set, keys, values, entries, merge, clone)
 */

export const ObjectFunctions: Record<string, BuiltinHandler> = {

    keyLength: (args) => {
        const obj = args[0];
        if (typeof obj !== 'object' || obj === null) {
            return 0;
        }
        return Object.keys(obj).length;
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

export const ObjectFunctionMetadata: Record<string, FunctionMetadata> = {
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
        example: 'keys {a: 1, b: 2}  # Returns ["a", "b"]'
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
        example: 'values {a: 1, b: 2}  # Returns [1, 2]'
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
        example: 'entries {a: 1, b: 2}  # Returns [["a", 1], ["b", 2]]'
    },

    merge: {
        description: 'Merges multiple objects into a single object',
        parameters: [
            {
                name: 'args',
                label: 'Arguments',
                dataType: 'array',
                description: 'Array of objects to merge (or multiple object arguments)',
                formInputType: 'json',
                required: true,
                children: {
                    name: 'object',
                    dataType: 'object',
                    description: 'Object to merge',
                    formInputType: 'json',
                    required: true
                }
            }
        ],
        returnType: 'object',
        returnDescription: 'Merged object (later objects override earlier ones)',
        example: 'merge {a: 1} {b: 2}  # Returns {a: 1, b: 2}'
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
        example: 'clone {a: 1, b: {c: 2}}  # Returns a deep copy'
    }
};

export const ObjectModuleMetadata: ModuleMetadata = {
    description: 'Object manipulation operations (keys, values, entries, merge, clone)',
    methods: [
        'keys',
        'values',
        'entries',
        'merge',
        'clone'
    ]
};

// Module adapter for auto-loading
const ObjectModule: ModuleAdapter = {
    name: 'object',
    functions: ObjectFunctions,
    functionMetadata: ObjectFunctionMetadata,
    moduleMetadata: ObjectModuleMetadata,
    global: true
};

export default ObjectModule;

