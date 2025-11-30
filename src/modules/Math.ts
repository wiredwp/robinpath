import type { 
    BuiltinHandler, 
    FunctionMetadata, 
    ModuleMetadata,
    ModuleAdapter
} from '../index';

/**
 * Math module for RobinPath
 * Provides mathematical operations and functions
 */

export const MathFunctions: Record<string, BuiltinHandler> = {
    add: (args) => {
        if (args.length === 0) return 0;
        return args.reduce((sum: number, val) => sum + (Number(val) || 0), 0);
    },

    subtract: (args) => {
        const a = args[0] ?? 0;
        const b = args[1] ?? 0;
        return (Number(a) || 0) - (Number(b) || 0);
    },

    multiply: (args) => {
        if (args.length === 0) return 0;
        return args.reduce((product: number, val) => product * (Number(val) || 0), 1);
    },

    divide: (args) => {
        const a = args[0] ?? 0;
        const b = args[1] ?? 0;
        if (Number(b) === 0) {
            throw new Error('Division by zero');
        }
        return (Number(a) || 0) / (Number(b) || 0);
    },

    modulo: (args) => {
        const a = args[0] ?? 0;
        const b = args[1] ?? 0;
        if (Number(b) === 0) {
            throw new Error('Modulo by zero');
        }
        return (Number(a) || 0) % (Number(b) || 0);
    },

    power: (args) => {
        const a = args[0] ?? 0;
        const b = args[1] ?? 0;
        return Math.pow(Number(a) || 0, Number(b) || 0);
    },

    sqrt: (args) => {
        const a = args[0] ?? 0;
        const num = Number(a) || 0;
        if (num < 0) {
            throw new Error('Square root of negative number');
        }
        return Math.sqrt(num);
    },

    abs: (args) => {
        const a = args[0] ?? 0;
        return Math.abs(Number(a) || 0);
    },

    round: (args) => {
        const a = args[0] ?? 0;
        return Math.round(Number(a) || 0);
    },

    floor: (args) => {
        const a = args[0] ?? 0;
        return Math.floor(Number(a) || 0);
    },

    ceil: (args) => {
        const a = args[0] ?? 0;
        return Math.ceil(Number(a) || 0);
    },

    min: (args) => {
        if (args.length === 0) return 0;
        return Math.min(...args.map(a => Number(a) || 0));
    },

    max: (args) => {
        if (args.length === 0) return 0;
        return Math.max(...args.map(a => Number(a) || 0));
    },

    sin: (args) => {
        const a = args[0] ?? 0;
        return Math.sin(Number(a) || 0);
    },

    cos: (args) => {
        const a = args[0] ?? 0;
        return Math.cos(Number(a) || 0);
    },

    tan: (args) => {
        const a = args[0] ?? 0;
        return Math.tan(Number(a) || 0);
    },

    pi: () => {
        return Math.PI;
    },

    e: () => {
        return Math.E;
    }
};

export const MathFunctionMetadata: Record<string, FunctionMetadata> = {
    add: {
        description: 'Adds multiple numbers together',
        parameters: [
            {
                name: 'args',
                label: 'Arguments',
                dataType: 'array',
                description: 'Numbers to add together (supports multiple arguments)',
                formInputType: 'json',
                required: true,
                children: {
                    name: 'value',
                    dataType: 'number',
                    description: 'Number to add',
                    formInputType: 'number',
                    required: true
                }
            }
        ],
        returnType: 'number',
        returnDescription: 'Sum of all the numbers',
        example: 'add 5 10 20  # Returns 35'
    },

    subtract: {
        description: 'Subtracts the second number from the first',
        parameters: [
            {
                name: 'a',
                dataType: 'number',
                description: 'Number to subtract from',
                formInputType: 'number',
                required: true
            },
            {
                name: 'b',
                dataType: 'number',
                description: 'Number to subtract',
                formInputType: 'number',
                required: true
            }
        ],
        returnType: 'number',
        returnDescription: 'Difference of the two numbers',
        example: 'subtract 10 3  # Returns 7'
    },

    multiply: {
        description: 'Multiplies multiple numbers together',
        parameters: [
            {
                name: 'args',
                label: 'Arguments',
                dataType: 'array',
                description: 'Numbers to multiply together (supports multiple arguments)',
                formInputType: 'json',
                required: true,
                children: {
                    name: 'value',
                    dataType: 'number',
                    description: 'Number to multiply',
                    formInputType: 'number',
                    required: true
                }
            }
        ],
        returnType: 'number',
        returnDescription: 'Product of all the numbers',
        example: 'multiply 5 3 2  # Returns 30'
    },

    divide: {
        description: 'Divides the first number by the second',
        parameters: [
            {
                name: 'a',
                dataType: 'number',
                description: 'Dividend (number to divide)',
                formInputType: 'number',
                required: true
            },
            {
                name: 'b',
                dataType: 'number',
                description: 'Divisor (number to divide by)',
                formInputType: 'number',
                required: true
            }
        ],
        returnType: 'number',
        returnDescription: 'Quotient of the division',
        example: 'divide 15 3  # Returns 5'
    },

    modulo: {
        description: 'Returns the remainder after division',
        parameters: [
            {
                name: 'a',
                dataType: 'number',
                description: 'Dividend',
                formInputType: 'number',
                required: true
            },
            {
                name: 'b',
                dataType: 'number',
                description: 'Divisor',
                formInputType: 'number',
                required: true
            }
        ],
        returnType: 'number',
        returnDescription: 'Remainder after division',
        example: 'modulo 17 5  # Returns 2'
    },

    power: {
        description: 'Raises the first number to the power of the second',
        parameters: [
            {
                name: 'base',
                dataType: 'number',
                description: 'Base number',
                formInputType: 'number',
                required: true
            },
            {
                name: 'exponent',
                dataType: 'number',
                description: 'Exponent (power)',
                formInputType: 'number',
                required: true
            }
        ],
        returnType: 'number',
        returnDescription: 'Result of base raised to the exponent',
        example: 'power 2 8  # Returns 256'
    },

    sqrt: {
        description: 'Calculates the square root of a number',
        parameters: [
            {
                name: 'value',
                dataType: 'number',
                description: 'Number to calculate square root of',
                formInputType: 'number',
                required: true
            }
        ],
        returnType: 'number',
        returnDescription: 'Square root of the input number',
        example: 'sqrt 16  # Returns 4'
    },

    abs: {
        description: 'Returns the absolute value of a number',
        parameters: [
            {
                name: 'value',
                dataType: 'number',
                description: 'Number to get absolute value of',
                formInputType: 'number',
                required: true
            }
        ],
        returnType: 'number',
        returnDescription: 'Absolute value of the input number',
        example: 'abs -5  # Returns 5'
    },

    round: {
        description: 'Rounds a number to the nearest integer',
        parameters: [
            {
                name: 'value',
                dataType: 'number',
                description: 'Number to round',
                formInputType: 'number',
                required: true
            }
        ],
        returnType: 'number',
        returnDescription: 'Rounded integer value',
        example: 'round 3.7  # Returns 4'
    },

    floor: {
        description: 'Rounds a number down to the nearest integer',
        parameters: [
            {
                name: 'value',
                dataType: 'number',
                description: 'Number to round down',
                formInputType: 'number',
                required: true
            }
        ],
        returnType: 'number',
        returnDescription: 'Largest integer less than or equal to the input',
        example: 'floor 3.7  # Returns 3'
    },

    ceil: {
        description: 'Rounds a number up to the nearest integer',
        parameters: [
            {
                name: 'value',
                dataType: 'number',
                description: 'Number to round up',
                formInputType: 'number',
                required: true
            }
        ],
        returnType: 'number',
        returnDescription: 'Smallest integer greater than or equal to the input',
        example: 'ceil 3.2  # Returns 4'
    },

    min: {
        description: 'Returns the minimum value from a list of numbers',
        parameters: [
            {
                name: 'args',
                label: 'Arguments',
                dataType: 'array',
                description: 'Array of numbers to find minimum from',
                formInputType: 'json',
                required: true,
                children: {
                    name: 'value',
                    dataType: 'number',
                    description: 'Number to compare',
                    formInputType: 'number',
                    required: true
                }
            }
        ],
        returnType: 'number',
        returnDescription: 'Minimum value from the input numbers',
        example: 'min 5 2 8 1  # Returns 1'
    },

    max: {
        description: 'Returns the maximum value from a list of numbers',
        parameters: [
            {
                name: 'args',
                label: 'Arguments',
                dataType: 'array',
                description: 'Array of numbers to find maximum from',
                formInputType: 'json',
                required: true,
                children: {
                    name: 'value',
                    dataType: 'number',
                    description: 'Number to compare',
                    formInputType: 'number',
                    required: true
                }
            }
        ],
        returnType: 'number',
        returnDescription: 'Maximum value from the input numbers',
        example: 'max 5 2 8 1  # Returns 8'
    },

    sin: {
        description: 'Calculates the sine of an angle in radians',
        parameters: [
            {
                name: 'angle',
                dataType: 'number',
                description: 'Angle in radians',
                formInputType: 'number',
                required: true
            }
        ],
        returnType: 'number',
        returnDescription: 'Sine of the angle',
        example: 'sin 0  # Returns 0'
    },

    cos: {
        description: 'Calculates the cosine of an angle in radians',
        parameters: [
            {
                name: 'angle',
                dataType: 'number',
                description: 'Angle in radians',
                formInputType: 'number',
                required: true
            }
        ],
        returnType: 'number',
        returnDescription: 'Cosine of the angle',
        example: 'cos 0  # Returns 1'
    },

    tan: {
        description: 'Calculates the tangent of an angle in radians',
        parameters: [
            {
                name: 'angle',
                dataType: 'number',
                description: 'Angle in radians',
                formInputType: 'number',
                required: true
            }
        ],
        returnType: 'number',
        returnDescription: 'Tangent of the angle',
        example: 'tan 0  # Returns 0'
    },

    pi: {
        description: 'Returns the mathematical constant π (pi)',
        parameters: [],
        returnType: 'number',
        returnDescription: 'Value of π (approximately 3.14159)',
        example: 'pi  # Returns 3.141592653589793'
    },

    e: {
        description: 'Returns the mathematical constant e (Euler\'s number)',
        parameters: [],
        returnType: 'number',
        returnDescription: 'Value of e (approximately 2.71828)',
        example: 'e  # Returns 2.718281828459045'
    }
};

export const MathModuleMetadata: ModuleMetadata = {
    description: 'Mathematical operations and functions including basic arithmetic, trigonometry, and mathematical constants',
    methods: [
        'add',
        'subtract',
        'multiply',
        'divide',
        'modulo',
        'power',
        'sqrt',
        'abs',
        'round',
        'floor',
        'ceil',
        'min',
        'max',
        'sin',
        'cos',
        'tan',
        'pi',
        'e'
    ]
};

// Module adapter for auto-loading
const MathModule: ModuleAdapter = {
    name: 'math',
    functions: MathFunctions,
    functionMetadata: MathFunctionMetadata,
    moduleMetadata: MathModuleMetadata,
    global: true
};

export default MathModule;

