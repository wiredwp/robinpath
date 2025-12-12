import { parentPort, workerData } from 'worker_threads';

const { timeoutMs } = workerData;

if (!timeoutMs || typeof timeoutMs !== 'number' || timeoutMs <= 0) {
    console.error('Timeout worker: Invalid timeoutMs:', timeoutMs);
    process.exit(1);
}

// Log that worker started (this goes to stderr, not parentPort)
console.error(`[Timeout Worker] Started with timeout: ${timeoutMs}ms`);

// Set up timeout that will send message after specified time
// This worker runs in a separate thread, so it can send messages even if main thread is frozen
// The setTimeout keeps the worker thread's event loop alive until it fires
const timeoutId = setTimeout(() => {
    console.error(`[Timeout Worker] Timeout fired after ${timeoutMs}ms`);
    if (parentPort) {
        try {
            console.error('[Timeout Worker] Sending timeout message to parent');
            parentPort.postMessage({ timeout: true });
            console.error('[Timeout Worker] Message sent successfully');
        } catch (err) {
            console.error('[Timeout Worker] Error sending message:', err);
            // If parent is already terminated, that's okay - just exit
            process.exit(0);
        }
    } else {
        console.error('[Timeout Worker] No parentPort available');
        process.exit(0);
    }
}, timeoutMs);

// Prevent the worker from exiting until the timeout fires
// The setTimeout creates an active handle, but we also need to prevent premature exit
// Use setInterval to keep the event loop active (as a backup)
const keepAlive = setInterval(() => {
    // This interval keeps the worker alive
    // It will be cleared when the timeout fires
}, 1000);

// Clear the keep-alive interval when timeout fires
setTimeout(() => {
    clearInterval(keepAlive);
}, timeoutMs + 100);

// Log if worker is about to exit prematurely
process.on('beforeExit', (code) => {
    console.error(`[Timeout Worker] beforeExit event with code: ${code}`);
});

process.on('exit', (code) => {
    console.error(`[Timeout Worker] exit event with code: ${code}`);
});
