import type { Value } from '../utils';
import type { 
    DefineFunction, 
    OnBlock,
    Arg
} from './Ast.type';

export type BuiltinCallback = (callbackArgs: Value[]) => Promise<Value> | Value | null;
export type BuiltinHandler = (args: Value[], callback?: BuiltinCallback | null) => Promise<Value> | Value | null;
export type DecoratorHandler = (targetName: string, func: DefineFunction | null, originalArgs: Value[], decoratorArgs: Value[], originalDecoratorArgs?: Arg[]) => Promise<Value[] | Value | null | undefined>;
export type ParseDecoratorHandler = (targetName: string, func: DefineFunction | null, decoratorArgs: Arg[], environment: Environment) => Promise<void> | void;

export interface Environment {
    variables: Map<string, Value>;
    functions: Map<string, DefineFunction>;
    builtins: Map<string, BuiltinHandler>;
    decorators: Map<string, DecoratorHandler>; // Runtime decorators
    parseDecorators: Map<string, ParseDecoratorHandler>; // Parse-time decorators
    metadata: Map<string, FunctionMetadata>;
    moduleMetadata: Map<string, ModuleMetadata>;
    currentModule: string | null; // Current module context set by "use" command
    variableMetadata: Map<string, Map<string, Value>>; // variable name -> (meta key -> value)
    functionMetadata: Map<string, Map<string, Value>>; // function name -> (meta key -> value)
    constants: Set<string>; // Set of constant variable names (cannot be reassigned)
    eventHandlers: Map<string, OnBlock[]>; // event name -> array of event handlers
}

export interface Frame {
    locals: Map<string, Value>;
    lastValue: Value;
    isFunctionFrame?: boolean; // True if this frame is from a function (def/enddef), false/undefined if from subexpression
    forgotten?: Set<string>; // Names of variables/functions forgotten in this scope
    isIsolatedScope?: boolean; // True if this frame is from a scope with parameters (isolated, no parent access)
}

export type DataType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null' | 'any';

export type FormInputType = 
    | 'text' 
    | 'number' 
    | 'textarea' 
    | 'select' 
    | 'checkbox' 
    | 'radio' 
    | 'date' 
    | 'datetime' 
    | 'file' 
    | 'json'
    | 'code';

export interface ParameterMetadata {
    name: string;
    label?: string; // Display label for the parameter (e.g., "Arguments" for variadic parameters)
    dataType: DataType;
    description: string;
    formInputType: FormInputType;
    required?: boolean;
    defaultValue?: Value;
    children?: ParameterMetadata; // Schema for array/list items (for variable arguments)
}

export interface FunctionMetadata {
    description: string;
    parameters: ParameterMetadata[];
    returnType: DataType;
    returnDescription: string;
    example?: string; // Optional example usage
}

export interface ModuleMetadata {
    description: string;
    methods: string[];
}

