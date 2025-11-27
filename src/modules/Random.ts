import type { 
    BuiltinHandler, 
    FunctionMetadata, 
    ModuleMetadata,
    ModuleAdapter
} from '../index';

/**
 * Random module for RobinPath
 * Provides random number generation and selection utilities
 */

// Simple UUID v4 generator
function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export const RandomFunctions: Record<string, BuiltinHandler> = {
    int: (args) => {
        const min = Number(args[0]) || 0;
        const max = Number(args[1]) || 1;
        const minInt = Math.ceil(min);
        const maxInt = Math.floor(max);
        if (minInt > maxInt) {
            throw new Error('Min must be less than or equal to max');
        }
        return Math.floor(Math.random() * (maxInt - minInt + 1)) + minInt;
    },

    float: () => {
        return Math.random();
    },

    uuid: () => {
        return generateUUID();
    },

    choice: (args) => {
        const arr = args[0];
        if (!Array.isArray(arr)) {
            throw new Error('First argument must be an array');
        }
        if (arr.length === 0) {
            throw new Error('Array cannot be empty');
        }
        const index = Math.floor(Math.random() * arr.length);
        return arr[index];
    }
};

export const RandomFunctionMetadata: Record<string, FunctionMetadata> = {
    int: {
        description: 'Generates a random integer between min and max (inclusive)',
        parameters: [
            {
                name: 'min',
                dataType: 'number',
                description: 'Minimum value (inclusive)',
                formInputType: 'number',
                required: true
            },
            {
                name: 'max',
                dataType: 'number',
                description: 'Maximum value (inclusive)',
                formInputType: 'number',
                required: true
            }
        ],
        returnType: 'number',
        returnDescription: 'Random integer between min and max',
        example: 'random.int 1 10  # Returns a random integer between 1 and 10'
    },

    float: {
        description: 'Generates a random floating-point number between 0 and 1',
        parameters: [],
        returnType: 'number',
        returnDescription: 'Random float between 0 (inclusive) and 1 (exclusive)',
        example: 'random.float  # Returns a random float like 0.123456'
    },

    uuid: {
        description: 'Generates a random UUID v4',
        parameters: [],
        returnType: 'string',
        returnDescription: 'Random UUID v4 string',
        example: 'random.uuid  # Returns a UUID like "550e8400-e29b-41d4-a716-446655440000"'
    },

    choice: {
        description: 'Randomly selects one element from an array',
        parameters: [
            {
                name: 'array',
                dataType: 'array',
                description: 'Array to choose from',
                formInputType: 'json',
                required: true
            }
        ],
        returnType: 'any',
        returnDescription: 'Randomly selected element from the array',
        example: 'random.choice range 1 5  # Returns a random number from [1, 2, 3, 4, 5]'
    }
};

export const RandomModuleMetadata: ModuleMetadata = {
    description: 'Random number generation and selection utilities for IDs, tests, and sampling',
    methods: [
        'int',
        'float',
        'uuid',
        'choice'
    ]
};

// Module adapter for auto-loading
const RandomModule: ModuleAdapter = {
    name: 'random',
    functions: RandomFunctions,
    functionMetadata: RandomFunctionMetadata,
    moduleMetadata: RandomModuleMetadata,
    global: false
};

export default RandomModule;

