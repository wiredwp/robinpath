#!/usr/bin/env python3

with open('test.rp', 'r') as f:
    lines = f.readlines()

result = []
for line in lines:
    # Remove comments (everything from # to end of line, but not if # is inside a string)
    in_string = False
    string_char = None
    escaped = False
    comment_pos = -1
    
    for i, char in enumerate(line):
        if not escaped and char in ('"', "'", '`'):
            if not in_string:
                in_string = True
                string_char = char
            elif char == string_char:
                in_string = False
                string_char = None
            escaped = False
        elif in_string:
            escaped = char == '\\' and not escaped
        elif char == '#' and not in_string:
            comment_pos = i
            break
        else:
            escaped = False
    
    if comment_pos >= 0:
        code_part = line[:comment_pos].rstrip()
        result.append(code_part + '\n' if code_part else '\n')
    else:
        result.append(line)

with open('test-no-comments.rp', 'w') as f:
    f.writelines(result)

print('Created test-no-comments.rp')
