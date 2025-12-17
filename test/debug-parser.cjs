
const { Parser } = require('../dist/classes/Parser');
const { Lexer } = require('../dist/classes/Lexer');

const code = `
log "Test 1: Basic variable assignment"
$str = "hello"
test.assertEqual $str "hello" "String assignment failed"
`;

async function run() {
    console.log('--- Code ---');
    console.log(code);
    console.log('--- Tokens ---');
    const tokens = Lexer.tokenizeFull(code);
    tokens.forEach(t => {
        console.log(`Line ${t.line}: ${t.kind} '${t.text}'`);
    });

    console.log('\n--- Parsing ---');
    const parser = new Parser(code);
    const ast = await parser.parse();
    
    console.log('\n--- AST ---');
    console.log(JSON.stringify(ast, null, 2));
}

run().catch(e => console.error(e));
