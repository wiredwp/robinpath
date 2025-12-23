import { RobinPath } from '../dist/index.js';

async function test() {
  const code = `set $a as 5`;
  console.log('Testing code:', code);
  const rp = new RobinPath();
  try {
    const ast = await rp.getAST(code);
    console.log('AST generated successfully');
    console.log(JSON.stringify(ast, null, 2));
    
    if (ast[0].isSet) {
        console.log('SUCCESS: isSet is true');
    } else {
        console.log('FAILURE: isSet is missing or false');
    }
  } catch (e) {
    console.error('Error generating AST:', e);
  }
}

test();
