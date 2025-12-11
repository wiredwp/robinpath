/**
 * Parser for 'with' blocks (callback blocks)
 * Syntax: with [$param1 $param2 ...] [into $var] ... endwith
 * 
 * Supports both:
 * - Line-based parsing (legacy): parseBlock(startLine)
 * - TokenStream-based parsing: parseFromStream(stream, headerToken, context)
 */

import { Lexer, TokenKind } from '../classes/Lexer';
import type { Token } from '../classes/Lexer';
import { TokenStream } from '../classes/TokenStream';
import { LexerUtils } from '../utils';
import { BlockParserBase, type BlockParserContext, type BlockTokenStreamContext } from './BlockParserBase';
import type { CommentWithPosition, AttributePathSegment, ScopeBlock, Statement } from '../index';

export interface WithScopeHeader {
    /**
     * Parameter names (without $)
     */
    paramNames: string[];
    
    /**
     * Into target (if present)
     */
    intoTarget: { targetName: string; targetPath?: AttributePathSegment[] } | null;
    
    /**
     * Comments attached to the with statement
     */
    comments: CommentWithPosition[];
}

export class WithScopeParser extends BlockParserBase {
    /**
     * Whether to ignore "into" on the first line
     * (it might be the command's "into", not the callback's)
     */
    private ignoreIntoOnFirstLine: boolean;
    
    constructor(context: BlockParserContext, ignoreIntoOnFirstLine: boolean = false) {
        super(context);
        this.ignoreIntoOnFirstLine = ignoreIntoOnFirstLine;
    }
    
    /**
     * Parse the 'with' block header
     * Syntax: with [$param1 $param2 ...] [into $var]
     */
    parseHeader(): WithScopeHeader {
        const line = this.context.originalLine.trim();
        const tokens = Lexer.tokenize(line);
        
        // Check for "into $var" after "with" (can be after parameters)
        // But ignore it if ignoreIntoOnFirstLine is true (it's the command's "into", not the callback's)
        const { target: intoTarget, intoIndex } = this.ignoreIntoOnFirstLine 
            ? { target: null, intoIndex: -1 }
            : this.parseIntoTarget(tokens, 1); // Start search from index 1 (after "with")
        const paramEndIndex = intoIndex >= 0 ? intoIndex : tokens.length;
        
        // Parse parameter names (optional): with $a $b or with $a $b into $var
        // Start from token index 1 (after "with"), stop before "into" if present
        const paramNames = this.parseParameterNames(tokens, 1, paramEndIndex);
        
        // Extract inline comment from scope line
        const inlineComment = this.extractInlineComment(this.context.originalLine);
        const comments: CommentWithPosition[] = [];
        if (inlineComment) {
            comments.push(this.createInlineCommentWithPosition(this.context.originalLine, inlineComment));
        }
        
        return { paramNames, intoTarget, comments };
    }
    
    /**
     * Parse the complete 'with' block (header + body)
     * Syntax: with [$param1 $param2 ...] [into $var] ... endwith
     */
    parseBlock(startLine: number): ScopeBlock {
        // Parse header
        const header = this.parseHeader();
        const { paramNames, intoTarget, comments } = header;
        
        this.context.advanceLine();

        const body: ScopeBlock['body'] = [];
        let closed = false;
        let pendingComments: string[] = [];
        const pendingCommentLines: number[] = [];

        while (this.context.getCurrentLine() < this.context.lines.length) {
            const currentLine = this.context.getCurrentLine();
            const originalBodyLine = this.context.lines[currentLine];
            const bodyLine = originalBodyLine.trim();
            
            // Blank line: preserve pending comments (they may be attached to next statement)
            if (!bodyLine) {
                this.context.advanceLine();
                continue;
            }
            
            // Comment line: if we have pending comments, they were separated by blank line, so create comment nodes
            // Then start a new sequence with this comment
            if (bodyLine.startsWith('#')) {
                const commentText = bodyLine.slice(1).trim();
                
                // If we have pending comments, they were separated by blank line from this comment
                // Create comment nodes for them (they won't be attached to a statement)
                // Group consecutive orphaned comments into a single node
                if (pendingComments.length > 0) {
                    body.push(this.context.createGroupedCommentNode(pendingComments, pendingCommentLines));
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                }
                
                // Start new sequence with this comment
                pendingComments.push(commentText);
                pendingCommentLines.push(currentLine);
                this.context.advanceLine();
                continue;
            }

            const bodyTokens = Lexer.tokenize(bodyLine);
            
            if (bodyTokens[0] === 'endwith') {
                this.context.advanceLine();
                closed = true;
                break;
            }

            const stmt = this.context.parseStatement();
            if (stmt) {
                const allComments: string[] = [];
                
                // Consecutive comments above
                if (pendingComments.length > 0) {
                    allComments.push(...pendingComments);
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                }
                
                // Inline comment on same line
                const inlineComment = this.extractInlineCommentAtLine(currentLine);
                if (inlineComment) {
                    allComments.push(inlineComment.text);
                }
                
                if (allComments.length > 0) {
                    (stmt as any).comments = allComments;
                }
                
                body.push(stmt);
            }
        }

        // Handle any remaining pending comments at end of block
        // Group consecutive orphaned comments into a single node
        if (pendingComments.length > 0) {
            body.push(this.context.createGroupedCommentNode(pendingComments, pendingCommentLines));
        }

        if (!closed) {
            throw this.createError('missing endwith');
        }

        // If parameters are declared, include them in the scope block
        // Note: We use type 'do' to maintain AST compatibility
        const endLine = this.context.getCurrentLine() - 1;
        const scopeBlock: ScopeBlock = paramNames.length > 0 
            ? { 
                type: 'do', 
                paramNames, 
                body, 
                into: intoTarget || undefined,
                codePos: this.context.createCodePositionFromLines(startLine, endLine) 
            }
            : { 
                type: 'do', 
                body, 
                into: intoTarget || undefined,
                codePos: this.context.createCodePositionFromLines(startLine, endLine) 
            };
        if (comments.length > 0) {
            scopeBlock.comments = comments;
        }
        
        return scopeBlock;
    }
    
    // ========================================================================
    // TokenStream-based parsing methods
    // ========================================================================
    
    /**
     * Parse 'with' block from TokenStream - TOKEN-BASED VERSION
     * 
     * @param stream - TokenStream positioned at the 'with' keyword
     * @param headerToken - The 'with' keyword token
     * @param context - Context with helper methods
     * @param ignoreIntoOnFirstLine - If true, ignore "into" on the first line (it's the command's "into", not the callback's)
     * @returns Parsed ScopeBlock
     */
    static parseFromStream(
        stream: TokenStream,
        headerToken: Token,
        context: BlockTokenStreamContext,
        ignoreIntoOnFirstLine: boolean = false
    ): ScopeBlock {
        // 1. Validate precondition: stream should be at 'with'
        if (headerToken.text !== 'with') {
            throw new Error(`parseFromStream expected 'with' keyword, got '${headerToken.text}'`);
        }
        
        // Consume 'with' keyword
        stream.next();
        
        // 2. Parse header: parameters and 'into' target
        const paramNames: string[] = [];
        let intoTarget: { targetName: string; targetPath?: AttributePathSegment[] } | null = null;
        const headerComments: CommentWithPosition[] = [];
        
        // Collect tokens until newline
        const headerTokens: Token[] = [];
        while (!stream.isAtEnd()) {
            const t = stream.current();
            if (!t) break;
            if (t.kind === TokenKind.NEWLINE) {
                stream.next(); // consume NEWLINE, move to first body token
                break;
            }
            if (t.kind === TokenKind.COMMENT) {
                // Capture inline comment on header line
                headerComments.push({
                    text: t.value ?? t.text.replace(/^#\s*/, ''),
                    inline: true,
                    codePos: context.createCodePositionFromTokens(t, t)
                });
                stream.next();
                continue;
            }
            headerTokens.push(t);
            stream.next();
        }
        
        // Parse parameters and 'into' from header tokens
        const tokenStrings = headerTokens.map(t => t.text);
        
        // Check for "into $var" after "with" (can be after parameters)
        // But ignore it if ignoreIntoOnFirstLine is true
        const { target: intoTargetResult, intoIndex } = ignoreIntoOnFirstLine
            ? { target: null, intoIndex: -1 }
            : (() => {
                const idx = tokenStrings.indexOf('into');
                if (idx >= 0 && idx < tokenStrings.length - 1) {
                    const varToken = headerTokens[idx + 1];
                    if (varToken && (varToken.kind === TokenKind.VARIABLE || LexerUtils.isVariable(varToken.text))) {
                        const { name, path } = LexerUtils.parseVariablePath(varToken.text);
                        return { target: { targetName: name, targetPath: path }, intoIndex: idx };
                    }
                }
                return { target: null, intoIndex: -1 };
            })();
        intoTarget = intoTargetResult;
        const paramEndIndex = intoIndex >= 0 ? intoIndex : tokenStrings.length;
        
        // Parse parameter names (optional): with $a $b or with $a $b into $var
        for (let i = 0; i < paramEndIndex; i++) {
            const token = headerTokens[i];
            if (!token) continue;
            
            // Parameters should be variables (starting with $)
            if (token.kind === TokenKind.VARIABLE || LexerUtils.isVariable(token.text)) {
                const { name: paramName } = LexerUtils.parseVariablePath(token.text);
                if (paramName && /^[A-Za-z_][A-Za-z0-9_]*$/.test(paramName)) {
                    paramNames.push(paramName);
                }
            }
        }
        
        // 3. Parse body tokens until matching 'endwith'
        const body: Statement[] = [];
        const bodyStartToken = stream.current() ?? headerToken;
        let endToken = bodyStartToken;
        
        while (!stream.isAtEnd()) {
            const t = stream.current();
            if (!t || t.kind === TokenKind.EOF) break;
            
            endToken = t;
            
            // Check for 'endwith' keyword - this closes our block
            if (t.kind === TokenKind.KEYWORD && t.text === 'endwith') {
                // Found closing endwith for our block
                stream.next(); // consume 'endwith'
                
                // Consume everything until end of line after 'endwith'
                while (!stream.isAtEnd() && stream.current()?.kind !== TokenKind.NEWLINE) {
                    stream.next();
                }
                if (stream.current()?.kind === TokenKind.NEWLINE) {
                    stream.next(); // move to next logical statement
                }
                break;
            }
            
            // Skip newlines and comments at the statement boundary
            if (t.kind === TokenKind.NEWLINE) {
                stream.next();
                continue;
            }
            
            if (t.kind === TokenKind.COMMENT) {
                // TODO: Handle standalone comments in body
                // For now, skip them
                stream.next();
                continue;
            }
            
            // Parse statement using context-provided parseStatementFromTokens
            const stmt = context.parseStatementFromTokens?.(stream);
            if (stmt) {
                body.push(stmt);
            } else {
                // If parseStatementFromTokens returns null, ensure progress
                stream.next();
            }
        }
        
        // 4. Build codePos from headerToken to endToken
        const codePos = context.createCodePositionFromTokens(headerToken, endToken);
        
        // 5. Build result (use type 'do' to maintain AST compatibility)
        const scopeBlock: ScopeBlock = paramNames.length > 0 
            ? { 
                type: 'do', 
                paramNames, 
                body, 
                into: intoTarget || undefined,
                codePos
            }
            : { 
                type: 'do', 
                body, 
                into: intoTarget || undefined,
                codePos
            };
        
        if (headerComments.length > 0) {
            scopeBlock.comments = headerComments;
        }
        
        return scopeBlock;
    }
}
