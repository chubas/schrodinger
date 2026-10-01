import { 
  parseAdjacencyRule, 
  RuleType,
  createSimpleRule,
  createNegatedRule,
  createDirectionalRule,
  createCompoundRule,
  createChoiceRule,
  Rule
} from '../src/AdjacencyGrammar';
import { matchRules } from '../src/Adjacencies';

describe('Adjacency Grammar Parser', () => {
  // Simple rule parsing
  test('parses simple rules', () => {
    const result = parseAdjacencyRule('Forest');
    expect(result).toEqual({
      type: RuleType.Simple,
      value: 'Forest'
    });
  });

  // Negated rule parsing
  test('parses negated rules', () => {
    const result = parseAdjacencyRule('^Forest');
    expect(result).toEqual({
      type: RuleType.Negated,
      value: {
        type: RuleType.Simple,
        value: 'Forest'
      }
    });
  });

  // Compound rule parsing
  test('parses compound rules', () => {
    const result = parseAdjacencyRule('Forest+Mountain');
    expect(result).toEqual({
      type: RuleType.Compound,
      values: [
        {
          type: RuleType.Simple,
          value: 'Forest'
        },
        {
          type: RuleType.Simple,
          value: 'Mountain'
        }
      ]
    });
  });

  // Choice rule parsing
  test('parses choice rules', () => {
    const result = parseAdjacencyRule('Forest|Mountain');
    expect(result).toEqual({
      type: RuleType.Choice,
      values: [
        {
          type: RuleType.Simple,
          value: 'Forest'
        },
        {
          type: RuleType.Simple,
          value: 'Mountain'
        }
      ]
    });
  });

  // Directional rule parsing
  test('parses directional rules', () => {
    const result = parseAdjacencyRule('[Forest>Mountain]');
    expect(result).toEqual({
      type: RuleType.Directional,
      origin: {
        type: RuleType.Simple,
        value: 'Forest'
      },
      destination: {
        type: RuleType.Simple,
        value: 'Mountain'
      }
    });
  });

  // Parenthesized rule parsing
  test('parses parenthesized rules', () => {
    const result = parseAdjacencyRule('(Forest|Mountain)');
    expect(result).toEqual({
      type: RuleType.Choice,
      values: [
        {
          type: RuleType.Simple,
          value: 'Forest'
        },
        {
          type: RuleType.Simple,
          value: 'Mountain'
        }
      ]
    });
  });

  test('parses parenthesized rules with nested rules', () => {
    const result = parseAdjacencyRule('(Forest|Mountain+Cliff)');
    expect(result).toEqual({
      type: RuleType.Choice,
      values: [
        {
          type: RuleType.Simple,
          value: 'Forest'
        },
        {
          type: RuleType.Compound,
          values: [
            {
              type: RuleType.Simple,
              value: 'Mountain'
            },
            {
              type: RuleType.Simple,
              value: 'Cliff'
            }
          ]
        }
      ]
    });
  });

  test(`parses rules with extra parentheses`, () => {
    const result = parseAdjacencyRule(`[(Forest)>((Mountain+((Cliff))))]`);
    expect(result).toEqual({
      type: RuleType.Directional,
      origin: {
        type: RuleType.Simple,
        value: 'Forest'
      },
      destination: {
        type: RuleType.Compound,
        values: [
          {
            type: RuleType.Simple,
            value: 'Mountain'
          },
          {
            type: RuleType.Simple,
            value: 'Cliff'
          }
        ]
      }
    });
  });

  // Combined rules parsing
  test('parses complex nested rules', () => {
    const result = parseAdjacencyRule('Forest+[^Reef>^(Desert|Mountain+Cliff|Jungle)]|(Sand|Grass)');
    
    // Using the structure from the example in grammar-proposal.md
    const expected = {
      type: RuleType.Choice,
      values: [
        {
          type: RuleType.Compound,
          values: [
            {
              type: RuleType.Simple,
              value: 'Forest'
            },
            {
              type: RuleType.Directional,
              origin: {
                type: RuleType.Negated,
                value: {
                  type: RuleType.Simple,
                  value: 'Reef'
                }
              },
              destination: {
                type: RuleType.Negated,
                value: {
                  type: RuleType.Choice,
                  values: [
                    {
                      type: RuleType.Simple,
                      value: 'Desert'
                    },
                    {
                      type: RuleType.Compound,
                      values: [
                        {
                          type: RuleType.Simple,
                          value: 'Mountain'
                        },
                        {
                          type: RuleType.Simple,
                          value: 'Cliff'
                        }
                      ]
                    },
                    {
                      type: RuleType.Simple,
                      value: 'Jungle'
                    }
                  ]
                }
              }
            }
          ]
        },
        {
          type: RuleType.Choice,
          values: [
            {
              type: RuleType.Simple,
              value: 'Sand'
            },
            {
              type: RuleType.Simple,
              value: 'Grass'
            }
          ]
        }
      ]
    };
    
    expect(result).toEqual(expected);
  });

  // Whitespace handling
  test('handles whitespace correctly', () => {
    const result = parseAdjacencyRule(' Forest + Mountain | Desert ');
    expect(result).toEqual({
      type: RuleType.Choice,
      values: [
        {
          type: RuleType.Compound,
          values: [
            {
              type: RuleType.Simple,
              value: 'Forest'
            },
            {
              type: RuleType.Simple,
              value: 'Mountain'
            }
          ]
        },
        {
          type: RuleType.Simple,
          value: 'Desert'
        }
      ]
    });
  });

  // Error handling
  test('returns an error for invalid syntax', () => {
    const result = parseAdjacencyRule('Forest+');
    expect(result).toBeInstanceOf(Error);
  });
});

describe('Rule Matching', () => {
  // Simple rule matching
  test('matches simple rules with same value', () => {
    // Same value should match
    expect(matchRules(
      createSimpleRule('Forest'),
      createSimpleRule('Forest')
    )).toBe(true);
    
    // A rule should match against itself
    let rule = createSimpleRule('Forest');
    expect(matchRules(rule, rule)).toBe(true);
  });

  test('does not match simple rules with different values', () => {
    // Different values should not match
    expect(matchRules(
      createSimpleRule('Forest'),
      createSimpleRule('Mountain')
    )).toBe(false);
  });

  // Negated rule matching
  test('matches negated rules when inner rule does not match', () => {
    // Negated rule should match when the inner rule doesn't match
    expect(matchRules(
      createNegatedRule(createSimpleRule('Forest')),
      createSimpleRule('Mountain')
    )).toBe(true);
  });

  test('does not match negated rules when inner rule matches', () => {
    // Negated rule should not match when the inner rule matches
    expect(matchRules(
      createNegatedRule(createSimpleRule('Forest')),
      createSimpleRule('Forest')
    )).toBe(false);
  });

  // Directional rule matching
  test('matches directional rules with complementary origin/destination', () => {
    // Directional rules should match when origin of one matches destination of other
    const ruleA = createDirectionalRule(
      createSimpleRule('Forest'),
      createSimpleRule('Mountain')
    );
    
    const ruleB = createDirectionalRule(
      createSimpleRule('Mountain'),
      createSimpleRule('Forest')
    );
    
    expect(matchRules(ruleA, ruleB)).toBe(true);
  });

  test('does not match directional rules with non-complementary values', () => {
    // Directional rules should not match when origin/destination don't match
    const ruleA = createDirectionalRule(
      createSimpleRule('Forest'),
      createSimpleRule('Mountain')
    );
    
    const ruleC = createDirectionalRule(
      createSimpleRule('Desert'),
      createSimpleRule('Forest')
    );
    
    expect(matchRules(ruleA, ruleC)).toBe(false);
  });

  test('does not match directional rules with negated components', () => {
    const ruleA = createDirectionalRule(
      createSimpleRule('Forest'),
      createSimpleRule('Mountain')
    );
    
    const ruleD = createDirectionalRule(
      createSimpleRule('Mountain'),
      createNegatedRule(createSimpleRule('Forest')),
    );
    
    expect(matchRules(ruleA, ruleD)).toBe(false);
  });

  test('does not match directional rules with themselves', () => {
    const ruleA = createDirectionalRule(
      createSimpleRule('Forest'),
      createSimpleRule('Mountain')
    );
    
    const ruleB = createDirectionalRule(
      createSimpleRule('Mountain'),
      createSimpleRule('Forest')
    );
    
    // Directional rules should not match with themselves
    expect(matchRules(ruleA, ruleA)).toBe(false);
    expect(matchRules(ruleB, ruleB)).toBe(false);
  });

  // Compound rule matching
  test('matches compound rules with identical components', () => {
    // Compound rules should match when all components match in order
    const ruleA = createCompoundRule([
      createSimpleRule('Forest'),
      createSimpleRule('Mountain')
    ]);
    
    const ruleB = createCompoundRule([
      createSimpleRule('Forest'),
      createSimpleRule('Mountain')
    ]);
    
    expect(matchRules(ruleA, ruleB)).toBe(true);
  });

  test('does not match compound rules with different components', () => {
    const ruleA = createCompoundRule([
      createSimpleRule('Forest'),
      createSimpleRule('Mountain')
    ]);
    
    // Compound rules should not match with different components
    const ruleC = createCompoundRule([
      createSimpleRule('Forest'),
      createSimpleRule('Desert')
    ]);
    
    expect(matchRules(ruleA, ruleC)).toBe(false);
  });

  test('does not match compound rules with different lengths', () => {
    const ruleA = createCompoundRule([
      createSimpleRule('Forest'),
      createSimpleRule('Mountain')
    ]);
    
    // Compound rules should not match with different number of components
    const ruleD = createCompoundRule([
      createSimpleRule('Forest'),
      createSimpleRule('Mountain'),
      createSimpleRule('Desert')
    ]);
    
    expect(matchRules(ruleA, ruleD)).toBe(false);
  });

  // Choice rule matching
  test('matches choice rules when any option matches', () => {
    // Choice rule should match if any option matches
    const ruleA = createChoiceRule([
      createSimpleRule('Forest'),
      createSimpleRule('Mountain')
    ]);
    
    // Should match since 'Forest' is in the choices
    expect(matchRules(ruleA, createSimpleRule('Forest'))).toBe(true);
    
    // Should match since 'Mountain' is in the choices
    expect(matchRules(ruleA, createSimpleRule('Mountain'))).toBe(true);
  });

  test('does not match choice rules when no option matches', () => {
    const ruleA = createChoiceRule([
      createSimpleRule('Forest'),
      createSimpleRule('Mountain')
    ]);
    
    // Should not match since 'Desert' is not in the choices
    expect(matchRules(ruleA, createSimpleRule('Desert'))).toBe(false);
  });

  // Complex rule matching examples
  test('matches parsed rules with identical structure', () => {
    // Parse complex rules and check if they match
    const ruleA = parseAdjacencyRule('Forest+Mountain');
    const ruleB = parseAdjacencyRule('Forest+Mountain');
    
    // Same structure should match
    expect(matchRules(ruleA as Rule, ruleB as Rule)).toBe(true);
  });

  test('does not match parsed rules with different structure', () => {
    const ruleA = parseAdjacencyRule('Forest+Mountain');
    const ruleC = parseAdjacencyRule('Forest+Desert');
    
    // Different structure should not match
    expect(matchRules(ruleA as Rule, ruleC as Rule)).toBe(false);
  });

  test('matches parsed directional rules correctly', () => {
    // Test directional matching with complex rules
    const ruleD = parseAdjacencyRule('[Forest>Mountain]');
    const ruleE = parseAdjacencyRule('[Mountain>Forest]');
    
    expect(matchRules(ruleD as Rule, ruleE as Rule)).toBe(true);
  });

  test('matches parsed choice rules correctly', () => {
    // Test with choices
    const ruleF = parseAdjacencyRule('Forest|Mountain');
    const ruleG = parseAdjacencyRule('Desert|Forest');
    
    // These should match because they share 'Forest'
    expect(matchRules(ruleF as Rule, ruleG as Rule)).toBe(true);
  });
});

// Test the complete example from the grammar proposal
describe('Complex Rule Matching', () => {
  const complexRule = 'Forest+[^Reef>(Desert|Mountain+Cliff|Jungle)]|(Sand|Grass)';
  let parsedRule: Rule;
  
  beforeEach(() => {
    parsedRule = parseAdjacencyRule(complexRule) as Rule;
  });
  
  test('parses the complex example without errors', () => {
    expect(parsedRule).not.toBeInstanceOf(Error);
  });
  
  test('matches choices in the complex rule correctly', () => {
    expect(matchRules(parsedRule, createSimpleRule('Sand'))).toBe(true);
    expect(matchRules(parsedRule, createSimpleRule('Grass'))).toBe(true);
  });
  
  test('does not match simple components of compound rules', () => {
    const forestRule = parseAdjacencyRule('Forest');
    expect(matchRules(parsedRule, forestRule as Rule)).toBe(false);
  });

  test('matches compound rules with correct negated rule', () => {
    const compoundRule = parseAdjacencyRule('Forest+[Jungle>Building]');
    expect(matchRules(parsedRule, compoundRule as Rule)).toBe(true);
  });

  test('matches compound rule with compound rules in directional rule', () => {
    const compoundRule = parseAdjacencyRule('Forest+[Mountain+Cliff>Building]');
    expect(matchRules(parsedRule, compoundRule as Rule)).toBe(true);
  });

  test('does not match compound rule with matching negated rule', () => {
    let negatedRule = parseAdjacencyRule('Forest+[Desert>Reef]');
    expect(matchRules(parsedRule, negatedRule as Rule)).toBe(false);
  });
}); 