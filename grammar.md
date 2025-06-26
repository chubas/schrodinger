# Adjacency rules and grammar specification

Rule := SingleRule | CompoundRule | ChoiceRule
SingleRule := "(" Rule ")" | NegatedRule | SimpleRule | DirectionalRule
NegatedRule := "^" SingleRule
DirectionalRule := "[" Rule ">" Rule "]"
CompoundRule := Rule ("+" Rule)+
ChoiceRule := Rule ("|" Rule)+
SimpleRule := [A-Za-z0-9]+

# Operator Precedence and Priority Rules

The adjacency grammar follows these priority rules (from highest to lowest precedence):

1. **Parentheses `( )`** - Used to explicitly group rules and override default precedence.
   - Example: `(Forest|Mountain)+Cliff` - The choice between Forest or Mountain is grouped before combining with Cliff.

2. **Negation `^`** - Negates a single rule.
   - Example: `^Forest` - Matches anything except Forest.

3. **Directional `[ > ]`** - Creates a directional relationship between two rules.
   - Example: `[Forest>Mountain]` - Forest on one side connects to Mountain on the other side.

4. **Compound `+`** - Combines multiple rules that must all match together.
   - Example: `Forest+Mountain` - Both Forest and Mountain must match.

5. **Choice `|`** - Provides alternative options where any one match is sufficient.
   - Example: `Forest|Mountain` - Either Forest or Mountain can match.

## Evaluation Rules:

- **Whitespace** is ignored between operators and rules.
- **Compound rules** match only against another compound rule if all values match in order (implying same number of elements).
- **Directional rules** match only another directional rule if the origin from one matches the destination of the other and vice versa.
- **Negated rules** match only if the wrapped rule doesn't match the other rule.
- **Choice rules** match if any of their options match with the other rule.
- **Simple rules** match only if they have the exact same value.

# Result of parsing (or to manually create rules without parsing)

Example of a complex rule

"Forest+[^Reef>^(Desert|Mountain+Cliff|Jungle)]|(Sand|Grass)"

rule = {
    type: Choice,
    values: [
        {
            type: Compound,
            values: [
                {
                    type: Simple,
                    value: "Forest"
                },
                {
                    type: Directional,
                    origin: {
                        type: Negated,
                        value: {
                            type: Simple,
                            value: "Reef"
                        }
                    },
                    destination: {
                        type: Negated,
                        value: {
                            type: Choice,
                            values: [
                                {
                                    type: Simple,
                                    value: "Desert"
                                },
                                {
                                    type: Compound,
                                    values: [
                                        {
                                            type: Simple,
                                            value: "Mountain
                                        },
                                        {
                                            type: Simple,
                                            value: "Cliff"
                                        }
                                    ]
                                },
                                {
                                    type: Simple,
                                    value: "Jungle"
                                }
                            ]
                        }
                    }
                }
            ]
        },
        {
            type: Choice,
            values: [
                { 
                    type: Simple,
                    value: Sand
                },
                {
                    type: Simple,
                    value: Grass
                }
            ]
        }
    ]
}

## Explanation of the Complex Example

The complex example above represents:
- Either: 
  - "Forest" AND a directional relationship where anything except "Reef" connects to anything except (Desert OR (Mountain AND Cliff) OR Jungle)
- OR:
  - "Sand" OR "Grass"

# Rules for matching:

A CompoundRule matches only against another CompoundRule if all the values contained match against each other in order (implying they have the same number of elements)
A DirectionalRule matches only another DirectionRule, if the origin from one match the target of the other one and viceversa
A NegatedRule matches only if the positive wrapped rule doesn't match the other rule