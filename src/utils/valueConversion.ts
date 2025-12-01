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

