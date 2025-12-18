/**
 * Print ifBlock node
 */

import type { PrintContext } from '../ASTToCodeConverter';
import { Writer, Printer } from '../ASTToCodeConverter';
import { printArg } from './printArg';
import {
    emitLeadingComments,
    emitBlankLineAfterComments
} from './printComment';

export function printIfBlock(node: any, writer: Writer, ctx: PrintContext): void {
    // Note: Leading comments attached to the ifBlock are printed by the parent
    // (e.g., printDefine's emitLeadingComments), so we don't print them here.
    // We only print the if statement and its branches.
    
    const condition = node.condition || node.conditionExpr;
    const conditionStr = (typeof condition === 'object' && condition !== null)
        ? (printArg(condition, ctx) ?? String(condition))
        : String(condition);

    // Use 'then' keyword if original code had it
    const thenKeyword = node.hasThen ? ' then' : '';
    writer.pushLine(`if ${conditionStr}${thenKeyword}`);

    // Print then branch with increased indentation
    if (node.thenBranch && Array.isArray(node.thenBranch)) {
        const bodyIndent = ctx.indentLevel + 1;
        
        for (const stmt of node.thenBranch) {
            emitLeadingComments(stmt, writer, ctx, bodyIndent);
            emitBlankLineAfterComments(stmt, writer);

            const stmtCode = Printer.printNode(stmt, { ...ctx, indentLevel: bodyIndent });
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
                ? (printArg(elseifCondition, ctx) ?? String(elseifCondition))
                : String(elseifCondition);
            
            writer.pushLine(`elseif ${elseifConditionStr}`);
            
            if (elseifBranch.body && Array.isArray(elseifBranch.body)) {
                const bodyIndent = ctx.indentLevel + 1;
                
                for (const stmt of elseifBranch.body) {
                    emitLeadingComments(stmt, writer, ctx, bodyIndent);
                    emitBlankLineAfterComments(stmt, writer);

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

    // Print else branch
    if (node.elseBranch && Array.isArray(node.elseBranch) && node.elseBranch.length > 0) {
        writer.pushLine('else');
        
        const bodyIndent = ctx.indentLevel + 1;
        
        for (const stmt of node.elseBranch) {
            emitLeadingComments(stmt, writer, ctx, bodyIndent);
            emitBlankLineAfterComments(stmt, writer);

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
