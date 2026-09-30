# Adjacency rules

Every tile has one **adjacency rule** per side (per direction of its grid). Two tiles can sit next to each other when the rule on the side of one tile *matches* the rule on the facing side of the other.

A rule is usually written as a string:

```js
{ name: 'shore', adjacencies: ['grass', 'water|sand', 'water', '^rock'] }
```

The string is parsed once, when the engine is first used. You can also pass rule objects directly (see [Rule objects](#rule-objects)).

## The short version

| Rule | Example | Meaning |
|---|---|---|
| Simple | `grass` | Matches exactly the same value. |
| Choice | `grass\|sand` | Matches if any option matches. |
| Compound | `a+b` | Matches another compound with the same number of parts, part by part, in order. |
| Negated | `^grass` | Matches anything the wrapped rule does not match. |
| Directional | `[a>b]` | Matches `[b>a]` (and nothing else): the two sides are mirror images. |
| Grouping | `(a\|b)+c` | Parentheses group rules. |

Whitespace around operators is ignored.

## Grammar

```
Rule        := ChoiceRule | CompoundRule | SingleRule
ChoiceRule  := (CompoundRule | SingleRule) ("|" (CompoundRule | SingleRule))+
CompoundRule:= SingleRule ("+" SingleRule)+
SingleRule  := "(" Rule ")" | NegatedRule | DirectionalRule | SimpleRule
NegatedRule := "^" SingleRule
DirectionalRule := "[" Rule ">" Rule "]"
SimpleRule  := [A-Za-z0-9]+
```

Precedence, tightest first: parentheses, `^`, `[ > ]`, `+`, `|`. So `a|b+c` means `a` or (`b` and `c`), and `^a+b` means (not `a`) and `b`.

**Values are letters and digits only.** `under_score`, `hy-phen` and `two words` are parse errors, and so is an empty string. (Tile *names* are free-form; this only applies to adjacency values.)

## How matching works

`matchAdjacencies(a, b)` (also exported as `matchRules`) checks two parsed rules. These results come from the actual matcher:

| Left | Right | Matches? | Why |
|---|---|---|---|
| `grass` | `grass` | yes | equal values |
| `grass` | `water` | no | |
| `grass\|water` | `water` | yes | one option matches |
| `grass\|water` | `grass\|sand` | yes | `grass` is shared |
| `grass\|water` | `sand` | no | |
| `^grass` | `water` | yes | `water` is not `grass` |
| `^grass` | `grass` | no | |
| `^grass` | `^water` | **no** | see below |
| `a+b` | `a+b` | yes | parts match in order |
| `a+b` | `b+a` | no | order matters |
| `a+b` | `a` | no | different number of parts |
| `a+b` | `a+b+c` | no | different number of parts |
| `(a\|b)+c` | `a+c` | yes | first part: `a` is one of the options |
| `[a>b]` | `[b>a]` | yes | origin matches the other's destination, and vice versa |
| `[a>b]` | `[a>b]` | **no** | origin `a` does not match destination `b` |
| `[a>b]` | `a` | no | directional only matches directional |

Matching is symmetric: if `A` matches `B`, then `B` matches `A`.

Things to watch for:

- **Two negated rules never match each other.** `^a` against `^b` is evaluated as "not (`a` matches `^b`)", and `a` does match `^b`, so the answer is no. Use a negation against a plain value (`^grass` next to `water`), or a choice.
- **Simple values don't match compounds or directionals.** Every part of the system has to use the same shape: if one side of an edge is `a+b`, the other side must be a compound too.
- **An identical directional rule on both sides never matches.** That is the point of it: it forces the two sides to be *different*.

### Directional rules: "must be different"

`[x>y]` only matches `[y>x]`, so a tile whose sides are all `[b>w]` can only touch a tile whose sides are all `[w>b]`:

```js
const tiles = [
  { name: 'Black', adjacencies: ['[b>w]', '[b>w]', '[b>w]', '[b>w]'] },
  { name: 'White', adjacencies: ['[w>b]', '[w>b]', '[w>b]', '[w>b]'] },
];
// Black never touches Black, White never touches White: a chessboard.
```

`examples/node/custom-graph.mjs` uses the same idea to two-colour a binary tree.

## Rule objects

Instead of a string, a side can be a rule object, which skips parsing. The shapes are:

```ts
{ type: RuleType.Simple, value: 'grass' }
{ type: RuleType.Negated, value: Rule }
{ type: RuleType.Directional, origin: Rule, destination: Rule }
{ type: RuleType.Compound, values: Rule[] }
{ type: RuleType.Choice, values: Rule[] }
```

`parseAdjacencyRule(text)` returns the same objects (or an `Error`). For example, `a|b+c` parses to:

```json
{ "type": "Choice", "values": [
  { "type": "Simple", "value": "a" },
  { "type": "Compound", "values": [
    { "type": "Simple", "value": "b" },
    { "type": "Simple", "value": "c" } ] } ] }
```

## Performance

Rules are compared once per pair of tiles per direction when the engine first runs, into lookup tables; after that, generation only does table lookups. So the cost of a rule is paid at start-up, in proportion to (number of tile pairs) × (directions), and does not depend on the grid size.
