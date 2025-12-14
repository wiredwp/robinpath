/**
 * Print command node
 */

import type { PrintContext } from '../types';
import { Writer } from '../Writer';
import { printArg, printIntoTarget } from './printArg';
import { Printer } from '../Printer';

export function printCommand(node: any, writer: Writer, ctx: PrintContext): void {
    // Special handling for _var command - just output the variable
    if (node.name === '_var' && node.args && node.args.length === 1 && node.args[0] && node.args[0].type === 'var') {
        const varArg = node.args[0];
        writer.pushLine(printVarRef(varArg.name, varArg.path));
        return;
    }
    
    // Special handling for _subexpr command
    if (node.name === '_subexpr' && node.args && node.args.length === 1 && node.args[0]) {
        const subexprArg = node.args[0];
        // Handle both deprecated 'subexpr' type (with code) and new 'subexpression' type (with body)
        if (subexprArg.type === 'subexpr') {
            writer.pushLine(`$(${subexprArg.code || ''})`);
            return;
        } else if (subexprArg.type === 'subexpression') {
            // Print subexpression with body
            const subexprBody = subexprArg.body || [];
            if (subexprBody.length === 0) {
                writer.pushLine('$()');
                return;
            }
            // Check if it's multiline (spans multiple lines)
            const isMultiline = subexprBody.length > 1 || 
                (subexprArg.codePos && subexprArg.codePos.endRow > subexprArg.codePos.startRow);
            
            if (isMultiline) {
                writer.pushIndented('$(\n');
                for (const stmt of subexprBody) {
                    const stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel + 1 });
                    if (stmtCode) {
                        writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');
                    }
                }
                writer.pushIndented(')');
                writer.newline();
            } else {
                // Single line
                const bodyCode = subexprBody.map(stmt => {
                    const stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: 0 });
                    return stmtCode ? stmtCode.trim() : '';
                }).filter(code => code).join(' ');
                writer.pushLine(`$(${bodyCode})`);
            }
            return;
        }
    }
    
    // Special handling for _object command
    if (node.name === '_object') {
        if (node.args && node.args.length >= 1 && node.args[0] && node.args[0].type === 'object') {
            const objArg = node.args[0];
            writer.pushLine(`{${objArg.code || ''}}`);
        } else {
            writer.pushLine('{}');
        }
        return;
    }
    
    // Special handling for _array command
    if (node.name === '_array') {
        if (node.args && node.args.length >= 1 && node.args[0] && node.args[0].type === 'array') {
            const arrArg = node.args[0];
            writer.pushLine(`[${arrArg.code || ''}]`);
        } else {
            writer.pushLine('[]');
        }
        return;
    }
    
    // Extract command name and module prefix
    let commandName = node.name;
    if (node.module && node.name.includes('.')) {
        const parts = node.name.split('.');
        commandName = parts[parts.length - 1];
    }
    const modulePrefix = node.module ? `${node.module}.` : '';
    
    // Separate positional args and named args
    const positionalArgs: any[] = [];
    let namedArgsObj: Record<string, any> | null = null;
    
    for (const arg of node.args || []) {
        if (!arg) continue;
        if (arg.type === 'namedArgs') {
            namedArgsObj = arg.args || {};
        } else {
            positionalArgs.push(arg);
        }
    }
    
    // Determine syntax type
    const syntaxType = node.syntaxType || 'space';
    
    // Build command code based on syntax type
    let commandLine = '';
    if (syntaxType === 'space') {
        const spaceArgs = (node.args || []).filter((arg: any) => arg && arg.type !== 'namedArgs');
        const argsStr = spaceArgs.map((arg: any) => printArg(arg, ctx)).filter((s: string | null) => s !== null).join(' ');
        commandLine = `${modulePrefix}${commandName}${argsStr ? ' ' + argsStr : ''}`;
    } else if (syntaxType === 'parentheses') {
        const argsStr = positionalArgs.map((arg: any) => printArg(arg, ctx)).filter((s: string | null) => s !== null).join(' ');
        commandLine = `${modulePrefix}${commandName}(${argsStr})`;
    } else if (syntaxType === 'named-parentheses') {
        const parts: string[] = [];
        const posArgsStr = positionalArgs.map((arg: any) => printArg(arg, ctx)).filter((s: string | null) => s !== null);
        parts.push(...posArgsStr);
        if (namedArgsObj) {
            for (const [key, valueArg] of Object.entries(namedArgsObj)) {
                const valueCode = printArg(valueArg as any, ctx);
                if (valueCode !== null) {
                    parts.push(`$${key}=${valueCode}`);
                }
            }
        }
        if (parts.length > 0) {
            commandLine = `${modulePrefix}${commandName}(${parts.join(' ')})`;
        } else {
            commandLine = `${modulePrefix}${commandName}()`;
        }
    } else if (syntaxType === 'multiline-parentheses') {
        const parts: string[] = [];
        const posArgsStr = positionalArgs.map((arg: any) => printArg(arg, ctx)).filter((s: string | null) => s !== null);
        if (posArgsStr.length > 0) {
            parts.push(...posArgsStr.map(arg => `  ${arg}`));
        }
        if (namedArgsObj) {
            for (const [key, valueArg] of Object.entries(namedArgsObj)) {
                const valueCode = printArg(valueArg as any, ctx);
                if (valueCode !== null) {
                    parts.push(`  $${key}=${valueCode}`);
                }
            }
        }
        if (parts.length > 0) {
            writer.pushIndented(`${modulePrefix}${commandName}(\n`);
            for (const part of parts) {
                writer.pushIndented(part);
                writer.newline();
            }
            // Add "into $var" if present (before closing parenthesis)
            let closingParen = ')';
            if (node.into) {
                const intoTarget = printIntoTarget(node.into.targetName, node.into.targetPath);
                closingParen = `) into ${intoTarget}`;
            }
            writer.pushIndented(closingParen);
            writer.newline();
            return;
        } else {
            commandLine = `${modulePrefix}${commandName}()`;
        }
    } else {
        // Fallback to space-separated
        const argsStr = (node.args || []).filter((arg: any) => arg).map((arg: any) => printArg(arg, ctx)).filter((s: string | null) => s !== null).join(' ');
        commandLine = `${modulePrefix}${commandName}${argsStr ? ' ' + argsStr : ''}`;
    }
    
    // Add "into $var" if present
    if (node.into) {
        const intoTarget = printIntoTarget(node.into.targetName, node.into.targetPath);
        commandLine += ` into ${intoTarget}`;
    }
    
    // Add inline comment if present
    if (node.comments && Array.isArray(node.comments)) {
        const inlineComment = node.comments.find((c: any) => c.inline === true && c.text && c.text.trim() !== '');
        if (inlineComment) {
            commandLine += `  # ${inlineComment.text}`;
        }
    }
    
    writer.pushLine(commandLine);
}

function printVarRef(name: string, path?: any[]): string {
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
