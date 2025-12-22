import type { PrintContext, CommentWithPosition } from './types';
import type { Value } from '../../utils/types';
import type { Statement } from '../../types/Ast.type';
import { Writer } from './Writer';
import { getValueType, convertValueType } from '../../utils/valueConversion';

// Type for printer function
type PrinterFn = (node: any, writer: Writer, ctx: PrintContext) => void;

/**
 * Printer class - AST → string conversion
 * 
 * Pure function(s), no access to originalScript.
 * Uses a Writer to avoid heavy string concatenations.
 */
export class Printer {
    // Registry of printers by node type
    private static printersRegistry: Record<string, PrinterFn> = {
        command: Printer.printCommand,
        assignment: Printer.printAssignment,
        shorthand: (node, writer) => {
            writer.pushLine(`$${node.targetName} = $`);
        },
        inlineIf: (node, writer, ctx) => {
            const conditionStr = Printer.printArg(node.conditionExpr, ctx) ?? String(node.conditionExpr);
            const cmdCode = Printer.printNode(node.command, { ...ctx, indentLevel: 0 });
            writer.pushLine(`if ${conditionStr} then ${cmdCode.trim()}`);
        },
        ifBlock: Printer.printIfBlock,
        ifTrue: (node, writer, ctx) => {
            const cmdCode = Printer.printNode(node.command, { ...ctx, indentLevel: 0 });
            writer.pushLine(`iftrue ${cmdCode.trim()}`);
        },
        ifFalse: (node, writer, ctx) => {
            const cmdCode = Printer.printNode(node.command, { ...ctx, indentLevel: 0 });
            writer.pushLine(`iffalse ${cmdCode.trim()}`);
        },
        define: Printer.printDefine,
        do: Printer.printDo,
        together: Printer.printTogether,
        forLoop: Printer.printForLoop,
        onBlock: Printer.printOnBlock,
        return: (node, writer, ctx) => {
            let returnLine = '';
            if (node.value) {
                const valueCode = Printer.printArg(node.value, ctx);
                returnLine = `return ${valueCode || ''}`;
            } else {
                returnLine = 'return';
            }
            
            // Add inline comment if present
            if (node.comments && Array.isArray(node.comments)) {
                const inlineComment = node.comments.find((c: any) => c.inline === true);
                if (inlineComment) {
                    returnLine += `  # ${inlineComment.text}`;
                }
            }
            
            writer.pushLine(returnLine);
        },
        break: (node, writer) => {
            let line = 'break';
            const inlineComment = Printer.getInlineComment(node);
            if (inlineComment) {
                line += Printer.formatInlineComment(inlineComment);
            }
            writer.pushLine(line);
        },
        continue: (node, writer) => {
            let line = 'continue';
            const inlineComment = Printer.getInlineComment(node);
            if (inlineComment) {
                line += Printer.formatInlineComment(inlineComment);
            }
            writer.pushLine(line);
        },
        comment: Printer.printCommentNode,
        chunk_marker: Printer.printChunkMarker,
        cell: Printer.printCellBlock,
        prompt_block: Printer.printPromptBlock,
    };

    /**
     * Print a statement node to code
     */
    static printNode(node: Statement, ctx: PrintContext): string {
        // If an original script exists and the caller did not specify, default to preserving
        // original formatting tokens where possible (e.g., `&&` vs `and`, parentheses).
        const effectiveCtx: PrintContext =
            ctx.allowExtractOriginalCode === undefined && ctx.originalScript
                ? { ...ctx, allowExtractOriginalCode: true }
                : ctx;

        const writer = new Writer();
        writer.indent(effectiveCtx.indentLevel);
        
        // Use visitor pattern with printer registry
        const printer = Printer.printersRegistry[node.type];
        if (printer) {
            printer(node as any, writer, effectiveCtx);
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
     * Get value type
     */
    static getValueType(value: Value): 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array' {
        return getValueType(value);
    }

    /**
     * Convert value type
     */
    static convertValueType(value: Value, targetType: 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array'): Value | null {
        return convertValueType(value, targetType);
    }

    /**
     * Print argument/expression code
     */
    static printArg(arg: any, _ctx: PrintContext): string | null {
        if (!arg) return null;

        switch (arg.type) {
            case 'var': {
                return Printer.printVarRef(arg.name, arg.path);
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
            case 'subexpression': {
                // Handle subexpression with body
                const subexprBody = arg.body || [];
                if (subexprBody.length === 0) {
                    return '$()';
                }
                
                // Use a temporary writer to print the body
                const writer = new Writer();
                
                // Check code positions if available
                const startRow = arg.codePos?.startRow;
                const endRow = arg.codePos?.endRow;
                const bodyStartRow = subexprBody[0]?.codePos?.startRow;
                const bodyEndRow = subexprBody[subexprBody.length - 1]?.codePos?.endRow;
                
                const startsOnSameLine = (startRow !== undefined && bodyStartRow !== undefined && startRow === bodyStartRow);
                
                // Check if it's multiline
                const isMultiline = subexprBody.length > 1 || 
                    (arg.codePos && arg.codePos.endRow > arg.codePos.startRow);
                
                if (isMultiline) {
                    if (startsOnSameLine) {
                        writer.push('$');
                        for (let i = 0; i < subexprBody.length; i++) {
                            const stmt = subexprBody[i];
                            // Use current indent level for the statements so they align with the parent expression's block
                            const stmtCode = Printer.printNode(stmt, { ..._ctx, indentLevel: _ctx.indentLevel });
                            
                            if (i === 0) {
                                // For the first statement on the same line, trim leading indentation
                                writer.push('(' + (stmtCode ? stmtCode.trimStart() : ''));
                            } else {
                                // For subsequent statements, append as is
                                if (stmtCode) {
                                    writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');
                                }
                            }
                        }
                        
                        // Handle closing parenthesis
                        const endsOnSameLine = (endRow !== undefined && bodyEndRow !== undefined && endRow === bodyEndRow);
                        let result = writer.toString();
                        
                        if (endsOnSameLine) {
                            if (result.endsWith('\n')) {
                                result = result.slice(0, -1);
                            }
                            result += ')';
                        } else {
                            if (!result.endsWith('\n')) {
                                result += '\n';
                            }
                            const indent = '  '.repeat(_ctx.indentLevel);
                            result += indent + ')';
                        }
                        return result;
                    } else {
                        // Standard multiline formatting
                        writer.push('$(\n');
                        for (const stmt of subexprBody) {
                            const stmtCode = Printer.printNode(stmt, { ..._ctx, indentLevel: _ctx.indentLevel + 1 });
                            if (stmtCode) {
                                writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');
                            }
                        }
                        writer.indent(_ctx.indentLevel);
                        writer.pushIndented(')');
                        return writer.toString();
                    }
                } else {
                    // Single line
                    const bodyCode = subexprBody.map((stmt: any) => {
                        const stmtCode = Printer.printNode(stmt, { ..._ctx, indentLevel: 0 });
                        return stmtCode ? stmtCode.trim() : '';
                    }).filter((code: string) => code).join(' ');
                    return `$(${bodyCode})`;
                }
            }
            case 'objectLiteral': {
                const props = (arg.properties || []).map((p: any) => {
                    const key = typeof p.key === 'string' ? p.key : Printer.printArg(p.key, _ctx);
                    const value = Printer.printArg(p.value, _ctx);
                    return `${key}: ${value}`;
                }).join(', ');
                return `{${props}}`;
            }
            case 'arrayLiteral': {
                const elements = (arg.elements || []).map((e: any) => Printer.printArg(e, _ctx)).join(', ');
                return `[${elements}]`;
            }
            case 'object':
                return `{${arg.code || ''}}`;
            case 'array':
                return `[${arg.code || ''}]`;
            case 'binary': {
                const left = Printer.printArg(arg.left, _ctx) || '';
                const right = Printer.printArg(arg.right, _ctx) || '';
                const op = arg.operatorText || arg.operator;
                const expr = `${left} ${op} ${right}`;
                return arg.parenthesized ? `(${expr})` : expr;
            }
            case 'unary': {
                const argStr = Printer.printArg(arg.argument, _ctx) || '';
                return `${arg.operator} ${argStr}`;
            }
            case 'call': {
                const callee = arg.callee || '';
                const args = (arg.args || []).map((a: any) => Printer.printArg(a, _ctx)).filter((s: string | null) => s !== null).join(' ');
                return args ? `${callee} ${args}` : callee;
            }
            case 'namedArgs':
                return null;
            default:
                if (typeof arg === 'string') {
                    return arg;
                }
                return null;
        }
    }

    /**
     * Print a variable reference
     */
    static printVarRef(name: string, path?: any[]): string {
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
    static printIntoTarget(targetName: string, targetPath?: any[]): string {
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

    /**
     * Print assignment node
     */
    static printAssignment(node: any, writer: Writer, ctx: PrintContext): void {
        Printer.emitDecorators(node, writer, ctx);

        const target = '$' + node.targetName + (node.targetPath?.map((seg: any) => 
            seg.type === 'property' ? '.' + seg.name : `[${seg.index}]`
        ).join('') || '');
        
        let assignmentLine: string;
        const prefix = node.isSet ? 'set ' : '';
        // If implicit, no operator. Otherwise space + op.
        const opStr = node.isImplicit ? '' : (node.hasAs ? ' as' : ' =');
        
        if (node.isLastValue) {
            assignmentLine = `${prefix}${target}${opStr} $`;
        } else if (node.command) {
            const cmdCode = Printer.printNode(node.command, { ...ctx, indentLevel: 0 });
            assignmentLine = `${prefix}${target}${opStr} ${cmdCode.trim()}`;
        } else if (node.literalValue !== undefined) {
            let valueToUse = node.literalValue;
            let typeToUse: 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';
            const currentType = Printer.getValueType(node.literalValue);
            
            if (node.literalValueType) {
                if (currentType !== node.literalValueType) {
                    const converted = Printer.convertValueType(node.literalValue, node.literalValueType);
                    if (converted !== null) {
                        valueToUse = converted;
                        typeToUse = node.literalValueType;
                    } else {
                        typeToUse = currentType;
                    }
                } else {
                    typeToUse = node.literalValueType;
                }
            } else {
                typeToUse = currentType;
            }
            
            let valueStr: string;
            if (typeToUse === 'string') {
                valueStr = `"${String(valueToUse).replace(/"/g, '\\"')}"`;
            } else if (typeToUse === 'null') {
                valueStr = 'null';
            } else if (typeToUse === 'boolean') {
                valueStr = String(valueToUse);
            } else if (typeToUse === 'number') {
                valueStr = String(valueToUse);
            } else if (typeToUse === 'array' || typeToUse === 'object') {
                valueStr = JSON.stringify(valueToUse);
            } else {
                valueStr = typeof valueToUse === 'string' ? `"${valueToUse}"` : String(valueToUse);
            }
            
            assignmentLine = `${prefix}${target}${opStr} ${valueStr}`;
        } else {
            return;
        }
        
        const inlineComment = Printer.getInlineComment(node);
        if (inlineComment) {
            assignmentLine += Printer.formatInlineComment(inlineComment);
        }
        
        writer.pushLine(assignmentLine);
    }

    /**
     * Print cell block node
     */
    static printCellBlock(node: any, writer: Writer, ctx: PrintContext): void {
        let headerLine = `---cell ${node.cellType}`;
        const meta = node.meta || {};
        const metaKeys = Object.keys(meta);
        
        if (meta.id !== undefined) {
            const value = meta.id;
            if (/[\s:=-]/.test(value)) {
                headerLine += ` id:"${value}"`;
            } else {
                headerLine += ` id:${value}`;
            }
        }
        
        const remainingKeys = metaKeys.filter(k => k !== 'id').sort();
        for (const key of remainingKeys) {
            const value = meta[key];
            if (/[\s:=-]/.test(value)) {
                headerLine += ` ${key}:"${value}"`;
            } else {
                headerLine += ` ${key}:${value}`;
            }
        }
        
        headerLine += '---';
        writer.pushLine(headerLine);
        
        if (node.cellType === 'code' && node.body && Array.isArray(node.body) && node.body.length > 0) {
            for (const stmt of node.body) {
                const stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel });
                if (stmtCode) {
                    writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');
                }
            }
        } else if (node.rawBody !== undefined && node.rawBody.length > 0) {
            writer.push(node.rawBody);
            if (!node.rawBody.endsWith('\n')) {
                writer.newline();
            }
        }
        
        writer.pushLine('---end---');
    }

    /**
     * Print chunk marker node
     */
    static printChunkMarker(node: any, writer: Writer, _ctx: PrintContext): void {
        let line = `--- chunk:${node.id}`;
        if (node.meta && Object.keys(node.meta).length > 0) {
            const sortedKeys = Object.keys(node.meta).sort();
            const metaPairs = sortedKeys.map(key => {
                const value = node.meta[key];
                if (/[\s:=-]/.test(value)) {
                    return `${key}:"${value}"`;
                }
                return `${key}:${value}`;
            });
            line += ' ' + metaPairs.join(' ');
        }
        line += ' ---';
        writer.pushLine(line);
    }

    /**
     * Print command node
     */
    static printCommand(node: any, writer: Writer, ctx: PrintContext): void {
        if (node.name === '_var' && node.args && node.args.length === 1 && node.args[0] && node.args[0].type === 'var') {
            const varArg = node.args[0];
            writer.pushLine(Printer.printVarRef(varArg.name, varArg.path));
            return;
        }
        
        if (node.name === '_subexpr' && node.args && node.args.length === 1 && node.args[0]) {
            const subexprArg = node.args[0];
            if (subexprArg.type === 'subexpr') {
                writer.pushLine(`$(${subexprArg.code || ''})`);
                return;
            } else if (subexprArg.type === 'subexpression') {
                const subexprBody = subexprArg.body || [];
                if (subexprBody.length === 0) {
                    writer.pushLine('$()');
                    return;
                }
                
                const startRow = subexprArg.codePos?.startRow;
                const endRow = subexprArg.codePos?.endRow;
                const bodyStartRow = subexprBody[0]?.codePos?.startRow;
                const bodyEndRow = subexprBody[subexprBody.length - 1]?.codePos?.endRow;
                const startsOnSameLine = (startRow !== undefined && bodyStartRow !== undefined && startRow === bodyStartRow);
                const isMultiline = subexprBody.length > 1 || 
                    (subexprArg.codePos && subexprArg.codePos.endRow > subexprArg.codePos.startRow);
                
                if (isMultiline) {
                    if (startsOnSameLine) {
                        writer.pushIndented('$');
                        const endsOnSameLine = (endRow !== undefined && bodyEndRow !== undefined && endRow === bodyEndRow);

                        for (let i = 0; i < subexprBody.length; i++) {
                            const stmt = subexprBody[i];
                            let stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel });
                            
                            if (i === 0) {
                                stmtCode = stmtCode ? stmtCode.trimStart() : '';
                                writer.push('(');
                            }
                            
                            if (i === subexprBody.length - 1 && endsOnSameLine) {
                                if (stmtCode.endsWith('\n')) {
                                    stmtCode = stmtCode.slice(0, -1);
                                }
                                writer.push(stmtCode + ')');
                                writer.newline();
                            } else {
                                if (stmtCode && !stmtCode.endsWith('\n')) {
                                    stmtCode += '\n';
                                }
                                writer.push(stmtCode);
                                if (i === subexprBody.length - 1) {
                                    writer.pushIndented(')');
                                    writer.newline();
                                }
                            }
                        }
                    } else {
                        writer.pushIndented('$(\n');
                        for (const stmt of subexprBody) {
                            const stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel + 1 });
                            if (stmtCode) {
                                writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');
                            }
                        }
                        writer.pushIndented(')');
                        writer.newline();
                    }
                } else {
                    const bodyCode = subexprBody.map((stmt: any) => {
                        const stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: 0 });
                        return stmtCode ? stmtCode.trim() : '';
                    }).filter((code: string) => code).join(' ');
                    writer.pushLine(`$(${bodyCode})`);
                }
                return;
            }
        }

        if (node.name === '_literal' && node.args && node.args.length === 1 && node.args[0]) {
            const arg = node.args[0];
            const argCode = Printer.printArg(arg, ctx);
            if (argCode !== null) {
                let line = argCode;
                const inlineComment = Printer.getInlineComment(node);
                if (inlineComment) {
                    line += Printer.formatInlineComment(inlineComment);
                }
                writer.pushLine(line);
                return;
            }
        }
        
        if (node.name === '_object') {
            if (node.args && node.args.length >= 1 && node.args[0] && node.args[0].type === 'object') {
                const objArg = node.args[0];
                writer.pushLine(`{${objArg.code || ''}}`);
            } else {
                writer.pushLine('{}');
            }
            return;
        }
        
        if (node.name === '_array') {
            if (node.args && node.args.length >= 1 && node.args[0] && node.args[0].type === 'array') {
                const arrArg = node.args[0];
                writer.pushLine(`[${arrArg.code || ''}]`);
            } else {
                writer.pushLine('[]');
            }
            return;
        }
        
        let commandName = node.name;
        if (node.module && node.name.includes('.')) {
            const parts = node.name.split('.');
            commandName = parts[parts.length - 1];
        }
        const modulePrefix = node.module ? `${node.module}.` : '';
        
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
        
        const syntaxType = node.syntaxType || 'space';
        let commandLine = '';
        if (syntaxType === 'space') {
            const spaceArgs = (node.args || []).filter((arg: any) => arg && arg.type !== 'namedArgs');
            const argsStr = spaceArgs.map((arg: any) => Printer.printArg(arg, ctx)).filter((s: string | null) => s !== null).join(' ');
            commandLine = `${modulePrefix}${commandName}${argsStr ? ' ' + argsStr : ''}`;
        } else if (syntaxType === 'parentheses') {
            const argsStr = positionalArgs.map((arg: any) => Printer.printArg(arg, ctx)).filter((s: string | null) => s !== null).join(' ');
            commandLine = `${modulePrefix}${commandName}(${argsStr})`;
        } else if (syntaxType === 'named-parentheses') {
            const parts: string[] = [];
            const posArgsStr = positionalArgs.map((arg: any) => Printer.printArg(arg, ctx)).filter((s: string | null) => s !== null);
            parts.push(...posArgsStr);
            if (namedArgsObj) {
                for (const [key, valueArg] of Object.entries(namedArgsObj)) {
                    const valueCode = Printer.printArg(valueArg as any, ctx);
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
            const posArgsStr = positionalArgs.map((arg: any) => Printer.printArg(arg, ctx)).filter((s: string | null) => s !== null);
            if (posArgsStr.length > 0) {
                parts.push(...posArgsStr.map(arg => `  ${arg}`));
            }
            if (namedArgsObj) {
                for (const [key, valueArg] of Object.entries(namedArgsObj)) {
                    const valueCode = Printer.printArg(valueArg as any, ctx);
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
                let closingParen = ')';
                if (node.into) {
                    const intoTarget = Printer.printIntoTarget(node.into.targetName, node.into.targetPath);
                    closingParen = `) into ${intoTarget}`;
                }
                writer.pushIndented(closingParen);
                writer.newline();
                return;
            } else {
                commandLine = `${modulePrefix}${commandName}()`;
            }
        } else {
            const argsStr = (node.args || []).filter((arg: any) => arg).map((arg: any) => Printer.printArg(arg, ctx)).filter((s: string | null) => s !== null).join(' ');
            commandLine = `${modulePrefix}${commandName}${argsStr ? ' ' + argsStr : ''}`;
        }
        
        if (node.into) {
            const intoTarget = Printer.printIntoTarget(node.into.targetName, node.into.targetPath);
            commandLine += ` into ${intoTarget}`;
        }
        
        const inlineComment = Printer.getInlineComment(node);
        if (inlineComment) {
            commandLine += Printer.formatInlineComment(inlineComment);
        }
        
        if (node.callback) {
            writer.pushIndented(commandLine);
            writer.push(' with');
            if (node.callback.paramNames && node.callback.paramNames.length > 0) {
                writer.push(' ' + node.callback.paramNames.map((p: string) => `$${p}`).join(' '));
            }
            if (node.callback.into) {
                const target = Printer.printIntoTarget(node.callback.into.targetName, node.callback.into.targetPath);
                writer.push(` into ${target}`);
            }
            const headerComment = Printer.getInlineComment(node.callback);
            if (headerComment) {
                writer.push(Printer.formatInlineComment(headerComment));
            }
            writer.newline();
            if (node.callback.body && Array.isArray(node.callback.body)) {
                for (const stmt of node.callback.body) {
                    Printer.emitLeadingComments(stmt, writer, ctx, ctx.indentLevel + 1);
                    const stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel + 1 });
                    if (stmtCode) writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');
                }
            }
            writer.pushLine('endwith');
            return;
        }

        writer.pushLine(commandLine);
    }

    /**
     * Print a comment node
     */
    static printCommentNode(node: any, writer: Writer, _ctx: PrintContext): void {
        if (!node || !node.comments || !Array.isArray(node.comments)) return;

        for (const comment of node.comments as CommentWithPosition[]) {
            const raw = (comment && typeof comment.text === 'string') ? comment.text : '';
            const commentLines = raw.split('\n');

            for (const line of commentLines) {
                const cleaned = line.replace(/\r/g, '');
                if (cleaned.trim() === '') {
                    writer.pushLine('#');
                } else {
                    writer.pushLine(`# ${cleaned}`);
                }
            }
        }
    }

    /**
     * Get leading comments from a statement node.
     */
    private static getLeadingComments(stmt: any): CommentWithPosition[] {
        if (stmt?.comments && Array.isArray(stmt.comments)) {
            return stmt.comments.filter((c: any) => !c.inline);
        }
        if (stmt?.leadingComments && Array.isArray(stmt.leadingComments)) {
            return stmt.leadingComments;
        }
        return [];
    }

    /**
     * Get inline comment from a statement node.
     */
    static getInlineComment(stmt: any): CommentWithPosition | null {
        if (!stmt?.comments || !Array.isArray(stmt.comments)) {
            return null;
        }
        return stmt.comments.find((c: any) => c.inline === true) || null;
    }

    /**
     * Format an inline comment as a string to append to a line.
     */
    static formatInlineComment(comment: CommentWithPosition | null): string {
        if (!comment || !comment.text) {
            return '';
        }
        return `  # ${comment.text}`;
    }

    /**
     * Emit decorators for a node if they exist.
     */
    private static emitDecorators(node: any, writer: Writer, ctx: PrintContext): void {
        if (node.decorators && Array.isArray(node.decorators) && node.decorators.length > 0) {
            for (const decorator of node.decorators) {
                const decoratorArgs: string[] = [];
                for (const arg of decorator.args || []) {
                    const argCode = Printer.printArg(arg, ctx);
                    if (argCode !== null) decoratorArgs.push(argCode);
                }
                const argsStr = decoratorArgs.length > 0 ? ' ' + decoratorArgs.join(' ') : '';
                writer.pushLine(`@${decorator.name}${argsStr}`);
            }
        }
    }

    /**
     * Emit leading comments for a statement, preserving blank lines between them.
     */
    static emitLeadingComments(
        stmt: any,
        writer: Writer,
        _ctx: PrintContext,
        indentLevel: number
    ): boolean {
        const leadingComments = Printer.getLeadingComments(stmt);
        if (leadingComments.length === 0) {
            return false;
        }

        leadingComments.sort((a: any, b: any) => {
            const aRow = a?.codePos?.startRow ?? 0;
            const bRow = b?.codePos?.startRow ?? 0;
            return aRow - bRow;
        });

        for (let i = 0; i < leadingComments.length; i++) {
            const comment = leadingComments[i];
            const commentCode = Printer.printComment(comment, indentLevel);
            if (commentCode) {
                writer.push(commentCode.endsWith('\n') ? commentCode : commentCode + '\n');
            }
            if (i < leadingComments.length - 1) {
                const nextComment = leadingComments[i + 1];
                const gap = (nextComment?.codePos?.startRow ?? 0) - (comment?.codePos?.endRow ?? 0);
                if (gap > 1) {
                    writer.pushBlankLine();
                }
            }
        }

        return true;
    }

    /**
     * Check if there's a blank line gap between the last comment and a statement.
     */
    static emitBlankLineAfterComments(
        stmt: any,
        writer: Writer
    ): void {
        if (!stmt || !('codePos' in stmt) || !stmt.codePos) {
            return;
        }

        const leadingComments = Printer.getLeadingComments(stmt);
        if (leadingComments.length === 0) {
            return;
        }

        const lastComment = leadingComments[leadingComments.length - 1];
        const gap = stmt.codePos.startRow - (lastComment?.codePos?.endRow ?? 0);
        if (gap > 1) {
            writer.pushBlankLine();
        }
    }

    /**
     * Check if there's a blank line gap between two statements.
     */
    static emitBlankLineBetweenStatements(
        prevStmt: any,
        currentStmt: any,
        writer: Writer
    ): void {
        if (!prevStmt || !currentStmt) {
            return;
        }

        if (!('codePos' in prevStmt) || !prevStmt.codePos ||
            !('codePos' in currentStmt) || !currentStmt.codePos) {
            return;
        }

        const prevEndRow = prevStmt.codePos.endRow;
        let currentStartRow = currentStmt.codePos.startRow;
        const leadingComments = Printer.getLeadingComments(currentStmt);
        if (leadingComments.length > 0 && leadingComments[0]?.codePos) {
            currentStartRow = leadingComments[0].codePos.startRow;
        }

        const gap = currentStartRow - prevEndRow;
        if (gap > 1) {
            writer.pushBlankLine();
        }
    }

    /**
     * Print define (function definition) node
     */
    static printDefine(node: any, writer: Writer, ctx: PrintContext): void {
        Printer.emitDecorators(node, writer, ctx);

        const paramNames = node.paramNames && Array.isArray(node.paramNames) ? node.paramNames : [];
        const paramsStr = paramNames.map((name: string) => `$${name}`).join(' ');
        writer.pushLine(`def ${node.name}${paramsStr ? ' ' + paramsStr : ''}`);

        if (node.body && Array.isArray(node.body)) {
            for (let i = 0; i < node.body.length; i++) {
                const stmt = node.body[i];
                const prevStmt = i > 0 ? node.body[i - 1] : null;
                
                if (i === 0 && 'codePos' in node && node.codePos && 'codePos' in stmt && stmt.codePos) {
                    const decoratorsCount = (node.decorators && Array.isArray(node.decorators)) ? node.decorators.length : 0;
                    const headerEndRow = node.codePos.startRow + decoratorsCount;
                    let effectiveStartRow = stmt.codePos.startRow;
                    const leadingComments = Printer.getLeadingComments(stmt);
                    if (leadingComments.length > 0 && leadingComments[0].codePos) {
                        effectiveStartRow = leadingComments[0].codePos.startRow;
                    }
                    const gap = effectiveStartRow - headerEndRow;
                    if (gap > 1) {
                        writer.pushBlankLine();
                    }
                } else {
                    Printer.emitBlankLineBetweenStatements(prevStmt, stmt, writer);
                }                
                Printer.emitLeadingComments(stmt, writer, ctx, ctx.indentLevel + 1);
                Printer.emitBlankLineAfterComments(stmt, writer);

                const stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel + 1 });
                if (stmtCode) writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');

                const trailingBlankLines = (stmt as any)?.trailingBlankLines;
                if (trailingBlankLines !== undefined && trailingBlankLines !== null && trailingBlankLines > 0) {
                    writer.push('\n'.repeat(trailingBlankLines));
                }
            }

            if (node.body.length > 0 && 'codePos' in node && node.codePos) {
                const lastStmt = node.body[node.body.length - 1];
                if ('codePos' in lastStmt && lastStmt.codePos) {
                    const gap = node.codePos.endRow - lastStmt.codePos.endRow;
                    if (gap > 1) {
                        writer.pushBlankLine();
                    }
                }
            }
        }

        writer.pushLine('enddef');
    }

    /**
     * Print do block node
     */
    static printDo(node: any, writer: Writer, ctx: PrintContext): void {
        Printer.emitDecorators(node, writer, ctx);

        let doHeader = 'do';
        if (node.paramNames && Array.isArray(node.paramNames) && node.paramNames.length > 0) {
            const params = node.paramNames.map((p: string) => p.startsWith('$') ? p : `$${p}`).join(' ');
            doHeader += ` ${params}`;
        }
        if (node.into) {
            const targetName = node.into.targetName.startsWith('$') ? node.into.targetName : `$${node.into.targetName}`;
            doHeader += ` into ${targetName}`;
        }
        writer.pushLine(doHeader);

        if (node.body && Array.isArray(node.body)) {
            for (const stmt of node.body) {
                Printer.emitLeadingComments(stmt, writer, ctx, ctx.indentLevel + 1);
                const stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel + 1 });
                if (stmtCode) writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');
                const trailingBlankLines = (stmt as any)?.trailingBlankLines;
                if (trailingBlankLines !== undefined && trailingBlankLines !== null && trailingBlankLines > 0) {
                    writer.push('\n'.repeat(trailingBlankLines));
                }
            }
        }

        writer.pushLine('enddo');
    }

    /**
     * Print for loop node
     */
    static printForLoop(node: any, writer: Writer, ctx: PrintContext): void {
        Printer.emitDecorators(node, writer, ctx);

        const varName = node.varName || node.var || node.iterator || '$i';
        const varPrefix = varName.startsWith('$') ? '' : '$';

        if (node.range && node.range.from !== undefined && node.range.to !== undefined) {
            const from = Printer.printArg(node.range.from, ctx);
            const to = Printer.printArg(node.range.to, ctx);
            writer.pushLine(`for ${varPrefix}${varName} in range ${from} ${to}`);
        } 
        else if (node.iterable) {
            const iterableStr = Printer.printArg(node.iterable, ctx);
            writer.pushLine(`for ${varPrefix}${varName} in ${iterableStr ?? ''}`.trimEnd());
        }
        else {
            writer.pushLine(`for ${varPrefix}${varName} in `.trimEnd());
        }

        if (node.body && Array.isArray(node.body)) {
            for (const stmt of node.body) {
                if (!stmt) continue;
                Printer.emitLeadingComments(stmt, writer, ctx, ctx.indentLevel + 1);
                const stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel + 1 });
                if (stmtCode) writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');
                const trailingBlankLines = (stmt as any)?.trailingBlankLines;
                if (trailingBlankLines !== undefined && trailingBlankLines !== null && trailingBlankLines > 0) {
                    writer.push('\n'.repeat(trailingBlankLines));
                }
            }
        }

        writer.pushLine('endfor');
    }

    /**
     * Print ifBlock node
     */
    static printIfBlock(node: any, writer: Writer, ctx: PrintContext): void {
        Printer.emitDecorators(node, writer, ctx);

        const condition = node.condition || node.conditionExpr;
        const conditionStr = (typeof condition === 'object' && condition !== null)
            ? (Printer.printArg(condition, ctx) ?? String(condition))
            : String(condition);

        const thenKeyword = node.hasThen ? ' then' : '';
        writer.pushLine(`if ${conditionStr}${thenKeyword}`);

        if (node.thenBranch && Array.isArray(node.thenBranch)) {
            const bodyIndent = ctx.indentLevel + 1;
            for (const stmt of node.thenBranch) {
                Printer.emitLeadingComments(stmt, writer, ctx, bodyIndent);
                Printer.emitBlankLineAfterComments(stmt, writer);
                const stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: bodyIndent });
                if (stmtCode) {
                    writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');
                }
                const trailingBlankLines = (stmt as any)?.trailingBlankLines;
                if (trailingBlankLines !== undefined && trailingBlankLines !== null && trailingBlankLines > 0) {
                    writer.push('\n'.repeat(trailingBlankLines));
                }
            }
        }

        if (node.elseifBranches && Array.isArray(node.elseifBranches)) {
            for (const elseifBranch of node.elseifBranches) {
                const elseifCondition = elseifBranch.condition || elseifBranch.conditionExpr;
                const elseifConditionStr = (typeof elseifCondition === 'object' && elseifCondition !== null)
                    ? (Printer.printArg(elseifCondition, ctx) ?? String(elseifCondition))
                    : String(elseifCondition);
                
                writer.pushLine(`elseif ${elseifConditionStr}`);
                
                if (elseifBranch.body && Array.isArray(elseifBranch.body)) {
                    const bodyIndent = ctx.indentLevel + 1;
                    for (const stmt of elseifBranch.body) {
                        Printer.emitLeadingComments(stmt, writer, ctx, bodyIndent);
                        Printer.emitBlankLineAfterComments(stmt, writer);
                        const stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: bodyIndent });
                        if (stmtCode) {
                            writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');
                        }
                        const trailingBlankLines = (stmt as any)?.trailingBlankLines;
                        if (trailingBlankLines !== undefined && trailingBlankLines !== null && trailingBlankLines > 0) {
                            writer.push('\n'.repeat(trailingBlankLines));
                        }
                    }
                }
            }
        }

        if (node.elseBranch && Array.isArray(node.elseBranch) && node.elseBranch.length > 0) {
            writer.pushLine('else');
            const bodyIndent = ctx.indentLevel + 1;
            for (const stmt of node.elseBranch) {
                Printer.emitLeadingComments(stmt, writer, ctx, bodyIndent);
                Printer.emitBlankLineAfterComments(stmt, writer);
                const stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: bodyIndent });
                if (stmtCode) {
                    writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');
                }
                const trailingBlankLines = (stmt as any)?.trailingBlankLines;
                if (trailingBlankLines !== undefined && trailingBlankLines !== null && trailingBlankLines > 0) {
                    writer.push('\n'.repeat(trailingBlankLines));
                }
            }
        }

        writer.pushLine('endif');
    }

    /**
     * Print on block node
     */
    static printOnBlock(node: any, writer: Writer, ctx: PrintContext): void {
        Printer.emitDecorators(node, writer, ctx);
        const eventName = node.eventName || node.event || '';
        writer.pushLine(`on "${eventName}"`.trimEnd());

        if (node.body && Array.isArray(node.body)) {
            for (const stmt of node.body) {
                Printer.emitLeadingComments(stmt, writer, ctx, ctx.indentLevel + 1);
                const stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel + 1 });
                if (stmtCode) writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');
                const trailingBlankLines = (stmt as any)?.trailingBlankLines;
                if (trailingBlankLines !== undefined && trailingBlankLines !== null && trailingBlankLines > 0) {
                    writer.push('\n'.repeat(trailingBlankLines));
                }
            }
        }
        writer.pushLine('endon');
    }

    /**
     * Print prompt block node
     */
    static printPromptBlock(node: any, writer: Writer, _ctx: PrintContext): void {
        writer.pushLine('---');
        if (node.rawText !== undefined) {
            if (node.rawText.length > 0) {
                writer.push(node.rawText);
                if (!node.rawText.endsWith('\n')) {
                    writer.newline();
                }
            } else if (node.bodyPos && node.bodyPos.startRow >= 0 && node.bodyPos.startRow <= node.bodyPos.endRow) {
                writer.newline();
            }
        }
        writer.pushLine('---');
    }

    /**
     * Print together block node
     */
    static printTogether(node: any, writer: Writer, ctx: PrintContext): void {
        Printer.emitDecorators(node, writer, ctx);
        writer.pushLine('together');
        if (node.blocks && Array.isArray(node.blocks)) {
            for (const block of node.blocks) {
                Printer.emitLeadingComments(block, writer, ctx, ctx.indentLevel + 1);
                const blockCode = Printer.printNode(block, { ...ctx, indentLevel: ctx.indentLevel + 1 });
                if (blockCode) writer.push(blockCode.endsWith('\n') ? blockCode : blockCode + '\n');
                const trailingBlankLines = (block as any)?.trailingBlankLines;
                if (trailingBlankLines !== undefined && trailingBlankLines !== null && trailingBlankLines > 0) {
                    writer.push('\n'.repeat(trailingBlankLines));
                }
            }
        }
        writer.pushLine('endtogether');
    }
}

