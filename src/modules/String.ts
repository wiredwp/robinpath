import type { 
    BuiltinHandler, 
    FunctionMetadata, 
    ModuleMetadata,
    ModuleAdapter
} from '../index';

/**
 * String module for RobinPath
 * Provides string manipulation operations and functions
 */

export const StringFunctions: Record<string, BuiltinHandler> = {
    length: (args) => {
        const str = String(args[0] ?? '');
        return str.length;
    },

    substring: (args) => {
        const str = String(args[0] ?? '');
        const start = Number(args[1]) || 0;
        const end = args[2] !== undefined ? Number(args[2]) : str.length;
        return str.substring(start, end);
    },

    toUpperCase: (args) => {
        const str = String(args[0] ?? '');
        return str.toUpperCase();
    },

    toLowerCase: (args) => {
        const str = String(args[0] ?? '');
        return str.toLowerCase();
    },

    trim: (args) => {
        const str = String(args[0] ?? '');
        return str.trim();
    },

    replace: (args) => {
        const str = String(args[0] ?? '');
        const search = String(args[1] ?? '');
        const replace = String(args[2] ?? '');
        return str.replace(new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replace);
    },

    replaceAll: (args) => {
        const str = String(args[0] ?? '');
        const search = String(args[1] ?? '');
        const replace = String(args[2] ?? '');
        return str.split(search).join(replace);
    },

    split: (args) => {
        const str = String(args[0] ?? '');
        const delimiter = args[1] !== undefined ? String(args[1]) : '';
        return str.split(delimiter);
    },

    join: (args) => {
        const delimiter = args.length > 1 && typeof args[args.length - 1] === 'string' 
            ? String(args[args.length - 1]) 
            : '';
        const items = Array.isArray(args[0]) ? args[0] : args.slice(0, args.length > 1 ? -1 : undefined);
        return items.map(item => String(item ?? '')).join(delimiter);
    },

    startsWith: (args) => {
        const str = String(args[0] ?? '');
        const prefix = String(args[1] ?? '');
        return str.startsWith(prefix);
    },

    endsWith: (args) => {
        const str = String(args[0] ?? '');
        const suffix = String(args[1] ?? '');
        return str.endsWith(suffix);
    },

    contains: (args) => {
        const str = String(args[0] ?? '');
        const search = String(args[1] ?? '');
        return str.includes(search);
    },

    indexOf: (args) => {
        const str = String(args[0] ?? '');
        const search = String(args[1] ?? '');
        return str.indexOf(search);
    },

    lastIndexOf: (args) => {
        const str = String(args[0] ?? '');
        const search = String(args[1] ?? '');
        return str.lastIndexOf(search);
    },

    charAt: (args) => {
        const str = String(args[0] ?? '');
        const index = Number(args[1]) || 0;
        return str.charAt(index);
    },

    padStart: (args) => {
        const str = String(args[0] ?? '');
        const length = Number(args[1]) || 0;
        const padString = args[2] !== undefined ? String(args[2]) : ' ';
        return str.padStart(length, padString);
    },

    padEnd: (args) => {
        const str = String(args[0] ?? '');
        const length = Number(args[1]) || 0;
        const padString = args[2] !== undefined ? String(args[2]) : ' ';
        return str.padEnd(length, padString);
    },

    repeat: (args) => {
        const str = String(args[0] ?? '');
        const count = Number(args[1]) || 0;
        return str.repeat(Math.max(0, count));
    }
};

export const StringFunctionMetadata: Record<string, FunctionMetadata> = {
    length: {
        description: 'Returns the length of a string',
        parameters: [
            {
                name: 'str',
                dataType: 'string',
                description: 'String to get length of',
                formInputType: 'text',
                required: true
            }
        ],
        returnType: 'number',
        returnDescription: 'Length of the string',
        example: 'length "hello"  # Returns 5'
    },

    substring: {
        description: 'Extracts a substring from a string',
        parameters: [
            {
                name: 'str',
                dataType: 'string',
                description: 'Source string',
                formInputType: 'text',
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
                description: 'End index (exclusive). If omitted, extracts to end of string',
                formInputType: 'number',
                required: false
            }
        ],
        returnType: 'string',
        returnDescription: 'Extracted substring',
        example: 'substring "hello" 1 4  # Returns "ell"'
    },

    toUpperCase: {
        description: 'Converts a string to uppercase',
        parameters: [
            {
                name: 'str',
                dataType: 'string',
                description: 'String to convert',
                formInputType: 'text',
                required: true
            }
        ],
        returnType: 'string',
        returnDescription: 'Uppercase version of the string',
        example: 'toUpperCase "hello"  # Returns "HELLO"'
    },

    toLowerCase: {
        description: 'Converts a string to lowercase',
        parameters: [
            {
                name: 'str',
                dataType: 'string',
                description: 'String to convert',
                formInputType: 'text',
                required: true
            }
        ],
        returnType: 'string',
        returnDescription: 'Lowercase version of the string',
        example: 'toLowerCase "HELLO"  # Returns "hello"'
    },

    trim: {
        description: 'Removes whitespace from both ends of a string',
        parameters: [
            {
                name: 'str',
                dataType: 'string',
                description: 'String to trim',
                formInputType: 'text',
                required: true
            }
        ],
        returnType: 'string',
        returnDescription: 'Trimmed string',
        example: 'trim "  hello  "  # Returns "hello"'
    },

    replace: {
        description: 'Replaces the first occurrence of a substring in a string',
        parameters: [
            {
                name: 'str',
                dataType: 'string',
                description: 'Source string',
                formInputType: 'text',
                required: true
            },
            {
                name: 'search',
                dataType: 'string',
                description: 'Substring to search for',
                formInputType: 'text',
                required: true
            },
            {
                name: 'replace',
                dataType: 'string',
                description: 'Replacement string',
                formInputType: 'text',
                required: true
            }
        ],
        returnType: 'string',
        returnDescription: 'String with first occurrence replaced',
        example: 'replace "hello world" "world" "universe"  # Returns "hello universe"'
    },

    replaceAll: {
        description: 'Replaces all occurrences of a substring in a string',
        parameters: [
            {
                name: 'str',
                dataType: 'string',
                description: 'Source string',
                formInputType: 'text',
                required: true
            },
            {
                name: 'search',
                dataType: 'string',
                description: 'Substring to search for',
                formInputType: 'text',
                required: true
            },
            {
                name: 'replace',
                dataType: 'string',
                description: 'Replacement string',
                formInputType: 'text',
                required: true
            }
        ],
        returnType: 'string',
        returnDescription: 'String with all occurrences replaced',
        example: 'replaceAll "a b a" "a" "x"  # Returns "x b x"'
    },

    split: {
        description: 'Splits a string into an array of substrings',
        parameters: [
            {
                name: 'str',
                dataType: 'string',
                description: 'String to split',
                formInputType: 'text',
                required: true
            },
            {
                name: 'delimiter',
                dataType: 'string',
                description: 'Delimiter to split on. If omitted, splits into individual characters',
                formInputType: 'text',
                required: false
            }
        ],
        returnType: 'array',
        returnDescription: 'Array of substrings',
        example: 'split "a,b,c" ","  # Returns ["a", "b", "c"]'
    },

    join: {
        description: 'Joins array elements into a string',
        parameters: [
            {
                name: 'items',
                dataType: 'array',
                description: 'Array of items to join',
                formInputType: 'json',
                required: true
            },
            {
                name: 'delimiter',
                dataType: 'string',
                description: 'Delimiter to join with',
                formInputType: 'text',
                required: false,
                defaultValue: ''
            }
        ],
        returnType: 'string',
        returnDescription: 'Joined string',
        example: 'join ["a", "b", "c"] ","  # Returns "a,b,c"'
    },

    startsWith: {
        description: 'Checks if a string starts with a given prefix',
        parameters: [
            {
                name: 'str',
                dataType: 'string',
                description: 'String to check',
                formInputType: 'text',
                required: true
            },
            {
                name: 'prefix',
                dataType: 'string',
                description: 'Prefix to check for',
                formInputType: 'text',
                required: true
            }
        ],
        returnType: 'boolean',
        returnDescription: 'True if string starts with prefix',
        example: 'startsWith "hello" "he"  # Returns true'
    },

    endsWith: {
        description: 'Checks if a string ends with a given suffix',
        parameters: [
            {
                name: 'str',
                dataType: 'string',
                description: 'String to check',
                formInputType: 'text',
                required: true
            },
            {
                name: 'suffix',
                dataType: 'string',
                description: 'Suffix to check for',
                formInputType: 'text',
                required: true
            }
        ],
        returnType: 'boolean',
        returnDescription: 'True if string ends with suffix',
        example: 'endsWith "hello" "lo"  # Returns true'
    },

    contains: {
        description: 'Checks if a string contains a given substring',
        parameters: [
            {
                name: 'str',
                dataType: 'string',
                description: 'String to search in',
                formInputType: 'text',
                required: true
            },
            {
                name: 'search',
                dataType: 'string',
                description: 'Substring to search for',
                formInputType: 'text',
                required: true
            }
        ],
        returnType: 'boolean',
        returnDescription: 'True if string contains the substring',
        example: 'contains "hello" "ell"  # Returns true'
    },

    indexOf: {
        description: 'Returns the index of the first occurrence of a substring',
        parameters: [
            {
                name: 'str',
                dataType: 'string',
                description: 'String to search in',
                formInputType: 'text',
                required: true
            },
            {
                name: 'search',
                dataType: 'string',
                description: 'Substring to search for',
                formInputType: 'text',
                required: true
            }
        ],
        returnType: 'number',
        returnDescription: 'Index of first occurrence, or -1 if not found',
        example: 'indexOf "hello" "l"  # Returns 2'
    },

    lastIndexOf: {
        description: 'Returns the index of the last occurrence of a substring',
        parameters: [
            {
                name: 'str',
                dataType: 'string',
                description: 'String to search in',
                formInputType: 'text',
                required: true
            },
            {
                name: 'search',
                dataType: 'string',
                description: 'Substring to search for',
                formInputType: 'text',
                required: true
            }
        ],
        returnType: 'number',
        returnDescription: 'Index of last occurrence, or -1 if not found',
        example: 'lastIndexOf "hello" "l"  # Returns 3'
    },

    charAt: {
        description: 'Returns the character at a given index',
        parameters: [
            {
                name: 'str',
                dataType: 'string',
                description: 'Source string',
                formInputType: 'text',
                required: true
            },
            {
                name: 'index',
                dataType: 'number',
                description: 'Character index',
                formInputType: 'number',
                required: true
            }
        ],
        returnType: 'string',
        returnDescription: 'Character at the given index',
        example: 'charAt "hello" 1  # Returns "e"'
    },

    padStart: {
        description: 'Pads the start of a string to a given length',
        parameters: [
            {
                name: 'str',
                dataType: 'string',
                description: 'String to pad',
                formInputType: 'text',
                required: true
            },
            {
                name: 'length',
                dataType: 'number',
                description: 'Target length',
                formInputType: 'number',
                required: true
            },
            {
                name: 'padString',
                dataType: 'string',
                description: 'String to pad with. Defaults to space',
                formInputType: 'text',
                required: false,
                defaultValue: ' '
            }
        ],
        returnType: 'string',
        returnDescription: 'Padded string',
        example: 'padStart "5" 3 "0"  # Returns "005"'
    },

    padEnd: {
        description: 'Pads the end of a string to a given length',
        parameters: [
            {
                name: 'str',
                dataType: 'string',
                description: 'String to pad',
                formInputType: 'text',
                required: true
            },
            {
                name: 'length',
                dataType: 'number',
                description: 'Target length',
                formInputType: 'number',
                required: true
            },
            {
                name: 'padString',
                dataType: 'string',
                description: 'String to pad with. Defaults to space',
                formInputType: 'text',
                required: false,
                defaultValue: ' '
            }
        ],
        returnType: 'string',
        returnDescription: 'Padded string',
        example: 'padEnd "5" 3 "0"  # Returns "500"'
    },

    repeat: {
        description: 'Repeats a string a given number of times',
        parameters: [
            {
                name: 'str',
                dataType: 'string',
                description: 'String to repeat',
                formInputType: 'text',
                required: true
            },
            {
                name: 'count',
                dataType: 'number',
                description: 'Number of times to repeat',
                formInputType: 'number',
                required: true
            }
        ],
        returnType: 'string',
        returnDescription: 'Repeated string',
        example: 'repeat "ha" 3  # Returns "hahaha"'
    }
};

export const StringModuleMetadata: ModuleMetadata = {
    description: 'String manipulation operations including substring extraction, case conversion, searching, and formatting',
    methods: [
        'length',
        'substring',
        'toUpperCase',
        'toLowerCase',
        'trim',
        'replace',
        'replaceAll',
        'split',
        'join',
        'startsWith',
        'endsWith',
        'contains',
        'indexOf',
        'lastIndexOf',
        'charAt',
        'padStart',
        'padEnd',
        'repeat'
    ]
};

// Module adapter for auto-loading
const StringModule: ModuleAdapter = {
    name: 'string',
    functions: StringFunctions,
    functionMetadata: StringFunctionMetadata,
    moduleMetadata: StringModuleMetadata,
    global: false
};

export default StringModule;

