/**
 * Print assignment node
 */

import type { PrintContext } from '../ASTToCodeConverter';
import { Writer, Printer } from '../ASTToCodeConverter';
import { getInlineComment, formatInlineComment } from './printComment';

export function printAssignment(node: any, writer: Writer, ctx: PrintContext): void {
    const target = '$' + node.targetName + (node.targetPath?.map((seg: any) => 
        seg.type === 'property' ? '.' + seg.name : `[${seg.index}]`
    ).join('') || '');
    
    let assignmentLine: string;
    
    // Check isLastValue first (before literalValue) since literalValue can be null
    if (node.isLastValue) {
        assignmentLine = `${target} = $`;
    } else if (node.command) {
        const cmdCode = Printer.printNode(node.command, { ...ctx, indentLevel: 0 });
        assignmentLine = `${target} = ${cmdCode.trim()}`;
    } else if (node.literalValue !== undefined) {
        // Handle type conversion if literalValueType is specified
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
    const inlineComment = getInlineComment(node);
    if (inlineComment) {
        assignmentLine += formatInlineComment(inlineComment);
    }
    
    writer.pushLine(assignmentLine);
}
