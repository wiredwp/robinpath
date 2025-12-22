/**
 * Value conversion and type checking utilities for RobinPath
 */

import type { Value } from './types';

/**
 * Convert a Value to its JavaScript string representation
 */
export function valueToJS(val: Value): string {
    if (val === null || val === undefined) {
        return 'null';
    }
    if (typeof val === 'string') {
        return JSON.stringify(val);
    }
    if (typeof val === 'number') {
        return val.toString();
    }
    if (typeof val === 'boolean') {
        return val.toString();
    }
    return JSON.stringify(val);
}

/**
 * Evaluate a JavaScript expression string
 * Simple expression evaluator - in production you'd want a proper parser
 */
export function evalExpression(expr: string): any {
    try {
        // eslint-disable-next-line no-eval
        return eval(expr);
    } catch {
        // Fallback: try to parse as boolean
        return expr === 'true' || expr === '1';
    }
}

/**
 * Check if a value is truthy according to RobinPath rules
 */
export function isTruthy(val: Value): boolean {
    if (val === null || val === undefined) {
        return false;
    }
    if (typeof val === 'number') {
        return val !== 0;
    }
    if (typeof val === 'string') {
        return val.length > 0;
    }
    if (typeof val === 'boolean') {
        return val;
    }
    return true;
}

/**
 * Get the type of a value
 */
export function getValueType(value: Value): 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array' {
    if (value === null) {
        return 'null';
    }
    if (typeof value === 'string') {
        return 'string';
    }
    if (typeof value === 'number') {
        return 'number';
    }
    if (typeof value === 'boolean') {
        return 'boolean';
    }
    if (Array.isArray(value)) {
        return 'array';
    }
    if (typeof value === 'object') {
        return 'object';
    }
    return 'string'; // Fallback
}

/**
 * Attempt to convert a value to a different type
 * @param value The value to convert
 * @param targetType The target type to convert to
 * @returns The converted value, or null if conversion fails
 */
export function convertValueType(value: Value, targetType: 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array'): Value | null {
    const currentType = getValueType(value);
    if (currentType === targetType) {
        return value;
    }

    try {
        switch (targetType) {
            case 'string':
                if (value === null) return 'null';
                if (typeof value === 'object' || Array.isArray(value)) {
                    return JSON.stringify(value);
                }
                return String(value);

            case 'number':
                if (value === null) return null;
                if (typeof value === 'boolean') {
                    return value ? 1 : 0;
                }
                if (typeof value === 'string') {
                    const parsed = parseFloat(value);
                    if (isNaN(parsed)) return null;
                    return parsed;
                }
                if (typeof value === 'number') return value;
                return null;

            case 'boolean':
                if (value === null) return false;
                if (typeof value === 'string') {
                    const lower = value.toLowerCase().trim();
                    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
                    if (lower === 'false' || lower === '0' || lower === 'no' || lower === '') return false;
                    return null;
                }
                if (typeof value === 'number') {
                    return value !== 0 && !isNaN(value);
                }
                if (typeof value === 'boolean') return value;
                if (Array.isArray(value)) return value.length > 0;
                if (typeof value === 'object') return Object.keys(value).length > 0;
                return false;

            case 'null':
                return null;

            case 'array':
                if (value === null) return [];
                if (Array.isArray(value)) return value;
                if (typeof value === 'string') {
                    try {
                        const parsed = JSON.parse(value);
                        if (Array.isArray(parsed)) return parsed;
                    } catch {
                        return value.split('');
                    }
                }
                if (typeof value === 'object') return Object.values(value);
                return [value];

            case 'object':
                if (value === null) return {};
                if (typeof value === 'object' && !Array.isArray(value)) return value;
                if (typeof value === 'string') {
                    try {
                        const parsed = JSON.parse(value);
                        if (typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
                    } catch {
                        return { value: value };
                    }
                }
                if (Array.isArray(value)) {
                    const obj: Record<string, Value> = {};
                    value.forEach((item, index) => {
                        obj[String(index)] = item;
                    });
                    return obj;
                }
                return { value: value };

            default:
                return null;
        }
    } catch {
        return null;
    }
}

