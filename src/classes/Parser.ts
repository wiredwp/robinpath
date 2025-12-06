/**
 * Parser class for parsing RobinPath code into AST
 */

import { Lexer } from './Lexer';
import { LexerUtils } from '../utils';
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
    CommentStatement,
    CommentWithPosition,
    CodePosition,
    DecoratorCall,
    IntoAssignment,
    AttributePathSegment
} from '../index';

export class Parser {
    private lines: string[];
    private trimmedLinesCache: Map<number, string> = new Map(); // Cache trimmed lines
    private currentLine: number = 0;
    private columnPositionsCache: Map<number, { startCol: number; endCol: number }> = new Map();
    private inlineCommentCache: Map<number, { text: string; position: number } | null> = new Map();

    constructor(lines: string[]) {
        this.lines = lines;
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

    parse(): Statement[] {
        // First pass: extract all def/enddef blocks and mark their line numbers
        const defBlockLines = new Set<number>();
        const extractedFunctions: DefineFunction[] = [];
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
                    // Not a decorator - check if it's a def, var, or const statement
                    if (decoratorTokens.length > 0 && decoratorTokens[0] === 'def') {
                        scanLine = decoratorScanLine; // Update scanLine to the def line
                        foundDef = true;
                        break;
                    } else if (decoratorTokens.length > 0 && (decoratorTokens[0] === 'var' || decoratorTokens[0] === 'const')) {
                        // Found var or const - skip it (decorators will be handled in main parse)
                        scanLine = decoratorScanLine + 1; // Skip the var/const line
                        foundVarOrConst = true;
                        break;
                    } else {
                        // Not a decorator and not a def/var/const - orphaned decorator
                        if (decorators.length > 0) {
                            throw this.createError('orphaned decorator: decorator must be immediately before function definition, var, or const declaration', decorators[0].codePos.startRow);
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
        } else if (tokens.length > 0 && (tokens[0] === 'var' || tokens[0] === 'const')) {
            // Line starts directly with var or const (no decorators) - skip it
            // These will be handled in the main parse() method
            scanLine++;
        } else {
            // Not a decorator, def, var, or const - skip this line and continue scanning
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
        (this as any).extractedFunctions = allExtractedFunctions;
        
        // Second pass: parse remaining statements (excluding def blocks)
        // Collect comments and attach them to the following statement
        this.currentLine = 0;
        const pendingComments: string[] = [];
        const statements = this.parseStatementsWithComments(
            pendingComments,
            (lineNumber) => defBlockLines.has(lineNumber)
        );

        return statements;
    }
    
    /**
     * Get extracted function definitions (def/enddef blocks) that were parsed separately
     */
    getExtractedFunctions(): DefineFunction[] {
        return (this as any).extractedFunctions || [];
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
                    throw this.createError('orphaned decorator: decorator must be immediately before function definition, var, or const declaration', pendingDecoratorLines[0]);
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
                    // Decorators are allowed before: def, var, const commands
                    if (stmt.type === 'define') {
                        // Attach decorators to def statements (handled below)
                    } else if (stmt.type === 'command' && (stmt.name === 'var' || stmt.name === 'const')) {
                        // Attach decorators to var/const commands
                        stmt.decorators = [...pendingDecorators];
                        pendingDecorators.length = 0;
                        pendingDecoratorLines.length = 0;
                    } else {
                        // Orphaned decorator - not before def, var, or const
                        throw this.createError('orphaned decorator: decorator must be immediately before function definition, var, or const declaration', pendingDecoratorLines[0]);
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
            throw this.createError('orphaned decorator: decorator must be immediately before function definition, var, or const declaration', pendingDecoratorLines[0]);
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

        // Check for define block
        if (tokens[0] === 'def') {
            return this.parseDefine(startLine);
        }

        // Check for together block
        if (tokens[0] === 'together') {
            return this.parseTogether(startLine);
        }

        // Check for do block
        if (tokens[0] === 'do') {
            return this.parseScope(startLine);
        }

        // Check for for loop
        if (tokens[0] === 'for') {
            return this.parseForLoop(startLine);
        }

        // Check for return statement
        if (tokens[0] === 'return') {
            return this.parseReturn(startLine);
        }

        // Check for break statement
        if (tokens[0] === 'break') {
            const endLine = this.currentLine;
            this.currentLine++;
            return { type: 'break', codePos: this.createCodePositionFromLines(startLine, endLine) };
        }

        // Check for block if
        if (tokens[0] === 'if' && !tokens.includes('then')) {
            return this.parseIfBlock(startLine);
        }

        // Check for inline if
        if (tokens[0] === 'if' && tokens.includes('then')) {
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
            // Note: parseParenthesizedCall already checks for "into" internally and returns IntoAssignment if found
            // So we can just return whatever it returns (either CommandCall or IntoAssignment)
            return this.parseParenthesizedCall(tokens, startLine);
        }

        // Regular command (space-separated)
        // Check for "into $var" in the tokens first
        const intoIndex = tokens.indexOf('into');
        if (intoIndex >= 0 && intoIndex < tokens.length - 1) {
            const varToken = tokens[intoIndex + 1];
            if (LexerUtils.isVariable(varToken)) {
                // This is an "into" assignment
                const { name: targetName, path: targetPath } = LexerUtils.parseVariablePath(varToken);
                // Parse command without the "into $var" part
                const commandTokens = tokens.slice(0, intoIndex);
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
                    return {
                        type: 'into',
                        statement: { ...command, syntaxType: 'space' as const, codePos: this.createCodePositionFromLines(startLine, endLine) },
                        targetName,
                        targetPath,
                        codePos: this.createCodePositionFromLines(startLine, endLine)
                    };
                } finally {
                    // Restore original line
                    this.lines[currentLineBackup] = originalLineBackup;
                }
            }
        }
        
        const command = this.parseCommandFromTokens(tokens, startLine);
        const endLine = this.currentLine;
        this.currentLine++;
        return { ...command, syntaxType: 'space' as const, codePos: this.createCodePositionFromLines(startLine, endLine) };
    }

    /**
     * Parse a parenthesized function call: fn(...)
     * Supports both positional and named arguments (key=value)
     * Handles multi-line calls
     */
    private parseParenthesizedCall(tokens: string[], startLine?: number): CommandCall | IntoAssignment {
        const callStartLine = startLine !== undefined ? startLine : this.currentLine;
        // Get function name (handle module.function syntax)
        let name: string;
        if (tokens.length >= 4 && tokens[1] === '.' && tokens[3] === '(') {
            // Module function: math.add(...)
            name = `${tokens[0]}.${tokens[2]}`;
        } else if (tokens.length >= 2 && tokens[1] === '(') {
            // Regular function: fn(...)
            name = tokens[0];
        } else {
            throw this.createError('expected ( after function name', this.currentLine);
        }

        // Validate function name
        if (LexerUtils.isNumber(name)) {
            throw this.createError(`expected command name, got number: ${name}`, this.currentLine);
        }
        if (LexerUtils.isString(name)) {
            throw this.createError(`expected command name, got string literal: ${name}`, this.currentLine);
        }
        if (LexerUtils.isVariable(name) || LexerUtils.isPositionalParam(name)) {
            throw this.createError(`expected command name, got variable: ${name}`, this.currentLine);
        }
        if (LexerUtils.isLastValue(name)) {
            throw this.createError(`expected command name, got last value reference: ${name}`, this.currentLine);
        }

        // Extract content inside parentheses (handles multi-line)
        const parenStartLine = this.currentLine;
        // Save the original line before extractParenthesizedContent modifies currentLine
        const originalLineAtStart = this.lines[parenStartLine];
        const parenContent = this.extractParenthesizedContent();
        const parenEndLine = this.currentLine - 1; // extractParenthesizedContent advances currentLine past the closing paren
        
        // Detect if multiline (content spans multiple lines)
        const isMultiline = parenEndLine > parenStartLine;
        
        // Parse arguments from the content
        const { positionalArgs, namedArgs } = this.parseParenthesizedArguments(parenContent);

        // Determine syntax type
        let syntaxType: 'parentheses' | 'named-parentheses' | 'multiline-parentheses';
        const hasNamedArgs = Object.keys(namedArgs).length > 0;
        
        if (isMultiline) {
            syntaxType = 'multiline-parentheses';
        } else if (hasNamedArgs) {
            syntaxType = 'named-parentheses';
        } else {
            syntaxType = 'parentheses';
        }

        // Combine positional args and named args (named args as a special object)
        const args: Arg[] = [...positionalArgs];
        if (hasNamedArgs) {
            args.push({ type: 'namedArgs', args: namedArgs });
        }

        // Check for "into $var" after parenthesized call (on same line as closing paren or next line)
        // For single-line calls, check the original line directly
        let intoInfo: { targetName: string; targetPath?: AttributePathSegment[] } | null = null;
        if (!isMultiline && parenEndLine === parenStartLine) {
            // Single-line call - check the original line directly
            const closingParenIndex = originalLineAtStart.lastIndexOf(')');
            if (closingParenIndex >= 0) {
                const afterParen = originalLineAtStart.slice(closingParenIndex + 1).trim();
                if (afterParen) {
                    const tokens = Lexer.tokenize(afterParen);
                    const intoIndex = tokens.indexOf('into');
                    if (intoIndex >= 0 && intoIndex < tokens.length - 1) {
                        const varToken = tokens[intoIndex + 1];
                        if (LexerUtils.isVariable(varToken)) {
                            const { name, path } = LexerUtils.parseVariablePath(varToken);
                            // currentLine is already past this line, so no need to advance
                            intoInfo = { targetName: name, targetPath: path };
                        }
                    }
                }
            }
        }
        
        // If not found on same line (or multiline), check using the helper method
        if (!intoInfo) {
            intoInfo = this.checkForIntoAfterParen(parenEndLine);
        }
        
        const endLine = intoInfo ? (this.currentLine - 1) : this.currentLine;
        const command: CommandCall = { 
            type: 'command', 
            name, 
            args,
            syntaxType,
            codePos: this.createCodePositionFromLines(callStartLine, endLine)
        };
        
        if (intoInfo) {
            // Return IntoAssignment wrapping the command
            return {
                type: 'into',
                statement: command,
                targetName: intoInfo.targetName,
                targetPath: intoInfo.targetPath,
                codePos: this.createCodePositionFromLines(callStartLine, endLine)
            };
        }
        
        return command;
    }

    /**
     * Check for "into $var" after a parenthesized call
     * This handles the case where "into" might be on the same line as the closing paren
     * or on the next line
     */
    private checkForIntoAfterParen(parenEndLine: number): { targetName: string; targetPath?: AttributePathSegment[] } | null {
        // Check the line containing the closing paren
        if (parenEndLine >= 0 && parenEndLine < this.lines.length) {
            const line = this.lines[parenEndLine];
            // Find the closing paren position
            const closingParenIndex = line.lastIndexOf(')');
            if (closingParenIndex >= 0) {
                // Check for "into" after the closing paren on the same line
                const afterParen = line.slice(closingParenIndex + 1);
                // Don't trim here - we want to preserve the original structure for tokenization
                // But we do need to check if there's any content after the paren
                if (afterParen.trim()) {
                    const tokens = Lexer.tokenize(afterParen.trim());
                    const intoIndex = tokens.indexOf('into');
                    if (intoIndex >= 0 && intoIndex < tokens.length - 1) {
                        const varToken = tokens[intoIndex + 1];
                        if (LexerUtils.isVariable(varToken)) {
                            const { name, path } = LexerUtils.parseVariablePath(varToken);
                            // Advance currentLine past this line if needed
                            // extractParenthesizedContent already advanced currentLine past the closing paren,
                            // so we just need to ensure we don't go backwards
                            if (parenEndLine + 1 > this.currentLine) {
                                this.currentLine = parenEndLine + 1;
                            }
                            return { targetName: name, targetPath: path };
                        }
                    }
                }
            }
        }
        
        // Check next line if not found on same line
        const nextLineNumber = parenEndLine + 1;
        if (nextLineNumber < this.lines.length) {
            const line = this.lines[nextLineNumber].trim();
            const tokens = Lexer.tokenize(line);
            
            // Look for "into" keyword followed by a variable
            const intoIndex = tokens.indexOf('into');
            if (intoIndex >= 0 && intoIndex < tokens.length - 1) {
                const varToken = tokens[intoIndex + 1];
                if (LexerUtils.isVariable(varToken)) {
                    const { name, path } = LexerUtils.parseVariablePath(varToken);
                    // Advance currentLine past this line
                    if (nextLineNumber >= this.currentLine) {
                        this.currentLine = nextLineNumber + 1;
                    }
                    return { targetName: name, targetPath: path };
                }
            }
        }
        
        return null;
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

    /**
     * Parse arguments from parenthesized content
     * Handles both positional and named arguments (key=value)
     */
    private parseParenthesizedArguments(content: string): { positionalArgs: Arg[]; namedArgs: Record<string, Arg> } {
        const positionalArgs: Arg[] = [];
        const namedArgs: Record<string, Arg> = {};

        // Optimize: Check length first before trimming
        const trimmedContent = content.trim();
        if (!trimmedContent) {
            return { positionalArgs, namedArgs };
        }

        // Split content into argument tokens
        // Arguments are separated by whitespace (spaces or newlines)
        // But we need to preserve strings and subexpressions
        const argTokens = this.tokenizeParenthesizedArguments(trimmedContent);

        for (let tokenIndex = 0; tokenIndex < argTokens.length; tokenIndex++) {
            const token = argTokens[tokenIndex];
            
            // Check if it's a named argument: key=value or $paramName=value
            // Handle both cases: $a="value" (one token) or $a = "value" (separate tokens)
            let key: string | null = null;
            let valueStr: string | null = null;
            let tokensToSkip = 0;
            
            // Case 1: Check if token contains = (e.g., $a="value" or key="value")
            const equalsIndex = token.indexOf('=');
            if (equalsIndex > 0 && equalsIndex < token.length - 1) {
                const beforeEquals = token.substring(0, equalsIndex).trim();
                valueStr = token.substring(equalsIndex + 1).trim();
                
                // Check for $paramName=value syntax (e.g., $a="value")
                if (beforeEquals.startsWith('$') && beforeEquals.length > 1) {
                    const paramName = beforeEquals.substring(1);
                    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(paramName)) {
                        key = paramName;
                    }
                }
                // Check for key=value syntax (e.g., key="value")
                else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(beforeEquals)) {
                    key = beforeEquals;
                }
            }
            // Case 2: Check if current token is $paramName or key and next token is =
            else if (tokenIndex + 1 < argTokens.length && argTokens[tokenIndex + 1] === '=') {
                // Check for $paramName = value syntax
                if (LexerUtils.isVariable(token)) {
                    const { name: paramName } = LexerUtils.parseVariablePath(token);
                    if (paramName && /^[A-Za-z_][A-Za-z0-9_]*$/.test(paramName)) {
                        key = paramName;
                        // Get the value token (skip =)
                        if (tokenIndex + 2 < argTokens.length) {
                            valueStr = argTokens[tokenIndex + 2];
                            tokensToSkip = 2; // Skip = and value
                        } else {
                            valueStr = '';
                            tokensToSkip = 1; // Skip = only
                        }
                    }
                }
                // Check for key = value syntax (without $)
                else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) {
                    key = token;
                    // Get the value token (skip =)
                    if (tokenIndex + 2 < argTokens.length) {
                        valueStr = argTokens[tokenIndex + 2];
                        tokensToSkip = 2; // Skip = and value
                    } else {
                        valueStr = '';
                        tokensToSkip = 1; // Skip = only
                    }
                }
            }
            
            if (key && valueStr !== null) {
                // This is a named argument
                const valueArg = this.parseArgumentValue(valueStr);
                    namedArgs[key] = valueArg;
                tokenIndex += tokensToSkip; // Skip processed tokens
                    continue;
            }

            // Positional argument
            const arg = this.parseArgumentValue(token);
            positionalArgs.push(arg);
        }

        return { positionalArgs, namedArgs };
    }

    /**
     * Tokenize arguments from parenthesized content
     * Handles strings, subexpressions, object/array literals, and whitespace separation
     */
    private tokenizeParenthesizedArguments(content: string): string[] {
        const tokens: string[] = [];
        let current = '';
        let inString: false | '"' | "'" | '`' = false;
        let subexprDepth = 0;
        let braceDepth = 0;
        let bracketDepth = 0;
        let i = 0;

        while (i < content.length) {
            const char = content[i];
            const nextChar = i + 1 < content.length ? content[i + 1] : '';
            const prevChar = i > 0 ? content[i - 1] : '';

            // Handle strings
            if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
                if (!inString) {
                    inString = char;
                } else if (char === inString) {
                    inString = false;
                }
                current += char;
                i++;
                continue;
            }

            if (inString) {
                current += char;
                i++;
                continue;
            }

            // Handle comments (only when not inside a string, subexpression, object, or array)
            // Comments start with # and continue to end of line
            if (char === '#' && subexprDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
                // Skip everything until end of line - optimize by finding newline index first
                const newlineIndex = content.indexOf('\n', i);
                i = newlineIndex >= 0 ? newlineIndex : content.length;
                // The newline will be processed in the next iteration as a separator
                continue;
            }

            // Handle $() subexpressions
            if (char === '$' && nextChar === '(') {
                subexprDepth++;
                current += char;
                i++;
                continue;
            }

            if (char === ')' && subexprDepth > 0) {
                subexprDepth--;
                current += char;
                i++;
                continue;
            }

            // Handle object literals { }
            if (char === '{') {
                braceDepth++;
                current += char;
                i++;
                continue;
            }

            if (char === '}' && braceDepth > 0) {
                braceDepth--;
                current += char;
                i++;
                continue;
            }

            // Handle array literals [ ]
            if (char === '[') {
                bracketDepth++;
                current += char;
                i++;
                continue;
            }

            if (char === ']' && bracketDepth > 0) {
                bracketDepth--;
                current += char;
                i++;
                continue;
            }

            // Handle whitespace, commas, and = (only at top level, not inside $(), {}, or [])
            // Commas are optional separators, = is used for named arguments
            if (((char === ' ' || char === '\n' || char === '\t') || char === ',' || char === '=') && 
                subexprDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
                // Optimize: Only push non-empty tokens
                const trimmed = current.trim();
                if (trimmed) {
                    tokens.push(trimmed);
                }
                current = '';
                // Push = as a separate token for named argument parsing
                if (char === '=') {
                    tokens.push('=');
                }
                i++;
                continue;
            }

            current += char;
            i++;
        }

        // Optimize: Only push non-empty tokens, avoiding filter at the end
        const trimmed = current.trim();
        if (trimmed) {
            tokens.push(trimmed);
        }

        return tokens;
    }

    /**
     * Parse a single argument value (for both positional and named arguments)
     */
    private parseArgumentValue(token: string): Arg {
        // Check if it's exactly $ (last value without attributes)
        if (token === '$') {
            return { type: 'lastValue' };
        }
        
        // Check if it's a variable
        if (LexerUtils.isVariable(token)) {
            const { name, path } = LexerUtils.parseVariablePath(token);
            return { type: 'var', name, path };
        }
        
        // Check if it's a positional param
        if (LexerUtils.isPositionalParam(token)) {
            return { type: 'var', name: token.slice(1) };
        }
        
        // Check if it's a boolean
        if (token === 'true') {
            return { type: 'literal', value: true };
        }
        if (token === 'false') {
            return { type: 'literal', value: false };
        }
        if (token === 'null') {
            return { type: 'literal', value: null };
        }
        
        // Check if it's a string
        if (LexerUtils.isString(token)) {
            return { type: 'string', value: LexerUtils.parseString(token) };
        }
        
        // Check if it's a number
        if (LexerUtils.isNumber(token)) {
            return { type: 'number', value: parseFloat(token) };
        }
        
        // Check if it's a subexpression $(...)
        if (token.startsWith('$(') && token.endsWith(')')) {
            const code = token.slice(2, -1); // Remove $( and )
            return { type: 'subexpr', code };
        }
        
        // Check if it's an object literal {...}
        if (token.startsWith('{') && token.endsWith('}')) {
            const code = token.slice(1, -1); // Remove { and }
            return { type: 'object', code };
        }
        
        // Check if it's an array literal [...]
        if (token.startsWith('[') && token.endsWith(']')) {
            const code = token.slice(1, -1); // Remove [ and ]
            return { type: 'array', code };
        }
        
        // Treat as literal string
        return { type: 'literal', value: token };
    }

    private parseDefine(startLine: number): DefineFunction {
        const originalLine = this.lines[this.currentLine];
        const line = originalLine.trim();
        const tokens = Lexer.tokenize(line);
        
        if (tokens.length < 2) {
            throw this.createError('def requires a function name', this.currentLine);
        }

        const name = tokens[1];
        
        // Parse parameter names (optional): def fn $a $b $c
        const paramNames: string[] = [];
        for (let i = 2; i < tokens.length; i++) {
            const token = tokens[i];
            // Parameter names must be variables (e.g., $a, $b, $c)
            if (LexerUtils.isVariable(token) && !LexerUtils.isPositionalParam(token) && !LexerUtils.isLastValue(token)) {
                const { name: paramName } = LexerUtils.parseVariablePath(token);
                if (paramName && /^[A-Za-z_][A-Za-z0-9_]*$/.test(paramName)) {
                    paramNames.push(paramName);
                } else {
                    // Invalid parameter name - stop parsing parameters
                    break;
                }
            } else {
                // Not a valid parameter name - stop parsing parameters
                break;
            }
        }
        
        // Extract inline comment from def line
        const inlineComment = this.extractInlineComment(originalLine, this.currentLine);
        const comments: CommentWithPosition[] = [];
        if (inlineComment) {
            comments.push(this.createInlineCommentWithPosition(originalLine, this.currentLine, inlineComment));
        }
        
        this.currentLine++;

        const body: Statement[] = [];
        let closed = false;
        let pendingComments: string[] = [];
        const pendingCommentLines: number[] = [];
        let hasBlankLineAfterLastComment = false;
        let hasCreatedCommentNodes = false;

        while (this.currentLine < this.lines.length) {
            const originalBodyLine = this.lines[this.currentLine];
            const bodyLine = originalBodyLine.trim();
            
            // Blank line: mark that blank line appeared after last comment
            if (!bodyLine) {
                hasBlankLineAfterLastComment = true;
                this.currentLine++;
                continue;
            }
            
            // Comment line: if we have pending comments with blank line after, create comment nodes
            if (bodyLine.startsWith('#')) {
                const commentText = bodyLine.slice(1).trim();
                
                // If we have pending comments and there was a blank line after them, create comment nodes
                if (pendingComments.length > 0 && hasBlankLineAfterLastComment) {
                    // Group consecutive orphaned comments into a single node
                    body.push(this.createGroupedCommentNode(pendingComments, pendingCommentLines));
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                    hasCreatedCommentNodes = true;
                } else if (!hasBlankLineAfterLastComment) {
                    // Consecutive comment (no blank line) - reset flag so they can be attached
                    hasCreatedCommentNodes = false;
                }
                
                // Start new sequence with this comment
                pendingComments.push(commentText);
                pendingCommentLines.push(this.currentLine);
                hasBlankLineAfterLastComment = false;
                this.currentLine++;
                continue;
            }

            const bodyTokens = Lexer.tokenize(bodyLine);
            
            if (bodyTokens[0] === 'enddef') {
                this.currentLine++;
                closed = true;
                break;
            }

            const stmt = this.parseStatement();
            if (stmt) {
                const allComments: string[] = [];
                
                // If there was a blank line after pending comments, create comment nodes
                if (pendingComments.length > 0 && hasBlankLineAfterLastComment && hasCreatedCommentNodes) {
                    // comment -> blank -> comment -> blank -> statement: all comments become nodes
                    // Group consecutive orphaned comments into a single node
                    body.push(this.createGroupedCommentNode(pendingComments, pendingCommentLines));
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                } else if (pendingComments.length > 0 && hasBlankLineAfterLastComment && !hasCreatedCommentNodes) {
                    // comment -> blank -> statement: comment becomes node (not attached)
                    // Group consecutive orphaned comments into a single node
                    body.push(this.createGroupedCommentNode(pendingComments, pendingCommentLines));
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                } else if (pendingComments.length > 0) {
                    // No blank line after comments - attach them (consecutive comments)
                    allComments.push(...pendingComments);
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                }
                
                // Inline comment on same line
                const inlineComment = this.extractInlineComment(originalBodyLine, this.currentLine);
                if (inlineComment) {
                    allComments.push(inlineComment.text);
                }
                
                if (allComments.length > 0) {
                    (stmt as any).comments = allComments;
                }
                
                body.push(stmt);
                hasBlankLineAfterLastComment = false;
                hasCreatedCommentNodes = false;
            }
        }

        // Handle any remaining pending comments at end of block
        // Group consecutive orphaned comments into a single node
        if (pendingComments.length > 0) {
            body.push(this.createGroupedCommentNode(pendingComments, pendingCommentLines));
        }

        if (!closed) {
            throw this.createError('missing enddef', this.currentLine);
        }

        const endLine = this.currentLine - 1; // enddef line
        const result: DefineFunction = { 
            type: 'define', 
            name, 
            paramNames, 
            body,
            codePos: this.createCodePositionFromLines(startLine, endLine)
        };
        if (comments.length > 0) {
            result.comments = comments;
        }
        return result;
    }

    private parseScope(startLine: number): ScopeBlock | IntoAssignment {
        const originalLine = this.lines[this.currentLine];
        const line = originalLine.trim();
        const tokens = Lexer.tokenize(line);
        
        // Check for "into $var" after "do" (can be after parameters)
        const intoIndex = tokens.indexOf('into');
        let intoTarget: { targetName: string; targetPath?: AttributePathSegment[] } | null = null;
        let paramEndIndex = tokens.length;
        
        if (intoIndex >= 0 && intoIndex < tokens.length - 1) {
            const varToken = tokens[intoIndex + 1];
            if (LexerUtils.isVariable(varToken)) {
                const { name, path } = LexerUtils.parseVariablePath(varToken);
                intoTarget = { targetName: name, targetPath: path };
                // Parameters end before "into"
                paramEndIndex = intoIndex;
            }
        }
        
        // Parse parameter names (optional): do $a $b or do $a $b into $var
        const paramNames: string[] = [];
        
        // Start from token index 1 (after "do"), stop before "into" if present
        for (let i = 1; i < paramEndIndex; i++) {
            const token = tokens[i];
            
            // Parameter names must be variables (e.g., $a, $b, $c)
            if (LexerUtils.isVariable(token) && !LexerUtils.isPositionalParam(token) && !LexerUtils.isLastValue(token)) {
                const { name: paramName } = LexerUtils.parseVariablePath(token);
                if (paramName && /^[A-Za-z_][A-Za-z0-9_]*$/.test(paramName)) {
                    paramNames.push(paramName);
                } else {
                    // Invalid parameter name - stop parsing parameters
                    break;
                }
            } else {
                // Not a valid parameter name - stop parsing parameters
                break;
            }
        }
        
        // Extract inline comment from scope line
        const inlineComment = this.extractInlineComment(originalLine, this.currentLine);
        const comments: CommentWithPosition[] = [];
        if (inlineComment) {
            comments.push(this.createInlineCommentWithPosition(originalLine, this.currentLine, inlineComment));
        }
        
        this.currentLine++;

        const body: Statement[] = [];
        let closed = false;
        let pendingComments: string[] = [];
        const pendingCommentLines: number[] = [];

        while (this.currentLine < this.lines.length) {
            const originalBodyLine = this.lines[this.currentLine];
            const bodyLine = originalBodyLine.trim();
            
            // Blank line: preserve pending comments (they may be attached to next statement)
            if (!bodyLine) {
                this.currentLine++;
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
                    body.push(this.createGroupedCommentNode(pendingComments, pendingCommentLines));
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                }
                
                // Start new sequence with this comment
                pendingComments.push(commentText);
                pendingCommentLines.push(this.currentLine);
                this.currentLine++;
                continue;
            }

            const bodyTokens = Lexer.tokenize(bodyLine);
            
            if (bodyTokens[0] === 'enddo') {
                this.currentLine++;
                closed = true;
                break;
            }

            const stmt = this.parseStatement();
            if (stmt) {
                const allComments: string[] = [];
                
                // Consecutive comments above
                if (pendingComments.length > 0) {
                    allComments.push(...pendingComments);
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                }
                
                // Inline comment on same line
                const inlineComment = this.extractInlineComment(originalBodyLine, this.currentLine);
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
            body.push(this.createGroupedCommentNode(pendingComments, pendingCommentLines));
        }

        if (!closed) {
            throw this.createError('missing enddo', this.currentLine);
        }

        // If parameters are declared, include them in the do block
        const endLine = this.currentLine - 1;
        const scopeBlock: ScopeBlock = paramNames.length > 0 
            ? { type: 'do', paramNames, body, codePos: this.createCodePositionFromLines(startLine, endLine) }
            : { type: 'do', body, codePos: this.createCodePositionFromLines(startLine, endLine) };
        if (comments.length > 0) {
            scopeBlock.comments = comments;
        }
        
        // If "into" was found after "do", wrap the scope block
        if (intoTarget) {
            return {
                type: 'into',
                statement: scopeBlock,
                targetName: intoTarget.targetName,
                targetPath: intoTarget.targetPath,
                codePos: this.createCodePositionFromLines(startLine, endLine)
            };
        }
        
        return scopeBlock;
    }

    private parseTogether(startLine: number): TogetherBlock {
        const originalLine = this.lines[this.currentLine];
        const line = originalLine.trim();
        const tokens = Lexer.tokenize(line);

        // Must start with "together"
        if (tokens[0] !== 'together') {
            throw this.createError('expected together', this.currentLine);
        }

        // Collect comments above the together block
        const comments: CommentWithPosition[] = [];
        let commentStartLine = startLine;
        while (commentStartLine > 0) {
            const prevLine = this.lines[commentStartLine - 1].trim();
            if (prevLine.startsWith('#')) {
                const lineNum = commentStartLine - 1;
                const cols = this.getColumnPositions(lineNum);
                comments.unshift({
                    text: prevLine.slice(1).trim(),
                    codePos: this.createCodePosition(lineNum, cols.startCol, lineNum, cols.endCol)
                });
                commentStartLine--;
            } else if (prevLine === '') {
                commentStartLine--;
            } else {
                break;
            }
        }

        this.currentLine++; // Move past "together" line

        const blocks: ScopeBlock[] = [];
        let closed = false;

        // Parse do blocks until we find "endtogether"
        while (this.currentLine < this.lines.length) {
            const bodyLine = this.lines[this.currentLine];
            const trimmedBodyLine = bodyLine.trim();

            // Skip empty lines
            if (!trimmedBodyLine || trimmedBodyLine.startsWith('#')) {
                this.currentLine++;
                continue;
            }

            const bodyTokens = Lexer.tokenize(trimmedBodyLine);

            // Check for endtogether
            if (bodyTokens[0] === 'endtogether') {
                this.currentLine++;
                closed = true;
                break;
            }

            // Only allow "do" blocks inside together
            if (bodyTokens[0] !== 'do') {
                throw this.createError('together block can only contain do blocks', this.currentLine);
            }

            // Parse the do block (can be regular do or do into $var)
            const doBlock = this.parseScope(this.currentLine);
            
            // parseScope returns ScopeBlock | IntoAssignment
            // For together, we accept both:
            // - ScopeBlock (regular do block)
            // - IntoAssignment wrapping a ScopeBlock (do into $var)
            if (doBlock.type === 'into' && doBlock.statement.type === 'do') {
                // This is "do into $var" - we need to store it as IntoAssignment
                // But TogetherBlock expects ScopeBlock[], so we need to change the type
                // Actually, let's store the IntoAssignment info in the ScopeBlock
                // For now, let's just store the do block and handle "into" during execution
                // We'll need to track which blocks have "into" assignments
                blocks.push(doBlock.statement);
                // Store the into info on the block for later use
                (doBlock.statement as any).__intoAssignment = {
                    targetName: doBlock.targetName,
                    targetPath: doBlock.targetPath
                };
            } else if (doBlock.type === 'do') {
                blocks.push(doBlock);
            } else {
                throw this.createError('together block can only contain do blocks', this.currentLine);
            }
        }

        if (!closed) {
            throw this.createError('missing endtogether', this.currentLine);
        }

        const endLine = this.currentLine - 1;
        const togetherBlock: TogetherBlock = {
            type: 'together',
            blocks,
            codePos: this.createCodePositionFromLines(startLine, endLine)
        };
        if (comments.length > 0) {
            togetherBlock.comments = comments;
        }
        return togetherBlock;
    }

    private parseForLoop(startLine: number): ForLoop {
        const originalLine = this.lines[this.currentLine];
        const line = originalLine.trim();
        const tokens = Lexer.tokenize(line);
        
        // Parse: for $var in <expr>
        if (tokens.length < 4) {
            throw this.createError('for loop requires: for $var in <expr>', this.currentLine);
        }
        
        if (tokens[0] !== 'for') {
            throw this.createError('expected for keyword', this.currentLine);
        }
        
        // Get loop variable
        if (!LexerUtils.isVariable(tokens[1])) {
            throw this.createError('for loop variable must be a variable (e.g., $i, $item)', this.currentLine);
        }
        const varName = tokens[1].slice(1); // Remove $
        
        if (tokens[2] !== 'in') {
            throw this.createError("for loop requires 'in' keyword", this.currentLine);
        }
        
        // Get iterable expression (everything after 'in')
        const exprTokens = tokens.slice(3);
        const iterableExpr = exprTokens.join(' ');
        
        // Extract inline comment from for line
        const inlineComment = this.extractInlineComment(originalLine, this.currentLine);
        const comments: CommentWithPosition[] = [];
        if (inlineComment) {
            comments.push(this.createInlineCommentWithPosition(originalLine, this.currentLine, inlineComment));
        }
        
        this.currentLine++;

        const body: Statement[] = [];
        let closed = false;
        let pendingComments: string[] = [];
        const pendingCommentLines: number[] = [];

        while (this.currentLine < this.lines.length) {
            const originalBodyLine = this.lines[this.currentLine];
            const bodyLine = originalBodyLine.trim();
            
            // Blank line: preserve pending comments (they may be attached to next statement)
            if (!bodyLine) {
                this.currentLine++;
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
                    body.push(this.createGroupedCommentNode(pendingComments, pendingCommentLines));
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                }
                
                // Start new sequence with this comment
                pendingComments.push(commentText);
                pendingCommentLines.push(this.currentLine);
                this.currentLine++;
                continue;
            }

            const bodyTokens = Lexer.tokenize(bodyLine);
            
            if (bodyTokens[0] === 'endfor') {
                this.currentLine++;
                closed = true;
                break;
            }

            const stmt = this.parseStatement();
            if (stmt) {
                const allComments: string[] = [];
                
                // Consecutive comments above
                if (pendingComments.length > 0) {
                    allComments.push(...pendingComments);
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                }
                
                // Inline comment on same line
                const inlineComment = this.extractInlineComment(originalBodyLine, this.currentLine);
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
            body.push(this.createGroupedCommentNode(pendingComments, pendingCommentLines));
        }

        if (!closed) {
            throw this.createError('missing endfor', this.currentLine);
        }

        const endLine = this.currentLine - 1; // endfor line
        const result: ForLoop = { 
            type: 'forLoop', 
            varName, 
            iterableExpr, 
            body,
            codePos: this.createCodePositionFromLines(startLine, endLine)
        };
        if (comments.length > 0) {
            result.comments = comments;
        }
        return result;
    }

    private parseReturn(startLine: number): ReturnStatement {
        const line = this.lines[this.currentLine].trim();
        const tokens = Lexer.tokenize(line);
        
        const endLine = this.currentLine;
        this.currentLine++;
        
        // If there's a value after "return", parse it as an argument
        if (tokens.length > 1) {
            const valueTokens = tokens.slice(1);
            // Parse the value as a single argument
            const arg = this.parseReturnValue(valueTokens);
            return { 
                type: 'return', 
                value: arg,
                codePos: this.createCodePositionFromLines(startLine, endLine)
            };
        }
        
        // No value specified - returns $ (last value)
        return { 
            type: 'return',
            codePos: this.createCodePositionFromLines(startLine, endLine)
        };
    }

    private parseReturnValue(tokens: string[]): Arg {
        if (tokens.length === 0) {
            return { type: 'lastValue' };
        }
        
        const line = this.lines[this.currentLine - 1]; // Get the original line
        const returnIndex = line.indexOf('return');
        
        // Find the position after "return" in the original line
        const afterReturnStart = returnIndex + 6; // "return" is 6 chars
        let pos = afterReturnStart;
        
        // Skip whitespace after "return"
        while (pos < line.length && /\s/.test(line[pos])) {
            pos++;
        }
        
        // Check if we're at a $( subexpression
        if (pos < line.length - 1 && line[pos] === '$' && line[pos + 1] === '(') {
            const subexprCode = this.extractSubexpression(line, pos);
            return { type: 'subexpr', code: subexprCode.code };
        }
        
        // Otherwise, parse the first token
        const token = tokens[0].trim(); // Ensure token is trimmed
        
        // Check if it's exactly $ (last value without attributes)
        if (token === '$') {
            return { type: 'lastValue' };
        } else if (LexerUtils.isVariable(token)) {
            // This includes $.property, $[index], $var, $var.property, etc.
            const { name, path } = LexerUtils.parseVariablePath(token);
            // If name is empty, it means last value with attributes (e.g., $.name)
            if (name === '') {
                return { type: 'var', name: '', path };
            }
            return { type: 'var', name, path };
        } else if (token === 'true') {
            return { type: 'literal', value: true };
        } else if (token === 'false') {
            return { type: 'literal', value: false };
        } else if (token === 'null') {
            return { type: 'literal', value: null };
        } else if (LexerUtils.isPositionalParam(token)) {
            return { type: 'var', name: token.slice(1) };
        } else if (LexerUtils.isString(token)) {
            return { type: 'string', value: LexerUtils.parseString(token) };
        } else if (LexerUtils.isNumber(token)) {
            return { type: 'number', value: parseFloat(token) };
        } else {
            // Treat as literal
            return { type: 'literal', value: token };
        }
    }

    private parseIfBlock(startLine: number): IfBlock {
        const originalLine = this.lines[this.currentLine];
        const line = originalLine.trim();
        
        // Extract condition (everything after 'if')
        // Use the original line string to preserve subexpressions $(...)
        const ifIndex = line.indexOf('if');
        if (ifIndex === -1) {
            throw this.createError('if statement must start with "if"', this.currentLine);
        }
        // Find the position after "if" and any whitespace
        let conditionStart = ifIndex + 2; // "if" is 2 characters
        while (conditionStart < line.length && /\s/.test(line[conditionStart])) {
            conditionStart++;
        }
        const conditionExpr = line.slice(conditionStart).trim();

        // Extract inline comment from if line
        const inlineComment = this.extractInlineComment(originalLine, this.currentLine);
        const comments: CommentWithPosition[] = [];
        if (inlineComment) {
            comments.push(this.createInlineCommentWithPosition(originalLine, this.currentLine, inlineComment));
        }

        this.currentLine++;

        const thenBranch: Statement[] = [];
        const elseifBranches: Array<{ condition: string; body: Statement[] }> = [];
        let elseBranch: Statement[] | undefined;
        let currentBranch: Statement[] = thenBranch;
        let pendingComments: string[] = [];
        const pendingCommentLines: number[] = [];
        let hasBlankLineAfterLastComment = false;
        let hasCreatedCommentNodes = false;
        let closed = false;

        while (this.currentLine < this.lines.length) {
            const originalBodyLine = this.lines[this.currentLine];
            const bodyLine = originalBodyLine.trim();
            
            // Blank line: mark that blank line appeared after last comment
            if (!bodyLine) {
                hasBlankLineAfterLastComment = true;
                this.currentLine++;
                continue;
            }
            
            // Comment line: if we have pending comments with blank line after, create comment nodes
            if (bodyLine.startsWith('#')) {
                const commentText = bodyLine.slice(1).trim();
                
                // If we have pending comments and there was a blank line after them, create comment nodes
                if (pendingComments.length > 0 && hasBlankLineAfterLastComment) {
                    // Group consecutive orphaned comments into a single node
                    currentBranch.push(this.createGroupedCommentNode(pendingComments, pendingCommentLines));
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                    hasCreatedCommentNodes = true;
                } else if (!hasBlankLineAfterLastComment) {
                    // Consecutive comment (no blank line) - reset flag so they can be attached
                    hasCreatedCommentNodes = false;
                }
                
                // Start new sequence with this comment
                pendingComments.push(commentText);
                pendingCommentLines.push(this.currentLine);
                hasBlankLineAfterLastComment = false;
                this.currentLine++;
                continue;
            }

            const tokens = Lexer.tokenize(bodyLine);

            // Handle elseif - switch to new branch
            if (tokens[0] === 'elseif') {
                // Extract condition from original line string to preserve subexpressions $(...)
                const elseifIndex = bodyLine.indexOf('elseif');
                if (elseifIndex === -1) {
                    throw this.createError('elseif statement must contain "elseif"', this.currentLine);
                }
                // Find the position after "elseif" and any whitespace
                let conditionStart = elseifIndex + 6; // "elseif" is 6 characters
                while (conditionStart < bodyLine.length && /\s/.test(bodyLine[conditionStart])) {
                    conditionStart++;
                }
                const condition = bodyLine.slice(conditionStart).trim();
                
                // Extract inline comment from elseif line
                const elseifInlineComment = this.extractInlineComment(originalBodyLine, this.currentLine);
                const elseifComments: string[] = [];
                if (pendingComments.length > 0) {
                    elseifComments.push(...pendingComments);
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                }
                if (elseifInlineComment) {
                    elseifComments.push(elseifInlineComment.text);
                }
                
                elseifBranches.push({ condition, body: [] });
                currentBranch = elseifBranches[elseifBranches.length - 1].body;
                hasBlankLineAfterLastComment = false;
                hasCreatedCommentNodes = false;
                this.currentLine++;
                continue;
            }

            // Handle else - switch to else branch
            if (tokens[0] === 'else') {
                // Extract inline comment from else line
                const elseInlineComment = this.extractInlineComment(originalBodyLine, this.currentLine);
                const elseComments: string[] = [];
                if (pendingComments.length > 0) {
                    elseComments.push(...pendingComments);
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                }
                if (elseInlineComment) {
                    elseComments.push(elseInlineComment.text);
                }
                
                elseBranch = [];
                currentBranch = elseBranch;
                hasBlankLineAfterLastComment = false;
                hasCreatedCommentNodes = false;
                this.currentLine++;
                continue;
            }

            // If this is our closing endif, consume it and stop
            if (tokens[0] === 'endif') {
                this.currentLine++;
                closed = true;
                break;
            }

            const stmt = this.parseStatement();
            if (stmt) {
                const allComments: string[] = [];
                
                // If we've created comment nodes before, remaining comments should also be nodes
                if (pendingComments.length > 0 && hasCreatedCommentNodes) {
                    // Group consecutive orphaned comments into a single node
                    currentBranch.push(this.createGroupedCommentNode(pendingComments, pendingCommentLines));
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                } else if (pendingComments.length > 0) {
                    // No comment nodes created - attach comments
                    allComments.push(...pendingComments);
                    pendingComments.length = 0;
                    pendingCommentLines.length = 0;
                }
                
                // Inline comment on same line
                const inlineComment = this.extractInlineComment(originalBodyLine, this.currentLine);
                if (inlineComment) {
                    allComments.push(inlineComment.text);
                }
                
                if (allComments.length > 0) {
                    (stmt as any).comments = allComments;
                }
                
                currentBranch.push(stmt);
                hasBlankLineAfterLastComment = false;
                hasCreatedCommentNodes = false;
            }
        }

        // Handle any remaining pending comments at end of block
        // Group consecutive orphaned comments into a single node
        if (pendingComments.length > 0) {
            currentBranch.push(this.createGroupedCommentNode(pendingComments, pendingCommentLines));
        }

        if (!closed) {
            throw this.createError('missing endif', this.currentLine);
        }

        const endLine = this.currentLine - 1; // endif line
        const result: IfBlock = {
            type: 'ifBlock',
            conditionExpr,
            thenBranch,
            elseifBranches: elseifBranches.length > 0 ? elseifBranches : undefined,
            elseBranch,
            codePos: this.createCodePositionFromLines(startLine, endLine)
        };
        if (comments.length > 0) {
            result.comments = comments;
        }
        return result;
    }

    private parseInlineIf(startLine: number): InlineIf {
        const originalLine = this.lines[this.currentLine];
        const line = originalLine.trim();
        const tokens = Lexer.tokenize(line);
        
        const thenIndex = tokens.indexOf('then');
        if (thenIndex === -1) {
            throw this.createError("inline if requires 'then'", this.currentLine);
        }

        const conditionTokens = tokens.slice(1, thenIndex);
        const conditionExpr = conditionTokens.join(' ');
        
        const commandTokens = tokens.slice(thenIndex + 1);
        
        // Check if this is an assignment FIRST, before trying to parse as command
        let finalCommand: Statement;
        if (commandTokens.length >= 3 && LexerUtils.isVariable(commandTokens[0]) && commandTokens[1] === '=') {
            // This is an assignment - parse target with possible attribute path
            const targetVar = commandTokens[0];
            const { name: targetName, path: targetPath } = LexerUtils.parseVariablePath(targetVar);
            const restTokens = commandTokens.slice(2);
            
            // Check if it's a literal value
            if (restTokens.length === 1) {
                const token = restTokens[0];
                if (LexerUtils.isNumber(token)) {
                    const numValue = parseFloat(token);
                    finalCommand = { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: numValue,
                        literalValueType: 'number',
                        codePos: this.createCodePositionFromLines(startLine, startLine)
                    };
                } else if (LexerUtils.isString(token)) {
                    const strValue = LexerUtils.parseString(token);
                    finalCommand = { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: strValue,
                        literalValueType: 'string',
                        codePos: this.createCodePositionFromLines(startLine, startLine)
                    };
                } else if (token === 'true') {
                    finalCommand = { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: true,
                        literalValueType: 'boolean',
                        codePos: this.createCodePositionFromLines(startLine, startLine)
                    };
                } else if (token === 'false') {
                    finalCommand = { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: false,
                        literalValueType: 'boolean',
                        codePos: this.createCodePositionFromLines(startLine, startLine)
                    };
                } else if (token === 'null') {
                    finalCommand = { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        literalValue: null,
                        literalValueType: 'null',
                        codePos: this.createCodePositionFromLines(startLine, startLine)
                    };
                } else if (LexerUtils.isVariable(token)) {
                    // Handle variable reference: $a = $b
                    const { name: varName, path: varPath } = LexerUtils.parseVariablePath(token);
                    finalCommand = { 
                        type: 'assignment', 
                        targetName, 
                        targetPath,
                        command: {
                            type: 'command',
                            name: '_var',
                            args: [{ type: 'var', name: varName, path: varPath }],
                            codePos: this.createCodePositionFromLines(startLine, startLine)
                        },
                        codePos: this.createCodePositionFromLines(startLine, startLine)
                    };
                } else {
                    const cmd = this.parseCommandFromTokens(restTokens, startLine);
                    finalCommand = { type: 'assignment', targetName, targetPath, command: cmd, codePos: this.createCodePositionFromLines(startLine, startLine) };
                }
            } else {
                const cmd = this.parseCommandFromTokens(restTokens, startLine);
                finalCommand = { type: 'assignment', targetName, targetPath, command: cmd, codePos: this.createCodePositionFromLines(startLine, startLine) };
            }
        } else {
            // Check if it's a break or return statement
            if (commandTokens.length === 1 && commandTokens[0] === 'break') {
                finalCommand = { type: 'break', codePos: this.createCodePositionFromLines(startLine, startLine) };
            } else if (commandTokens.length >= 1 && commandTokens[0] === 'return') {
                // Parse return statement
                const returnValueTokens = commandTokens.slice(1);
                if (returnValueTokens.length === 0) {
                    finalCommand = { type: 'return', codePos: this.createCodePositionFromLines(startLine, startLine) };
                } else {
                    const returnValue = this.parseReturnValue(returnValueTokens);
                    finalCommand = { type: 'return', value: returnValue, codePos: this.createCodePositionFromLines(startLine, startLine) };
            }
        } else {
            // Not an assignment, parse as regular command
            finalCommand = this.parseCommandFromTokens(commandTokens, startLine);
            }
        }

        // Extract inline comment from inline if line
        const inlineComment = this.extractInlineComment(originalLine, this.currentLine);
        const comments: CommentWithPosition[] = [];
        if (inlineComment) {
            comments.push(this.createInlineCommentWithPosition(originalLine, this.currentLine, inlineComment));
        }

        const endLine = this.currentLine;
        this.currentLine++;
        const result: InlineIf = { 
            type: 'inlineIf', 
            conditionExpr, 
            command: finalCommand,
            codePos: this.createCodePositionFromLines(startLine, endLine)
        };
        if (comments.length > 0) {
            result.comments = comments;
        }
        return result;
    }

    private parseCommandFromTokens(tokens: string[], startLine?: number): CommandCall {
        const commandStartLine = startLine !== undefined ? startLine : this.currentLine;
        if (tokens.length === 0) {
            throw this.createError('empty command', this.currentLine);
        }

        // Handle module function calls: math.add -> tokens: ["math", ".", "add"]
        // Combine module name and function name if second token is "."
        let name: string;
        let argStartIndex = 1;
        if (tokens.length >= 3 && tokens[1] === '.') {
            // Validate module name doesn't start with a number
            if (/^\d/.test(tokens[0])) {
                throw this.createError(`module name cannot start with a number: ${tokens[0]}`, this.currentLine);
            }
            // Validate function name doesn't start with a number
            if (/^\d/.test(tokens[2])) {
                throw this.createError(`function name cannot start with a number: ${tokens[2]}`, this.currentLine);
            }
            name = `${tokens[0]}.${tokens[2]}`;
            argStartIndex = 3;
        } else {
            name = tokens[0];
            // Validate function name doesn't start with a number
            if (/^\d/.test(name)) {
                throw this.createError(`function name cannot start with a number: ${name}`, this.currentLine);
            }
        }
        
        // Validate that the first token is not a literal number, string, variable, or last value reference
        // (strings should be quoted, numbers should not be command names, variables are not commands, $ is not a command)
        if (LexerUtils.isNumber(name)) {
            throw this.createError(`expected command name, got number: ${name}`, this.currentLine);
        }
        if (LexerUtils.isString(name)) {
            throw this.createError(`expected command name, got string literal: ${name}`, this.currentLine);
        }
        if (LexerUtils.isVariable(name) || LexerUtils.isPositionalParam(name)) {
            throw this.createError(`expected command name, got variable: ${name}`, this.currentLine);
        }
        if (LexerUtils.isLastValue(name)) {
            throw this.createError(`expected command name, got last value reference: ${name}`, this.currentLine);
        }
        
        const positionalArgs: Arg[] = [];
        const namedArgs: Record<string, Arg> = {};
        let currentLineIndex = this.currentLine;
        let line = this.lines[currentLineIndex];

        // We need to scan the original line to find $(...) subexpressions
        // because tokenization may have split them incorrectly
        let i = argStartIndex;
        
        // Find the position after the command name in the original line
        // For module functions like "math.add", we need to find the position after the full name
        let nameEndPos: number;
        if (argStartIndex === 3) {
            // Module function: tokens[0] + "." + tokens[2]
            // Find where tokens[0] starts, then calculate end position
            const moduleToken = tokens[0];
            const modulePos = line.indexOf(moduleToken);
            // Calculate end: module name + "." + function name
            nameEndPos = modulePos + moduleToken.length + 1 + tokens[2].length;
        } else {
            // Regular function: just tokens[0]
            nameEndPos = line.indexOf(name) + name.length;
        }
        let pos = nameEndPos;
        
        // Skip whitespace after command name
        while (pos < line.length && /\s/.test(line[pos])) {
            pos++;
        }

        while (i < tokens.length || pos < line.length || currentLineIndex < this.lines.length) {
            // Update line if we've moved to a new line
            if (currentLineIndex !== this.currentLine) {
                currentLineIndex = this.currentLine;
                line = this.lines[currentLineIndex];
                pos = 0;
                // Skip whitespace at start of new line
                while (pos < line.length && /\s/.test(line[pos])) {
                    pos++;
                }
            }
            
            // Check if we're at a $( subexpression in the current line
            if (pos < line.length - 1 && line[pos] === '$' && line[pos + 1] === '(') {
                // Extract the subexpression code
                const subexprCode = this.extractSubexpression(line, pos);
                positionalArgs.push({ type: 'subexpr', code: subexprCode.code });
                
                // Skip past the $() in the current line
                pos = subexprCode.endPos;
                
                // Skip any tokens that were part of this subexpression
                // We'll skip tokens until we find one that starts after our end position
                while (i < tokens.length) {
                    const tokenStart = line.indexOf(tokens[i], pos - 100); // Search from a bit before
                    if (tokenStart === -1 || tokenStart >= pos) {
                        break;
                    }
                    i++;
                }
                
                // Skip whitespace
                while (pos < line.length && /\s/.test(line[pos])) {
                    pos++;
                }
                continue;
            }

            // Check if we're at an object literal { ... }
            if (pos < line.length && line[pos] === '{') {
                const startLineIndex = this.currentLine;
                const objCode = this.extractObjectLiteral(line, pos);
                positionalArgs.push({ type: 'object', code: objCode.code });
                
                // extractObjectLiteral may have advanced this.currentLine if it was multi-line
                // Update our tracking variables
                if (this.currentLine > startLineIndex) {
                    // We've moved to a new line - continue parsing from that line
                    currentLineIndex = this.currentLine;
                    line = this.lines[currentLineIndex];
                    pos = objCode.endPos;
                    // Skip past the closing brace
                    if (pos < line.length && line[pos] === '}') {
                        pos++;
                    }
                    // Re-tokenize the remaining part of this line to get any remaining arguments
                    const remainingLine = line.substring(pos).trim();
                    if (remainingLine) {
                        const remainingTokens = Lexer.tokenize(remainingLine);
                        // Insert remaining tokens at current position
                        tokens.splice(i, 0, ...remainingTokens);
                    }
                } else {
                    pos = objCode.endPos;
                }
                
                // Skip any tokens that were part of this object
                while (i < tokens.length) {
                    const tokenStart = line.indexOf(tokens[i], Math.max(0, pos - 100));
                    if (tokenStart === -1 || tokenStart >= pos) {
                        break;
                    }
                    i++;
                }
                
                // Skip whitespace
                while (pos < line.length && /\s/.test(line[pos])) {
                    pos++;
                }
                continue;
            }

            // Check if we're at an array literal [ ... ]
            if (pos < line.length && line[pos] === '[') {
                const startLineIndex = this.currentLine;
                const arrCode = this.extractArrayLiteral(line, pos);
                positionalArgs.push({ type: 'array', code: arrCode.code });
                
                // extractArrayLiteral may have advanced this.currentLine if it was multi-line
                // Update our tracking variables
                if (this.currentLine > startLineIndex) {
                    // We've moved to a new line - continue parsing from that line
                    currentLineIndex = this.currentLine;
                    line = this.lines[currentLineIndex];
                    pos = arrCode.endPos;
                    // Skip past the closing bracket
                    if (pos < line.length && line[pos] === ']') {
                        pos++;
                    }
                    // Re-tokenize the remaining part of this line to get any remaining arguments
                    const remainingLine = line.substring(pos).trim();
                    if (remainingLine) {
                        const remainingTokens = Lexer.tokenize(remainingLine);
                        // Insert remaining tokens at current position
                        tokens.splice(i, 0, ...remainingTokens);
                    }
                } else {
                    pos = arrCode.endPos;
                }
                
                // Skip any tokens that were part of this array
                while (i < tokens.length) {
                    const tokenStart = line.indexOf(tokens[i], Math.max(0, pos - 100));
                    if (tokenStart === -1 || tokenStart >= pos) {
                        break;
                    }
                    i++;
                }
                
                // Skip whitespace
                while (pos < line.length && /\s/.test(line[pos])) {
                    pos++;
                }
                continue;
            }
            
            // If we've processed all tokens and we're at the end of the current line,
            // check if there are more lines to process (for multi-line commands)
            if (i >= tokens.length && pos >= line.length) {
                // Check if we've moved to a new line due to multi-line literal extraction
                if (currentLineIndex < this.currentLine) {
                    // We've moved ahead, continue from the new line
                    currentLineIndex = this.currentLine;
                    line = this.lines[currentLineIndex];
                    pos = 0;
                    // Re-tokenize the new line to get remaining arguments
                    const remainingTokens = Lexer.tokenize(line);
                    // Add remaining tokens to our processing queue
                    tokens.push(...remainingTokens);
                    // Skip whitespace
                    while (pos < line.length && /\s/.test(line[pos])) {
                        pos++;
                    }
                    continue;
                } else {
                    // No more lines to process
                    break;
                }
            }
            
            // If we've processed all tokens from the original line but there's more content on current line
            if (i >= tokens.length && pos < line.length) {
                // Re-tokenize remaining part of current line
                const remainingLine = line.substring(pos).trim();
                if (remainingLine) {
                    const remainingTokens = Lexer.tokenize(remainingLine);
                    tokens.push(...remainingTokens);
                    // Update pos to end of line to avoid re-processing
                    pos = line.length;
                }
            }
            
            // If we still have no tokens, break
            if (i >= tokens.length) {
                break;
            }
            
            const token = tokens[i];
            
            // Check if this is a module function reference: math.add -> tokens: ["math", ".", "add"]
            // Combine module name and function name if next tokens are "." and a valid identifier
            let actualToken = token;
            let tokensToSkip = 0;
            if (i + 2 < tokens.length && tokens[i + 1] === '.' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(tokens[i + 2])) {
                // Validate module name doesn't start with a number
                if (!/^\d/.test(token) && /^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) {
                    actualToken = `${token}.${tokens[i + 2]}`;
                    tokensToSkip = 2; // Skip the "." and function name tokens
                }
            }
            
            // Check if this is a named argument: key=value or $paramName=value
            // Handle both cases: $a="value" (one token) or $a = "value" (separate tokens)
            let key: string | null = null;
            let valueStr: string | null = null;
            
            // Case 1: Check if token contains = (e.g., $a="value" or key="value")
            const equalsIndex = token.indexOf('=');
            if (equalsIndex > 0 && equalsIndex < token.length - 1 && 
                !token.startsWith('"') && !token.startsWith("'") && !token.startsWith('`')) {
                const beforeEquals = token.substring(0, equalsIndex).trim();
                valueStr = token.substring(equalsIndex + 1).trim();
                
                // Check for $paramName=value syntax (e.g., $a="value")
                if (beforeEquals.startsWith('$') && beforeEquals.length > 1) {
                    const paramName = beforeEquals.substring(1);
                    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(paramName)) {
                        key = paramName;
                    }
                }
                // Check for key=value syntax (e.g., key="value")
                else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(beforeEquals)) {
                    key = beforeEquals;
                }
            }
            // Case 2: Check if current token is $paramName or key and next token is =
            // But skip if we already combined tokens (tokensToSkip > 0), as that means we have module.function
            let tokensSkipped = 0;
            if (!key && tokensToSkip === 0 && i + 1 < tokens.length && tokens[i + 1] === '=') {
                // Check for $paramName = value syntax
                if (LexerUtils.isVariable(token)) {
                    const { name: paramName } = LexerUtils.parseVariablePath(token);
                    if (paramName && /^[A-Za-z_][A-Za-z0-9_]*$/.test(paramName)) {
                        key = paramName;
                        // Skip the = token and get the value
                        if (i + 2 < tokens.length) {
                            valueStr = tokens[i + 2];
                            tokensSkipped = 2; // Skip = and value token
                        } else {
                            valueStr = '';
                            tokensSkipped = 1; // Skip = only
                        }
                    }
                }
                // Check for key = value syntax (without $)
                else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) {
                    key = token;
                    // Skip the = token and get the value
                    if (i + 2 < tokens.length) {
                        valueStr = tokens[i + 2];
                        tokensSkipped = 2; // Skip = and value token
                    } else {
                        valueStr = '';
                        tokensSkipped = 1; // Skip = only
                    }
                }
            }
            
            if (key && valueStr !== null) {
                // This is a named argument
                    const valueArg = this.parseArgumentValue(valueStr);
                    namedArgs[key] = valueArg;
                    
                    // Advance position
                    const tokenPos = line.indexOf(token, pos);
                    if (tokenPos !== -1) {
                        pos = tokenPos + token.length;
                        while (pos < line.length && /\s/.test(line[pos])) {
                            pos++;
                        }
                    }
                // Skip tokens if we processed Case 2
                if (tokensSkipped > 0) {
                    i += tokensSkipped;
                    continue;
                }
            }
            
            // Parse as positional argument
            let arg: Arg;
            if (actualToken === '$') {
                arg = { type: 'lastValue' };
            } else if (LexerUtils.isVariable(actualToken)) {
                // This includes $.property, $[index], $var, $var.property, etc.
                const { name: varName, path } = LexerUtils.parseVariablePath(actualToken);
                arg = { type: 'var', name: varName, path };
            } else if (actualToken === 'true') {
                arg = { type: 'literal', value: true };
            } else if (actualToken === 'false') {
                arg = { type: 'literal', value: false };
            } else if (actualToken === 'null') {
                arg = { type: 'literal', value: null };
            } else if (LexerUtils.isPositionalParam(actualToken)) {
                arg = { type: 'var', name: actualToken.slice(1) };
            } else if (LexerUtils.isString(actualToken)) {
                arg = { type: 'string', value: LexerUtils.parseString(actualToken) };
            } else if (LexerUtils.isNumber(actualToken)) {
                arg = { type: 'number', value: parseFloat(actualToken) };
            } else {
                // Treat as literal string (handles module.function names like "math.add")
                arg = { type: 'literal', value: actualToken };
            }
            
            positionalArgs.push(arg);
            
            // Advance position in line (approximate)
            const tokenPos = line.indexOf(token, pos);
            if (tokenPos !== -1) {
                // If we combined tokens, advance past all of them
                const advanceLength = tokensToSkip > 0 ? 
                    (token.length + 1 + tokens[i + 2].length) : token.length;
                pos = tokenPos + advanceLength;
                while (pos < line.length && /\s/.test(line[pos])) {
                    pos++;
                }
            }
            
            i += 1 + tokensToSkip;
        }

        // Combine positional args and named args (named args as a special object)
        const args: Arg[] = [...positionalArgs];
        if (Object.keys(namedArgs).length > 0) {
            args.push({ type: 'namedArgs', args: namedArgs });
        }

        // Determine end line - use the current line index (may have advanced due to multi-line literals)
        const endLine = currentLineIndex;
        return { type: 'command', name, args, codePos: this.createCodePositionFromLines(commandStartLine, endLine) };
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
