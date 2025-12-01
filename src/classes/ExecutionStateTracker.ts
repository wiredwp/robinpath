/**
 * Tracks execution state for each statement in the AST
 */

import type { Value } from '../utils';

export class ExecutionStateTracker {
    private state: Map<number, { lastValue: Value; beforeValue: Value }> = new Map();

    setState(index: number, state: { lastValue: Value; beforeValue: Value }): void {
        this.state.set(index, state);
    }

    getState(index: number): { lastValue: Value; beforeValue: Value } | undefined {
        return this.state.get(index);
    }
}

