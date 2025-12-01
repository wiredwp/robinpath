/**
 * Shared types for utility functions
 */

export type Value = string | number | boolean | null | object;

export type AttributePathSegment = 
    | { type: 'property'; name: string }      // .propertyName
    | { type: 'index'; index: number };        // [35]

