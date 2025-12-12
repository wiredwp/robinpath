import { parentPort, workerData } from 'worker_threads';
import { RobinPath } from '../dist/index.js';
import { readFileSync } from 'fs';

const { testFilePath, isCaseTest } = workerData;

(async () => {
    try {
        if (isCaseTest) {
             // For case tests, we import the module and run its runTest function
             // Ensure it's a file URL
             const importPath = testFilePath.startsWith('file://') ? testFilePath : `file://${testFilePath}`;
             const caseModule = await import(importPath);
             
             if (typeof caseModule.runTest !== 'function') {
                throw new Error(`Test case must export a runTest function`);
             }
             await caseModule.runTest();
        } else {
             // For RP script tests, we read the file and execute it with RobinPath
             const testScript = readFileSync(testFilePath, 'utf-8');
             const rp = new RobinPath();
             await rp.executeScript(testScript);
        }
        if (parentPort) {
            parentPort.postMessage({ success: true });
        } else {
            process.exit(0);
        }
    } catch (error) {
        if (parentPort) {
            parentPort.postMessage({ success: false, error: error.message, stack: error.stack });
        } else {
            console.error(error);
            process.exit(1);
        }
    }
})();
