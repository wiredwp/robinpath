import type { 
    BuiltinHandler, 
    BuiltinCallback,
    FunctionMetadata, 
    ModuleMetadata,
    ModuleAdapter,
    Value
} from '../index';

/**
 * Dom module for RobinPath
 * Provides DOM manipulation and event handling operations
 */

export const DomFunctions: Record<string, BuiltinHandler> = {
    click: async (args, callback?: BuiltinCallback | null) => {
        const queryName = String(args[0] ?? '');
        
        // Simulate clicking an element (in a real implementation, this would interact with the DOM)
        // For now, we'll just log and call the callback if provided
        console.log(`[DOM] Clicking element: ${queryName}`);
        
        // If callback is provided, call it with event data
        if (callback) {
            // Simulate event data that would be passed to the callback
            const eventData: Value[] = [
                { type: 'click', target: queryName }, // $1 - event object
                queryName // $2 - query name
            ];
            
            const callbackResult = await Promise.resolve(callback(eventData));
            return callbackResult !== undefined ? callbackResult : null;
        }
        
        return null;
    }
};

export const DomFunctionMetadata: Record<string, FunctionMetadata> = {
    click: {
        description: 'Simulates a click event on an element identified by query name. Optionally accepts a do callback block.',
        parameters: [
            {
                name: 'queryName',
                dataType: 'string',
                description: 'Query selector or identifier for the element to click',
                formInputType: 'text',
                required: true
            }
        ],
        returnType: 'null',
        returnDescription: 'Returns null, or the result of the callback if a do block is provided',
        example: 'dom.click "button" do\n  log "Clicked:" $1\nenddo'
    }
};

export const DomModuleMetadata: ModuleMetadata = {
    description: 'DOM manipulation and event handling operations including element clicking with callback support',
    methods: [
        'click'
    ]
};

// Module adapter for auto-loading
const DomModule: ModuleAdapter = {
    name: 'dom',
    functions: DomFunctions,
    functionMetadata: DomFunctionMetadata,
    moduleMetadata: DomModuleMetadata,
    global: false
};

export default DomModule;

