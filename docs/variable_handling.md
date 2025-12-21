# RobinPath Variable Handling

This document details how variables are managed, scoped, and accessed within the RobinPath runtime.

## Overview

RobinPath uses a dynamic scoping mechanism with a hierarchy of storage:
1.  **Local Scope**: Variables within the current function or isolated block.
2.  **Parent Scope**: Variables in the calling context (lexical or dynamic parents, depending on block type).
3.  **Global/Environment Scope**: Variables accessible everywhere.

## Mermaid Diagram

```mermaid
flowchart TD
    subgraph DataStructures [Data Structures]
        Env[Environment] -- contains --> Globals[Map: Global Variables]
        Env -- contains --> Consts[Set: Constants]
        
        Stack[Call Stack] -- contains --> Frames[List of Frames]
        
        Frame[Frame] -- contains --> Locals[Map: Local Variables]
        Frame -- contains --> LastVal[Last Value ($)]
        Frame -- property --> IsFunc[isFunctionFrame?]
        Frame -- property --> IsIso[isIsolatedScope?]
    end

    subgraph Assignment [Assignment Logic (setVariable)]
        StartSet([setVariable(name, value)]) --> CheckConst{Is Constant?}
        CheckConst -- Yes --> ErrConst[Error: Immutable]
        CheckConst -- No --> CheckIso{Is Isolated Scope?}
        
        CheckIso -- Yes --> SetLocal[Set in Current Locals]
        
        CheckIso -- No --> CheckLocal{Exists in Locals?}
        CheckLocal -- Yes --> SetLocal
        
        CheckLocal -- No --> LoopParents{Walk up Stack}
        LoopParents -- Found in Parent --> SetParent[Update Parent Variable]
        LoopParents -- Not Found --> CheckGlobal{Exists in Global?}
        
        CheckGlobal -- Yes --> SetGlobal[Update Global Variable]
        CheckGlobal -- No --> CreateNew{Context Type?}
        
        CreateNew -- Function Frame --> CreateLocal[Create New Local]
        CreateNew -- Global/Root --> CreateGlobal[Create New Global]
        CreateNew -- Block/Subexpr --> CreateGlobal
    end

    subgraph Retrieval [Retrieval Logic (getVariable)]
        StartGet([getVariable(name)]) --> GetLocal{In Locals?}
        GetLocal -- Yes --> RetVal([Return Value])
        
        GetLocal -- No --> GetParent{Walk up Stack}
        GetParent -- Found --> RetVal
        
        GetParent -- Not Found --> GetGlobal{In Globals?}
        GetGlobal -- Yes --> RetVal
        GetGlobal -- No --> RetNull([Return Undefined/Null])
    end
```

## Detailed Logic

### 1. Storage Layers

*   **Environment Variables**: The execution environment holds a global map of variables. These persist across function calls and potentially across script executions if the environment is reused.
*   **Constants**: Also stored in the environment. Once defined (e.g., via `const`), they cannot be changed.
*   **Stack Frames**: Every time a function is called or a significant scope is entered, a `Frame` is pushed onto the `callStack`.
    *   `locals`: A Map storing variables specific to this frame.
    *   `lastValue`: Stores the result of the last operation (accessed via `$`).

### 2. Scoping Rules

*   **Function Scope (`def`)**: Functions create a boundary. Variables defined inside a function (using `var` or implicitly on assignment) are local to that function unless they already exist globally.
*   **Isolated Scope (`together`, `spawn`)**: Some blocks run in isolation. They can read from the environment but typically have their own stack or are prevented from modifying parent stack variables to avoid race conditions.
*   **Block Scope (`if`, `for`)**: Standard blocks do **not** create a fully isolated scope barrier for *reading*. They share the parent's variables. However, `for` loop iterators are typically set in the current frame's locals.

### 3. The `$` Variable
The `$` variable is special. It represents the result of the previously executed statement or command.
- It is tracked per-frame in `Frame.lastValue`.
- It allows for chaining logic (e.g., `calc 1 + 1` followed by `print $`).

### 4. Path Assignment (`$obj.prop`)
When assigning to a property (e.g., `$user.name = "Alice"`):
1.  The base variable (`user`) is resolved using the standard logic.
2.  If it doesn't exist, it might be auto-created as an object.
3.  The property path is traversed, and the value is set on the object reference.
