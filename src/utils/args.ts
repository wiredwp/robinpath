/**
 * Argument parsing utilities for RobinPath
 */

import type { Value } from './types';

/**
 * Utility function to extract named arguments from function call arguments.
 * Named arguments are passed as the last argument (an object with string keys).
 * 
 * @param args The arguments array passed to a BuiltinHandler
 * @returns An object with `positionalArgs` (Value[]) and `namedArgs` (Record<string, Value>)
 * 
 * @example
 * ```typescript
 * export const MyFunctions: Record<string, BuiltinHandler> = {
 *   myFunction: (args) => {
 *     const { positionalArgs, namedArgs } = extractNamedArgs(args);
 *     const url = namedArgs.url || positionalArgs[0];
 *     const body = namedArgs.body || positionalArgs[1];
 *     // ... use url and body
 *   }
 * };
 * ```
 */
export function extractNamedArgs(args: Value[]): { positionalArgs: Value[]; namedArgs: Record<string, Value> } {
    const positionalArgs: Value[] = [];
    let namedArgs: Record<string, Value> = {};
    
    if (args.length > 0) {
        const lastArg = args[args.length - 1];
        if (typeof lastArg === 'object' && lastArg !== null && !Array.isArray(lastArg)) {
            // Check if it looks like a named args object (has non-numeric keys)
            const keys = Object.keys(lastArg);
            const hasNonNumericKeys = keys.some(key => !/^\d+$/.test(key));
            if (hasNonNumericKeys && keys.length > 0) {
                // This is a named args object
                namedArgs = lastArg as Record<string, Value>;
                positionalArgs.push(...args.slice(0, -1));
            } else {
                // Regular object passed as positional arg (or empty object)
                positionalArgs.push(...args);
            }
        } else {
            positionalArgs.push(...args);
        }
    }
    
    return { positionalArgs, namedArgs };
}

