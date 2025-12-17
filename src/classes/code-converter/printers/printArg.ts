/**
 * Print argument/expression code
 */

import type { PrintContext } from '../ASTToCodeConverter';

export function printArg(arg: any, _ctx: PrintContext): string | null {
    if (!arg) return null;

    switch (arg.type) {
        case 'var': {
            return printVarRef(arg.name, arg.path);
        }
        case 'string':
            return `"${arg.value}"`;
        case 'number':
            return String(arg.value);
        case 'literal':
            return String(arg.value);
        case 'lastValue':
            return '$';
        case 'subexpr':
            return `$(${arg.code || ''})`;
        case 'object':
            return `{${arg.code || ''}}`;
        case 'array':
            return `[${arg.code || ''}]`;
        case 'binary': {
            // Handle binary expressions like $value > 5
            const left = printArg(arg.left, _ctx) || '';
            const right = printArg(arg.right, _ctx) || '';
            // Use original operator text if available (e.g., && instead of and)
            const op = arg.operatorText || arg.operator;
            const expr = `${left} ${op} ${right}`;
            // Wrap in parentheses if originally parenthesized
            return arg.parenthesized ? `(${expr})` : expr;
        }
        case 'unary': {
            // Handle unary expressions like not $value
            const argStr = printArg(arg.argument, _ctx) || '';
            return `${arg.operator} ${argStr}`;
        }
        case 'call': {
            // Handle function calls like range(1, 5) or range 1 5
            const callee = arg.callee || '';
            const args = (arg.args || []).map((a: any) => printArg(a, _ctx)).filter((s: string | null) => s !== null).join(' ');
            return args ? `${callee} ${args}` : callee;
        }
        case 'namedArgs':
            // This is handled by the parent command printer
            return null;
        default:
            // If it's already a string, return it (for backward compatibility)
            if (typeof arg === 'string') {
                return arg;
            }
            // Try to stringify if it has a codePos (might be an expression object)
            if (arg.codePos) {
                // Fallback: try to reconstruct from available properties
                return null;
            }
            return null;
    }
}

/**
 * Print a variable reference
 */
export function printVarRef(name: string, path?: any[]): string {
    let result = '$' + name;
    if (path) {
        for (const seg of path) {
            if (seg && seg.type === 'property') {
                result += '.' + seg.name;
            } else if (seg && seg.type === 'index') {
                result += '[' + seg.index + ']';
            }
        }
    }
    return result;
}

/**
 * Print an into target
 */
export function printIntoTarget(targetName: string, targetPath?: any[]): string {
    let result = '$' + targetName;
    if (targetPath) {
        for (const seg of targetPath) {
            if (seg.type === 'property') {
                result += '.' + seg.name;
            } else if (seg.type === 'index') {
                result += '[' + seg.index + ']';
            }
        }
    }
    return result;
}
