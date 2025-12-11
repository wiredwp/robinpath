import { Lexer, TokenKind } from './Lexer';
import type { Token } from './Lexer';
import { TokenStream } from './TokenStream';
import { LexerUtils, splitIntoLogicalLines } from '../utils';
import { TogetherBlockParser } from '../parsers/TogetherBlockParser';
import { ForLoopParser } from '../parsers/ForLoopParser';
import { IfBlockParser } from '../parsers/IfBlockParser';
import { DefineParser } from '../parsers/DefineParser';
import { ScopeParser } from '../parsers/ScopeParser';
import { WithScopeParser } from '../parsers/WithScopeParser';
import { OnBlockParser, type OnBlockTokenStreamContext } from '../parsers/OnBlockParser';
import { ReturnParser } from '../parsers/ReturnParser';
import { BreakParser } from '../parsers/BreakParser';
import { InlineIfParser } from '../parsers/InlineIfParser';
import { CommandParser } from '../parsers/CommandParser';
import type {
    Statement,
    Arg,
    CommandCall,
    InlineIf,
    IfBlock,
    DefineFunction,
    ScopeBlock,
    TogetherBlock,
    ForLoop,
    ReturnStatement,
    OnBlock,
    CommentStatement,
    CommentWithPosition,
    CodePosition,
    DecoratorCall,
    AttributePathSegment
} from '../index';

export class Parser {
    // TokenStream infrastructure (for future incremental migration)
    // @ts-expect-error - Reserved for future TokenStream-based parsing migration
    private source: string;  // Original source code - available for future TokenStream-based parsing
    private lines: string[];  // Processed logical lines - currently used by line-based parser
    private tokens: Token[];  // Full token array - available for TokenStream operations
    // @ts-expect-error - Reserved for future TokenStream-based parsing migration
    private stream: TokenStream;  // Token stream - ready for future parser refactoring
    
    // Line-to-token index mapping for hybrid parsing
    // line (0-based) → index of the first token on that line (-1 if no tokens)
    private lineStartTokenIndex: number[] = [];
    
    // Legacy line-based parsing fields (will be gradually replaced by TokenStream)
    private trimmedLinesCache: Map<number, string> = new Map();
    private currentLine: number = 0;  // Current line index in line-based parsing
    private columnPositionsCache: Map<number, { startCol: number; endCol: number }> = new Map();
    private inlineCommentCache: Map<number, { text: string; position: number } | null> = new Map();
    
    // Extracted blocks during parsing
    private extractedFunctions: DefineFunction[] = [];
    private extractedEventHandlers: OnBlock[] = [];

    /**
     * Create a new Parser
     * @param source - Full source code as a single string
     */
    constructor(source: string) {
        this.source = source;
        // Process logical lines (handles backslash continuation, semicolon separator, etc.)
        this.lines = splitIntoLogicalLines(source);
        // Rejoin for tokenization (Lexer handles multi-line strings internally)
        const processedSource = this.lines.join('\n');
        this.tokens = Lexer.tokenizeFull(processedSource);
        this.stream = new TokenStream(this.tokens);
        // Build line-to-token index mapping for hybrid parsing
        this.lineStartTokenIndex = this.buildLineStartTokenIndex();
    }
    
    /**
     * Build mapping from line number (0-based) to the first token index on that line
     * Returns -1 for lines with no tokens (empty lines, comment-only lines handled by Lexer)
     */
    private buildLineStartTokenIndex(): number[] {
        const result = new Array<number>(this.lines.length).fill(-1);
        
        for (let i = 0; i < this.tokens.length; i++) {
            const token = this.tokens[i];
            // Token.line is 1-based, convert to 0-based
            const lineIndex = token.line - 1;
            
            // Skip invalid line indices
            if (lineIndex < 0 || lineIndex >= this.lines.length) continue;
            
            // Only record the first token on each line
            if (result[lineIndex] === -1) {
                result[lineIndex] = i;
            }
        }
        
        return result;
    }
    
    /**
     * Alternative constructor for backward compatibility (used by some internal methods)
     * @deprecated - Use constructor(source: string) instead
     */
    static fromLines(lines: string[]): Parser {
        return new Parser(lines.join('\n'));
    }
    
    // ========================================================================
    // TokenStream Utility Methods (for future migration)
    // ========================================================================
    
    /**
     * Get a fresh TokenStream copy starting from the beginning
     * Useful for sub-parsing operations
     */
    getTokenStream(): TokenStream {
        return new TokenStream([...this.tokens]);
    }
    
    /**
     * Get the current token array
     * Useful for manual token inspection
     */
    getTokens(): Token[] {
        return this.tokens;
    }
    
    /**
     * Quick utility: peek at a token by index
     * @param index - Token index (0-based)
     */
    peekToken(index: number): Token | null {
        return this.tokens[index] || null;
    }
    
    /**
     * Find the next token of a specific kind starting from an index
     * @param kind - TokenKind to search for
     * @param startIndex - Starting index (default 0)
     * @returns Index of found token, or -1 if not found
     */
    findToken(kind: TokenKind, startIndex: number = 0): number {
        for (let i = startIndex; i < this.tokens.length; i++) {
            if (this.tokens[i].kind === kind) {
                return i;
            }
        }
        return -1;
    }
    
    /**
     * Find the next token with specific text starting from an index
     * @param text - Token text to search for
     * @param startIndex - Starting index (default 0)
     * @returns Index of found token, or -1 if not found
     */
    findTokenByText(text: string, startIndex: number = 0): number {
        for (let i = startIndex; i < this.tokens.length; i++) {
            if (this.tokens[i].text === text) {
                return i;
            }
        }
        return -1;
    }
    
    
    // Optimize: Cache trimmed lines to avoid repeated trimming
    private getTrimmedLine(lineNumber: number): string {
        const cached = this.trimmedLinesCache.get(lineNumber);
        if (cached !== undefined) {
            return cached;
        }
        const trimmed = this.lines[lineNumber]?.trim() || '';
        this.trimmedLinesCache.set(lineNumber, trimmed);
        return trimmed;
    }

    /**
     * Create a code position object with row and column information
     */
    private createCodePosition(startRow: number, startCol: number, endRow: number, endCol: number): CodePosition {
        return { startRow, startCol, endRow, endCol };
    }

    /**
     * Helper to get column positions from line content
     * Returns start column (0 or position of first non-whitespace) and end column (excluding inline comments)
     */
    private getColumnPositions(lineNumber: number): { startCol: number; endCol: number } {
        // Check cache first
        const cached = this.columnPositionsCache.get(lineNumber);
        if (cached !== undefined) {
            return cached;
        }
        
        const line = this.lines[lineNumber] || '';
        if (!line) {
            const result = { startCol: 0, endCol: 0 };
            this.columnPositionsCache.set(lineNumber, result);
            return result;
        }
        
        // Find the first non-whitespace character (optimized: use char comparison instead of regex)
        let startCol = 0;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char !== ' ' && char !== '\t' && char !== '\r' && char !== '\n') {
                startCol = i;
                break;
            }
        }
        
        // Find the position of inline comment (#) if it exists (not inside a string)
        // Try to reuse cached comment extraction result first
        let commentPos = -1;
        const cachedComment = this.inlineCommentCache.get(lineNumber);
        if (cachedComment !== undefined) {
            // Use cached result if available
            commentPos = cachedComment ? cachedComment.position : -1;
        } else if (line.indexOf('#') >= 0) {
            // Only scan if # exists - need to verify it's not inside a string
            // We scan the full line because there might be # inside strings before the actual comment
        let inString: false | '"' | "'" | '`' = false;
        let escaped = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            // Handle string boundaries
            if (!escaped && (char === '"' || char === "'" || char === '`')) {
                if (!inString) {
                    inString = char;
                } else if (char === inString) {
                    inString = false;
                }
                escaped = false;
                continue;
            }
            
            if (inString) {
                escaped = char === '\\' && !escaped;
                continue;
            }
            
            // Check for comment character (not inside string)
            if (char === '#') {
                commentPos = i;
                    // Cache the result for future use
                    const commentText = line.slice(i + 1).trim();
                    this.inlineCommentCache.set(lineNumber, commentText ? { text: commentText, position: i } : null);
                    break; // Found first valid comment, stop scanning
            }
            
            escaped = false;
            }
            // Cache null result if no comment found
            if (commentPos === -1) {
                this.inlineCommentCache.set(lineNumber, null);
            }
        } else {
            // No # in line, cache null result
            this.inlineCommentCache.set(lineNumber, null);
        }
        
        // If there's an inline comment, find the last non-whitespace character before it
        let endCol: number;
        if (commentPos >= 0) {
            // Find the last non-whitespace character before the comment (optimized: use char comparison)
            endCol = commentPos - 1;
            for (let i = commentPos - 1; i >= startCol; i--) {
                const char = line[i];
                if (char !== ' ' && char !== '\t' && char !== '\r' && char !== '\n') {
                    endCol = i;
                    break;
                }
            }
            // If no non-whitespace found before comment, use startCol
            if (endCol < startCol) {
                endCol = startCol;
            }
        } else {
            // No inline comment, use the last character index (inclusive)
            endCol = Math.max(0, line.length - 1);
        }
        
        const result = { startCol, endCol };
        this.columnPositionsCache.set(lineNumber, result);
        return result;
    }

    /**
     * Helper to create code position from start/end line numbers
     * Automatically calculates column positions from line content
     */
    private createCodePositionFromLines(startRow: number, endRow: number): CodePosition {
        const startCols = this.getColumnPositions(startRow);
        const endCols = this.getColumnPositions(endRow);
        return this.createCodePosition(startRow, startCols.startCol, endRow, endCols.endCol);
    }
    
    /**
     * Create code position from Token range
     * Converts Token.line (1-based) and Token.column (0-based) to CodePosition
     */
    private createCodePositionFromTokens(startToken: Token, endToken: Token): CodePosition {
        // Token.line is 1-based, convert to 0-based for CodePosition
        const startRow = startToken.line - 1;
        const endRow = endToken.line - 1;
        
        // Token.column is 0-based (same as CodePosition)
        const startCol = startToken.column;
        // For endCol, use the end of the token text
        const endCol = endToken.column + endToken.text.length;
        
        return this.createCodePosition(startRow, startCol, endRow, endCol);
    }

    /**
     * Helper function to create a comment node from orphaned comments
     * For a single comment, uses 'text' property
     * For multiple comments, uses 'comments' array with CommentWithPosition objects
     */
    private createGroupedCommentNode(comments: string[], commentLines: number[]): CommentStatement {
        // Ensure we have comments to group
        if (comments.length === 0) {
            throw new Error('createGroupedCommentNode called with empty comments array');
        }
        const startLine = Math.min(...commentLines);
        const endLine = Math.max(...commentLines);
        
        // Get column positions from the actual lines
        const startLineContent = this.lines[startLine] || '';
        const endLineContent = this.lines[endLine] || '';
        const startCol = startLineContent.indexOf('#');
        const endCol = endLineContent.length - 1; // End of line
        
        // Always use 'comments' array with CommentWithPosition objects (consistent structure)
        // Combine consecutive comments into a single CommentWithPosition object with \n-separated text
        const combinedText = comments.join('\n');
        const commentsWithPos: CommentWithPosition[] = [{
            text: combinedText,
            codePos: this.createCodePosition(startLine, startCol >= 0 ? startCol : 0, endLine, endCol >= 0 ? endCol : 0)
        }];
        
        return {
            type: 'comment',
            comments: commentsWithPos,
            lineNumber: commentLines[0]
            // codePos is not stored - derive from comments[0].codePos when needed
        };
    }

    private getLineContent(lineNumber: number): string {
        if (lineNumber >= 0 && lineNumber < this.lines.length) {
            return this.getTrimmedLine(lineNumber);
        }
        return '';
    }

    private createError(message: string, lineNumber: number): Error {
        const lineContent = this.getLineContent(lineNumber);
        const lineInfo = lineContent ? `\n  Line content: ${lineContent}` : '';
        return new Error(`Line ${lineNumber + 1}: ${message}${lineInfo}`);
    }

    /**
     * Create an error from a token position
     * This will be used extensively once TokenStream integration is complete
     */
    private createErrorFromToken(message: string, token: Token | null): Error {
        if (!token) {
            return new Error(message + ' (at end of input)');
        }
        return new Error(`Line ${token.line}, Column ${token.column}: ${message}\n  Near: '${token.text}'`);
    }
    
    /**
     * Create a BlockParserContext for use by block parsers
     * This provides the necessary methods for parsers to interact with the main parser
     */
    private createBlockParserContext(lineNumber: number): import('../parsers/BlockParserBase').BlockParserContext {
        return {
            originalLine: this.lines[lineNumber],
            lineNumber: lineNumber,
            lines: this.lines,
            getCurrentLine: () => this.currentLine,
            advanceLine: () => { this.currentLine++; },
            getTrimmedLine: (ln: number) => this.getTrimmedLine(ln),
            extractInlineCommentFromLine: (ln: number) => this.extractInlineComment(this.lines[ln], ln),
            createCodePositionFromLines: (startRow: number, endRow: number) => this.createCodePositionFromLines(startRow, endRow),
            createGroupedCommentNode: (comments: string[], commentLines: number[]) => this.createGroupedCommentNode(comments, commentLines),
            parseStatement: () => this.parseStatement()
        };
    }
    
    /**
     * Create a ReturnParserContext for use by ReturnParser
     */
    private createReturnParserContext(): import('../parsers/ReturnParser').ReturnParserContext {
        return {
            originalLine: this.lines[this.currentLine],
            lineNumber: this.currentLine,
            lines: this.lines,
            getColumnPositions: (ln: number) => this.getColumnPositions(ln),
            createCodePosition: (startRow: number, startCol: number, endRow: number, endCol: number) => 
                this.createCodePosition(startRow, startCol, endRow, endCol),
            createErrorFromToken: (message: string, token: Token | null) => this.createErrorFromToken(message, token),
            extractSubexpression: (line: string, startPos: number) => this.extractSubexpression(line, startPos),
            advanceLine: () => { this.currentLine++; }
        };
    }
    
    /**
     * Create a BreakParserContext for use by BreakParser
     */
    private createBreakParserContext(): import('../parsers/BreakParser').BreakParserContext {
        return {
            originalLine: this.lines[this.currentLine],
            lineNumber: this.currentLine,
            lines: this.lines,
            createCodePosition: (startRow: number, startCol: number, endRow: number, endCol: number) => 
                this.createCodePosition(startRow, startCol, endRow, endCol),
            createErrorFromToken: (message: string, token: Token | null) => this.createErrorFromToken(message, token),
            advanceLine: () => { this.currentLine++; }
        };
    }
    
    /**
     * Create an InlineIfParserContext for use by InlineIfParser
     */
    private createInlineIfParserContext(): import('../parsers/InlineIfParser').InlineIfParserContext {
        return {
            currentLine: this.currentLine,
            lines: this.lines,
            advanceLine: () => { this.currentLine++; },
            createError: (message: string, lineNumber: number) => this.createError(message, lineNumber),
            createCodePositionFromLines: (startRow: number, endRow: number) => this.createCodePositionFromLines(startRow, endRow),
            extractInlineComment: (line: string, lineNumber?: number) => this.extractInlineComment(line, lineNumber),
            createInlineCommentWithPosition: (line: string, lineNumber: number, comment: { text: string; position: number }) => 
                this.createInlineCommentWithPosition(line, lineNumber, comment),
            parseCommandFromTokens: (tokens: string[], startLine?: number) => this.parseCommandFromTokens(tokens, startLine),
            extractSubexpression: (line: string, startPos: number) => this.extractSubexpression(line, startPos)
        };
    }
    
    /**
     * Create a CommandParserContext for use by CommandParser
     */
    private createCommandParserContext(): import('../parsers/CommandParser').CommandParserContext {
        return {
            getCurrentLine: () => this.currentLine,
            setCurrentLine: (line: number) => { this.currentLine = line; },
            lines: this.lines,
            createError: (message: string, lineNumber: number) => this.createError(message, lineNumber),
            createCodePositionFromLines: (startRow: number, endRow: number) => this.createCodePositionFromLines(startRow, endRow),
            getTrimmedLine: (lineNumber: number) => this.getTrimmedLine(lineNumber),
            extractSubexpression: (line: string, startPos: number) => this.extractSubexpression(line, startPos),
            extractObjectLiteral: (line: string, startPos: number) => this.extractObjectLiteral(line, startPos),
            extractArrayLiteral: (line: string, startPos: number) => this.extractArrayLiteral(line, startPos),
            extractParenthesizedContent: () => this.extractParenthesizedContent(),
            parseScope: (startLine: number) => this.parseScope(startLine),
            parseWithScope: (startLine: number) => this.parseWithScope(startLine, true)
        };
    }

    /**
     * DEMO: Helper to convert string tokens to TokenStream
     * 
     * This is a bridge function for gradual migration.
     * Once parseCommandFromTokens is refactored to use TokenStream,
     * this won't be needed.
     * 
     * @internal - For future use during gradual migration
     */
    // @ts-expect-error - Unused helper function for future TokenStream migration
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private tokensToStream(tokens: string[], lineNumber: number): TokenStream {
        // Convert string tokens to Token objects
        const tokenObjects: Token[] = tokens.map((text, index) => {
            // Determine token kind based on text
            let kind: TokenKind;
            if (text.startsWith('$')) {
                kind = TokenKind.VARIABLE;
            } else if (text.startsWith('"') || text.startsWith("'") || text.startsWith('`')) {
                kind = TokenKind.STRING;
            } else if (!isNaN(Number(text))) {
                kind = TokenKind.NUMBER;
            } else if (text === 'true' || text === 'false') {
                kind = TokenKind.BOOLEAN;
            } else if (text === 'null') {
                kind = TokenKind.NULL;
            } else {
                // Check if it's a keyword (simplified - just check common ones)
                const keywords = ['if', 'else', 'endif', 'do', 'enddo', 'def', 'enddef', 'for', 'endfor', 'on', 'endon', 'return', 'break'];
                kind = keywords.includes(text) ? TokenKind.KEYWORD : TokenKind.IDENTIFIER;
            }
            
            return {
                kind,
                text,
                line: lineNumber + 1, // Convert to 1-based
                column: index * 2, // Approximate column (not accurate, but okay for demo)
                value: kind === TokenKind.NUMBER ? parseFloat(text) : 
                       kind === TokenKind.BOOLEAN ? (text === 'true') :
                       kind === TokenKind.NULL ? null : undefined
            };
        });
        
        return new TokenStream(tokenObjects);
    }

    // ========================================================================
    // Top-level parsing logic (Current line-based implementation)
    // ========================================================================

    parse(): Statement[] {
        // First pass: extract all def/enddef blocks and on/endon blocks, and mark their line numbers
        const defBlockLines = new Set<number>();
        const onBlockLines = new Set<number>();
        const extractedFunctions: DefineFunction[] = [];
        const extractedEventHandlers: OnBlock[] = [];
        let scanLine = 0;
        
        while (scanLine < this.lines.length) {
            const line = this.getTrimmedLine(scanLine);
            
            // Skip empty lines and comments when scanning for def blocks
            if (!line || line.startsWith('#')) {
                scanLine++;
                continue;
            }
            
            const tokens = Lexer.tokenize(line);
            
            // Check if this line starts with a decorator or def
            // Only start decorator collection if we see a decorator or def
            if (tokens.length > 0 && (tokens[0].startsWith('@') || tokens[0] === 'def')) {
                // Collect decorators before def blocks
                const decorators: DecoratorCall[] = [];
                let decoratorScanLine = scanLine;
                let foundDef = false;
                let foundVarOrConst = false;
                while (decoratorScanLine < this.lines.length) {
                    const decoratorLine = this.getTrimmedLine(decoratorScanLine);
                    if (!decoratorLine || decoratorLine.startsWith('#')) {
                        // Blank line or comment - allowed between decorators and def/var/const
                        decoratorScanLine++;
                        continue;
                    }
                    const decoratorTokens = Lexer.tokenize(decoratorLine);
                    if (decoratorTokens.length > 0 && decoratorTokens[0].startsWith('@')) {
                        // Parse decorator
                        const decoratorName = decoratorTokens[0].substring(1);
                        if (!decoratorName || !/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(decoratorName)) {
                            break; // Invalid decorator name - stop collecting
                        }
                        const decoratorArgs: Arg[] = [];
                        for (let i = 1; i < decoratorTokens.length; i++) {
                            const token = decoratorTokens[i];
                            let arg: Arg;
                            if (token === '$') {
                                arg = { type: 'lastValue' };
                            } else if (LexerUtils.isVariable(token)) {
                                const { name: varName, path } = LexerUtils.parseVariablePath(token);
                                arg = { type: 'var', name: varName, path };
                            } else if (token === 'true') {
                                arg = { type: 'literal', value: true };
                            } else if (token === 'false') {
                                arg = { type: 'literal', value: false };
                            } else if (token === 'null') {
                                arg = { type: 'literal', value: null };
                            } else if (LexerUtils.isString(token)) {
                                arg = { type: 'string', value: LexerUtils.parseString(token) };
                            } else if (LexerUtils.isNumber(token)) {
                                arg = { type: 'number', value: parseFloat(token) };
                            } else {
                                arg = { type: 'literal', value: token };
                            }
                            decoratorArgs.push(arg);
                        }
                        const originalDecoratorLine = this.lines[decoratorScanLine];
                        const decoratorStartCol = originalDecoratorLine.indexOf('@');
                        const decoratorEndCol = originalDecoratorLine.length - 1;
                        decorators.push({
                            name: decoratorName,
                            args: decoratorArgs,
                            codePos: this.createCodePosition(
                                decoratorScanLine,
                                decoratorStartCol >= 0 ? decoratorStartCol : 0,
                                decoratorScanLine,
                                decoratorEndCol >= 0 ? decoratorEndCol : 0
                            )
                        });
                        decoratorScanLine++;
                        continue;
                    }
                    // Not a decorator - check if it's a def, var, const, if, do, for, or on statement
                    if (decoratorTokens.length > 0 && decoratorTokens[0] === 'def') {
                        scanLine = decoratorScanLine; // Update scanLine to the def line
                        foundDef = true;
                        break;
                    } else if (decoratorTokens.length > 0 && (decoratorTokens[0] === 'var' || decoratorTokens[0] === 'const')) {
                        // Found var or const - skip it (decorators will be handled in main parse)
                        scanLine = decoratorScanLine + 1; // Skip the var/const line
                        foundVarOrConst = true;
                        break;
                    } else if (decoratorTokens.length > 0 && (decoratorTokens[0] === 'if' || decoratorTokens[0] === 'do' || decoratorTokens[0] === 'for' || decoratorTokens[0] === 'on')) {
                        // Found if, do, for, or on - skip it (decorators will be handled in main parse)
                        scanLine = decoratorScanLine + 1; // Skip the statement line
                        foundVarOrConst = true; // Reuse this flag to indicate we found a statement that needs decorator handling in main parse
                        break;
                    } else {
                        // Not a decorator and not a supported statement - orphaned decorator
                        if (decorators.length > 0) {
                            throw this.createError('orphaned decorator: decorator must be immediately before function definition, var, const, if, do, for, or on statement', decorators[0].codePos.startRow);
                        }
                        break;
                    }
                }
            
            // Check if we found a def (either directly or after decorators)
            const defLine = this.getTrimmedLine(scanLine);
            const defTokens = Lexer.tokenize(defLine);
            if (foundDef || (defTokens.length > 0 && defTokens[0] === 'def')) {
                // Found a def block - extract it
                const savedCurrentLine = this.currentLine;
                this.currentLine = scanLine;
                const func = this.parseDefine(scanLine);
                // Attach decorators if any
                if (decorators.length > 0) {
                    (func as any).decorators = decorators;
                }
                extractedFunctions.push(func);
                
                // Mark all lines in this def block (from def to enddef)
                const startLine = scanLine;
                const endLine = this.currentLine - 1; // parseDefine advances past enddef
                for (let i = startLine; i <= endLine; i++) {
                    defBlockLines.add(i);
                }
                
                scanLine = this.currentLine;
                this.currentLine = savedCurrentLine;
            } else if (foundVarOrConst) {
                // Found var or const - already advanced scanLine, just continue
                // Decorators will be handled in the main parse() method
                continue;
            } else {
                scanLine++;
            }
        } else if (tokens.length > 0 && tokens[0] === 'on') {
            // Found an on block - extract it
            const savedCurrentLine = this.currentLine;
            this.currentLine = scanLine;
            const onBlock = this.parseOnBlock(scanLine);
            extractedEventHandlers.push(onBlock);
            
            // Mark all lines in this on block (from on to endon, or to end of script if auto-closed)
            const startLine = scanLine;
            // parseOnBlock advances past endon if found, or stays at end of script if auto-closed
            const endLine = this.currentLine <= this.lines.length ? (this.currentLine - 1) : (this.lines.length - 1);
            for (let i = startLine; i <= endLine; i++) {
                onBlockLines.add(i);
            }
            
            // If we've reached the end of the script, stop scanning
            if (this.currentLine >= this.lines.length) {
                break;
            }
            
            scanLine = this.currentLine;
            this.currentLine = savedCurrentLine;
        } else if (tokens.length > 0 && (tokens[0] === 'var' || tokens[0] === 'const')) {
            // Line starts directly with var or const (no decorators) - skip it
            // These will be handled in the main parse() method
            scanLine++;
        } else {
            // Not a decorator, def, var, const, or on - skip this line and continue scanning
            scanLine++;
        }
        }
        
        // Extract nested def blocks from function bodies
        const allExtractedFunctions = [...extractedFunctions];
        const extractNestedDefs = (statements: Statement[]): void => {
            for (const stmt of statements) {
                if (stmt.type === 'define') {
                    // Found a nested def - extract it and remove from parent body
                    allExtractedFunctions.push(stmt);
                    // Note: We'll remove it from the parent body later
                } else if (stmt.type === 'ifBlock') {
                    // Check branches for nested defs
                    if (stmt.thenBranch) extractNestedDefs(stmt.thenBranch);
                    if (stmt.elseifBranches) {
                        for (const branch of stmt.elseifBranches) {
                            extractNestedDefs(branch.body);
                        }
                    }
                    if (stmt.elseBranch) extractNestedDefs(stmt.elseBranch);
                } else if (stmt.type === 'forLoop') {
                    if (stmt.body) extractNestedDefs(stmt.body);
                } else if (stmt.type === 'do') {
                    if (stmt.body) extractNestedDefs(stmt.body);
                }
            }
        };
        
        // Extract nested defs from already-extracted functions
        for (const func of extractedFunctions) {
            extractNestedDefs(func.body);
        }
        
        // Remove nested def statements from function bodies
        const removeNestedDefs = (statements: Statement[]): Statement[] => {
            return statements.filter(stmt => stmt.type !== 'define');
        };
        
        for (const func of extractedFunctions) {
            func.body = removeNestedDefs(func.body);
            // Also remove nested defs from nested blocks
            func.body = func.body.map(stmt => {
                if (stmt.type === 'ifBlock') {
                    return {
                        ...stmt,
                        thenBranch: stmt.thenBranch ? removeNestedDefs(stmt.thenBranch) : undefined,
                        elseifBranches: stmt.elseifBranches?.map(branch => ({
                            ...branch,
                            body: removeNestedDefs(branch.body)
                        })),
                        elseBranch: stmt.elseBranch ? removeNestedDefs(stmt.elseBranch) : undefined
                    };
                } else if (stmt.type === 'forLoop') {
                    return {
                        ...stmt,
                        body: removeNestedDefs(stmt.body)
                    };
                } else if (stmt.type === 'do') {
                    return {
                        ...stmt,
                        body: removeNestedDefs(stmt.body)
                    };
                }
                return stmt;
            }) as Statement[];
        }
        
        // Store all extracted functions (including nested ones) for later registration
        this.extractedFunctions = allExtractedFunctions;
        
        // Store all extracted event handlers for later registration
        this.extractedEventHandlers = extractedEventHandlers;
        
        // Second pass: parse remaining statements (excluding def blocks and on blocks)
        // Collect comments and attach them to the following statement
        this.currentLine = 0;
        const pendingComments: string[] = [];
        const statements = this.parseStatementsWithComments(
            pendingComments,
            (lineNumber) => defBlockLines.has(lineNumber) || onBlockLines.has(lineNumber)
        );

        return statements;
    }
    
    /**
     * Get extracted function definitions (def/enddef blocks) that were parsed separately
     */
    getExtractedFunctions(): DefineFunction[] {
        return this.extractedFunctions;
    }
    
    /**
     * Get extracted event handlers (on/endon blocks) that were parsed separately
     */
    getExtractedEventHandlers(): OnBlock[] {
        return this.extractedEventHandlers;
    }

    /**
     * Create a CommentWithPosition from an inline comment
     */
    private createInlineCommentWithPosition(line: string, lineNumber: number, commentData: { text: string; position: number }): CommentWithPosition {
        const commentCol = commentData.position;
        const endCol = line.length - 1;
        return {
            text: commentData.text,
            codePos: this.createCodePosition(lineNumber, commentCol, lineNumber, endCol >= 0 ? endCol : 0),
            inline: true // Mark as inline comment
        };
    }

    /**
     * Extract inline comment from a line (comment after code on the same line)
     * Returns an object with comment text and position, or null if no inline comment found
     * Results are cached per line number to avoid redundant scanning
     */
    private extractInlineComment(line: string, lineNumber?: number): { text: string; position: number } | null {
        // Use cache if lineNumber is provided
        if (lineNumber !== undefined) {
            const cached = this.inlineCommentCache.get(lineNumber);
            if (cached !== undefined) {
                return cached;
            }
        }
        
        // Early exit optimization: if there's no # in the line at all, return null
        // This avoids the character-by-character scan for lines without comments
        if (line.indexOf('#') === -1) {
            if (lineNumber !== undefined) {
                this.inlineCommentCache.set(lineNumber, null);
            }
            return null;
        }
        
        let inString: false | '"' | "'" | '`' = false;
        let escaped = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            // Handle string boundaries
            if (!escaped && (char === '"' || char === "'" || char === '`')) {
                if (!inString) {
                    inString = char;
                } else if (char === inString) {
                    inString = false;
                }
                escaped = false;
                continue;
            }
            
            if (inString) {
                escaped = char === '\\' && !escaped;
                continue;
            }
            
            // Check for comment character (not inside string)
            if (char === '#') {
                const commentText = line.slice(i + 1).trim();
                const result = commentText ? { text: commentText, position: i } : null;
                if (lineNumber !== undefined) {
                    this.inlineCommentCache.set(lineNumber, result);
                }
                return result;
            }
            
            escaped = false;
        }
        
        if (lineNumber !== undefined) {
            this.inlineCommentCache.set(lineNumber, null);
        }
        return null;
    }

    /**
     * Parse statements with comment collection
     * Rules:
     * 1. Collect consecutive comments directly above a statement (no blank lines between)
     * 2. Collect inline comments on the same line as the statement
     * Blank lines break the comment sequence - unattached comments become CommentStatement nodes
     */
    private parseStatementsWithComments(
        pendingComments: string[],
        shouldSkipLine?: (lineNumber: number) => boolean
    ): Statement[] {
        const statements: Statement[] = [];
        const pendingCommentLines: number[] = []; // Track line numbers for pending comments
        let hasBlankLineAfterLastComment = false; // Track if blank line appeared after last comment
        const pendingDecorators: DecoratorCall[] = []; // Track decorators before def
        const pendingDecoratorLines: number[] = []; // Track line numbers for decorators
        
        while (this.currentLine < this.lines.length) {
            if (shouldSkipLine && shouldSkipLine(this.currentLine)) {
                // If we're skipping a def block line and have pending decorators,
                // clear them because they were already handled during def extraction
                if (pendingDecorators.length > 0) {
                    pendingDecorators.length = 0;
                    pendingDecoratorLines.length = 0;
                }
                this.currentLine++;
                continue;
            }
            
            const originalLine = this.lines[this.currentLine];
            const line = this.getTrimmedLine(this.currentLine);
            
            // Blank line: mark that blank line appeared after last comment
            // Blank lines between decorators and def are allowed (like comments)
            if (!line) {
                hasBlankLineAfterLastComment = true;
                this.currentLine++;
                continue;
            }
            
            // Decorator line: @decoratorName args...
            if (line.startsWith('@')) {
                // Check if there are pending decorators with blank line after (orphaned)
                if (pendingDecorators.length > 0 && hasBlankLineAfterLastComment) {
                    throw this.createError('orphaned decorator: decorator must be immediately before function definition, var, const, if, do, for, or on statement', pendingDecoratorLines[0]);
                }
                
                // Parse decorator: @decoratorName arg1 arg2 ...
                const decoratorTokens = Lexer.tokenize(line);
                if (decoratorTokens.length < 1) {
                    throw this.createError('invalid decorator syntax', this.currentLine);
                }
                
                const decoratorName = decoratorTokens[0].substring(1); // Remove @
                if (!decoratorName || !/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(decoratorName)) {
                    throw this.createError(`invalid decorator name: ${decoratorTokens[0]}`, this.currentLine);
                }
                
                // Parse decorator arguments (similar to command parsing)
                const decoratorArgs: Arg[] = [];
                for (let i = 1; i < decoratorTokens.length; i++) {
                    const token = decoratorTokens[i];
                    let arg: Arg;
                    
                    if (token === '$') {
                        arg = { type: 'lastValue' };
                    } else if (LexerUtils.isVariable(token)) {
                        const { name: varName, path } = LexerUtils.parseVariablePath(token);
                        arg = { type: 'var', name: varName, path };
                    } else if (token === 'true') {
                        arg = { type: 'literal', value: true };
                    } else if (token === 'false') {
                        arg = { type: 'literal', value: false };
                    } else if (token === 'null') {
                        arg = { type: 'literal', value: null };
                    } else if (LexerUtils.isString(token)) {
                        arg = { type: 'string', value: LexerUtils.parseString(token) };
                    } else if (LexerUtils.isNumber(token)) {
                        arg = { type: 'number', value: parseFloat(token) };
                    } else {
                        // Treat as literal string
                        arg = { type: 'literal', value: token };
                    }
                    
                    decoratorArgs.push(arg);
                }
                
                // Create codePos for decorator
                const decoratorStartCol = originalLine.indexOf('@');
                const decoratorEndCol = originalLine.length - 1;
                const decoratorCodePos = this.createCodePosition(
                    this.currentLine,
                    decoratorStartCol >= 0 ? decoratorStartCol : 0,
                    this.currentLine,
                    decoratorEndCol >= 0 ? decoratorEndCol : 0
                );
                
                pendingDecorators.push({
                    name: decoratorName,
                    args: decoratorArgs,
                    codePos: decoratorCodePos
                });
                pendingDecoratorLines.push(this.currentLine);
                hasBlankLineAfterLastComment = false; // Reset flag
                this.currentLine++;
                continue;
            }
            
            // Comment line: if we have pending comments with blank line after, create comment nodes
            // Then start a new sequence with this comment
            if (line.startsWith('#')) {
                const commentText = line.slice(1).trim();
                
                // If we have pending decorators, comments between decorator and def/var/const are allowed
                // Don't treat comments as breaking the decorator-def/var/const connection
                if (pendingDecorators.length > 0) {
                    // Comments between decorators and def/var/const are allowed - just add to pending comments
                    pendingComments.push(commentText);
                    pendingCommentLines.push(this.currentLine);
                    hasBlankLineAfterLastComment = false; // Reset flag
                    this.currentLine++;
                    continue;
                }
                
                // If we have pending comments and there was a blank line after them, create comment nodes
                // This happens when: comment -> blank line -> comment (first comment becomes node)
                if (pendingComments.length > 0 && hasBlankLineAfterLastComment) {
                    // Group consecutive orphaned comments into a single node
                    // Make a copy of the arrays before clearing them
                    const commentsToGroup = [...pendingComments];
                    const linesToGroup = [...pendingCommentLines];
                    statements.push(this.createGroupedCommentNode(commentsToGroup, linesToGroup));
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                }
                
                // Start new sequence with this comment
                pendingComments.push(commentText);
                pendingCommentLines.push(this.currentLine);
                hasBlankLineAfterLastComment = false; // Reset flag
                this.currentLine++;
                continue;
            }

            // Statement: attach pending comments + inline comment
            // If we've created comment nodes before (comment->blank->comment pattern), 
            // remaining comments should also be nodes
            
            // First, handle pending comments BEFORE parsing the statement
            // This ensures we don't lose pending comments if parseStatement() consumes lines
            if (pendingComments.length > 0 && hasBlankLineAfterLastComment) {
                // Blank line after comments - create comment nodes (not attached to statement)
                // Group consecutive orphaned comments into a single node
                // Make a copy of the arrays before clearing them
                const commentsToGroup = [...pendingComments];
                const linesToGroup = [...pendingCommentLines];
                statements.push(this.createGroupedCommentNode(commentsToGroup, linesToGroup));
                pendingComments.length = 0;
                pendingCommentLines.length = 0;
            }
            
            const statementLineNumber = this.currentLine; // Save line number before parsing
            const stmt = this.parseStatement();
            if (stmt) {
                // If we have pending decorators, check if this statement supports decorators
                if (pendingDecorators.length > 0) {
                    // Decorators are allowed before: def, var, const, if, do, for, on statements
                    if (stmt.type === 'define') {
                        // Attach decorators to def statements (handled below)
                    } else if (stmt.type === 'command' && (stmt.name === 'var' || stmt.name === 'const')) {
                        // Attach decorators to var/const commands
                        stmt.decorators = [...pendingDecorators];
                        pendingDecorators.length = 0;
                        pendingDecoratorLines.length = 0;
                    } else if (stmt.type === 'ifBlock' || stmt.type === 'do' || stmt.type === 'forLoop' || stmt.type === 'onBlock') {
                        // Attach decorators to if, do, for, and on statements
                        (stmt as any).decorators = [...pendingDecorators];
                        pendingDecorators.length = 0;
                        pendingDecoratorLines.length = 0;
                    } else {
                        // Orphaned decorator - not before def, var, const, if, do, for, or on
                        throw this.createError('orphaned decorator: decorator must be immediately before function definition, var, const, if, do, for, or on statement', pendingDecoratorLines[0]);
                    }
                }
                const allComments: CommentWithPosition[] = [];
                
                // If there are still pending comments (no blank line), attach them
                if (pendingComments.length > 0) {
                    // No blank line after comments - attach them (consecutive comments)
                    // Combine consecutive comments into a single CommentWithPosition object
                    const firstCommentLine = pendingCommentLines[0];
                    const lastCommentLine = pendingCommentLines[pendingCommentLines.length - 1];
                    const firstLineContent = this.lines[firstCommentLine] || '';
                    const lastLineContent = this.lines[lastCommentLine] || '';
                    const startCol = firstLineContent.indexOf('#');
                    const endCol = lastLineContent.length - 1;
                    
                    // Combine all comment texts with \n
                    const combinedText = pendingComments.join('\n');
                    
                    allComments.push({
                        text: combinedText,
                        codePos: this.createCodePosition(
                            firstCommentLine,
                            startCol >= 0 ? startCol : 0,
                            lastCommentLine,
                            endCol >= 0 ? endCol : 0
                        ),
                        inline: false // Comments above are not inline
                    });
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                }
                
                // Add inline comment from same line
                const inlineComment = this.extractInlineComment(originalLine, statementLineNumber);
                if (inlineComment) {
                    allComments.push(this.createInlineCommentWithPosition(originalLine, statementLineNumber, inlineComment));
                }
                
                // Attach to statement
                if (allComments.length > 0) {
                    (stmt as any).comments = allComments;
                }
                
                // Attach decorators to def statements
                if (stmt.type === 'define' && pendingDecorators.length > 0) {
                    (stmt as any).decorators = [...pendingDecorators];
                    pendingDecorators.length = 0;
                    pendingDecoratorLines.length = 0;
                }
                
                statements.push(stmt);
                hasBlankLineAfterLastComment = false; // Reset flag
            } else {
                // parseStatement() returned null (blank line or comment)
                // If we have pending decorators and we're not on a blank/comment line, it's an error
                // But blank lines and comments between decorators and def are allowed
                // So we only check when we encounter an actual statement that's not def
                // (This check happens above when stmt is not null and not a define)
                hasBlankLineAfterLastComment = false;
            }
        }

        // Handle any remaining pending comments at end of file
        // Group consecutive orphaned comments into a single node
        if (pendingComments.length > 0) {
            // Make a copy of the arrays before clearing them
            const commentsToGroup = [...pendingComments];
            const linesToGroup = [...pendingCommentLines];
            statements.push(this.createGroupedCommentNode(commentsToGroup, linesToGroup));
        }
        
        // Handle any remaining pending decorators at end of file (orphaned decorators)
        if (pendingDecorators.length > 0) {
            throw this.createError('orphaned decorator: decorator must be immediately before function definition, var, const, if, do, for, or on statement', pendingDecoratorLines[0]);
        }

        return statements;
    }

    private parseStatement(): Statement | null {
        if (this.currentLine >= this.lines.length) return null;

        const startLine = this.currentLine; // Track start line
        const line = this.lines[this.currentLine].trim();
        if (!line || line.startsWith('#')) {
            this.currentLine++;
            return null;
        }

        const tokens = Lexer.tokenize(line);

        if (tokens.length === 0) {
            this.currentLine++;
            return null;
        }

        // Keyword dispatch (using TokenStream-compatible logic for future migration)
        const firstToken = tokens[0];
        
        // Check for define block
        if (firstToken === 'def') {
            return this.parseDefine(startLine);
        }

        // Check for together block
        if (firstToken === 'together') {
            return this.parseTogether(startLine);
        }

        // Check for do block
        if (firstToken === 'do') {
            return this.parseScope(startLine);
        }

        // Check for for loop
        if (firstToken === 'for') {
            return this.parseForLoop(startLine);
        }

        // Check for return statement
        if (firstToken === 'return') {
            return this.parseReturn(startLine);
        }

        // Check for break statement
        if (firstToken === 'break') {
            return this.parseBreak(startLine);
        }

        // Check for on block
        if (firstToken === 'on') {
            return this.parseOnBlock(startLine);
        }

        // Check for block if
        if (firstToken === 'if' && !tokens.includes('then')) {
            return this.parseIfBlock(startLine);
        }

        // Check for inline if
        if (firstToken === 'if' && tokens.includes('then')) {
            return this.parseInlineIf(startLine);
        }

        // Check for iftrue/iffalse
        if (tokens[0] === 'iftrue') {
            const restTokens = tokens.slice(1);
            const command = this.parseCommandFromTokens(restTokens, startLine);
            const endLine = this.currentLine;
            this.currentLine++;
            return { type: 'ifTrue', command, codePos: this.createCodePositionFromLines(startLine, endLine) };
        }

        if (tokens[0] === 'iffalse') {
            const restTokens = tokens.slice(1);
            const command = this.parseCommandFromTokens(restTokens, startLine);
            const endLine = this.currentLine;
            this.currentLine++;
            return { type: 'ifFalse', command, codePos: this.createCodePositionFromLines(startLine, endLine) };
        }

        // Check for assignment
        if (tokens.length >= 3 && LexerUtils.isVariable(tokens[0]) && tokens[1] === '=') {
            // Parse the target variable name (can include attribute paths like $animal.cat)
            const targetVar = tokens[0];
            const { name: targetName, path: targetPath } = LexerUtils.parseVariablePath(targetVar);
            const restTokens = tokens.slice(2);
            
            // Check if it's a literal value (number, string, boolean, null, or $)
            if (restTokens.length === 1) {
                const token = restTokens[0].trim(); // Ensure token is trimmed
                if (LexerUtils.isLastValue(token)) {
                    // Special case: $var = $ means assign last value
                    // This is handled by executeAssignment which will use frame.lastValue
                    const endLine = this.currentLine;
                    this.currentLine++;
                    return { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: null, // Will be resolved at execution time from frame.lastValue
                        isLastValue: true,
                        codePos: this.createCodePositionFromLines(startLine, endLine)
                    };
                } else if (token === 'true') {
                    // Check for boolean true BEFORE checking for variables
                    const endLine = this.currentLine;
                    this.currentLine++;
                    return { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: true,
                        literalValueType: 'boolean',
                        codePos: this.createCodePositionFromLines(startLine, endLine)
                    };
                } else if (token === 'false') {
                    // Check for boolean false BEFORE checking for variables
                    const endLine = this.currentLine;
                    this.currentLine++;
                    return { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: false,
                        literalValueType: 'boolean',
                        codePos: this.createCodePositionFromLines(startLine, endLine)
                    };
                } else if (token === 'null') {
                    // Check for null BEFORE checking for variables
                    const endLine = this.currentLine;
                    this.currentLine++;
                    return { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: null,
                        literalValueType: 'null',
                        codePos: this.createCodePositionFromLines(startLine, endLine)
                    };
                } else if (LexerUtils.isPositionalParam(token)) {
                    // Special case: $var1 = $1 means assign positional param value
                    const varName = token.slice(1);
                    const endLine = this.currentLine;
                    this.currentLine++;
                    return {
                        type: 'assignment',
                        targetName,
                        targetPath,
                        command: {
                            type: 'command',
                            name: '_var', // Special internal command name
                            args: [{ type: 'var', name: varName }],
                            codePos: this.createCodePositionFromLines(startLine, endLine)
                        },
                        codePos: this.createCodePositionFromLines(startLine, endLine)
                    };
                } else if (LexerUtils.isVariable(token)) {
                    // Special case: $var1 = $var2 means assign variable value
                    // Create a command that just references the variable
                    const { name: varName, path } = LexerUtils.parseVariablePath(token);
                    const endLine = this.currentLine;
                    this.currentLine++;
                    return {
                        type: 'assignment',
                        targetName,
                        targetPath,
                        command: {
                            type: 'command',
                            name: '_var', // Special internal command name
                            args: [{ type: 'var', name: varName, path }],
                            codePos: this.createCodePositionFromLines(startLine, endLine)
                        },
                        codePos: this.createCodePositionFromLines(startLine, endLine)
                    };
                } else if (LexerUtils.isNumber(token)) {
                    const endLine = this.currentLine;
                    this.currentLine++;
                    const numValue = parseFloat(token);
                    return { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: numValue,
                        literalValueType: 'number',
                        codePos: this.createCodePositionFromLines(startLine, endLine)
                    };
                } else if (LexerUtils.isString(token)) {
                    const endLine = this.currentLine;
                    this.currentLine++;
                    const strValue = LexerUtils.parseString(token);
                    return { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: strValue,
                        literalValueType: 'string',
                        codePos: this.createCodePositionFromLines(startLine, endLine)
                    };
                }
            }
            
            // Check if all remaining tokens are string literals (automatic concatenation)
            // This handles cases like: $var = "hello " "world " "from RobinPath"
            if (restTokens.length > 1 && restTokens.every(token => LexerUtils.isString(token))) {
                // Concatenate all string literals
                const concatenated = restTokens.map(token => LexerUtils.parseString(token)).join('');
                const endLine = this.currentLine;
                this.currentLine++;
                return {
                    type: 'assignment',
                    targetName,
                    targetPath,
                    literalValue: concatenated,
                    literalValueType: 'string',
                    codePos: this.createCodePositionFromLines(startLine, endLine)
                };
            }
            
            // Check if the assignment value is a subexpression $(...), object {...}, or array [...]
            // We need to check the original line because tokenization may have split these incorrectly
            const line = this.lines[this.currentLine];
            const equalsIndex = line.indexOf('=');
            if (equalsIndex !== -1) {
                let pos = equalsIndex + 1;
                // Skip whitespace after "="
                while (pos < line.length && /\s/.test(line[pos])) {
                    pos++;
                }
                // Check if we're at a $( subexpression
                if (pos < line.length - 1 && line[pos] === '$' && line[pos + 1] === '(') {
                    // Extract the subexpression code
                    const subexprCode = this.extractSubexpression(line, pos);
                    const endLine = this.currentLine;
                    this.currentLine++;
                    return {
                        type: 'assignment',
                        targetName,
                        targetPath,
                        command: {
                            type: 'command',
                            name: '_subexpr', // Special internal command name for subexpressions
                            args: [{ type: 'subexpr', code: subexprCode.code }],
                            codePos: this.createCodePositionFromLines(startLine, endLine)
                        },
                        codePos: this.createCodePositionFromLines(startLine, endLine)
                    };
                }
                // Check if we're at an object literal {
                if (pos < line.length && line[pos] === '{') {
                    const objCode = this.extractObjectLiteral(line, pos);
                    const endLine = this.currentLine;
                    this.currentLine++;
                    return {
                        type: 'assignment',
                        targetName,
                        targetPath,
                        command: {
                            type: 'command',
                            name: '_object',
                            args: [{ type: 'object', code: objCode.code }],
                            codePos: this.createCodePositionFromLines(startLine, endLine)
                        },
                        codePos: this.createCodePositionFromLines(startLine, endLine)
                    };
                }
                // Check if we're at an array literal [
                if (pos < line.length && line[pos] === '[') {
                    const arrCode = this.extractArrayLiteral(line, pos);
                    const endLine = this.currentLine;
                    this.currentLine++;
                    return {
                        type: 'assignment',
                        targetName,
                        targetPath,
                        command: {
                            type: 'command',
                            name: '_array',
                            args: [{ type: 'array', code: arrCode.code }],
                            codePos: this.createCodePositionFromLines(startLine, endLine)
                        },
                        codePos: this.createCodePositionFromLines(startLine, endLine)
                    };
                }
            }
            
            // Otherwise, treat as command
            const command = this.parseCommandFromTokens(restTokens, startLine);
            const endLine = this.currentLine;
            this.currentLine++;
            return { type: 'assignment', targetName, targetPath, command, codePos: this.createCodePositionFromLines(startLine, endLine) };
        }

        // Check if line starts with object or array literal
        const currentLine = this.lines[this.currentLine].trim();
        if (currentLine.startsWith('{')) {
            const objCode = this.extractObjectLiteral(this.lines[this.currentLine], this.lines[this.currentLine].indexOf('{'));
            // extractObjectLiteral sets this.currentLine to the line containing the closing brace
            // We need to move past that line
            const endLine = this.currentLine;
            this.currentLine++;
            return {
                type: 'command',
                name: '_object', // Special internal command for object literals
                args: [{ type: 'object', code: objCode.code }],
                codePos: this.createCodePositionFromLines(startLine, endLine)
            };
        }
        if (currentLine.startsWith('[')) {
            const arrCode = this.extractArrayLiteral(this.lines[this.currentLine], this.lines[this.currentLine].indexOf('['));
            // extractArrayLiteral sets this.currentLine to the line containing the closing bracket
            // We need to move past that line
            const endLine = this.currentLine;
            this.currentLine++;
            return {
                type: 'command',
                name: '_array', // Special internal command for array literals
                args: [{ type: 'array', code: arrCode.code }],
                codePos: this.createCodePositionFromLines(startLine, endLine)
            };
        }

        // Check for shorthand assignment or positional param reference
        if (tokens.length === 1) {
            if (LexerUtils.isVariable(tokens[0])) {
                const targetVar = tokens[0];
                // For shorthand assignment, only allow simple variable names (reading attributes is allowed)
                // If it has a path, it's just a reference, not an assignment
                if (/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(targetVar)) {
                    // Simple variable - shorthand assignment
                    const targetName = targetVar.slice(1);
                    const endLine = this.currentLine;
                this.currentLine++;
                    return { type: 'shorthand', targetName, codePos: this.createCodePositionFromLines(startLine, endLine) };
                } else {
                    // Variable with path - just a reference, treat as no-op (or could be used in expressions)
                    // For now, we'll treat it as a no-op since we can't assign to attributes
                    this.currentLine++;
                    return null;
                }
            } else if (LexerUtils.isPositionalParam(tokens[0])) {
                // Positional params alone on a line are no-ops (just references)
                // They're used for documentation/clarity in function definitions
                const endLine = this.currentLine;
                this.currentLine++;
                return { type: 'shorthand', targetName: tokens[0].slice(1), codePos: this.createCodePositionFromLines(startLine, endLine) };
            } else if (LexerUtils.isLastValue(tokens[0])) {
                // Just $ on a line is a no-op (just references the last value, doesn't assign)
                // This is useful in subexpressions or for clarity
                // We'll create a no-op statement by using a comment-like approach
                // Actually, we can just skip it - it's effectively a no-op
                this.currentLine++;
                return null; // No-op statement
            }
        }

        // Check if this is a parenthesized function call: fn(...) or module.fn(...)
        // Look for pattern: identifier followed by '(' OR module.identifier followed by '('
        if ((tokens.length >= 2 && tokens[1] === '(') || 
            (tokens.length >= 4 && tokens[1] === '.' && tokens[3] === '(')) {
            // This is a parenthesized call - parse it specially
            // Note: parseParenthesizedCall already checks for "into" internally and sets the into property on the command
            return this.parseParenthesizedCall(tokens, startLine);
        }

        // Regular command (space-separated)
        // Check for "with" or "do" callback blocks on the same line first
        // These keywords should not be parsed as arguments
        const withIndex = tokens.indexOf('with');
        const doIndex = tokens.indexOf('do');
        
        // Find the earliest callback keyword (if any)
        let callbackKeywordIndex = -1;
        let callbackKeyword: 'with' | 'do' | null = null;
        if (withIndex >= 0 && (doIndex < 0 || withIndex < doIndex)) {
            callbackKeywordIndex = withIndex;
            callbackKeyword = 'with';
        } else if (doIndex >= 0) {
            callbackKeywordIndex = doIndex;
            callbackKeyword = 'do';
        }
        
        // Check for "into $var" in the tokens (but only before callback keywords)
        const intoIndex = callbackKeywordIndex >= 0 
            ? (tokens.indexOf('into') >= 0 && tokens.indexOf('into') < callbackKeywordIndex ? tokens.indexOf('into') : -1)
            : tokens.indexOf('into');

        let intoTarget: { targetName: string; targetPath?: AttributePathSegment[] } | null = null;
        
        if (intoIndex >= 0 && intoIndex < tokens.length - 1) {
            const varToken = tokens[intoIndex + 1];
            if (LexerUtils.isVariable(varToken)) {
                // This is an "into" assignment - parse the target variable
                const { name: targetName, path: targetPath } = LexerUtils.parseVariablePath(varToken);
                intoTarget = { targetName, targetPath };
                // Parse command without the "into $var" part (and without callback keywords)
                const endIndex = callbackKeywordIndex >= 0 ? Math.min(intoIndex, callbackKeywordIndex) : intoIndex;
                const commandTokens = tokens.slice(0, endIndex);
                // Find the position of "into" in the original line to limit argument parsing
                const originalLine = this.lines[this.currentLine];
                const intoPosInLine = originalLine.indexOf('into');
                // Temporarily modify the line to exclude "into $var" for argument parsing
                // This prevents parseCommandFromTokens from trying to parse "into" as an argument
                const lineBeforeInto = intoPosInLine >= 0 ? originalLine.substring(0, intoPosInLine).trim() : originalLine;
                const originalLineBackup = this.lines[this.currentLine];
                const currentLineBackup = this.currentLine;
                this.lines[this.currentLine] = lineBeforeInto;
                try {
                    const command = this.parseCommandFromTokens(commandTokens, startLine);
                    const endLine = this.currentLine;
                    // Only advance if we're still on the same line (parseCommandFromTokens might advance for multi-line args)
                    if (this.currentLine === currentLineBackup) {
                        this.currentLine++;
                    }
                    // Set the into property on the command instead of wrapping it
                    const result = {
                        ...command,
                        syntaxType: 'space' as const,
                        into: intoTarget,
                        codePos: this.createCodePositionFromLines(startLine, endLine)
                    };
                    return result;
                } finally {
                    // Restore original line
                    this.lines[currentLineBackup] = originalLineBackup;
                }
            }
        }
        
        // If there's a callback keyword on the same line, exclude it from argument parsing
        let commandTokens = tokens;
        if (callbackKeywordIndex >= 0) {
            commandTokens = tokens.slice(0, callbackKeywordIndex);
            // Also modify the line to exclude the callback keyword for argument parsing
            const originalLine = this.lines[this.currentLine];
            const callbackPosInLine = originalLine.indexOf(callbackKeyword!);
            if (callbackPosInLine >= 0) {
                const lineBeforeCallback = originalLine.substring(0, callbackPosInLine).trim();
                const originalLineBackup = this.lines[this.currentLine];
                const currentLineBackup = this.currentLine;
                this.lines[this.currentLine] = lineBeforeCallback;
                try {
                    const command = this.parseCommandFromTokens(commandTokens, startLine);
                    const endLine = this.currentLine;
                    // Restore original line before checking for callback
                    this.lines[currentLineBackup] = originalLineBackup;
                    // Reset currentLine to the original line to check for callback on same line
                    this.currentLine = currentLineBackup;
                    
                    // Check for callback on the same line (after the command arguments)
                    let callback: ScopeBlock | undefined = undefined;
                    const remainingLineContent = originalLine.substring(callbackPosInLine).trim();
                    const remainingTokens = Lexer.tokenize(remainingLineContent);
                    if (remainingTokens.length > 0 && remainingTokens[0] === callbackKeyword) {
                        // Check if "into" appears after the callback keyword on the same line
                        // This means "into" is the command's assignment target, not the callback's
                        const intoIndexInRemaining = remainingTokens.indexOf('into');
                        let commandIntoFromCallback: { targetName: string; targetPath?: AttributePathSegment[] } | null = null;
                        
                        if (intoIndexInRemaining > 0 && intoIndexInRemaining < remainingTokens.length - 1) {
                            // "into" appears after callback keyword - this is the command's "into"
                            const varToken = remainingTokens[intoIndexInRemaining + 1];
                            if (LexerUtils.isVariable(varToken)) {
                                const { name: targetName, path: targetPath } = LexerUtils.parseVariablePath(varToken);
                                commandIntoFromCallback = { targetName, targetPath };
                                // Update intoTarget to use this one (it takes precedence)
                                intoTarget = commandIntoFromCallback;
                                
                                // Parse callback without the "into $var" part
                                // We need to modify the line temporarily, but ensure parseWithScope can find endwith
                                const callbackLineContent = remainingTokens.slice(0, intoIndexInRemaining).join(' ');
                                const originalLineForCallback = this.lines[this.currentLine];
                                const currentLineBeforeParse = this.currentLine;
                                
                                // Parse callback, telling parseWithScope to ignore "into" on the first line
                                // (it's the command's "into", not the callback's)
                                if (callbackKeyword === 'with') {
                                    // Temporarily modify the line to exclude "into $var" so parseWithScope doesn't try to parse it
                                    this.lines[this.currentLine] = callbackLineContent;
                                    try {
                                        callback = this.parseWithScope(this.currentLine, true);
                                    } finally {
                                        // Restore original line only if we're still on the same line
                                        // (parseWithScope may have advanced currentLine)
                                        if (this.currentLine === currentLineBeforeParse) {
                                            this.lines[this.currentLine] = originalLineForCallback;
                                        }
                                    }
                                } else if (callbackKeyword === 'do') {
                                    // For "do", we still need to modify the line
                                    this.lines[this.currentLine] = callbackLineContent;
                                    try {
                                        callback = this.parseScope(this.currentLine);
                                    } finally {
                                        if (this.currentLine === currentLineBeforeParse) {
                                            this.lines[this.currentLine] = originalLineForCallback;
                                        }
                                    }
                                }
                            }
                        } else {
                            // No "into" after callback keyword - parse callback normally
                            const originalLineForCallback = this.lines[this.currentLine];
                            const currentLineBeforeParse = this.currentLine;
                            this.lines[this.currentLine] = remainingLineContent;
                            try {
                                if (callbackKeyword === 'with') {
                                    callback = this.parseWithScope(this.currentLine);
                                } else if (callbackKeyword === 'do') {
                                    // Check if this is a standalone "do into" block (not a callback)
                                    const hasInto = remainingTokens.includes('into');
                                    if (!hasInto) {
                                        callback = this.parseScope(this.currentLine);
                                    }
                                }
                            } finally {
                                // Restore original line only if we're still on the same line
                                if (this.currentLine === currentLineBeforeParse) {
                                    this.lines[this.currentLine] = originalLineForCallback;
                                }
                            }
                        }
                        
                        // If "into" was found after callback keyword, callback is required
                        if (commandIntoFromCallback && !callback) {
                            throw this.createError('callback block is required when using "into" after callback keyword', this.currentLine);
                        }
                    }
                    
                    const result = {
                        ...command,
                        syntaxType: 'space' as const,
                        into: intoTarget || undefined,
                        callback,
                        codePos: this.createCodePositionFromLines(startLine, callback ? (this.currentLine - 1) : endLine)
                    };
                    return result;
                } finally {
                    // Restore original line
                    this.lines[currentLineBackup] = originalLineBackup;
                }
            }
        }
        
        const command = this.parseCommandFromTokens(commandTokens, startLine);
        // parseCommandFromTokens may have advanced currentLine if there were multi-line arguments
        // So we need to check from the current line position
        const commandEndLine = this.currentLine;
        
        // Check if next line is a callback block ("with" or "do")
        // Look ahead to see if next non-empty, non-comment line is "with" or "do"
        // CRITICAL: Always start from the line AFTER where the command ended
        // This ensures we don't accidentally skip the next statement when there's no blank line
        // 
        // IMPORTANT: Do NOT hardcode which commands support callbacks (e.g., don't check command.name.startsWith('dom.'))
        // The parser should be syntax-aware, not semantics-aware. We parse callback blocks when they appear,
        // and let the executor/runtime handle whether the command actually supports callbacks or not.
        // This keeps the parser flexible and allows new commands to support callbacks without parser changes.
        let callback: ScopeBlock | undefined = undefined;
        // Start looking from the line after the command ended
        // For single-line commands, commandEndLine equals startLine, so we look at startLine + 1
        // For multi-line commands, parseCommandFromTokens already advanced currentLine, so we look at commandEndLine + 1
        let lookAheadLine = startLine + 1;
        // But if parseCommandFromTokens advanced currentLine (multi-line args), use that instead
        if (commandEndLine > startLine) {
            lookAheadLine = commandEndLine + 1;
        }
        
        while (lookAheadLine < this.lines.length) {
            const lookAheadLineContent = this.lines[lookAheadLine]?.trim();
            if (!lookAheadLineContent || lookAheadLineContent.startsWith('#')) {
                lookAheadLine++;
                continue;
            }
            
            const lookAheadTokens = Lexer.tokenize(lookAheadLineContent);
            const firstToken = lookAheadTokens.length > 0 ? lookAheadTokens[0] : '';
            
            // Check for "with" block (used for callback syntax)
            if (firstToken === 'with') {
                // Found a "with" block - parse it as callback
                // Note: We don't check if the command supports callbacks here - that's the executor's responsibility
                this.currentLine = lookAheadLine;
                callback = this.parseWithScope(lookAheadLine);
                // parseWithScope advances currentLine past endwith
                break;
            } else if (firstToken === 'do') {
                // Check if this is a standalone "do into" block (not a callback)
                // "do into $var" is a standalone statement, not a callback
                const hasInto = lookAheadTokens.includes('into');
                if (hasInto) {
                    // This is a standalone "do into" block, not a callback - stop looking
                    break;
                }
                // Found a simple "do" block - parse it as callback
                // Note: We don't check if the command supports callbacks here - that's the executor's responsibility
                // If the command doesn't support callbacks, the executor will handle it appropriately
                this.currentLine = lookAheadLine;
                callback = this.parseScope(lookAheadLine);
                // parseScope advances currentLine past enddo
                break;
            } else {
                // Not a callback block - stop looking
                break;
            }
        }
        
        const endLine = callback ? (this.currentLine - 1) : commandEndLine;
        // If no callback, advance past the command line
        // CRITICAL: For single-line commands, commandEndLine equals startLine
        // So we need to advance to startLine + 1, not commandEndLine + 1
        // But if parseCommandFromTokens advanced currentLine (multi-line), use commandEndLine + 1
        if (!callback) {
            // Always advance to the line after where the command started
            // This ensures we don't skip the next statement when there's no blank line
            if (commandEndLine > startLine) {
                // Multi-line command - parseCommandFromTokens already advanced
                this.currentLine = commandEndLine + 1;
            } else {
                // Single-line command - advance to startLine + 1
                this.currentLine = startLine + 1;
            }
        }
        // If callback was found, currentLine is already advanced by parseWithScope or parseScope
        
        const result: CommandCall = { 
            ...command, 
            syntaxType: 'space' as const, 
            callback,
            codePos: this.createCodePositionFromLines(startLine, endLine) 
        };
        return result;
    }

    /**
     * Parse a parenthesized function call: fn(...)
     * Supports both positional and named arguments (key=value)
     * Handles multi-line calls
     */
    private parseParenthesizedCall(tokens: string[], startLine?: number): CommandCall {
        // Delegate to CommandParser
        const parser = new CommandParser(this.createCommandParserContext());
        return parser.parseParenthesizedCall(tokens, startLine);
    }

    /**
     * Extract content inside parentheses, handling multi-line calls
     * Returns the inner content (without the parentheses)
     */
    private extractParenthesizedContent(): string {
        const startLine = this.currentLine;
        const originalLine = this.lines[startLine];
        const trimmedLine = originalLine.trim();
        
        // Find the opening parenthesis position in the trimmed line
        const openParenIndexInTrimmed = trimmedLine.indexOf('(');
        if (openParenIndexInTrimmed === -1) {
            throw this.createError('expected (', startLine);
        }
        
        // Find the actual position in the original line (accounting for leading whitespace)
        // Find where the trimmed content starts in the original line
        const trimmedStart = originalLine.length - trimmedLine.length;
        const openParenIndex = trimmedStart + openParenIndexInTrimmed;

        let pos = openParenIndex + 1;
        let depth = 1;
        let inString: false | '"' | "'" | '`' = false;
        const content: string[] = [];
        let currentLineIndex = startLine;

        while (currentLineIndex < this.lines.length && depth > 0) {
            const currentLine = this.lines[currentLineIndex];
            
            // On the first line, use the calculated pos. On subsequent lines, start from beginning
            if (currentLineIndex === startLine && pos >= currentLine.length) {
                // We've reached the end of the first line, move to next
                currentLineIndex++;
                pos = 0;
                continue;
            }
            
            while (pos < currentLine.length && depth > 0) {
                const char = currentLine[pos];
                const prevChar = pos > 0 ? currentLine[pos - 1] : '';

                // Handle strings
                if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
                    if (!inString) {
                        inString = char;
                    } else if (char === inString) {
                        inString = false;
                    }
                    content.push(char);
                    pos++;
                    continue;
                }

                if (inString) {
                    content.push(char);
                    pos++;
                    continue;
                }

                // Handle comments (only when not inside a string)
                // Comments start with # and continue to end of line
                if (char === '#') {
                    // Skip everything until end of line - optimize by jumping directly to end
                    pos = currentLine.length;
                    // The newline will be added when we move to the next line
                    continue;
                }

                // Handle nested parentheses
                if (char === '(') {
                    depth++;
                    content.push(char);
                } else if (char === ')') {
                    depth--;
                    if (depth > 0) {
                        // This is a closing paren for a nested call
                        content.push(char);
                    }
                    // If depth === 0, we're done - don't include this closing paren
                } else {
                    content.push(char);
                }
                pos++;
            }

            if (depth > 0) {
                // Need to continue on next line
                content.push('\n');
                currentLineIndex++;
                pos = 0;
            }
        }

        if (depth > 0) {
            throw this.createError('unclosed parenthesized function call', startLine);
        }

        // Update currentLine to skip past the line with the closing paren
        this.currentLine = currentLineIndex + 1;

        // Optimize: Use join directly, trim only if needed
        const joined = content.join('');
        return joined.trim();
    }

    private parseDefine(startLine: number): DefineFunction {
        // Delegate to DefineParser for complete block parsing
        const parser = new DefineParser(this.createBlockParserContext(this.currentLine));
        return parser.parseBlock(startLine);
    }

    /**
     * Parse 'do' scope block
     * Syntax: do [$param1 $param2 ...] [into $var] ... enddo
     */
    private parseScope(startLine: number): ScopeBlock {
        // Delegate to ScopeParser for complete block parsing
        const parser = new ScopeParser(this.createBlockParserContext(this.currentLine));
        return parser.parseBlock(startLine);
    }

    /**
     * Parse a "with" block (callback block for dom commands)
     * Similar to parseScope but uses "with" and "endwith" keywords
     * @param ignoreIntoOnFirstLine - If true, ignore "into" on the first line (it's the command's "into", not the callback's)
     */
    private parseWithScope(startLine: number, ignoreIntoOnFirstLine: boolean = false): ScopeBlock {
        // Delegate to WithScopeParser for complete block parsing
        const parser = new WithScopeParser(this.createBlockParserContext(this.currentLine), ignoreIntoOnFirstLine);
        return parser.parseBlock(startLine);
    }

    private parseTogether(startLine: number): TogetherBlock {
        // Delegate to TogetherBlockParser for complete block parsing
        const parser = new TogetherBlockParser(this.createBlockParserContext(this.currentLine));
        return parser.parseBlock(startLine);
    }

    private parseForLoop(startLine: number): ForLoop {
        // Delegate to ForLoopParser for complete block parsing
        const parser = new ForLoopParser(this.createBlockParserContext(this.currentLine));
        return parser.parseBlock(startLine);
    }

    /**
     * Parse return statement
     * Syntax: return [value]
     */
    private parseReturn(_startLine: number): ReturnStatement {
        // Delegate to ReturnParser
        const parser = new ReturnParser(this.createReturnParserContext());
        return parser.parseStatement();
    }

    /**
     * Parse break statement
     * Syntax: break
     */
    private parseBreak(_startLine: number): Statement {
        // Delegate to BreakParser
        const parser = new BreakParser(this.createBreakParserContext());
        return parser.parseStatement();
    }


    private parseIfBlock(startLine: number): IfBlock {
        // Delegate to IfBlockParser for complete block parsing
        const parser = new IfBlockParser(this.createBlockParserContext(this.currentLine));
        return parser.parseBlock(startLine);
    }

    /**
     * Parse 'on' event block
     * Syntax: on "eventName" ... endon
     * 
     * This is the bridge from line-based parsing to TokenStream-based parsing.
     * It creates a TokenStream starting at the current line and delegates to
     * parseOnBlockTokenStream for the actual parsing.
     */
    private parseOnBlock(startLine: number): OnBlock {
        // Get the token index for this line
        const tokenIndex = this.lineStartTokenIndex[startLine];
        
        // If no tokens on this line, fall back to line-based parsing
        if (tokenIndex === -1) {
            const parser = new OnBlockParser(this.createBlockParserContext(this.currentLine));
            return parser.parseBlock(startLine);
        }
        
        // Get the header token and verify it's 'on'
        const headerToken = this.tokens[tokenIndex];
        if (headerToken.text !== 'on') {
            // Unexpected - fall back to line-based parsing
            const parser = new OnBlockParser(this.createBlockParserContext(this.currentLine));
            return parser.parseBlock(startLine);
        }
        
        // Create a TokenStream starting at this token
        const stream = new TokenStream(this.tokens, tokenIndex);
        
        // Use the TokenStream-based parser
        return this.parseOnBlockTokenStream(stream, headerToken);
    }
    
    /**
     * TokenStream-based 'on' block parser
     * 
     * Delegates to OnBlockParser.parseFromStream() for token-based parsing.
     * Uses a hybrid approach: TokenStream for boundaries, line-based for body statements.
     * 
     * @param stream - TokenStream positioned at the 'on' token
     * @param headerToken - The 'on' keyword token
     */
    private parseOnBlockTokenStream(stream: TokenStream, headerToken: Token): OnBlock {
        // Create context for OnBlockParser.parseFromStream
        const context: OnBlockTokenStreamContext = {
            lines: this.lines,
            parseStatementFromTokens: (tokenStream: TokenStream) => {
                // Hybrid approach: convert token position to line and use line-based parsing
                const currentToken = tokenStream.current();
                if (!currentToken) return null;
                
                // Get line from token (1-based, convert to 0-based)
                const statementStartLine = currentToken.line - 1;
                
                // Sync currentLine to the statement's line
                this.currentLine = statementStartLine;
                
                // Use line-based parseStatement (this will advance this.currentLine)
                const stmt = this.parseStatement();
                
                // Advance stream past all tokens on lines consumed by parseStatement
                // parseStatement advanced this.currentLine to the line after the statement
                const endLine = this.currentLine - 1; // Last line of the statement
                
                while (!tokenStream.isAtEnd()) {
                    const nextToken = tokenStream.current();
                    if (!nextToken) break;
                    
                    const nextLine = nextToken.line - 1;
                    
                    // If we've moved past the statement's last line, stop
                    if (nextLine > endLine) {
                        break;
                    }
                    
                    tokenStream.next();
                }
                
                return stmt;
            },
            createCodePositionFromTokens: (startToken: Token, endToken: Token) => {
                return this.createCodePositionFromTokens(startToken, endToken);
            },
            createCodePositionFromLines: (startLine: number, endLine: number) => {
                return this.createCodePositionFromLines(startLine, endLine);
            },
            createGroupedCommentNode: (comments: string[], commentLines: number[]) => {
                return this.createGroupedCommentNode(comments, commentLines);
            }
        };
        
        // Use OnBlockParser.parseFromStream
        const result = OnBlockParser.parseFromStream(stream, headerToken, context);
        
        // Update currentLine based on where the stream ended
        // The stream should be positioned after the 'endon' or at the next 'on'
        const finalToken = stream.current();
        if (finalToken) {
            // Stream is positioned at the first token after the block
            // Set currentLine to that token's line
            this.currentLine = finalToken.line - 1;
        } else {
            // Stream reached EOF - set to end of file
            this.currentLine = this.lines.length;
        }
        
        return result;
    }

    private parseInlineIf(startLine: number): InlineIf {
        // Delegate to InlineIfParser
        const parser = new InlineIfParser(this.createInlineIfParserContext());
        return parser.parseStatement(startLine);
    }

    private parseCommandFromTokens(tokens: string[], startLine?: number): CommandCall {
        // Delegate to CommandParser
        const parser = new CommandParser(this.createCommandParserContext());
        return parser.parseCommandFromTokens(tokens, startLine);
    }

    /**
     * Extract a $(...) subexpression from a line, starting at the given position.
     * Returns the inner code and the end position.
     * Handles multi-line subexpressions (newlines are preserved in the code).
     */
    private extractSubexpression(line: string, startPos: number): { code: string; endPos: number } {
        // Skip past "$("
        let pos = startPos + 2;
        let depth = 1;
        let inString: false | '"' | "'" | '`' = false;
        const code: string[] = [];
        
        while (pos < line.length && depth > 0) {
            const char = line[pos];
            const prevChar = pos > 0 ? line[pos - 1] : '';
            
            // Handle strings
            if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
                if (!inString) {
                    inString = char;
                } else if (char === inString) {
                    inString = false;
                }
                code.push(char);
                pos++;
                continue;
            }
            
            if (inString) {
                code.push(char);
                pos++;
                continue;
            }
            
            // Handle nested $() subexpressions
            if (char === '$' && pos + 1 < line.length && line[pos + 1] === '(') {
                depth++;
                code.push(char);
                pos++;
                continue;
            }
            
            if (char === ')') {
                depth--;
                if (depth > 0) {
                    // This is a closing paren for a nested subexpr
                    code.push(char);
                }
                // If depth === 0, we're done - don't include this closing paren
                pos++;
                continue;
            }
            
            // Preserve all characters including newlines, spaces, tabs, etc.
            code.push(char);
            pos++;
        }
        
        // If we exited because we reached the end of the line but depth > 0,
        // that means the subexpression spans multiple lines (which should be handled by splitIntoLogicalLines)
        // But if it somehow didn't, we should still return what we have
        if (depth > 0 && pos >= line.length) {
            // This shouldn't happen if splitIntoLogicalLines is working correctly,
            // but we'll handle it gracefully
            throw this.createError(`unclosed subexpression starting at position ${startPos}`, this.currentLine);
        }
        
        return {
            code: code.join(''),
            endPos: pos
        };
    }

    /**
     * Extract object literal { ... } from a line, starting at the given position.
     * Handles nested objects, arrays, and strings.
     * Supports multi-line objects.
     */
    private extractObjectLiteral(line: string, startPos: number): { code: string; endPos: number } {
        // Skip past "{"
        let pos = startPos + 1;
        let braceDepth = 1;
        let bracketDepth = 0; // Track array depth inside object
        let inString: false | '"' | "'" | '`' = false;
        const code: string[] = [];
        let currentLineIndex = this.currentLine;
        
        while (currentLineIndex < this.lines.length && braceDepth > 0) {
            const currentLine = currentLineIndex === this.currentLine ? line : this.lines[currentLineIndex];
            
            while (pos < currentLine.length && braceDepth > 0) {
                const char = currentLine[pos];
                const prevChar = pos > 0 ? currentLine[pos - 1] : '';
                
                // Handle strings
                if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
                    if (!inString) {
                        inString = char;
                    } else if (char === inString) {
                        inString = false;
                    }
                    code.push(char);
                    pos++;
                    continue;
                }
                
                if (inString) {
                    code.push(char);
                    pos++;
                    continue;
                }
                
                // Handle nested objects and arrays
                if (char === '{') {
                    braceDepth++;
                    code.push(char);
                } else if (char === '}') {
                    braceDepth--;
                    if (braceDepth > 0) {
                        code.push(char);
                    }
                    // If braceDepth === 0, we're done - don't include this closing brace
                } else if (char === '[') {
                    bracketDepth++;
                    code.push(char);
                } else if (char === ']') {
                    bracketDepth--;
                    code.push(char);
                } else {
                    code.push(char);
                }
                pos++;
            }
            
            if (braceDepth > 0) {
                // Need to continue on next line
                code.push('\n');
                currentLineIndex++;
                pos = 0;
            }
        }
        
        if (braceDepth > 0) {
            throw this.createError('unclosed object literal', this.currentLine);
        }
        
        // Update currentLine if we moved to a new line
        if (currentLineIndex > this.currentLine) {
            this.currentLine = currentLineIndex;
        }
        
        return {
            code: code.join('').trim(),
            endPos: pos
        };
    }

    /**
     * Extract array literal [ ... ] from a line, starting at the given position.
     * Handles nested arrays, objects, and strings.
     * Supports multi-line arrays.
     */
    private extractArrayLiteral(line: string, startPos: number): { code: string; endPos: number } {
        // Skip past "["
        let pos = startPos + 1;
        let bracketDepth = 1;
        let braceDepth = 0; // Track object depth inside array
        let inString: false | '"' | "'" | '`' = false;
        const code: string[] = [];
        let currentLineIndex = this.currentLine;
        
        while (currentLineIndex < this.lines.length && bracketDepth > 0) {
            const currentLine = currentLineIndex === this.currentLine ? line : this.lines[currentLineIndex];
            
            while (pos < currentLine.length && bracketDepth > 0) {
                const char = currentLine[pos];
                const prevChar = pos > 0 ? currentLine[pos - 1] : '';
                
                // Handle strings
                if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
                    if (!inString) {
                        inString = char;
                    } else if (char === inString) {
                        inString = false;
                    }
                    code.push(char);
                    pos++;
                    continue;
                }
                
                if (inString) {
                    code.push(char);
                    pos++;
                    continue;
                }
                
                // Handle nested arrays and objects
                if (char === '[') {
                    bracketDepth++;
                    code.push(char);
                } else if (char === ']') {
                    bracketDepth--;
                    if (bracketDepth > 0) {
                        code.push(char);
                    }
                    // If bracketDepth === 0, we're done - don't include this closing bracket
                } else if (char === '{') {
                    braceDepth++;
                    code.push(char);
                } else if (char === '}') {
                    braceDepth--;
                    code.push(char);
                } else {
                    code.push(char);
                }
                pos++;
            }
            
            if (bracketDepth > 0) {
                // Need to continue on next line
                code.push('\n');
                currentLineIndex++;
                pos = 0;
            }
        }
        
        if (bracketDepth > 0) {
            throw this.createError('unclosed array literal', this.currentLine);
        }
        
        // Update currentLine if we moved to a new line
        if (currentLineIndex > this.currentLine) {
            this.currentLine = currentLineIndex;
        }
        
        return {
            code: code.join('').trim(),
            endPos: pos
        };
    }
}
