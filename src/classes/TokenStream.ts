/**
 * TokenStream - A stream of tokens for parsing
 * 
 * This class provides convenient methods for consuming and inspecting tokens
 * during parsing. It supports lookahead, backtracking, error reporting, and
 * parsing context tracking.
 */

import { TokenKind } from './Lexer';
import type { Token } from './Lexer';

/**
 * Parsing context types that the TokenStream can track
 */
export const ParsingContext = {
    NONE: 'none',
    ARRAY_LITERAL: 'array_literal',
    OBJECT_LITERAL: 'object_literal',
    FUNCTION_CALL: 'function_call',
    SUBEXPRESSION: 'subexpression',
    BLOCK: 'block', // Generic block (do, together, etc.)
    FUNCTION_DEFINITION: 'function_definition', // Inside def/enddef
    STRING_LITERAL: 'string_literal', // Inside a string (though strings are tokenized, this helps track state)
} as const;

export type ParsingContext = typeof ParsingContext[keyof typeof ParsingContext];

export class TokenStream {
    private tokens: Token[];
    private position: number = 0;
    private contextStack: ParsingContext[] = [];
    private lastNextPosition: number = -1; // Track last position where next() was called
    private consecutiveNextCalls: number = 0; // Track consecutive next() calls at same position
    
    /**
     * Maximum number of consecutive next() calls allowed at the same position before throwing
     */
    static readonly MAX_CONSECUTIVE_NEXT_AT_SAME_POSITION = 3;
    
    /**
     * Debug mode flag - set to true to enable logging
     * Can be controlled via VITE_DEBUG environment variable or set programmatically
     * Usage: TokenStream.debug = true;
     */
    static debug: boolean = (() => {
        try {
            // Check process.env (Node.js)
            const proc = (globalThis as any).process;
            if (proc && proc.env?.VITE_DEBUG === 'true') {
                return true;
            }
            // Check import.meta.env (Vite/browser)
            const importMeta = (globalThis as any).import?.meta;
            if (importMeta && importMeta.env?.VITE_DEBUG === 'true') {
                return true;
            }
        } catch {
            // Ignore errors
        }
        return false;
    })();
    
    /**
     * Create a new TokenStream
     * @param tokens - Array of tokens to stream
     * @param startIndex - Optional starting index (default 0)
     */
    constructor(tokens: Token[], startIndex: number = 0) {
        this.tokens = tokens;
        this.position = startIndex;
        this.lastNextPosition = -1;
        this.consecutiveNextCalls = 0;
    }
    
    /**
     * Create a new TokenStream starting from the given index
     * Useful for sub-parsing operations that need to start from a specific position
     * @param index - Starting index in the token array
     * @returns New TokenStream instance starting at the given index
     */
    cloneFrom(index: number): TokenStream {
        return new TokenStream(this.tokens, index);
    }
    
    /**
     * Set the current position directly
     * @param position - New position
     */
    setPosition(position: number): void {
        this.position = position;
        // Reset tracking when position is set manually
        this.lastNextPosition = -1;
        this.consecutiveNextCalls = 0;
    }
    
    /**
     * Get the current token without consuming it
     * @returns The current token, or null if at end
     */
    current(): Token | null {
        return this.peek(0);
    }
    
    /**
     * Look ahead at a token without consuming it
     * @param offset - Number of tokens to look ahead (default 0 = current token)
     * @returns The token at the given offset, or null if beyond end
     */
    peek(offset: number = 0): Token | null {
        const index = this.position + offset;
        if (index < 0 || index >= this.tokens.length) {
            return null;
        }
        return this.tokens[index];
    }
    
    /**
     * Consume and return the current token
     * @returns The current token, or null if at end
     * @throws Error if called multiple times at the same position (indicates infinite loop)
     */
    next(): Token | null {
        if (this.position >= this.tokens.length) {
            if (TokenStream.debug) {
                const timestamp = new Date().toISOString();
                console.log(`[TokenStream] [${timestamp}] next() - At end of stream (position: ${this.position}, total tokens: ${this.tokens.length})`);
            }
            return null;
        }
        
        // Detect if we're calling next() multiple times at the same position (infinite loop detection)
        if (this.position === this.lastNextPosition) {
            this.consecutiveNextCalls++;
            if (this.consecutiveNextCalls >= TokenStream.MAX_CONSECUTIVE_NEXT_AT_SAME_POSITION) {
                const token = this.tokens[this.position];
                throw new Error(`[TokenStream] Infinite loop detected! next() called ${this.consecutiveNextCalls} times at position ${this.position} without advancing. Token: ${token?.text || 'null'} (${token?.kind || 'EOF'}), line: ${token?.line || 'N/A'}`);
            }
            if (TokenStream.debug) {
                const timestamp = new Date().toISOString();
                console.log(`[TokenStream] [${timestamp}] WARNING: next() called ${this.consecutiveNextCalls} times at position ${this.position} without advancing`);
            }
        } else {
            // Position changed, reset counter
            this.consecutiveNextCalls = 0;
            this.lastNextPosition = this.position;
        }
        
        const token = this.tokens[this.position];
        const oldPosition = this.position;
        this.position++;
        
        if (TokenStream.debug) {
            const timestamp = new Date().toISOString();
            console.log(`[TokenStream] [${timestamp}] next() - Advanced from position ${oldPosition} to ${this.position}:`, {
                kind: token.kind,
                text: token.text,
                line: token.line,
                column: token.column,
                context: this.getCurrentContext()
            });
        }
        return token;
    }
    
    /**
     * Check if we're at the end of the token stream
     * @returns True if at EOF or beyond
     */
    isAtEnd(): boolean {
        const token = this.current();
        return token === null || token.kind === TokenKind.EOF;
    }
    
    /**
     * Check if the current token matches the given kind or text, without consuming it
     * @param kindOrText - TokenKind enum or string text to match
     * @returns True if the current token matches
     */
    check(kindOrText: TokenKind | string): boolean {
        const token = this.current();
        if (!token) return false;
        
        if (typeof kindOrText === 'string') {
            return token.text === kindOrText;
        } else {
            return token.kind === kindOrText;
        }
    }
    
    /**
     * If the current token matches, consume it and return true
     * Otherwise, return false without consuming
     * 
     * @param kindOrText - TokenKind enum or string text to match
     * @returns True if matched and consumed, false otherwise
     */
    match(kindOrText: TokenKind | string): boolean {
        if (this.check(kindOrText)) {
            this.next();
            return true;
        }
        return false;
    }
    
    /**
     * Expect the current token to match, consume it, and return it
     * If it doesn't match, throw an error
     * 
     * @param kindOrText - TokenKind enum or string text to expect
     * @param message - Optional custom error message
     * @returns The consumed token
     * @throws Error if token doesn't match
     */
    expect(kindOrText: TokenKind | string, message?: string): Token {
        const token = this.current();
        if (!token) {
            const errorMsg = message || `Expected ${kindOrText} but reached end of input`;
            throw new Error(errorMsg);
        }
        
        const matches = typeof kindOrText === 'string' 
            ? token.text === kindOrText 
            : token.kind === kindOrText;
        
        if (!matches) {
            const expected = typeof kindOrText === 'string' ? `'${kindOrText}'` : kindOrText;
            const errorMsg = message || `Expected ${expected} but got '${token.text}' at line ${token.line}, column ${token.column}`;
            throw new Error(errorMsg);
        }
        
        this.next();
        return token;
    }
    
    /**
     * Save the current position for potential backtracking
     * @returns The current position index
     */
    save(): number {
        return this.position;
    }
    
    /**
     * Restore a previously saved position (backtrack)
     * @param pos - The position to restore to
     */
    restore(pos: number): void {
        this.position = pos;
    }
    
    /**
     * Skip tokens of a specific kind (useful for skipping newlines, comments, etc.)
     * @param kind - The TokenKind to skip
     * @returns Number of tokens skipped
     */
    skip(kind: TokenKind): number {
        let count = 0;
        while (this.check(kind)) {
            this.next();
            count++;
        }
        return count;
    }
    
    /**
     * Skip all newline tokens
     * @returns Number of newlines skipped
     */
    skipNewlines(): number {
        return this.skip(TokenKind.NEWLINE);
    }
    
    /**
     * Consume tokens until a specific kind or text is found (exclusive)
     * @param kindOrText - The kind or text to stop at
     * @returns Array of consumed tokens (not including the stop token)
     */
    consumeUntil(kindOrText: TokenKind | string): Token[] {
        const consumed: Token[] = [];
        while (!this.isAtEnd() && !this.check(kindOrText)) {
            const token = this.next();
            if (token) consumed.push(token);
        }
        return consumed;
    }
    
    /**
     * Collect all tokens on the current line (until NEWLINE or EOF)
     * @returns Array of tokens on the current line
     */
    collectLine(): Token[] {
        const lineTokens: Token[] = [];
        while (!this.isAtEnd()) {
            const token = this.current();
            if (!token || token.kind === TokenKind.NEWLINE || token.kind === TokenKind.EOF) {
                break;
            }
            lineTokens.push(this.next()!);
        }
        return lineTokens;
    }
    
    /**
     * Get the current position in the stream
     * @returns Current position index
     */
    getPosition(): number {
        return this.position;
    }
    
    /**
     * Get the total number of tokens in the stream
     * @returns Total token count
     */
    getLength(): number {
        return this.tokens.length;
    }
    
    /**
     * Get all remaining tokens without consuming them
     * @returns Array of remaining tokens
     */
    remaining(): Token[] {
        return this.tokens.slice(this.position);
    }
    
    /**
     * Create a sub-stream from a range of tokens
     * Useful for parsing sub-expressions or blocks
     * 
     * @param start - Start position (inclusive)
     * @param end - End position (exclusive), defaults to current position
     * @returns New TokenStream instance
     */
    slice(start: number, end?: number): TokenStream {
        const endPos = end !== undefined ? end : this.position;
        return new TokenStream(this.tokens.slice(start, endPos));
    }
    
    /**
     * Format current position for error messages
     * @returns String like "line 10, column 5"
     */
    formatPosition(): string {
        const token = this.current();
        if (!token) {
            return 'end of input';
        }
        return `line ${token.line}, column ${token.column}`;
    }
    
    /**
     * Push a parsing context onto the context stack
     * @param context - The parsing context to enter
     */
    pushContext(context: ParsingContext): void {
        this.contextStack.push(context);
    }
    
    /**
     * Pop the most recent parsing context from the stack
     * @returns The context that was removed, or NONE if stack was empty
     */
    popContext(): ParsingContext {
        return this.contextStack.pop() || ParsingContext.NONE;
    }
    
    /**
     * Get the current parsing context (top of the stack)
     * @returns The current parsing context, or NONE if no context is active
     */
    getCurrentContext(): ParsingContext {
        return this.contextStack.length > 0 
            ? this.contextStack[this.contextStack.length - 1] 
            : ParsingContext.NONE;
    }
    
    /**
     * Check if we're currently in a specific parsing context
     * @param context - The context to check for
     * @returns True if we're in the given context (at any level)
     */
    isInContext(context: ParsingContext): boolean {
        return this.contextStack.includes(context);
    }
    
    /**
     * Get all active contexts (the entire stack)
     * @returns Array of contexts from bottom to top
     */
    getContextStack(): ParsingContext[] {
        return [...this.contextStack];
    }
    
    /**
     * Clear all parsing contexts
     */
    clearContexts(): void {
        this.contextStack = [];
    }
    
    /**
     * Create a new TokenStream with the same tokens and contexts
     * Useful for sub-parsing that should inherit context
     * @param startIndex - Optional starting index (defaults to current position)
     * @returns New TokenStream instance with copied context
     */
    cloneWithContext(startIndex?: number): TokenStream {
        const newStream = new TokenStream(this.tokens, startIndex ?? this.position);
        newStream.contextStack = [...this.contextStack];
        return newStream;
    }
    
    /**
     * Skip whitespace (newlines) and comments
     * Advances the stream past any consecutive newline or comment tokens
     */
    skipWhitespaceAndComments(): void {
        while (!this.isAtEnd()) {
            const token = this.current();
            if (!token) break;
            
            if (token.kind === TokenKind.NEWLINE || token.kind === TokenKind.COMMENT) {
                this.next();
                continue;
            }
            
            break;
        }
    }
}
