/**
 * ExpressionEvaluator class for evaluating RobinPath expressions
 */

import { LexerUtils, valueToJS, evalExpression, isTruthy, type Value, type AttributePathSegment } from '../utils';
import type { Frame, Environment, Arg } from '../index';
import type { Executor } from './Executor';

export class ExpressionEvaluator {
    private frame: Frame;
    private globals: Environment;
    private executor: Executor | null;

    constructor(frame: Frame, globals: Environment, executor?: Executor | null) {
        this.frame = frame;
        this.globals = globals;
        this.executor = executor || null;
    }

    async evaluate(expr: string): Promise<boolean> {
        // Simple expression evaluator using JS delegation
        // Replace $ and $var references with actual values
        let jsExpr = expr.trim();

        // First, check if the entire expression is a function call (like "isBigger $value 5" or "test.isBigger $value 5")
        // This handles simple cases where the expression is just a function call
        if (this.executor) {
            const trimmedExpr = expr.trim();
            // Match function names with optional module prefix: "functionName" or "module.functionName"
            const funcCallMatch = trimmedExpr.match(/^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)\s+(.+)$/);
            
            if (funcCallMatch) {
                const funcName = funcCallMatch[1];
                const argsStr = funcCallMatch[2];
                
                // Check if this is a known function (builtin or user-defined)
                if (this.globals.builtins.has(funcName) || this.globals.functions.has(funcName)) {
                    // Execute the function call and return its truthiness
                    const funcResult = await this.executeFunctionCall(funcName, argsStr);
                    return isTruthy(funcResult);
                }
            }
        }

        // Evaluate and replace subexpressions $(...) first
        if (this.executor) {
            jsExpr = await this.replaceSubexpressions(jsExpr);
        }

        // Replace $name variables with attribute access (before bare $)
        // Match: $var, $var.property, $var[0], $var.property[0], etc.
        jsExpr = jsExpr.replace(/\$([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d+\])*)/g, (_match, varPath) => {
            try {
                const { name, path } = LexerUtils.parseVariablePath('$' + varPath);
                const val = this.resolveVariable(name, path);
            return valueToJS(val);
            } catch {
                // If parsing fails, return the original match
                return _match;
            }
        });

        // Replace $1, $2, etc. (positional params)
        jsExpr = jsExpr.replace(/\$([0-9]+)/g, (_match, num) => {
            const val = this.frame.locals.get(num) ?? null;
            return valueToJS(val);
        });

        // Replace $ (last value) - must be last, and only when not followed by word character
        // Match $ at word boundary but not if followed by letter/digit (which would be a variable)
        jsExpr = jsExpr.replace(/(^|\W)\$(?=\W|$)/g, (_match, prefix) => {
            const val = this.frame.lastValue;
            return prefix + valueToJS(val);
        });

        try {
            // Evaluate in a safe context
            const result = evalExpression(jsExpr);
            return isTruthy(result);
        } catch (error) {
            throw new Error(`Expression evaluation error: ${expr} - ${error}`);
        }
    }

    /**
     * Replace all subexpressions $(...) in an expression string with their evaluated values
     */
    private async replaceSubexpressions(expr: string): Promise<string> {
        if (!this.executor) {
            return expr;
        }

        let result = expr;
        let pos = 0;
        
        while (pos < result.length - 1) {
            // Look for $( pattern
            if (result[pos] === '$' && result[pos + 1] === '(') {
                // Extract the subexpression
                const subexprInfo = this.extractSubexpressionFromString(result, pos);
                if (subexprInfo) {
                    // Evaluate the subexpression
                    const subexprValue = await this.executor.executeSubexpression(subexprInfo.code);
                    const jsValue = valueToJS(subexprValue);
                    
                    // Replace the subexpression with its evaluated value
                    result = result.slice(0, pos) + jsValue + result.slice(subexprInfo.endPos);
                    // Continue from after the replacement
                    pos += jsValue.length;
                } else {
                    pos++;
                }
            } else {
                pos++;
            }
        }
        
        return result;
    }

    /**
     * Extract a subexpression $(...) from a string, starting at the given position
     * Returns null if no valid subexpression is found
     */
    private extractSubexpressionFromString(str: string, startPos: number): { code: string; endPos: number } | null {
        if (startPos >= str.length - 1 || str[startPos] !== '$' || str[startPos + 1] !== '(') {
            return null;
        }

        let depth = 0;
        let i = startPos + 2; // Start after "$("
        const code: string[] = [];
        let inString: false | '"' | "'" | '`' = false;
        let escapeNext = false;

        while (i < str.length) {
            const char = str[i];
            
            if (escapeNext) {
                code.push(char);
                escapeNext = false;
                i++;
                continue;
            }

            if (char === '\\' && inString) {
                escapeNext = true;
                code.push(char);
                i++;
                continue;
            }

            // Handle string literals
            if (!inString && (char === '"' || char === "'" || char === '`')) {
                inString = char;
                code.push(char);
                i++;
                continue;
            }

            if (inString && char === inString) {
                inString = false;
                code.push(char);
                i++;
                continue;
            }

            if (inString) {
                code.push(char);
                i++;
                continue;
            }

            // Handle nested $(
            if (char === '$' && i + 1 < str.length && str[i + 1] === '(') {
                depth++;
                code.push(char);
                i++;
                continue;
            }

            // Handle closing )
            if (char === ')') {
                if (depth > 0) {
                    // This is a closing paren for a nested subexpr
                    depth--;
                    code.push(char);
                    i++;
                    continue;
                } else {
                    // This is the closing paren for our subexpression
                    return {
                        code: code.join(''),
                        endPos: i + 1
                    };
                }
            }

            code.push(char);
            i++;
        }

        // If we reach here, the subexpression is unclosed
        return null;
    }

    private async executeFunctionCall(funcName: string, argsStr: string): Promise<Value> {
        if (!this.executor) {
            throw new Error('Executor not available for function call evaluation');
        }
        
        // Parse arguments from the string
        const argTokens = argsStr.trim().split(/\s+/);
        const args: Arg[] = [];
        
        for (const token of argTokens) {
            if (token === '$') {
                args.push({ type: 'lastValue' });
            } else if (LexerUtils.isPositionalParam(token)) {
                args.push({ type: 'var', name: token.slice(1) });
            } else if (LexerUtils.isVariable(token)) {
                const { name, path } = LexerUtils.parseVariablePath(token);
                args.push({ type: 'var', name, path });
            } else if (token === 'true') {
                args.push({ type: 'literal', value: true });
            } else if (token === 'false') {
                args.push({ type: 'literal', value: false });
            } else if (token === 'null') {
                args.push({ type: 'literal', value: null });
            } else if (/^-?\d+$/.test(token)) {
                args.push({ type: 'number', value: parseFloat(token) });
            } else if ((token.startsWith('"') && token.endsWith('"')) || 
                       (token.startsWith("'") && token.endsWith("'"))) {
                args.push({ type: 'string', value: token.slice(1, -1) });
            } else {
                args.push({ type: 'literal', value: token });
            }
        }
        
        // Execute the function call using the executor's public method
        return await this.executor.executeFunctionCall(funcName, args);
    }

    private resolveVariable(name: string, path?: AttributePathSegment[]): Value {
        // Check if variable is forgotten in current scope
        if (this.frame.forgotten && this.frame.forgotten.has(name)) {
            // Variable is forgotten in this scope - return null (as if it doesn't exist)
            return null;
        }
        
        // If this is an isolated scope (has parameters), only check locals
        // Don't access parent scopes or globals
        if (this.frame.isIsolatedScope) {
            let baseValue: Value;
            
            // If name is empty, it means last value ($) with attributes
            if (name === '') {
                baseValue = this.frame.lastValue;
            } else {
                // Only check locals in isolated scope
                if (this.frame.locals.has(name)) {
                    baseValue = this.frame.locals.get(name)!;
                } else {
                    return null; // Variable not found in isolated scope
                }
            }
            
            // If no path, return the base value
            if (!path || path.length === 0) {
                return baseValue;
            }
            
            // Traverse the path segments
            let current: any = baseValue;
            for (let i = 0; i < path.length; i++) {
                const segment = path[i];
                
                if (segment.type === 'property') {
                    // Property access: .propertyName
                    if (current === null || current === undefined) {
                        return null;
                    }
                    if (typeof current !== 'object') {
                        return null;
                    }
                    current = current[segment.name];
                } else if (segment.type === 'index') {
                    // Array index access: [index]
                    if (!Array.isArray(current)) {
                        return null;
                    }
                    if (segment.index < 0 || segment.index >= current.length) {
                        return null;
                    }
                    current = current[segment.index];
                }
            }
            
            return current;
        }
        
        // If name is empty, it means last value ($) with attributes
        let baseValue: Value;
        if (name === '') {
            baseValue = this.frame.lastValue;
        } else {
        // Check locals first
        if (this.frame.locals.has(name)) {
                baseValue = this.frame.locals.get(name)!;
            } else if (this.globals.variables.has(name)) {
        // Check globals
                baseValue = this.globals.variables.get(name)!;
            } else {
        return null;
            }
        }
        
        // If no path, return the base value
        if (!path || path.length === 0) {
            return baseValue;
        }
        
        // Traverse the path segments
        let current: any = baseValue;
        for (let i = 0; i < path.length; i++) {
            const segment = path[i];
            
            if (segment.type === 'property') {
                // Property access: .propertyName
                if (current === null || current === undefined) {
                    return null; // Accessing property on null/undefined returns null
                }
                if (typeof current !== 'object') {
                    return null; // Accessing property on primitive returns null (consistent with out-of-bounds array access)
                }
                current = current[segment.name];
            } else if (segment.type === 'index') {
                // Array index access: [index]
                if (!Array.isArray(current)) {
                    return null; // Accessing index on non-array returns null (consistent with property access on primitives)
                }
                if (segment.index < 0 || segment.index >= current.length) {
                    return null; // Out of bounds returns null
                }
                current = current[segment.index];
            }
        }
        
        return current;
    }

    // valueToJS, evalExpression, and isTruthy are imported from utils
}
