import type { 
    BuiltinHandler, 
    FunctionMetadata, 
    ModuleMetadata,
    ModuleAdapter
} from '../index';

/**
 * Time module for RobinPath
 * Provides date/time operations and utilities
 */

export const TimeFunctions: Record<string, BuiltinHandler> = {
    now: () => {
        return new Date().toISOString();
    },

    timestamp: () => {
        return Date.now();
    },

    format: (args) => {
        const value = args[0];
        // Pattern is reserved for future use
        // const pattern = args[1] !== undefined ? String(args[1]) : undefined;
        
        let date: Date;
        if (typeof value === 'string') {
            date = new Date(value);
        } else if (typeof value === 'number') {
            date = new Date(value);
        } else {
            throw new Error('Value must be a date string or timestamp');
        }
        
        if (isNaN(date.getTime())) {
            throw new Error('Invalid date');
        }
        
        // For now, just return ISO string (can be extended later with pattern support)
        return date.toISOString();
    },

    addDays: (args) => {
        const iso = String(args[0] ?? '');
        const days = Number(args[1]) || 0;
        
        const date = new Date(iso);
        if (isNaN(date.getTime())) {
            throw new Error('Invalid date string');
        }
        
        date.setDate(date.getDate() + days);
        return date.toISOString();
    },

    diffDays: (args) => {
        const iso1 = String(args[0] ?? '');
        const iso2 = String(args[1] ?? '');
        
        const date1 = new Date(iso1);
        const date2 = new Date(iso2);
        
        if (isNaN(date1.getTime()) || isNaN(date2.getTime())) {
            throw new Error('Invalid date string');
        }
        
        const diffMs = date2.getTime() - date1.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        return diffDays;
    },

    sleep: async (args) => {
        const ms = Number(args[0]) || 0;
        if (ms < 0) {
            throw new Error('Sleep duration must be non-negative');
        }
        await new Promise(resolve => setTimeout(resolve, ms));
        return null;
    }
};

export const TimeFunctionMetadata: Record<string, FunctionMetadata> = {
    now: {
        description: 'Returns the current date and time as an ISO string',
        parameters: [],
        returnType: 'string',
        returnDescription: 'Current date/time in ISO 8601 format',
        example: 'time.now  # Returns current ISO date string like "2024-01-15T10:30:00.000Z"'
    },

    timestamp: {
        description: 'Returns the current timestamp in milliseconds',
        parameters: [],
        returnType: 'number',
        returnDescription: 'Current timestamp in milliseconds since Unix epoch',
        example: 'time.timestamp  # Returns current timestamp like 1705312200000'
    },

    format: {
        description: 'Formats a date value (currently returns ISO string)',
        parameters: [
            {
                name: 'value',
                dataType: 'string',
                description: 'Date string or timestamp to format',
                formInputType: 'text',
                required: true
            },
            {
                name: 'pattern',
                dataType: 'string',
                description: 'Format pattern (currently unused, returns ISO)',
                formInputType: 'text',
                required: false
            }
        ],
        returnType: 'string',
        returnDescription: 'Formatted date as ISO string',
        example: 'time.format "2024-01-15"  # Returns ISO formatted date string'
    },

    addDays: {
        description: 'Adds a number of days to a date',
        parameters: [
            {
                name: 'iso',
                dataType: 'string',
                description: 'ISO date string',
                formInputType: 'text',
                required: true
            },
            {
                name: 'days',
                dataType: 'number',
                description: 'Number of days to add (can be negative)',
                formInputType: 'number',
                required: true
            }
        ],
        returnType: 'string',
        returnDescription: 'New date as ISO string',
        example: 'time.addDays "2024-01-15T00:00:00.000Z" 7  # Returns date 7 days later'
    },

    diffDays: {
        description: 'Calculates the difference in days between two dates',
        parameters: [
            {
                name: 'iso1',
                dataType: 'string',
                description: 'First ISO date string',
                formInputType: 'text',
                required: true
            },
            {
                name: 'iso2',
                dataType: 'string',
                description: 'Second ISO date string',
                formInputType: 'text',
                required: true
            }
        ],
        returnType: 'number',
        returnDescription: 'Number of days difference (iso2 - iso1)',
        example: 'time.diffDays "2024-01-01" "2024-01-08"  # Returns 7'
    },

    sleep: {
        description: 'Pauses execution for a specified number of milliseconds',
        parameters: [
            {
                name: 'ms',
                dataType: 'number',
                description: 'Number of milliseconds to sleep',
                formInputType: 'number',
                required: true
            }
        ],
        returnType: 'null',
        returnDescription: 'Returns null after the sleep duration',
        example: 'time.sleep 1000  # Pauses execution for 1 second'
    }
};

export const TimeModuleMetadata: ModuleMetadata = {
    description: 'Date and time operations including current time, formatting, date arithmetic, and sleep functionality',
    methods: [
        'now',
        'timestamp',
        'format',
        'addDays',
        'diffDays',
        'sleep'
    ]
};

// Module adapter for auto-loading
const TimeModule: ModuleAdapter = {
    name: 'time',
    functions: TimeFunctions,
    functionMetadata: TimeFunctionMetadata,
    moduleMetadata: TimeModuleMetadata,
    global: false
};

export default TimeModule;

