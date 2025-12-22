/**
 * Print class - Consolidated printer methods for all AST node types
 */

import type { PrintContext, CommentWithPosition } from './ASTToCodeConverter';
import type { Value } from '../../utils/types';
import { Writer } from './ASTToCodeConverter';

// Type for printer function
type PrinterFn = (node: any, writer: Writer, ctx: PrintContext) => void;

/**
 * Print class containing all printer methods
 */
export class Print {
    // Registry of printers - will be set by ASTToCodeConverter
    private static printersRegistry: Record<string, PrinterFn> | null = null;

    /**
     * Set the printers registry (called by ASTToCodeConverter)
     */
    static setPrintersRegistry(registry: Record<string, PrinterFn>): void {
        Print.printersRegistry = registry;
    }

    /**
     * Print a statement node to code
     */
    static printNode(node: any, ctx: PrintContext): string {
        if (!Print.printersRegistry) {
            throw new Error('Printers registry not initialized. Call Print.setPrintersRegistry() first.');
        }

        // If an original script exists and the caller did not specify, default to preserving
        // original formatting tokens where possible (e.g., `&&` vs `and`, parentheses).
        const effectiveCtx: PrintContext =
            ctx.allowExtractOriginalCode === undefined && ctx.originalScript
                ? { ...ctx, allowExtractOriginalCode: true }
                : ctx;

        const writer = new Writer();
        writer.indent(effectiveCtx.indentLevel);
        
        // Use visitor pattern with printer registry
        const printer = Print.printersRegistry[node.type];
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
        const currentType = Print.getValueType(value);
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
    /**
     * Print argument/expression code
     */
    static printArg(arg: any, _ctx: PrintContext): string | null {
        if (!arg) return null;

        switch (arg.type) {
            case 'var': {
                return Print.printVarRef(arg.name, arg.path);
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
                const left = Print.printArg(arg.left, _ctx) || '';
                const right = Print.printArg(arg.right, _ctx) || '';
                // Use original operator text if available (e.g., && instead of and)
                const op = arg.operatorText || arg.operator;
                const expr = `${left} ${op} ${right}`;
                // Wrap in parentheses if originally parenthesized
                return arg.parenthesized ? `(${expr})` : expr;
            }
            case 'unary': {
                // Handle unary expressions like not $value
                const argStr = Print.printArg(arg.argument, _ctx) || '';
                return `${arg.operator} ${argStr}`;
            }
            case 'call': {
                // Handle function calls like range(1, 5) or range 1 5
                const callee = arg.callee || '';
                const args = (arg.args || []).map((a: any) => Print.printArg(a, _ctx)).filter((s: string | null) => s !== null).join(' ');
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
        const target = '$' + node.targetName + (node.targetPath?.map((seg: any) => 
            seg.type === 'property' ? '.' + seg.name : `[${seg.index}]`
        ).join('') || '');
        
        let assignmentLine: string;
        
        // Check isLastValue first (before literalValue) since literalValue can be null
        if (node.isLastValue) {
            assignmentLine = `${target} = $`;
        } else if (node.command) {
            const cmdCode = Print.printNode(node.command, { ...ctx, indentLevel: 0 });
            assignmentLine = `${target} = ${cmdCode.trim()}`;
        } else if (node.literalValue !== undefined) {
            // Handle type conversion if literalValueType is specified
            let valueToUse = node.literalValue;
            let typeToUse: 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';
            const currentType = Print.getValueType(node.literalValue);
            
            if (node.literalValueType) {
                if (currentType !== node.literalValueType) {
                    const converted = Print.convertValueType(node.literalValue, node.literalValueType);
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
            
            // Format the value for code output
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
            
            assignmentLine = `${target} = ${valueStr}`;
        } else {
            return; // No valid assignment
        }
        
        // Add inline comment if present
        const inlineComment = Print.getInlineComment(node);
        if (inlineComment) {
            assignmentLine += Print.formatInlineComment(inlineComment);
        }
        
        writer.pushLine(assignmentLine);
    }

    /**
     * Print cell block node
     */
    static printCellBlock(node: any, writer: Writer, ctx: PrintContext): void {
        // Print header: ---cell <cellType> key:value key:value---
        let headerLine = `---cell ${node.cellType}`;
        
        // Collect and sort metadata
        const meta = node.meta || {};
        const metaKeys = Object.keys(meta);
        
        // Print id first if present, then remaining keys sorted
        if (meta.id !== undefined) {
            const value = meta.id;
            if (/[\s:=-]/.test(value)) {
                headerLine += ` id:"${value}"`;
            } else {
                headerLine += ` id:${value}`;
            }
        }
        
        // Print remaining keys sorted alphabetically
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
        
        // Print body
        if (node.cellType === 'code' && node.body && Array.isArray(node.body) && node.body.length > 0) {
            // Print parsed statements
            for (const stmt of node.body) {
                const stmtCode = Print.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel });
                if (stmtCode) {
                    writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');
                }
            }
        } else if (node.rawBody !== undefined && node.rawBody.length > 0) {
            // Print raw body verbatim
            writer.push(node.rawBody);
            // Ensure body ends with newline if it doesn't already
            if (!node.rawBody.endsWith('\n')) {
                writer.newline();
            }
        }
        // Empty body - no content between header and ---end---
        
        // Print closing fence
        writer.pushLine('---end---');
    }

    /**
     * Print chunk marker node
     */
    static printChunkMarker(node: any, writer: Writer, _ctx: PrintContext): void {
        // If raw is preserved, use that (for now, always use canonical format)
        // Future: could add preserveRaw option to PrintContext if needed

        // Print in canonical format
        let line = `--- chunk:${node.id}`;

        // Add metadata if present
        if (node.meta && Object.keys(node.meta).length > 0) {
            // Sort keys alphabetically for canonical output
            const sortedKeys = Object.keys(node.meta).sort();
            const metaPairs = sortedKeys.map(key => {
                const value = node.meta[key];
                // If value contains spaces or special chars, quote it
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
        // Special handling for _var command - just output the variable
        if (node.name === '_var' && node.args && node.args.length === 1 && node.args[0] && node.args[0].type === 'var') {
            const varArg = node.args[0];
            writer.pushLine(Print.printVarRef(varArg.name, varArg.path));
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
                        const stmtCode = Print.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel + 1 });
                        if (stmtCode) {
                            writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');
                        }
                    }
                    writer.pushIndented(')');
                    writer.newline();
                } else {
                    // Single line
                    const bodyCode = subexprBody.map((stmt: any) => {
                        const stmtCode = Print.printNode(stmt, { ...ctx, indentLevel: 0 });
                        return stmtCode ? stmtCode.trim() : '';
                    }).filter((code: string) => code).join(' ');
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
            const argsStr = spaceArgs.map((arg: any) => Print.printArg(arg, ctx)).filter((s: string | null) => s !== null).join(' ');
            commandLine = `${modulePrefix}${commandName}${argsStr ? ' ' + argsStr : ''}`;
        } else if (syntaxType === 'parentheses') {
            const argsStr = positionalArgs.map((arg: any) => Print.printArg(arg, ctx)).filter((s: string | null) => s !== null).join(' ');
            commandLine = `${modulePrefix}${commandName}(${argsStr})`;
        } else if (syntaxType === 'named-parentheses') {
            const parts: string[] = [];
            const posArgsStr = positionalArgs.map((arg: any) => Print.printArg(arg, ctx)).filter((s: string | null) => s !== null);
            parts.push(...posArgsStr);
            if (namedArgsObj) {
                for (const [key, valueArg] of Object.entries(namedArgsObj)) {
                    const valueCode = Print.printArg(valueArg as any, ctx);
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
            const posArgsStr = positionalArgs.map((arg: any) => Print.printArg(arg, ctx)).filter((s: string | null) => s !== null);
            if (posArgsStr.length > 0) {
                parts.push(...posArgsStr.map(arg => `  ${arg}`));
            }
            if (namedArgsObj) {
                for (const [key, valueArg] of Object.entries(namedArgsObj)) {
                    const valueCode = Print.printArg(valueArg as any, ctx);
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
                    const intoTarget = Print.printIntoTarget(node.into.targetName, node.into.targetPath);
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
            const argsStr = (node.args || []).filter((arg: any) => arg).map((arg: any) => Print.printArg(arg, ctx)).filter((s: string | null) => s !== null).join(' ');
            commandLine = `${modulePrefix}${commandName}${argsStr ? ' ' + argsStr : ''}`;
        }
        
        // Add "into $var" if present
        if (node.into) {
            const intoTarget = Print.printIntoTarget(node.into.targetName, node.into.targetPath);
            commandLine += ` into ${intoTarget}`;
        }
        
        // Add inline comment if present
        const inlineComment = Print.getInlineComment(node);
        if (inlineComment) {
            commandLine += Print.formatInlineComment(inlineComment);
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
            // Support consecutive comments encoded with \n
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
     * Supports both new format (stmt.comments) and old format (stmt.leadingComments).
     */
    private static getLeadingComments(stmt: any): CommentWithPosition[] {
        // Try new format first (stmt.comments with inline flag)
        if (stmt?.comments && Array.isArray(stmt.comments)) {
            return stmt.comments.filter((c: any) => !c.inline);
        }

        // Fall back to old format (stmt.leadingComments)
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
     * Emit leading comments for a statement, preserving blank lines between them.
     * Returns true if any comments were emitted, false otherwise.
     */
    static emitLeadingComments(
        stmt: any,
        writer: Writer,
        _ctx: PrintContext,
        indentLevel: number
    ): boolean {
        const leadingComments = Print.getLeadingComments(stmt);
        if (leadingComments.length === 0) {
            return false;
        }

        // Sort comments by their row position to maintain order
        leadingComments.sort((a: any, b: any) => {
            const aRow = a?.codePos?.startRow ?? 0;
            const bRow = b?.codePos?.startRow ?? 0;
            return aRow - bRow;
        });

        // Print each leading comment, preserving blank lines between them
        for (let i = 0; i < leadingComments.length; i++) {
            const comment = leadingComments[i];
            const commentCode = Print.printComment(comment, indentLevel);
            if (commentCode) {
                writer.push(commentCode.endsWith('\n') ? commentCode : commentCode + '\n');
            }

            // Check if there's a blank line gap before the next comment
            if (i < leadingComments.length - 1) {
                const nextComment = leadingComments[i + 1];
                const gap = (nextComment?.codePos?.startRow ?? 0) - (comment?.codePos?.endRow ?? 0);
                // If gap > 1, there's at least one blank line between comments
                if (gap > 1) {
                    writer.pushBlankLine();
                }
            }
        }

        return true;
    }

    /**
     * Check if there's a blank line gap between the last comment and a statement,
     * and emit a blank line if needed.
     */
    static emitBlankLineAfterComments(
        stmt: any,
        writer: Writer
    ): void {
        if (!stmt || !('codePos' in stmt) || !stmt.codePos) {
            return;
        }

        const leadingComments = Print.getLeadingComments(stmt);
        if (leadingComments.length === 0) {
            return;
        }

        const lastComment = leadingComments[leadingComments.length - 1];
        const gap = stmt.codePos.startRow - (lastComment?.codePos?.endRow ?? 0);
        // If gap > 1, there's at least one blank line between last comment and statement
        if (gap > 1) {
            writer.pushBlankLine();
        }
    }

    /**
     * Check if there's a blank line gap between two statements,
     * and emit a blank line if needed.
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
        // Get the start row of the current statement or its first leading comment
        let currentStartRow = currentStmt.codePos.startRow;
        const leadingComments = Print.getLeadingComments(currentStmt);
        if (leadingComments.length > 0 && leadingComments[0]?.codePos) {
            currentStartRow = leadingComments[0].codePos.startRow;
        }

        const gap = currentStartRow - prevEndRow;
        // If gap > 1, there's at least one blank line between statements
        if (gap > 1) {
            writer.pushBlankLine();
        }
    }

    /**
     * Print define (function definition) node
     */
    static printDefine(node: any, writer: Writer, ctx: PrintContext): void {
        // Print decorators first (if any)
        if (node.decorators && Array.isArray(node.decorators) && node.decorators.length > 0) {
            for (const decorator of node.decorators) {
                const decoratorArgs: string[] = [];
                for (const arg of decorator.args || []) {
                    const argCode = Print.printArg(arg, ctx);
                    if (argCode !== null) decoratorArgs.push(argCode);
                }
                const argsStr = decoratorArgs.length > 0 ? ' ' + decoratorArgs.join(' ') : '';
                writer.pushLine(`@${decorator.name}${argsStr}`);
            }
        }

        // Parameters are stored as paramNames (array of strings), not params
        const paramNames = node.paramNames && Array.isArray(node.paramNames) ? node.paramNames : [];
        const paramsStr = paramNames.map((name: string) => `$${name}`).join(' ');
        writer.pushLine(`def ${node.name}${paramsStr ? ' ' + paramsStr : ''}`);

        if (node.body && Array.isArray(node.body)) {
            for (let i = 0; i < node.body.length; i++) {
                const stmt = node.body[i];
                const prevStmt = i > 0 ? node.body[i - 1] : null;
                
                // Check for blank lines between previous statement and current statement
                if (i === 0 && 'codePos' in node && node.codePos && 'codePos' in stmt && stmt.codePos) {
                    // Check gap between header and first statement
                    // Approximate header end: startRow + decorators count
                    const decoratorsCount = (node.decorators && Array.isArray(node.decorators)) ? node.decorators.length : 0;
                    const headerEndRow = node.codePos.startRow + decoratorsCount;
                    const gap = stmt.codePos.startRow - headerEndRow;
                    if (gap > 1) {
                        writer.pushBlankLine();
                    }
                } else {
                Print.emitBlankLineBetweenStatements(prevStmt, stmt, writer);
                }
                
                // Emit leading comments
                Print.emitLeadingComments(stmt, writer, ctx, ctx.indentLevel + 1);
                
                // Check if there's a blank line gap between the last comment and the statement
                Print.emitBlankLineAfterComments(stmt, writer);

                const stmtCode = Print.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel + 1 });
                if (stmtCode) writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');

                const trailingBlankLines = (stmt as any)?.trailingBlankLines;
                if (trailingBlankLines !== undefined && trailingBlankLines !== null && trailingBlankLines > 0) {
                    writer.push('\n'.repeat(trailingBlankLines));
                }
            }

            // Check for blank lines after last statement (before enddef)
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
        // Build the do header with optional parameters and into target
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
                Print.emitLeadingComments(stmt, writer, ctx, ctx.indentLevel + 1);

                const stmtCode = Print.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel + 1 });
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
        const varName = node.varName || node.var || node.iterator || '$i';
        const varPrefix = varName.startsWith('$') ? '' : '$';

        // Handle range from original parser format
        if (node.range && node.range.from !== undefined && node.range.to !== undefined) {
            const from = Print.printArg(node.range.from, ctx);
            const to = Print.printArg(node.range.to, ctx);
            writer.pushLine(`for ${varPrefix}${varName} in range ${from} ${to}`);
        } 
        // Handle iterable
        else if (node.iterable) {
            const iterableStr = Print.printArg(node.iterable, ctx);
            writer.pushLine(`for ${varPrefix}${varName} in ${iterableStr ?? ''}`.trimEnd());
        }
        else {
            writer.pushLine(`for ${varPrefix}${varName} in `.trimEnd());
        }

        if (node.body && Array.isArray(node.body)) {
            for (const stmt of node.body) {
                if (!stmt) continue;
                
                Print.emitLeadingComments(stmt, writer, ctx, ctx.indentLevel + 1);

                const stmtCode = Print.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel + 1 });
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
        // Note: Leading comments attached to the ifBlock are printed by the parent
        // (e.g., printDefine's emitLeadingComments), so we don't print them here.
        // We only print the if statement and its branches.
        
        const condition = node.condition || node.conditionExpr;
        const conditionStr = (typeof condition === 'object' && condition !== null)
            ? (Print.printArg(condition, ctx) ?? String(condition))
            : String(condition);

        // Use 'then' keyword if original code had it
        const thenKeyword = node.hasThen ? ' then' : '';
        writer.pushLine(`if ${conditionStr}${thenKeyword}`);

        // Print then branch with increased indentation
        if (node.thenBranch && Array.isArray(node.thenBranch)) {
            const bodyIndent = ctx.indentLevel + 1;
            
            for (const stmt of node.thenBranch) {
                Print.emitLeadingComments(stmt, writer, ctx, bodyIndent);
                Print.emitBlankLineAfterComments(stmt, writer);

                const stmtCode = Print.printNode(stmt, { ...ctx, indentLevel: bodyIndent });
                if (stmtCode) {
                    // Use writer.push instead of pushLine to avoid double indentation,
                    // as stmtCode already contains the required indentation.
                    writer.push(stmtCode.endsWith('\n') ? stmtCode : stmtCode + '\n');
                }

                const trailingBlankLines = (stmt as any)?.trailingBlankLines;
                if (trailingBlankLines !== undefined && trailingBlankLines !== null && trailingBlankLines > 0) {
                    writer.push('\n'.repeat(trailingBlankLines));
                }
            }
        }

        // Print elseif branches
        if (node.elseifBranches && Array.isArray(node.elseifBranches)) {
            for (const elseifBranch of node.elseifBranches) {
                const elseifCondition = elseifBranch.condition || elseifBranch.conditionExpr;
                const elseifConditionStr = (typeof elseifCondition === 'object' && elseifCondition !== null)
                    ? (Print.printArg(elseifCondition, ctx) ?? String(elseifCondition))
                    : String(elseifCondition);
                
                writer.pushLine(`elseif ${elseifConditionStr}`);
                
                if (elseifBranch.body && Array.isArray(elseifBranch.body)) {
                    const bodyIndent = ctx.indentLevel + 1;
                    
                    for (const stmt of elseifBranch.body) {
                        Print.emitLeadingComments(stmt, writer, ctx, bodyIndent);
                        Print.emitBlankLineAfterComments(stmt, writer);

                        const stmtCode = Print.printNode(stmt, { ...ctx, indentLevel: bodyIndent });
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

        // Print else branch
        if (node.elseBranch && Array.isArray(node.elseBranch) && node.elseBranch.length > 0) {
            writer.pushLine('else');
            
            const bodyIndent = ctx.indentLevel + 1;
            
            for (const stmt of node.elseBranch) {
                Print.emitLeadingComments(stmt, writer, ctx, bodyIndent);
                Print.emitBlankLineAfterComments(stmt, writer);

                const stmtCode = Print.printNode(stmt, { ...ctx, indentLevel: bodyIndent });
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
        const eventName = node.eventName || node.event || '';
        // Event name needs to be quoted
        writer.pushLine(`on "${eventName}"`.trimEnd());

        if (node.body && Array.isArray(node.body)) {
            for (const stmt of node.body) {
                Print.emitLeadingComments(stmt, writer, ctx, ctx.indentLevel + 1);

                const stmtCode = Print.printNode(stmt, { ...ctx, indentLevel: ctx.indentLevel + 1 });
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
        // Print opening fence
        writer.pushLine('---');
        
        // Print raw text verbatim
        if (node.rawText !== undefined) {
            // rawText contains the content between the fences
            // If rawText is empty but bodyPos indicates there was content (like a blank line),
            // we need to preserve that
            if (node.rawText.length > 0) {
                writer.push(node.rawText);
                // Ensure text ends with newline if it doesn't already
                if (!node.rawText.endsWith('\n')) {
                    writer.newline();
                }
            } else if (node.bodyPos && node.bodyPos.startRow >= 0 && node.bodyPos.startRow <= node.bodyPos.endRow) {
                // Empty rawText but body position exists - there was a blank line
                writer.newline();
            }
        }
        
        // Print closing fence
        writer.pushLine('---');
    }

    /**
     * Print together block node
     */
    static printTogether(node: any, writer: Writer, ctx: PrintContext): void {
        writer.pushLine('together');

        if (node.blocks && Array.isArray(node.blocks)) {
            for (const block of node.blocks) {
                // Each block is a 'do' block
                const blockCode = Print.printNode(block, { ...ctx, indentLevel: ctx.indentLevel + 1 });
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

