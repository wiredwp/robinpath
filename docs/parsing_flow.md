# RobinPath Parsing Flow

This document outlines how RobinPath source code is parsed into an Abstract Syntax Tree (AST).

## Overview

The parsing process consists of two main stages:
1.  **Lexical Analysis (Lexer)**: Converts the raw source code string into a stream of tokens.
2.  **Syntactic Analysis (Parser)**: Consumes the token stream and constructs the AST based on the language grammar.

## Mermaid Diagram

```mermaid
flowchart TD
    Start([Source Code String]) --> Lexer
    
    subgraph Lexer [Lexical Analysis]
        direction TB
        L_Init[Initialize Lexer]
        L_Loop{End of Source?}
        L_Match[Match Token Pattern]
        L_Emit[Emit Token]
        L_Error[Lexer Error]
        
        L_Init --> L_Loop
        L_Loop -- No --> L_Match
        L_Loop -- Yes --> L_Done([Token Stream])
        
        L_Match -- "Whitespace" --> L_Loop
        L_Match -- "Comment (#)" --> L_Emit
        L_Match -- "String" --> L_Emit
        L_Match -- "Number" --> L_Emit
        L_Match -- "Boolean/Null" --> L_Emit
        L_Match -- "Keyword" --> L_Emit
        L_Match -- "Identifier" --> L_Emit
        L_Match -- "Operator/Punctuation" --> L_Emit
        L_Match -- "Unknown" --> L_Error
        
        L_Emit --> L_Loop
    end
    
    L_Done --> Parser
    
    subgraph Parser [Syntactic Analysis]
        direction TB
        P_Init[Initialize Parser with Token Stream]
        P_Loop{End of Stream?}
        P_Peek[Peek Current Token]
        P_Dispatch{Dispatch based on Token Type}
        
        P_Init --> P_Loop
        P_Loop -- Yes --> P_Done([AST Statement[]])
        P_Loop -- No --> P_Peek
        P_Peek --> P_Dispatch
        
        %% Control Flow Parsers
        P_Dispatch -- "if" --> P_If[Parse IfBlock]
        P_Dispatch -- "for" --> P_For[Parse ForLoop]
        P_Dispatch -- "while/repeat" --> P_LoopBlock[Parse Loop]
        P_Dispatch -- "together" --> P_Together[Parse TogetherBlock]
        P_Dispatch -- "try" --> P_Try[Parse TryCatch]
        
        %% Definition Parsers
        P_Dispatch -- "def" --> P_Def[Parse Function Definition]
        P_Dispatch -- "on" --> P_On[Parse Event Handler]
        
        %% Structure Parsers
        P_Dispatch -- "{" --> P_Obj[Parse Object Literal]
        P_Dispatch -- "[" --> P_Arr[Parse Array Literal]
        P_Dispatch -- "$(" --> P_Sub[Parse Subexpression]
        
        %% Simple Statements
        P_Dispatch -- "return" --> P_Ret[Parse Return]
        P_Dispatch -- "break" --> P_Break[Parse Break]
        P_Dispatch -- "continue" --> P_Cont[Parse Continue]
        P_Dispatch -- "@" --> P_Dec[Parse Decorator]
        P_Dispatch -- "#" --> P_Comment[Parse Comment]
        
        %% Default Cases
        P_Dispatch -- "Identifier/Variable" --> P_CheckAssign{Is Assignment?}
        P_CheckAssign -- Yes (=) --> P_Assign[Parse Assignment]
        P_CheckAssign -- No --> P_Cmd[Parse Command]
        
        %% Statement Completion
        P_If --> P_Add[Add to Statements]
        P_For --> P_Add
        P_LoopBlock --> P_Add
        P_Together --> P_Add
        P_Try --> P_Add
        P_Def --> P_Add
        P_On --> P_Add
        P_Obj --> P_Add
        P_Arr --> P_Add
        P_Sub --> P_Add
        P_Ret --> P_Add
        P_Break --> P_Add
        P_Cont --> P_Add
        P_Dec --> P_Buffer[Buffer Decorator]
        P_Comment --> P_Pending[Buffer Comment]
        P_Assign --> P_Add
        P_Cmd --> P_Add
        
        P_Buffer --> P_Loop
        P_Pending --> P_Loop
        P_Add --> P_Loop
    end
```

## Key Components

### 1. Lexer (`Lexer.ts`)
The Lexer iterates through the source code character by character (or using regex) to identify meaningful units called tokens. It handles:
- **Skipping Whitespace**: Spaces and tabs are generally ignored unless inside strings.
- **Literals**: Parsing strings (quoted), numbers, booleans, and null.
- **Keywords**: Identifying reserved words like `if`, `def`, `return`.
- **Identifiers**: Variable names and command names.
- **Operators**: Math operators, comparison operators, etc.
- **Comments**: Capturing comments starting with `#`.

### 2. Parser (`Parser.ts`)
The Parser takes the list of tokens and organizes them into a hierarchical structure (AST). It uses a recursive descent approach.

- **TokenStream**: A helper to navigate the token list (peek, consume, match).
- **Dispatching**: The main loop looks at the current token to decide which specific parser method to call (e.g., if it sees `if`, it calls `parseIf`).
- **Specific Parsers**:
    - `IfBlockParser`: Handles `if...elseif...else...endif`.
    - `ForLoopParser`: Handles `for item in list...endfor`.
    - `CommandParser`: Handles function/command calls like `print "hello"`.
    - `AssignmentParser`: Handles variable assignment like `$x = 10`.
    - `DefineParser`: Handles function definitions.
    - `ObjectLiteralParser` / `ArrayLiteralParser`: Handles JSON-like structures.

### 3. AST (Abstract Syntax Tree)
The result is an array of `Statement` objects. Each statement node contains relevant information:
- **Type**: The kind of statement (e.g., `StatementType.IF`, `StatementType.COMMAND`).
- **Position**: Line and column number for debugging/errors.
- **Properties**: Specific data for that node (e.g., `condition` and `consequent` for an If node).
