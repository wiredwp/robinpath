const fs = require('fs');

const content = fs.readFileSync('test.rp', 'utf-8');
const lines = content.split('\n');
const result = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  let inString = false;
  let stringChar = '';
  let escaped = false;
  let commentPos = -1;
  
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    
    if (!escaped && (char === '"' || char === "'" || char === '`')) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = '';
      }
      escaped = false;
    } else if (inString) {
      escaped = char === '\\' && !escaped;
    } else if (char === '#' && !inString) {
      commentPos = j;
      break;
    } else {
      escaped = false;
    }
  }
  
  if (commentPos >= 0) {
    const codePart = line.substring(0, commentPos).trimEnd();
    if (codePart) {
      result.push(codePart);
    } else {
      result.push('');
    }
  } else {
    result.push(line);
  }
}

fs.writeFileSync('test-no-comments.rp', result.join('\n'), 'utf-8');
console.log('Created test-no-comments.rp');
