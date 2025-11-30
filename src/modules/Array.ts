import type { 
    BuiltinHandler, 
    FunctionMetadata, 
    ModuleMetadata,
    ModuleAdapter
} from '../index';

/**
 * Array module for RobinPath
 * Provides array manipulation operations
 */

export const ArrayFunctions: Record<string, BuiltinHandler> = {
    length: (args) => {
        const arr = args[0];
        if (!Array.isArray(arr)) {
            throw new Error('First argument must be an array');
        }
        return arr.length;
    },

    get: (args) => {
        const arr = args[0];
        const index = Number(args[1]) || 0;
        
        if (!Array.isArray(arr)) {
            throw new Error('First argument must be an array');
        }
        
        if (index < 0 || index >= arr.length) {
            return null;
        }
        
        return arr[index];
    },

    slice: (args) => {
        const arr = args[0];
        const start = Number(args[1]) || 0;
        const end = args[2] !== undefined ? Number(args[2]) : undefined;
        
        if (!Array.isArray(arr)) {
            throw new Error('First argument must be an array');
        }
        
        if (end !== undefined) {
            return arr.slice(start, end);
        }
        return arr.slice(start);
    },

    push: (args) => {
        const arr = args[0];
        const value = args[1];
        
        if (!Array.isArray(arr)) {
            throw new Error('First argument must be an array');
        }
        
        // Create a copy to avoid mutating the original
        const newArr = [...arr];
        newArr.push(value);
        return newArr;
    },

    concat: (args) => {
        const arr1 = args[0];
        const arr2 = args[1];
        
        if (!Array.isArray(arr1)) {
            throw new Error('First argument must be an array');
        }
        if (!Array.isArray(arr2)) {
            throw new Error('Second argument must be an array');
        }
        
        return arr1.concat(arr2);
    },

    join: (args) => {
        const arr = args[0];
        const delimiter = args[1] !== undefined ? String(args[1]) : ',';
        
        if (!Array.isArray(arr)) {
            throw new Error('First argument must be an array');
        }
        
        return arr.map(item => String(item ?? '')).join(delimiter);
    },

    create: (args) => {
        // Return all arguments as an array
        return [...args];
    }
};

export const ArrayFunctionMetadata: Record<string, FunctionMetadata> = {
    length: {
        description: 'Returns the length of an array',
        parameters: [
            {
                name: 'arr',
                dataType: 'array',
                description: 'Array to get length of',
                formInputType: 'json',
                required: true
            }
        ],
        returnType: 'number',
        returnDescription: 'Length of the array',
        example: 'length range 1 5  # Returns 5'
    },

    get: {
        description: 'Gets an element from an array by index',
        parameters: [
            {
                name: 'arr',
                dataType: 'array',
                description: 'Array to get element from',
                formInputType: 'json',
                required: true
            },
            {
                name: 'index',
                dataType: 'number',
                description: 'Index of the element (0-based)',
                formInputType: 'number',
                required: true
            }
        ],
        returnType: 'any',
        returnDescription: 'Element at the specified index, or null if out of bounds',
        example: 'get range 1 5 2  # Returns 3'
    },

    slice: {
        description: 'Extracts a section of an array',
        parameters: [
            {
                name: 'arr',
                dataType: 'array',
                description: 'Array to slice',
                formInputType: 'json',
                required: true
            },
            {
                name: 'start',
                dataType: 'number',
                description: 'Start index (inclusive)',
                formInputType: 'number',
                required: true
            },
            {
                name: 'end',
                dataType: 'number',
                description: 'End index (exclusive). If omitted, slices to end of array',
                formInputType: 'number',
                required: false
            }
        ],
        returnType: 'array',
        returnDescription: 'New array containing the sliced elements',
        example: 'slice range 1 10 2 5  # Returns [3, 4, 5]'
    },

    push: {
        description: 'Adds an element to the end of an array (returns new array)',
        parameters: [
            {
                name: 'arr',
                dataType: 'array',
                description: 'Array to add element to',
                formInputType: 'json',
                required: true
            },
            {
                name: 'value',
                dataType: 'any',
                description: 'Value to add',
                formInputType: 'json',
                required: true
            }
        ],
        returnType: 'array',
        returnDescription: 'New array with the element added',
        example: 'push range 1 3 4  # Returns [1, 2, 3, 4]'
    },

    concat: {
        description: 'Concatenates two arrays',
        parameters: [
            {
                name: 'arr1',
                dataType: 'array',
                description: 'First array',
                formInputType: 'json',
                required: true
            },
            {
                name: 'arr2',
                dataType: 'array',
                description: 'Second array',
                formInputType: 'json',
                required: true
            }
        ],
        returnType: 'array',
        returnDescription: 'New array containing elements from both arrays',
        example: 'concat range 1 2 range 3 4  # Returns [1, 2, 3, 4]'
    },

    join: {
        description: 'Joins array elements into a string with a delimiter',
        parameters: [
            {
                name: 'arr',
                dataType: 'array',
                description: 'Array to join',
                formInputType: 'json',
                required: true
            },
            {
                name: 'delimiter',
                dataType: 'string',
                description: 'Delimiter to join with. Defaults to comma',
                formInputType: 'text',
                required: false,
                defaultValue: ','
            }
        ],
        returnType: 'string',
        returnDescription: 'Joined string',
        example: 'join range 1 3 ","  # Returns "1,2,3"'
    },

    create: {
        description: 'Creates an array from the given arguments',
        parameters: [
            {
                name: 'Arguments',
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
        example: 'array.create 1 2 3 "hello"  # Returns [1, 2, 3, "hello"]'
    }
};

export const ArrayModuleMetadata: ModuleMetadata = {
    description: 'Array manipulation operations including length, indexing, slicing, and joining',
    methods: [
        'length',
        'get',
        'slice',
        'push',
        'concat',
        'join',
        'create'
    ]
};

// Module adapter for auto-loading
const ArrayModule: ModuleAdapter = {
    name: 'array',
    functions: ArrayFunctions,
    functionMetadata: ArrayFunctionMetadata,
    moduleMetadata: ArrayModuleMetadata,
    global: false
};

export default ArrayModule;

