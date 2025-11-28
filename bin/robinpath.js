#!/usr/bin/env node

import { createInterface } from 'readline';
import { RobinPath } from '../dist/index.js';

// Create interpreter instance with thread control enabled and start a thread for REPL
const rp = new RobinPath({ threadControl: true });
rp.createThread('default'); // Creates and sets as currentThread

// Helper function to get the prompt with thread ID and current module
function getPrompt() {
    if (!rp.currentThread) return '> ';
    const threadId = rp.currentThread.id;
    const currentModule = rp.currentThread.getCurrentModule();
    if (currentModule) {
        return `${threadId}@${currentModule}> `;
    }
    return `${threadId}> `;
}

// Create readline interface (prompt will be updated after thread is ready)
const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
});

// Set the initial prompt with current module
rl.setPrompt(getPrompt());

// State for multi-line blocks
let accumulatedLines = [];

// Helper function to check if a line ends with backslash (ignoring trailing whitespace)
function endsWithBackslash(line) {
    const trimmed = line.trimEnd();
    return trimmed.endsWith('\\');
}

// Process a line of input
async function processLine(line) {
    const trimmed = line.trim();
    
    // Skip empty lines
    if (!trimmed) {
        return;
    }
    
    // Handle exit commands
    if (trimmed === 'exit' || trimmed === 'quit' || trimmed === '.exit' || trimmed === '.quit') {
        console.log('Goodbye!');
        rl.close();
        process.exit(0);
        return;
    }
    
    // Handle help
    if (trimmed === 'help' || trimmed === '.help') {
        console.log(`
RobinPath REPL Commands:
  exit, quit, .exit, .quit  - Exit the REPL
  help, .help                - Show this help message
  clear, .clear              - Clear the screen
  
Multi-line blocks:
  def <name> ... enddef  - Define a function
  if <expr> ... endif    - Conditional block
  for $var in <expr> ... endfor  - Loop block
  scope ... endscope     - Scope block
  fn(...)                - Parenthesized function call (multi-line)
  <line> \\              - Backslash line continuation
  
Examples:
  math.add 10 20
  log $
  
  def greet
  $1
  $2
  log "Hello" $1
  enddef
  
  greet "Alice" 25
  
  for $i in range 1 5
    log "i =" $i
  endfor
  
  log "this is a long message " \\
      "that continues on the next line"
        `);
        return;
    }
    
    // Handle clear
    if (trimmed === 'clear' || trimmed === '.clear') {
        console.clear();
        return;
    }
    
    // Handle ".." command - show available commands
    if (trimmed === '..') {
        let commands;
        if (rp.currentThread) {
            commands = rp.currentThread.getAvailableCommands();
        } else {
            commands = rp.getAvailableCommands();
        }
        
        // Just show JSON
        console.log(JSON.stringify(commands, null, 2));
        return;
    }
    
    // If we have accumulated lines, add this line and check if block is complete
    if (accumulatedLines.length > 0) {
        accumulatedLines.push(line);
        const script = accumulatedLines.join('\n');
        
        // Check if line ends with backslash - if so, continue accumulating
        if (endsWithBackslash(line)) {
            // Still in continuation mode, update prompt
            if (!rp.currentThread) {
                rl.setPrompt(`... `);
            } else {
                const threadId = rp.currentThread.id;
                const currentModule = rp.currentThread.getCurrentModule();
                if (currentModule) {
                    rl.setPrompt(`[${threadId}]@[${currentModule}]... `);
                } else {
                    rl.setPrompt(`[${threadId}]... `);
                }
            }
            return;
        }
        
        // Check if the block is now complete using the built-in method
        let needsMore;
        if (rp.currentThread) {
            needsMore = rp.currentThread.needsMoreInput(script);
        } else {
            needsMore = rp.needsMoreInput(script);
        }
        
        if (!needsMore.needsMore) {
            // Block is complete, execute it
            const finalScript = accumulatedLines.join('\n');
            accumulatedLines = [];
            
            try {
                let result;
                if (rp.currentThread) {
                    // Execute in current thread
                    result = await rp.currentThread.executeScript(finalScript);
                } else {
                    // Execute in global thread (root RobinPath instance)
                    result = await rp.executeScript(finalScript);
                }
                
                // Check if result is from explain command (structured object)
                if (result && typeof result === 'object' && !Array.isArray(result) && result.type) {
                    if (result.type === 'function') {
                        // Format function documentation
                        console.log(`\nFunction: ${result.name}`);
                        console.log(`\nDescription: ${result.description}\n`);
                        
                        if (result.parameters && result.parameters.length > 0) {
                            console.log('Parameters:');
                            for (const param of result.parameters) {
                                let paramLine = `  - ${param.name} (${param.dataType})`;
                                if (param.required) {
                                    paramLine += ' [required]';
                                }
                                console.log(paramLine);
                                console.log(`    ${param.description}`);
                                if (param.formInputType) {
                                    console.log(`    Input type: ${param.formInputType}`);
                                }
                                if (param.defaultValue !== undefined) {
                                    console.log(`    Default: ${JSON.stringify(param.defaultValue)}`);
                                }
                            }
                        } else {
                            console.log('Parameters: None');
                        }
                        
                        console.log(`\nReturns: ${result.returnType}`);
                        if (result.returnDescription) {
                            console.log(`  ${result.returnDescription}`);
                        }
                        console.log('');
                    } else if (result.type === 'module') {
                        // Format module documentation
                        console.log(`\nModule: ${result.name}`);
                        console.log(`\nDescription: ${result.description}\n`);
                        
                        if (result.methods && result.methods.length > 0) {
                            console.log('Available Methods:');
                            for (const method of result.methods) {
                                console.log(`  - ${method}`);
                            }
                        } else {
                            console.log('Available Methods: None');
                        }
                        console.log('');
                    } else if (result.error) {
                        console.log(result.error);
                    }
                } else if (result && typeof result === 'object' && result.error) {
                    // Handle error objects
                    console.log(result.error);
                } else if (result !== null && result !== undefined) {
                    // Only show result if it's meaningful
                    // (log commands already print, so we don't need to show null)
                }
            } catch (error) {
                console.error(`Error: ${error.message}`);
            }
            
            // Reset prompt after block execution
            rl.setPrompt(getPrompt());
        } else {
            // Still in block mode, update prompt to show continuation
            if (!rp.currentThread) {
                rl.setPrompt(`... `);
            } else {
                const threadId = rp.currentThread.id;
                const currentModule = rp.currentThread.getCurrentModule();
                if (currentModule) {
                    rl.setPrompt(`[${threadId}]@[${currentModule}]... `);
                } else {
                    rl.setPrompt(`[${threadId}]... `);
                }
            }
        }
        
        return;
    }
    
    // Check if this line ends with backslash - if so, enter continuation mode
    if (endsWithBackslash(line)) {
        accumulatedLines = [line];
        if (!rp.currentThread) {
            rl.setPrompt(`... `);
        } else {
            const threadId = rp.currentThread.id;
            const currentModule = rp.currentThread.getCurrentModule();
            if (currentModule) {
                rl.setPrompt(`[${threadId}]@[${currentModule}]... `);
            } else {
                rl.setPrompt(`[${threadId}]... `);
            }
        }
        return;
    }
    
    // Check if this line starts an incomplete block using the built-in method
    let needsMore;
    if (rp.currentThread) {
        needsMore = rp.currentThread.needsMoreInput(line);
    } else {
        needsMore = rp.needsMoreInput(line);
    }
    
    if (needsMore.needsMore) {
        // This line starts an incomplete block, enter block mode
        accumulatedLines = [line];
        if (!rp.currentThread) {
            rl.setPrompt(`... `);
        } else {
            const threadId = rp.currentThread.id;
            const currentModule = rp.currentThread.getCurrentModule();
            if (currentModule) {
                rl.setPrompt(`[${threadId}]@[${currentModule}]... `);
            } else {
                rl.setPrompt(`[${threadId}]... `);
            }
        }
        return;
    }
    
    // Regular single-line command - use executeLine for persistent state
    try {
        let result;
        if (rp.currentThread) {
            // Execute in current thread
            result = await rp.currentThread.executeLine(line);
        } else {
            // Execute in global thread (root RobinPath instance)
            result = await rp.executeLine(line);
        }
        
        // Check if result is from explain command (structured object)
        if (result && typeof result === 'object' && !Array.isArray(result) && result.type) {
            if (result.type === 'function') {
                // Format function documentation
                console.log(`\nFunction: ${result.name}`);
                console.log(`\nDescription: ${result.description}\n`);
                
                if (result.parameters && result.parameters.length > 0) {
                    console.log('Parameters:');
                    for (const param of result.parameters) {
                        let paramLine = `  - ${param.name} (${param.dataType})`;
                        if (param.required) {
                            paramLine += ' [required]';
                        }
                        console.log(paramLine);
                        console.log(`    ${param.description}`);
                        if (param.formInputType) {
                            console.log(`    Input type: ${param.formInputType}`);
                        }
                        if (param.defaultValue !== undefined) {
                            console.log(`    Default: ${JSON.stringify(param.defaultValue)}`);
                        }
                    }
                } else {
                    console.log('Parameters: None');
                }
                
                console.log(`\nReturns: ${result.returnType}`);
                if (result.returnDescription) {
                    console.log(`  ${result.returnDescription}`);
                }
                console.log('');
            } else if (result.type === 'module') {
                // Format module documentation
                console.log(`\nModule: ${result.name}`);
                console.log(`\nDescription: ${result.description}\n`);
                
                if (result.methods && result.methods.length > 0) {
                    console.log('Available Methods:');
                    for (const method of result.methods) {
                        console.log(`  - ${method}`);
                    }
                } else {
                    console.log('Available Methods: None');
                }
                console.log('');
            } else if (result.error) {
                console.log(result.error);
            }
        } else if (result && typeof result === 'object' && result.error) {
            // Handle error objects
            console.log(result.error);
        }
        
        // Update prompt in case module context changed (e.g., "use" command)
        rl.setPrompt(getPrompt());
        // Don't print null/undefined results (log commands handle their own output)
        if (result !== null && result !== undefined && result !== '' && 
            (!result || typeof result !== 'object' || (!result.type && !result.error))) {
            // Only print if it's a meaningful value and not a structured object
            // Most commands use log for output, so we skip printing here
        }
    } catch (error) {
        console.error(`Error: ${error.message}`);
    }
}

// Start the REPL
console.log('RobinPath REPL');
console.log('Type "help" for commands, "exit" to quit');
console.log('');

rl.prompt();

rl.on('line', async (line) => {
    await processLine(line);
    rl.prompt();
});

rl.on('close', () => {
    console.log('\nGoodbye!');
    process.exit(0);
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    if (accumulatedLines.length > 0) {
        console.log('\nBlock cancelled. Returning to normal mode.');
        accumulatedLines = [];
        rl.setPrompt(getPrompt());
        rl.prompt();
    } else {
        console.log('\nGoodbye!');
        rl.close();
        process.exit(0);
    }
});

