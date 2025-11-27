import type { 
    BuiltinHandler, 
    FunctionMetadata, 
    ModuleMetadata,
    ModuleAdapter
} from '../index';

/**
 * Test module for RobinPath
 * Provides testing and assertion functions
 */

export const TestFunctions: Record<string, BuiltinHandler> = {
    assert: (args) => {
        if (args.length === 0) {
            throw new Error('assert requires at least one argument');
        }
        const value = args[0];
        const expectedGot = `Expected truthy value, got ${JSON.stringify(value)}`;
        const message = args.length > 1 ? `${String(args[1])} (${expectedGot})` : expectedGot;
        
        if (!isTruthy(value)) {
            throw new Error(message);
        }
        return true;
    },

    assertEqual: (args) => {
        if (args.length < 2) {
            throw new Error('assertEqual requires two arguments');
        }
        const actual = args[0];
        const expected = args[1];
        const expectedGot = `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
        const message = args.length > 2 ? `${String(args[2])} (${expectedGot})` : expectedGot;
        
        if (!deepEqual(actual, expected)) {
            throw new Error(message);
        }
        return true;
    },

    assertNotEqual: (args) => {
        if (args.length < 2) {
            throw new Error('assertNotEqual requires two arguments');
        }
        const actual = args[0];
        const expected = args[1];
        const expectedGot = `Expected values to be different, but both were ${JSON.stringify(actual)}`;
        const message = args.length > 2 ? `${String(args[2])} (${expectedGot})` : expectedGot;
        
        if (deepEqual(actual, expected)) {
            throw new Error(message);
        }
        return true;
    },

    assertTrue: (args) => {
        if (args.length === 0) {
            throw new Error('assertTrue requires one argument');
        }
        const value = args[0];
        const expectedGot = `Expected true, got ${JSON.stringify(value)}`;
        const message = args.length > 1 ? `${String(args[1])} (${expectedGot})` : expectedGot;
        
        if (value !== true) {
            throw new Error(message);
        }
        return true;
    },

    assertFalse: (args) => {
        if (args.length === 0) {
            throw new Error('assertFalse requires one argument');
        }
        const value = args[0];
        const expectedGot = `Expected false, got ${JSON.stringify(value)}`;
        const message = args.length > 1 ? `${String(args[1])} (${expectedGot})` : expectedGot;
        
        if (value !== false) {
            throw new Error(message);
        }
        return true;
    },

    assertNull: (args) => {
        if (args.length === 0) {
            throw new Error('assertNull requires one argument');
        }
        const value = args[0];
        const expectedGot = `Expected null, got ${JSON.stringify(value)}`;
        const message = args.length > 1 ? `${String(args[1])} (${expectedGot})` : expectedGot;
        
        if (value !== null) {
            throw new Error(message);
        }
        return true;
    },

    assertNotNull: (args) => {
        if (args.length === 0) {
            throw new Error('assertNotNull requires one argument');
        }
        const value = args[0];
        const expectedGot = `Expected non-null value, got ${JSON.stringify(value)}`;
        const message = args.length > 1 ? `${String(args[1])} (${expectedGot})` : expectedGot;
        
        if (value === null) {
            throw new Error(message);
        }
        return true;
    },

    assertGreater: (args) => {
        if (args.length < 2) {
            throw new Error('assertGreater requires two arguments');
        }
        const actual = Number(args[0]) || 0;
        const expected = Number(args[1]) || 0;
        const expectedGot = `Expected value greater than ${expected}, got ${actual}`;
        const message = args.length > 2 ? `${String(args[2])} (${expectedGot})` : expectedGot;
        
        if (actual <= expected) {
            throw new Error(message);
        }
        return true;
    },

    assertGreaterOrEqual: (args) => {
        if (args.length < 2) {
            throw new Error('assertGreaterOrEqual requires two arguments');
        }
        const actual = Number(args[0]) || 0;
        const expected = Number(args[1]) || 0;
        const expectedGot = `Expected value greater than or equal to ${expected}, got ${actual}`;
        const message = args.length > 2 ? `${String(args[2])} (${expectedGot})` : expectedGot;
        
        if (actual < expected) {
            throw new Error(message);
        }
        return true;
    },

    assertLess: (args) => {
        if (args.length < 2) {
            throw new Error('assertLess requires two arguments');
        }
        const actual = Number(args[0]) || 0;
        const expected = Number(args[1]) || 0;
        const expectedGot = `Expected value less than ${expected}, got ${actual}`;
        const message = args.length > 2 ? `${String(args[2])} (${expectedGot})` : expectedGot;
        
        if (actual >= expected) {
            throw new Error(message);
        }
        return true;
    },

    assertLessOrEqual: (args) => {
        if (args.length < 2) {
            throw new Error('assertLessOrEqual requires two arguments');
        }
        const actual = Number(args[0]) || 0;
        const expected = Number(args[1]) || 0;
        const expectedGot = `Expected value less than or equal to ${expected}, got ${actual}`;
        const message = args.length > 2 ? `${String(args[2])} (${expectedGot})` : expectedGot;
        
        if (actual > expected) {
            throw new Error(message);
        }
        return true;
    },

    assertContains: (args) => {
        if (args.length < 2) {
            throw new Error('assertContains requires two arguments');
        }
        const container = args[0];
        const item = args[1];
        const expectedGot = `Expected ${JSON.stringify(container)} to contain ${JSON.stringify(item)}, but it does not`;
        const message = args.length > 2 ? `${String(args[2])} (${expectedGot})` : expectedGot;
        
        if (Array.isArray(container)) {
            if (!container.includes(item)) {
                throw new Error(message);
            }
        } else if (typeof container === 'string' && typeof item === 'string') {
            if (!container.includes(item)) {
                throw new Error(message);
            }
        } else {
            throw new Error('assertContains: first argument must be an array or string');
        }
        return true;
    },

    assertNotContains: (args) => {
        if (args.length < 2) {
            throw new Error('assertNotContains requires two arguments');
        }
        const container = args[0];
        const item = args[1];
        const expectedGot = `Expected ${JSON.stringify(container)} not to contain ${JSON.stringify(item)}, but it does`;
        const message = args.length > 2 ? `${String(args[2])} (${expectedGot})` : expectedGot;
        
        if (Array.isArray(container)) {
            if (container.includes(item)) {
                throw new Error(message);
            }
        } else if (typeof container === 'string' && typeof item === 'string') {
            if (container.includes(item)) {
                throw new Error(message);
            }
        } else {
            throw new Error('assertNotContains: first argument must be an array or string');
        }
        return true;
    },

    assertType: (args) => {
        if (args.length < 2) {
            throw new Error('assertType requires two arguments');
        }
        const value = args[0];
        const expectedType = String(args[1]);
        const actualType = getType(value);
        const expectedGot = `Expected type ${expectedType}, got ${actualType}`;
        const message = args.length > 2 ? `${String(args[2])} (${expectedGot})` : expectedGot;
        
        if (actualType !== expectedType) {
            throw new Error(message);
        }
        return true;
    },

    isEqual: (args) => {
        if (args.length < 2) {
            throw new Error('isEqual requires two arguments');
        }
        const a = args[0];
        const b = args[1];
        return deepEqual(a, b);
    },

    isBigger: (args) => {
        if (args.length < 2) {
            throw new Error('isBigger requires two arguments');
        }
        const a = Number(args[0]) || 0;
        const b = Number(args[1]) || 0;
        return a > b;
    },

    isSmaller: (args) => {
        if (args.length < 2) {
            throw new Error('isSmaller requires two arguments');
        }
        const a = Number(args[0]) || 0;
        const b = Number(args[1]) || 0;
        return a < b;
    },

    isEqualOrBigger: (args) => {
        if (args.length < 2) {
            throw new Error('isEqualOrBigger requires two arguments');
        }
        const a = Number(args[0]) || 0;
        const b = Number(args[1]) || 0;
        return a >= b;
    },

    isEqualOrSmaller: (args) => {
        if (args.length < 2) {
            throw new Error('isEqualOrSmaller requires two arguments');
        }
        const a = Number(args[0]) || 0;
        const b = Number(args[1]) || 0;
        return a <= b;
    },

    fail: (args) => {
        const message = args.length > 0 ? String(args[0]) : 'Test failed';
        throw new Error(message);
    }
};

// Helper functions
function isTruthy(value: any): boolean {
    if (value === null || value === undefined) {
        return false;
    }
    if (typeof value === 'number') {
        return value !== 0;
    }
    if (typeof value === 'string') {
        return value.length > 0;
    }
    if (typeof value === 'boolean') {
        return value;
    }
    return true;
}

function deepEqual(a: any, b: any): boolean {
    if (a === b) {
        return true;
    }
    if (a === null || b === null || a === undefined || b === undefined) {
        return false;
    }
    if (typeof a !== typeof b) {
        return false;
    }
    if (typeof a === 'object') {
        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) {
                return false;
            }
            for (let i = 0; i < a.length; i++) {
                if (!deepEqual(a[i], b[i])) {
                    return false;
                }
            }
            return true;
        }
        // For objects, do a shallow comparison of keys
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) {
            return false;
        }
        for (const key of keysA) {
            if (!deepEqual(a[key], b[key])) {
                return false;
            }
        }
        return true;
    }
    return false;
}

function getType(value: any): string {
    if (value === null) {
        return 'null';
    }
    if (Array.isArray(value)) {
        return 'array';
    }
    return typeof value;
}

export const TestFunctionMetadata: Record<string, FunctionMetadata> = {
    assert: {
        description: 'Asserts that a value is truthy',
        parameters: [
            {
                name: 'value',
                dataType: 'any',
                description: 'Value to assert as truthy',
                formInputType: 'json',
                required: true
            },
            {
                name: 'message',
                dataType: 'string',
                description: 'Optional error message if assertion fails',
                formInputType: 'text',
                required: false
            }
        ],
        returnType: 'boolean',
        returnDescription: 'Returns true if assertion passes',
        example: 'assert add 5 5  # Passes if result is truthy'
    },

    assertEqual: {
        description: 'Asserts that two values are equal (deep comparison)',
        parameters: [
            {
                name: 'actual',
                dataType: 'any',
                description: 'Actual value',
                formInputType: 'json',
                required: true
            },
            {
                name: 'expected',
                dataType: 'any',
                description: 'Expected value',
                formInputType: 'json',
                required: true
            },
            {
                name: 'message',
                dataType: 'string',
                description: 'Optional error message if assertion fails',
                formInputType: 'text',
                required: false
            }
        ],
        returnType: 'boolean',
        returnDescription: 'Returns true if assertion passes',
        example: 'assertEqual add 5 5 10  # Passes if 5+5 equals 10'
    },

    assertNotEqual: {
        description: 'Asserts that two values are not equal',
        parameters: [
            {
                name: 'actual',
                dataType: 'any',
                description: 'Actual value',
                formInputType: 'json',
                required: true
            },
            {
                name: 'expected',
                dataType: 'any',
                description: 'Value that should not equal actual',
                formInputType: 'json',
                required: true
            },
            {
                name: 'message',
                dataType: 'string',
                description: 'Optional error message if assertion fails',
                formInputType: 'text',
                required: false
            }
        ],
        returnType: 'boolean',
        returnDescription: 'Returns true if assertion passes',
        example: 'assertNotEqual add 5 5 9  # Passes if 5+5 does not equal 9'
    },

    assertTrue: {
        description: 'Asserts that a value is exactly true',
        parameters: [
            {
                name: 'value',
                dataType: 'boolean',
                description: 'Value to assert as true',
                formInputType: 'checkbox',
                required: true
            },
            {
                name: 'message',
                dataType: 'string',
                description: 'Optional error message if assertion fails',
                formInputType: 'text',
                required: false
            }
        ],
        returnType: 'boolean',
        returnDescription: 'Returns true if assertion passes',
        example: 'assertTrue true  # Passes if value is exactly true'
    },

    assertFalse: {
        description: 'Asserts that a value is exactly false',
        parameters: [
            {
                name: 'value',
                dataType: 'boolean',
                description: 'Value to assert as false',
                formInputType: 'checkbox',
                required: true
            },
            {
                name: 'message',
                dataType: 'string',
                description: 'Optional error message if assertion fails',
                formInputType: 'text',
                required: false
            }
        ],
        returnType: 'boolean',
        returnDescription: 'Returns true if assertion passes',
        example: 'assertFalse false  # Passes if value is exactly false'
    },

    assertNull: {
        description: 'Asserts that a value is null',
        parameters: [
            {
                name: 'value',
                dataType: 'null',
                description: 'Value to assert as null',
                formInputType: 'json',
                required: true
            },
            {
                name: 'message',
                dataType: 'string',
                description: 'Optional error message if assertion fails',
                formInputType: 'text',
                required: false
            }
        ],
        returnType: 'boolean',
        returnDescription: 'Returns true if assertion passes',
        example: 'assertNull null  # Passes if value is null'
    },

    assertNotNull: {
        description: 'Asserts that a value is not null',
        parameters: [
            {
                name: 'value',
                dataType: 'any',
                description: 'Value to assert as non-null',
                formInputType: 'json',
                required: true
            },
            {
                name: 'message',
                dataType: 'string',
                description: 'Optional error message if assertion fails',
                formInputType: 'text',
                required: false
            }
        ],
        returnType: 'boolean',
        returnDescription: 'Returns true if assertion passes',
        example: 'assertNotNull add 5 5  # Passes if result is not null'
    },

    assertGreater: {
        description: 'Asserts that the first number is greater than the second',
        parameters: [
            {
                name: 'actual',
                dataType: 'number',
                description: 'Actual value',
                formInputType: 'number',
                required: true
            },
            {
                name: 'expected',
                dataType: 'number',
                description: 'Value that actual should be greater than',
                formInputType: 'number',
                required: true
            },
            {
                name: 'message',
                dataType: 'string',
                description: 'Optional error message if assertion fails',
                formInputType: 'text',
                required: false
            }
        ],
        returnType: 'boolean',
        returnDescription: 'Returns true if assertion passes',
        example: 'assertGreater 10 5  # Passes if 10 > 5'
    },

    assertGreaterOrEqual: {
        description: 'Asserts that the first number is greater than or equal to the second',
        parameters: [
            {
                name: 'actual',
                dataType: 'number',
                description: 'Actual value',
                formInputType: 'number',
                required: true
            },
            {
                name: 'expected',
                dataType: 'number',
                description: 'Value that actual should be greater than or equal to',
                formInputType: 'number',
                required: true
            },
            {
                name: 'message',
                dataType: 'string',
                description: 'Optional error message if assertion fails',
                formInputType: 'text',
                required: false
            }
        ],
        returnType: 'boolean',
        returnDescription: 'Returns true if assertion passes',
        example: 'assertGreaterOrEqual 10 10  # Passes if 10 >= 10'
    },

    assertLess: {
        description: 'Asserts that the first number is less than the second',
        parameters: [
            {
                name: 'actual',
                dataType: 'number',
                description: 'Actual value',
                formInputType: 'number',
                required: true
            },
            {
                name: 'expected',
                dataType: 'number',
                description: 'Value that actual should be less than',
                formInputType: 'number',
                required: true
            },
            {
                name: 'message',
                dataType: 'string',
                description: 'Optional error message if assertion fails',
                formInputType: 'text',
                required: false
            }
        ],
        returnType: 'boolean',
        returnDescription: 'Returns true if assertion passes',
        example: 'assertLess 3 5  # Passes if 3 < 5'
    },

    assertLessOrEqual: {
        description: 'Asserts that the first number is less than or equal to the second',
        parameters: [
            {
                name: 'actual',
                dataType: 'number',
                description: 'Actual value',
                formInputType: 'number',
                required: true
            },
            {
                name: 'expected',
                dataType: 'number',
                description: 'Value that actual should be less than or equal to',
                formInputType: 'number',
                required: true
            },
            {
                name: 'message',
                dataType: 'string',
                description: 'Optional error message if assertion fails',
                formInputType: 'text',
                required: false
            }
        ],
        returnType: 'boolean',
        returnDescription: 'Returns true if assertion passes',
        example: 'assertLessOrEqual 5 5  # Passes if 5 <= 5'
    },

    assertContains: {
        description: 'Asserts that an array or string contains a value',
        parameters: [
            {
                name: 'container',
                dataType: 'array',
                description: 'Array or string to check',
                formInputType: 'json',
                required: true
            },
            {
                name: 'item',
                dataType: 'any',
                description: 'Value to check for',
                formInputType: 'json',
                required: true
            },
            {
                name: 'message',
                dataType: 'string',
                description: 'Optional error message if assertion fails',
                formInputType: 'text',
                required: false
            }
        ],
        returnType: 'boolean',
        returnDescription: 'Returns true if assertion passes',
        example: 'assertContains range 1 5 3  # Passes if array contains 3'
    },

    assertNotContains: {
        description: 'Asserts that an array or string does not contain a value',
        parameters: [
            {
                name: 'container',
                dataType: 'array',
                description: 'Array or string to check',
                formInputType: 'json',
                required: true
            },
            {
                name: 'item',
                dataType: 'any',
                description: 'Value that should not be present',
                formInputType: 'json',
                required: true
            },
            {
                name: 'message',
                dataType: 'string',
                description: 'Optional error message if assertion fails',
                formInputType: 'text',
                required: false
            }
        ],
        returnType: 'boolean',
        returnDescription: 'Returns true if assertion passes',
        example: 'assertNotContains range 1 3 5  # Passes if array does not contain 5'
    },

    assertType: {
        description: 'Asserts that a value has a specific type',
        parameters: [
            {
                name: 'value',
                dataType: 'any',
                description: 'Value to check type of',
                formInputType: 'json',
                required: true
            },
            {
                name: 'type',
                dataType: 'string',
                description: 'Expected type (string, number, boolean, object, array, null)',
                formInputType: 'text',
                required: true
            },
            {
                name: 'message',
                dataType: 'string',
                description: 'Optional error message if assertion fails',
                formInputType: 'text',
                required: false
            }
        ],
        returnType: 'boolean',
        returnDescription: 'Returns true if assertion passes',
        example: 'assertType "hello" "string"  # Passes if value is a string'
    },

    isEqual: {
        description: 'Returns true if two values are equal (deep comparison)',
        parameters: [
            {
                name: 'a',
                dataType: 'any',
                description: 'First value to compare',
                formInputType: 'json',
                required: true
            },
            {
                name: 'b',
                dataType: 'any',
                description: 'Second value to compare',
                formInputType: 'json',
                required: true
            }
        ],
        returnType: 'boolean',
        returnDescription: 'Returns true if values are equal, false otherwise',
        example: 'isEqual add 5 5 10  # Returns true if 5+5 equals 10'
    },

    isBigger: {
        description: 'Returns true if the first number is greater than the second',
        parameters: [
            {
                name: 'a',
                dataType: 'number',
                description: 'First number',
                formInputType: 'number',
                required: true
            },
            {
                name: 'b',
                dataType: 'number',
                description: 'Second number',
                formInputType: 'number',
                required: true
            }
        ],
        returnType: 'boolean',
        returnDescription: 'Returns true if a > b, false otherwise',
        example: 'isBigger 10 5  # Returns true'
    },

    isSmaller: {
        description: 'Returns true if the first number is less than the second',
        parameters: [
            {
                name: 'a',
                dataType: 'number',
                description: 'First number',
                formInputType: 'number',
                required: true
            },
            {
                name: 'b',
                dataType: 'number',
                description: 'Second number',
                formInputType: 'number',
                required: true
            }
        ],
        returnType: 'boolean',
        returnDescription: 'Returns true if a < b, false otherwise',
        example: 'isSmaller 3 5  # Returns true'
    },

    isEqualOrBigger: {
        description: 'Returns true if the first number is greater than or equal to the second',
        parameters: [
            {
                name: 'a',
                dataType: 'number',
                description: 'First number',
                formInputType: 'number',
                required: true
            },
            {
                name: 'b',
                dataType: 'number',
                description: 'Second number',
                formInputType: 'number',
                required: true
            }
        ],
        returnType: 'boolean',
        returnDescription: 'Returns true if a >= b, false otherwise',
        example: 'isEqualOrBigger 10 10  # Returns true'
    },

    isEqualOrSmaller: {
        description: 'Returns true if the first number is less than or equal to the second',
        parameters: [
            {
                name: 'a',
                dataType: 'number',
                description: 'First number',
                formInputType: 'number',
                required: true
            },
            {
                name: 'b',
                dataType: 'number',
                description: 'Second number',
                formInputType: 'number',
                required: true
            }
        ],
        returnType: 'boolean',
        returnDescription: 'Returns true if a <= b, false otherwise',
        example: 'isEqualOrSmaller 5 5  # Returns true'
    },

    fail: {
        description: 'Explicitly fails a test with an optional message',
        parameters: [
            {
                name: 'message',
                dataType: 'string',
                description: 'Error message for the failure',
                formInputType: 'text',
                required: false
            }
        ],
        returnType: 'boolean',
        returnDescription: 'Never returns (throws an error)',
        example: 'fail "Test intentionally failed"  # Throws an error'
    }
};

export const TestModuleMetadata: ModuleMetadata = {
    description: 'Testing and assertion functions for validating values and conditions',
    methods: [
        'assert',
        'assertEqual',
        'assertNotEqual',
        'assertTrue',
        'assertFalse',
        'assertNull',
        'assertNotNull',
        'assertGreater',
        'assertGreaterOrEqual',
        'assertLess',
        'assertLessOrEqual',
        'assertContains',
        'assertNotContains',
        'assertType',
        'isEqual',
        'isBigger',
        'isSmaller',
        'isEqualOrBigger',
        'isEqualOrSmaller',
        'fail'
    ]
};

// Module adapter for auto-loading
const TestModule: ModuleAdapter = {
    name: 'test',
    functions: TestFunctions,
    functionMetadata: TestFunctionMetadata,
    moduleMetadata: TestModuleMetadata,
    global: true
};

export default TestModule;

