/**
 * Exception classes for RobinPath execution control flow
 */

import type { Value } from '../utils';

/**
 * Special exception used to signal early return from functions or global scope
 */
export class ReturnException extends Error {
    value: Value;
    constructor(value: Value) {
        super('Return');
        this.value = value;
        this.name = 'ReturnException';
    }
}

/**
 * Special exception used to signal break from loops
 */
export class BreakException extends Error {
    constructor() {
        super('Break');
        this.name = 'BreakException';
    }
}

/**
 * Special exception used to signal continue to next iteration of loops
 */
export class ContinueException extends Error {
    constructor() {
        super('Continue');
        this.name = 'ContinueException';
    }
}

/**
 * Special exception used to signal end of script execution
 */
export class EndException extends Error {
    constructor() {
        super('End');
        this.name = 'EndException';
    }
}

