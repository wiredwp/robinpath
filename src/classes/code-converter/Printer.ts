/**
 * Printer - AST → string conversion
 * 
 * Pure function(s), no access to originalScript.
 * Uses a Writer to avoid heavy string concatenations.
 */

import type { Statement, CommentWithPosition } from '../../types/Ast.type';
import type { Value } from '../../utils/types';
import type { PrintContext } from './types';
import { Writer } from './Writer';
import { printCommand } from './printers/printCommand';
import { printAssignment } from './printers/printAssignment';
import { printIfBlock } from './printers/printIfBlock';
import { printDefine } from './printers/printDefine';
import { printDo } from './printers/printDo';
import { printForLoop } from './printers/printForLoop';
import { printComment } from './printers/printComment';
import { printArg } from './printers/printArg';
import { printOnBlock } from './printers/printOnBlock';

export class Printer {
    /**
     * Print a statement node to code
     * Note: trailingBlankLines are handled by PatchPlanner, not here
     */
    static printNode(node: Statement, ctx: PrintContext): string {
        const writer = new Writer();
        writer.indent(ctx.indentLevel);
        
        // Use visitor pattern with printer registry
        const printer = printers[node.type];
        if (printer) {
            printer(node as any, writer, ctx);
            return writer.toString();
        }
        
        return '';
    }

    /**
     * Print a comment
     */
    static printComment(comment: CommentWithPosition, indentLevel: number = 0): string {
        if (!comment.text || comment.text.trim() === '') {
            return '';
        }
        const indent = '  '.repeat(indentLevel);
        return comment.text.split('\n').map(line => `${indent}# ${line}`).join('\n');
    }

    /**
     * Print an argument
     */
    static printArg(arg: any, ctx: PrintContext): string | null {
        return printArg(arg, ctx);
    }

    /**
     * Get value type
     */
    static getValueType(value: Value): 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array' {
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
     * Convert value type
     */
    static convertValueType(value: Value, targetType: 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array'): Value | null {
        const currentType = Printer.getValueType(value);
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
}

// Printer function type
type PrinterFn = (node: any, writer: Writer, ctx: PrintContext) => void;

// Registry of printers by node type
const printers: Record<string, PrinterFn> = {
    command: printCommand,
    assignment: printAssignment,
    shorthand: (node, writer) => {
        writer.pushLine(`$${node.targetName} = $`);
    },
    inlineIf: (node, writer, ctx) => {
        const cmdCode = Printer.printNode(node.command, { ...ctx, indentLevel: 0 });
        writer.pushLine(`if ${node.conditionExpr} ${cmdCode.trim()}`);
    },
    ifBlock: printIfBlock,
    ifTrue: (node, writer, ctx) => {
        const cmdCode = Printer.printNode(node.command, { ...ctx, indentLevel: 0 });
        writer.pushLine(`iftrue ${cmdCode.trim()}`);
    },
    ifFalse: (node, writer, ctx) => {
        const cmdCode = Printer.printNode(node.command, { ...ctx, indentLevel: 0 });
        writer.pushLine(`iffalse ${cmdCode.trim()}`);
    },
    define: printDefine,
    do: printDo,
    forLoop: printForLoop,
    onBlock: printOnBlock,
    return: (node, writer, ctx) => {
        if (node.value) {
            const valueCode = printArg(node.value, ctx);
            writer.pushLine(`return ${valueCode || ''}`);
        } else {
            writer.pushLine('return');
        }
    },
    break: (_node, writer) => {
        writer.pushLine('break');
    },
    continue: (_node, writer) => {
        writer.pushLine('continue');
    },
    comment: printComment,
};
