# RobinPath Syntax Guide (Concise)

**Overview**: Command-based, last-value tracking (`$`), event-driven, parallel execution.

## Variables & Types
**Prefix**: `$`. **Types**: String, Number, Boolean, Null, Array `[]`, Object `{}`.
```robinpath
$s="str"; $n=42; $b=true; $z=null; $a=[1,2]; $o={k:"v"}
$copy=$orig; set $v "val"; set $o.p "v"
var $v; const $C 10
```

## Operators
*   **Compare**: `==` `!=` `>` `<` `>=` `<=`
*   **Logic**: `&&` `||` `!` `not`
*   **Math**: `+` `-` `*` `/` `%`
*   **Group**: `($a && $b)`

## Control Flow
**Conditionals**:
```robinpath
if $x>0 then log "Inline"
if $x>9; "A"; elseif $x>5; "B"; else; "C"; endif
```
**Loops** (`break`, `continue`):
```robinpath
for $i in range 1 5; log $i; endfor
for $item in $arr; log $item; endfor
```

## Functions
**Def**: `def name $arg1 $arg2 ... enddef` (last expr returns).
**Call**: `name arg1 arg2` or `name(arg1 arg2)` or named `name($k=v)`.
**Return**: `return val` (or `null`).
```robinpath
def add $a $b; math.add $a $b; enddef
add 1 2; add($a=1 $b=2)
```

## Blocks
**Do** (Scope/Group): `do; ...; enddo` or `do into $res; ...; enddo`.
**Isolated**: `do $arg; ...; enddo` (no outer scope access).
**Together** (Parallel):
```robinpath
together
  do; task1; enddo
  do; task2; enddo
endtogether
```
**With** (Callback/Accumulator):
```robinpath
repeat 5 with; add $2 1; endwith # $1=idx, $2=acc
```

## Events
**Handle**: `on "evt"; log $1; endon`.
**Trigger**: `trigger "evt" arg1 arg2`.

## Modules & Built-ins
**Vars**: `set`, `get`, `empty`, `fallback`, `clear` ($), `forget`, `has`, `getType`.
**IO**: `log`, `say`.
**Structs**: `obj`, `array`, `keys`, `values`, `entries`, `merge`, `clone`.

| Module | Functions |
| :--- | :--- |
| **Math** | `add` `subtract` `multiply` `divide` `modulo` `power` `sqrt` `abs` `round` `floor` `ceil` `min` `max` |
| **String** | `length` `substring` `toUpperCase` `toLowerCase` `trim` `replace` `replaceAll` `split` `concat` `startsWith` `endsWith` `contains` `indexOf` `lastIndexOf` `charAt` `padStart` `padEnd` `repeat` |
| **Array** | `length` `get` `slice` `push` `concat` `join` `create` |
| **JSON** | `parse` `stringify` `isValid` |
| **Time** | `now` `timestamp` `format` `addDays` `diffDays` |
| **Random** | `int` `float` `uuid` `choice` |

## Objects & Arrays
**Access**: `$u.name`, `$u.addr.city`, `$arr[0]`.
**Assign**: `$u.city="NY"`, `$arr[0]=1`.
**Literals**: `{k:$v}`, `[1, $x]`.

## Subexpressions & Templates
**Subexpr**: `$res = $(math.add 1 2)`.
**Template**: `` `Hello $name, 1+1=$(math.add 1 1)` ``. Escapes: `\$`, `` \` ``, `\\`.

## Special Features
**Into**: Capture result without changing `$`. `add 1 2 into $res`.
**Last Value ($)**: Result of last op/literal. `1; add $ 2`. `clear` resets.
**Metadata**: `meta $v key val` or `setMeta`. `getMeta $v key`.
**Decorators**: `@desc "txt"`, `@param type $n "doc"`, `@required $n`.
**Line Cont**: `\` at EOL.

## Fenced Blocks
`--- chunk:id tags... ---`, `---cell code id:x--- ... ---end---`
