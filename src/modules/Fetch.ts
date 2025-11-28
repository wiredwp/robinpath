import type { 
    BuiltinHandler, 
    FunctionMetadata, 
    ModuleMetadata,
    ModuleAdapter
} from '../index';
import { extractNamedArgs } from '../index';

/**
 * Fetch module for RobinPath
 * Provides HTTP request operations using the native fetch API
 */

interface FetchOptions {
    url: string;
    body?: any;
    headers?: Record<string, string>;
    method?: string;
}

const parseFetchOptions = (args: any[]): FetchOptions => {
    // Use the utility function to extract named arguments
    const { positionalArgs, namedArgs } = extractNamedArgs(args);
    
    // Debug: log what we received
    // console.log('parseFetchOptions - args:', JSON.stringify(args));
    // console.log('parseFetchOptions - positionalArgs:', JSON.stringify(positionalArgs));
    // console.log('parseFetchOptions - namedArgs:', JSON.stringify(namedArgs));
    
    // Extract url from named args or first positional arg
    let url: string | undefined;
    if (namedArgs.url !== undefined) {
        // Ensure URL is a string
        if (typeof namedArgs.url !== 'string') {
            throw new Error(`url must be a string, got ${typeof namedArgs.url}: ${JSON.stringify(namedArgs.url)}`);
        }
        url = namedArgs.url;
    } else if (positionalArgs.length > 0) {
        // Ensure URL is a string
        if (typeof positionalArgs[0] !== 'string') {
            throw new Error(`url must be a string, got ${typeof positionalArgs[0]}: ${JSON.stringify(positionalArgs[0])}`);
        }
        url = positionalArgs[0];
    }
    
    // Validate URL
    if (!url || typeof url !== 'string' || url.trim() === '' || url === 'undefined' || url === 'null') {
        throw new Error(`url is required and must be a non-empty string. Received: ${JSON.stringify(url)}. Use url="..." or pass as first positional argument`);
    }
    
    // Additional validation - check for obviously invalid URLs
    url = url.trim();
    if (url.length < 4 || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        throw new Error(`Invalid URL format: "${url}". URL must start with http:// or https://`);
    }
    
    // Extract body from named args or second positional arg
    let body: any = undefined;
    if (namedArgs.body !== undefined) {
        body = namedArgs.body;
    } else if (positionalArgs.length > 1) {
        body = positionalArgs[1];
    }
    
    // Extract headers from named args or third positional arg
    let headers: Record<string, string> | undefined = undefined;
    if (namedArgs.headers !== undefined) {
        const headersVal = namedArgs.headers;
        if (typeof headersVal === 'object' && headersVal !== null && !Array.isArray(headersVal)) {
            headers = headersVal as Record<string, string>;
        }
    } else if (positionalArgs.length > 2) {
        const headersVal = positionalArgs[2];
        if (typeof headersVal === 'object' && headersVal !== null && !Array.isArray(headersVal)) {
            headers = headersVal as Record<string, string>;
        }
    }
    
    return {
        url,
        body,
        headers,
        method: namedArgs.method ? String(namedArgs.method).toUpperCase() : undefined
    };
};

const executeFetch = async (options: FetchOptions, defaultMethod: string): Promise<any> => {
    const method = options.method || defaultMethod;
    const headers: Record<string, string> = {
        ...(options.headers || {})
    };
    
    // Set Content-Type to application/json if body is provided and no Content-Type header is set
    if (options.body !== undefined && !headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
    }
    
    const fetchOptions: RequestInit = {
        method,
        headers: Object.keys(headers).length > 0 ? headers : undefined
    };
    
    // Add body for methods that support it
    if (options.body !== undefined && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        if (typeof options.body === 'string') {
            fetchOptions.body = options.body;
        } else {
            fetchOptions.body = JSON.stringify(options.body);
        }
    }
    
    try {
        // Validate URL before calling fetch
        if (!options.url || typeof options.url !== 'string') {
            throw new Error(`Invalid URL: ${JSON.stringify(options.url)}`);
        }
        const response = await fetch(options.url, fetchOptions);
        
        // Try to parse as JSON, fallback to text
        let data: any;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            try {
                data = await response.json();
            } catch {
                data = await response.text();
            }
        } else {
            data = await response.text();
        }
        
        return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            data: data
        };
    } catch (error) {
        throw new Error(`Fetch failed: ${error instanceof Error ? error.message : String(error)}`);
    }
};

export const FetchFunctions: Record<string, BuiltinHandler> = {
    get: async (args) => {
        const options = parseFetchOptions(args);
        return await executeFetch(options, 'GET');
    },

    post: async (args) => {
        const options = parseFetchOptions(args);
        return await executeFetch(options, 'POST');
    },

    delete: async (args) => {
        const options = parseFetchOptions(args);
        return await executeFetch(options, 'DELETE');
    },

    put: async (args) => {
        const options = parseFetchOptions(args);
        return await executeFetch(options, 'PUT');
    }
};

export const FetchFunctionMetadata: Record<string, FunctionMetadata> = {
    get: {
        description: 'Performs an HTTP GET request',
        parameters: [
            {
                name: 'url',
                dataType: 'string',
                description: 'URL to fetch from',
                formInputType: 'text',
                required: true
            },
            {
                name: 'headers',
                dataType: 'object',
                description: 'HTTP headers as key-value pairs',
                formInputType: 'json',
                required: false
            }
        ],
        returnType: 'object',
        returnDescription: 'Response object with ok, status, statusText, headers, and data properties',
        example: 'fetch.get(url="https://api.example.com/data", headers=obj`{"Authorization": "Bearer token"}`)'
    },

    post: {
        description: 'Performs an HTTP POST request',
        parameters: [
            {
                name: 'url',
                dataType: 'string',
                description: 'URL to send request to',
                formInputType: 'text',
                required: true
            },
            {
                name: 'body',
                dataType: 'any',
                description: 'Request body (will be JSON stringified if object)',
                formInputType: 'json',
                required: false
            },
            {
                name: 'headers',
                dataType: 'object',
                description: 'HTTP headers as key-value pairs',
                formInputType: 'json',
                required: false
            }
        ],
        returnType: 'object',
        returnDescription: 'Response object with ok, status, statusText, headers, and data properties',
        example: 'fetch.post(url="https://api.example.com/users", body=obj`{"name": "John"}`, headers=obj`{"Content-Type": "application/json"}`)'
    },

    delete: {
        description: 'Performs an HTTP DELETE request',
        parameters: [
            {
                name: 'url',
                dataType: 'string',
                description: 'URL to delete resource at',
                formInputType: 'text',
                required: true
            },
            {
                name: 'headers',
                dataType: 'object',
                description: 'HTTP headers as key-value pairs',
                formInputType: 'json',
                required: false
            }
        ],
        returnType: 'object',
        returnDescription: 'Response object with ok, status, statusText, headers, and data properties',
        example: 'fetch.delete(url="https://api.example.com/users/123", headers=obj`{"Authorization": "Bearer token"}`)'
    },

    put: {
        description: 'Performs an HTTP PUT request',
        parameters: [
            {
                name: 'url',
                dataType: 'string',
                description: 'URL to send request to',
                formInputType: 'text',
                required: true
            },
            {
                name: 'body',
                dataType: 'any',
                description: 'Request body (will be JSON stringified if object)',
                formInputType: 'json',
                required: false
            },
            {
                name: 'headers',
                dataType: 'object',
                description: 'HTTP headers as key-value pairs',
                formInputType: 'json',
                required: false
            }
        ],
        returnType: 'object',
        returnDescription: 'Response object with ok, status, statusText, headers, and data properties',
        example: 'fetch.put(url="https://api.example.com/users/123", body=obj`{"name": "Jane"}`, headers=obj`{"Content-Type": "application/json"}`)'
    }
};

export const FetchModuleMetadata: ModuleMetadata = {
    description: 'HTTP request operations using the native fetch API. Supports GET, POST, DELETE, and PUT methods.',
    methods: [
        'get',
        'post',
        'delete',
        'put'
    ]
};

// Module adapter for auto-loading
const FetchModule: ModuleAdapter = {
    name: 'fetch',
    functions: FetchFunctions,
    functionMetadata: FetchFunctionMetadata,
    moduleMetadata: FetchModuleMetadata,
    global: false
};

export default FetchModule;

