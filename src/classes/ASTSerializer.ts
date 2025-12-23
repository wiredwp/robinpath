/**
 * ASTSerializer class for converting AST nodes to JSON-serializable objects
 */

import type { Environment } from '../types/Environment.type';
import type { 
    Statement, 
    Arg, 
    TogetherBlock, 
    OnBlock,
    Expression
} from '../types/Ast.type';
import { type Value, getValueType } from '../utils';

export class ASTSerializer {
    private environment: Environment;
    constructor(environment: Environment) {
        this.environment = environment;
    }

    /**
     * Find the module name for a given function name
     * Returns the module name if found, null otherwise
     */
    public findModuleName(functionName: string, currentModuleContext?: string | null): string | null {
        // If the function name contains a dot, extract the module name
        if (functionName.includes('.')) {
            const parts = functionName.split('.');
            return parts[0] || null;
        }

        // Use provided context or environment's currentModule
        const moduleContext = currentModuleContext !== undefined ? currentModuleContext : this.environment.currentModule;

        // If there's a module context, check that module first
        if (moduleContext) {
            const fullName = `${moduleContext}.${functionName}`;
            if (this.environment.builtins.has(fullName) || this.environment.metadata.has(fullName)) {
                return moduleContext;
            }
        }

        // Check if it's a global builtin BEFORE searching modules
        // This ensures global functions are preferred over module functions
        if (this.environment.builtins.has(functionName) || this.environment.metadata.has(functionName)) {
            return null; // Global function, no module
        }

        // Search through builtins and metadata to find which module this function belongs to
        for (const [name] of this.environment.builtins.entries()) {
            if (name.includes('.') && name.endsWith(`.${functionName}`)) {
                const parts = name.split('.');
                return parts[0] || null;
            }
        }

        for (const [name] of this.environment.metadata.entries()) {
            if (name.includes('.') && name.endsWith(`.${functionName}`)) {
                const parts = name.split('.');
                return parts[0] || null;
            }
        }

        return null;
    }

    /**
     * Serialize a statement to a JSON-serializable object
     * @param stmt The statement to serialize
     * @param currentModuleContext Optional module context from "use" command
     * @param lastValue Optional last value (execution state) - can be a Value or a state object with lastValue and beforeValue
     */
    public serializeStatement(
        stmt: Statement, 
        currentModuleContext?: string | null,
        lastValue?: Value | { lastValue: Value; beforeValue: Value } | null
    ): any {
        // Handle both direct Value and state object
        const resolvedLastValue = lastValue && typeof lastValue === 'object' && 'lastValue' in lastValue
            ? lastValue.lastValue
            : (lastValue as Value ?? null);
        // For comment nodes, don't include codePos - derive from comments array when needed
        const base: any = {
            type: stmt.type,
            lastValue: resolvedLastValue
        };
        
        // Only add codePos for non-comment nodes
        if (stmt.type !== 'comment') {
            base.codePos = (stmt as any).codePos;
        }

        // Add comments if present
        const comments = (stmt as any).comments;
        if (comments && comments.length > 0) {
            base.comments = comments;
        }

        // Add trailingBlankLines if present
        const trailingBlankLines = (stmt as any).trailingBlankLines;
        if (trailingBlankLines !== undefined && trailingBlankLines !== null) {
            base.trailingBlankLines = trailingBlankLines;
        }

        switch (stmt.type) {
            case 'command':
                const moduleName = this.findModuleName(stmt.name, currentModuleContext);
                const serializedCmd: any = {
                    ...base,
                    name: stmt.name,
                    module: moduleName,
                    args: stmt.args.map(arg => this.serializeArg(arg)),
                    syntaxType: (stmt as any).syntaxType,
                    into: stmt.into
                };
                if (stmt.callback) {
                    serializedCmd.callback = {
                        type: 'do',
                        paramNames: stmt.callback.paramNames,
                        body: stmt.callback.body.map(s => this.serializeStatement(s, currentModuleContext)),
                        into: stmt.callback.into
                    };
                }
                return serializedCmd;
            case 'assignment':
                return {
                    ...base,
                    targetName: stmt.targetName,
                    targetPath: stmt.targetPath,
                    command: stmt.command ? this.serializeStatement(stmt.command, currentModuleContext) : undefined,
                    literalValue: stmt.literalValue,
                    literalValueType: stmt.literalValue !== undefined ? getValueType(stmt.literalValue) : undefined,
                    isLastValue: stmt.isLastValue,
                    isSet: stmt.isSet,
                    hasAs: stmt.hasAs,
                    isImplicit: stmt.isImplicit,
                };
            case 'shorthand':
                return {
                    ...base,
                    targetName: stmt.targetName
                };
            case 'inlineIf':
                return {
                    ...base,
                    conditionExpr: stmt.condition,
                    command: this.serializeStatement(stmt.command, currentModuleContext)
                };
            case 'ifBlock': {
                const ifBlockResult: any = {
                    ...base,
                    condition: stmt.condition,
                    conditionExpr: stmt.condition,
                    thenBranch: stmt.thenBranch.map((s: Statement) => this.serializeStatement(s, currentModuleContext))
                };
                if (stmt.elseifBranches && stmt.elseifBranches.length > 0) {
                    ifBlockResult.elseifBranches = stmt.elseifBranches.map((branch: { condition: Expression; body: Statement[] }) => ({
                        condition: branch.condition,
                        conditionExpr: branch.condition,
                        body: branch.body.map((s: Statement) => this.serializeStatement(s, currentModuleContext))
                    }));
                }
                if (stmt.elseBranch && stmt.elseBranch.length > 0) {
                    ifBlockResult.elseBranch = stmt.elseBranch.map((s: Statement) => this.serializeStatement(s, currentModuleContext));
                }
                if ((stmt as any).hasThen) {
                    ifBlockResult.hasThen = true;
                }
                return ifBlockResult;
            }
            case 'ifTrue':
                return {
                    ...base,
                    command: this.serializeStatement(stmt.command, currentModuleContext)
                };
            case 'ifFalse':
                return {
                    ...base,
                    command: this.serializeStatement(stmt.command, currentModuleContext)
                };
            case 'define':
                return {
                    ...base,
                    name: stmt.name,
                    paramNames: stmt.paramNames,
                    body: stmt.body.map(s => this.serializeStatement(s, currentModuleContext)),
                    decorators: stmt.decorators
                };
            case 'do':
                return {
                    ...base,
                    paramNames: (stmt as any).paramNames,
                    body: stmt.body.map(s => this.serializeStatement(s, currentModuleContext)),
                    into: (stmt as any).into
                };
            case 'forLoop':
                return {
                    ...base,
                    varName: stmt.varName,
                    iterable: stmt.iterable,
                    iterableExpr: stmt.iterable,
                    body: stmt.body.map(s => this.serializeStatement(s, currentModuleContext))
                };
            case 'together': {
                const togetherStmt: TogetherBlock = stmt as TogetherBlock;
                return {
                    ...base,
                    blocks: (togetherStmt.blocks || []).map(block => this.serializeStatement(block, currentModuleContext))
                };
            }
            case 'onBlock':
                const onBlockStmt = stmt as OnBlock;
                return {
                    ...base,
                    eventName: onBlockStmt.eventName,
                    body: onBlockStmt.body.map(s => this.serializeStatement(s, currentModuleContext))
                };
            case 'return':
                return {
                    ...base,
                    value: stmt.value ? this.serializeArg(stmt.value) : undefined
                };
            case 'break':
                return {
                    ...base
                };
            case 'continue':
                return {
                    ...base
                };
            case 'comment':
                return {
                    ...base,
                    comments: stmt.comments || [],
                    lineNumber: stmt.lineNumber
                };
            case 'chunk_marker':
                const chunkMarkerStmt = stmt as any;
                return {
                    ...base,
                    id: chunkMarkerStmt.id,
                    meta: chunkMarkerStmt.meta,
                    raw: chunkMarkerStmt.raw
                };
            case 'cell':
                const cellBlockStmt = stmt as any;
                const serializedCell: any = {
                    ...base,
                    cellType: cellBlockStmt.cellType,
                    meta: cellBlockStmt.meta || {}
                };
                if (cellBlockStmt.rawBody !== undefined && cellBlockStmt.rawBody !== null) {
                    serializedCell.rawBody = cellBlockStmt.rawBody;
                }
                if (cellBlockStmt.body && Array.isArray(cellBlockStmt.body) && cellBlockStmt.body.length > 0) {
                    serializedCell.body = cellBlockStmt.body.map((s: Statement) => this.serializeStatement(s, currentModuleContext));
                }
                return serializedCell;
            case 'prompt_block':
                const promptBlockStmt = stmt as any;
                return {
                    ...base,
                    rawText: promptBlockStmt.rawText || '',
                    fence: promptBlockStmt.fence || '---',
                    bodyPos: promptBlockStmt.bodyPos
                };
            default:
                return base;
        }
    }

    /**
     * Serialize an argument to a JSON-serializable object
     */
    public serializeArg(arg: Arg): any {
        switch (arg.type) {
            case 'subexpr':
                return { type: 'subexpr', code: arg.code };
            case 'subexpression':
                const subexpr = arg as any;
                return {
                    type: 'subexpression',
                    body: subexpr.body ? subexpr.body.map((s: Statement) => this.serializeStatement(s, null)) : [],
                    codePos: subexpr.codePos
                };
            case 'var':
                return { type: 'var', name: arg.name, path: arg.path };
            case 'lastValue':
                return { type: 'lastValue' };
            case 'number':
                return { type: 'number', value: arg.value };
            case 'string':
                return { type: 'string', value: arg.value };
            case 'literal':
                return { type: 'literal', value: arg.value };
            case 'namedArgs':
                const serialized: Record<string, any> = {};
                for (const [key, valueArg] of Object.entries(arg.args)) {
                    serialized[key] = this.serializeArg(valueArg);
                }
                return { type: 'namedArgs', args: serialized };
            case 'objectLiteral':
                return {
                    type: 'objectLiteral',
                    properties: (arg as any).properties.map((p: any) => ({
                        key: typeof p.key === 'string' ? p.key : this.serializeArg(p.key),
                        value: this.serializeArg(p.value)
                    })),
                    codePos: (arg as any).codePos
                };
            case 'arrayLiteral':
                return {
                    type: 'arrayLiteral',
                    elements: (arg as any).elements.map((e: any) => this.serializeArg(e)),
                    codePos: (arg as any).codePos
                };
            case 'object':
                return { type: 'object', code: (arg as any).code };
            case 'array':
                return { type: 'array', code: (arg as any).code };
            default:
                return null;
        }
    }
}
