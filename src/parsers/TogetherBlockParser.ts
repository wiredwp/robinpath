/**
 * Parser for 'together' blocks
 * Syntax: together ... endtogether
 */

import { Lexer } from '../classes/Lexer';
import { BlockParserBase, type BlockParserContext } from './BlockParserBase';
import { ScopeParser } from './ScopeParser';
import type { CommentWithPosition, TogetherBlock } from '../index';

export interface TogetherBlockHeader {
    /**
     * Comments attached to the together statement
     */
    comments: CommentWithPosition[];
}

export class TogetherBlockParser extends BlockParserBase {
    constructor(context: BlockParserContext) {
        super(context);
    }
    
    /**
     * Parse the 'together' block header
     * Syntax: together
     */
    parseHeader(): TogetherBlockHeader {
        const line = this.context.originalLine.trim();
        const tokens = Lexer.tokenize(line);
        
        // Must start with "together"
        if (tokens[0] !== 'together') {
            throw this.createError('expected together');
        }
        
        // Extract inline comment from together line
        const inlineComment = this.extractInlineComment(this.context.originalLine);
        const comments: CommentWithPosition[] = [];
        if (inlineComment) {
            comments.push(this.createInlineCommentWithPosition(this.context.originalLine, inlineComment));
        }
        
        return { comments };
    }
    
    /**
     * Parse the complete 'together' block (header + body)
     * Syntax: together ... endtogether
     */
    parseBlock(startLine: number): TogetherBlock {
        // Parse header
        const header = this.parseHeader();
        
        // Collect comments above the together block (not handled by header parser)
        const comments: CommentWithPosition[] = [];
        let commentStartLine = startLine;
        while (commentStartLine > 0) {
            const prevLine = this.context.lines[commentStartLine - 1].trim();
            if (prevLine.startsWith('#')) {
                const lineNum = commentStartLine - 1;
                const line = this.context.lines[lineNum];
                const startCol = line.indexOf('#');
                const endCol = line.length - 1;
                comments.unshift({
                    text: prevLine.slice(1).trim(),
                    codePos: this.createCodePosition(lineNum, startCol >= 0 ? startCol : 0, lineNum, endCol >= 0 ? endCol : 0)
                });
                commentStartLine--;
            } else if (prevLine === '') {
                commentStartLine--;
            } else {
                break;
            }
        }
        
        // Add inline comment from header to comments
        if (header.comments.length > 0) {
            comments.push(...header.comments);
        }

        this.context.advanceLine(); // Move past "together" line

        const blocks: TogetherBlock['blocks'] = [];
        let closed = false;

        // Parse do blocks until we find "endtogether"
        while (this.context.getCurrentLine() < this.context.lines.length) {
            const currentLine = this.context.getCurrentLine();
            const bodyLine = this.context.lines[currentLine];
            const trimmedBodyLine = bodyLine.trim();

            // Skip empty lines
            if (!trimmedBodyLine || trimmedBodyLine.startsWith('#')) {
                this.context.advanceLine();
                continue;
            }

            const bodyTokens = Lexer.tokenize(trimmedBodyLine);

            // Check for endtogether
            if (bodyTokens[0] === 'endtogether') {
                this.context.advanceLine();
                closed = true;
                break;
            }

            // Only allow "do" blocks inside together
            if (bodyTokens[0] !== 'do') {
                throw this.createError('together block can only contain do blocks');
            }

            // Parse the do block (can be regular do or do into $var)
            // Create a fresh context for the do block parser with the current line
            const doBlockContext: import('./BlockParserBase').BlockParserContext = {
                originalLine: this.context.lines[currentLine],
                lineNumber: currentLine,
                lines: this.context.lines,
                getCurrentLine: () => this.context.getCurrentLine(),
                advanceLine: () => this.context.advanceLine(),
                getTrimmedLine: (ln: number) => this.context.getTrimmedLine(ln),
                extractInlineCommentFromLine: (ln: number) => this.context.extractInlineCommentFromLine(ln),
                createCodePositionFromLines: (startRow: number, endRow: number) => this.context.createCodePositionFromLines(startRow, endRow),
                createGroupedCommentNode: (comments: string[], commentLines: number[]) => this.context.createGroupedCommentNode(comments, commentLines),
                parseStatement: () => this.context.parseStatement()
            };
            const scopeParser = new ScopeParser(doBlockContext);
            const doBlock = scopeParser.parseBlock(currentLine);
            
            // parseBlock now returns ScopeBlock with optional into property
            if (doBlock.type === 'do') {
                blocks.push(doBlock);
            } else {
                throw this.createError('together block can only contain do blocks');
            }
        }

        if (!closed) {
            throw this.createError('missing endtogether');
        }

        const endLine = this.context.getCurrentLine() - 1;
        const togetherBlock: TogetherBlock = {
            type: 'together',
            blocks,
            codePos: this.context.createCodePositionFromLines(startLine, endLine)
        };
        if (comments.length > 0) {
            togetherBlock.comments = comments;
        }
        return togetherBlock;
    }
}
