
// Mock LineIndexImpl logic matching source
class MockLineIndex {
    constructor(originalScript) {
        this.originalScript = originalScript;
        this.lines = originalScript.split('\n');
        
        this.lineStartOffsets = new Array(this.lines.length);
        let offset = 0;
        for (let i = 0; i < this.lines.length; i++) {
            this.lineStartOffsets[i] = offset;
            offset += this.lines[i].length + 1; // +1 for newline
        }
    }

    offsetAt(row, col, exclusive = false) {
        if (row < 0 || row >= this.lines.length) {
            return 0;
        }

        const lineStart = this.lineStartOffsets[row];
        const lineLength = this.lines[row].length;
        const colOffset = Math.min(col, lineLength);
        
        let offset = lineStart + colOffset;
        
        if (exclusive) {
            // Point one past the column, or after the newline if at end of line
            if (colOffset >= lineLength) {
                offset += 1; // After the newline
            } else {
                offset += 1; // One past the column
            }
        }
        
        return offset;
    }
}

const script = '$str = "hello"\ntest.assertEqual';
const lineIndex = new MockLineIndex(script);

console.log('Script:', JSON.stringify(script));
console.log('Line 0:', JSON.stringify(lineIndex.lines[0]), 'Length:', lineIndex.lines[0].length);

const endRow = 0;
const endCol = 13; // Length of $str = "hello"

const offset = lineIndex.offsetAt(endRow, endCol, true);
console.log('Offset at 0, 13 (exclusive):', offset);

const substring = script.slice(0, offset);
console.log('Substring(0, offset):', JSON.stringify(substring));

const remainder = script.slice(offset);
console.log('Remainder:', JSON.stringify(remainder));

if (substring.endsWith('\n')) {
    console.log('Includes newline: YES');
} else {
    console.log('Includes newline: NO');
}

