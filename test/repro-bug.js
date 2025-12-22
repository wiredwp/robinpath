import { RobinPath } from '../dist/index.js';

async function test() {
  const code = 'on "test"\n  $a = 5\nendon';
  console.log('Testing code:\n', code);
  const rp = new RobinPath();
  try {
    const ast = await rp.getAST(code);
    console.log('AST generated successfully');
    console.log(JSON.stringify(ast, null, 2));
  } catch (e) {
    console.error('Error generating AST:', e);
  }
}

test();
