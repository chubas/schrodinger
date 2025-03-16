import * as P from 'parsimmon';

/**
 * Types representing the different kinds of adjacency rules
 */
export enum RuleType {
  Simple = 'Simple',
  Negated = 'Negated',
  Directional = 'Directional',
  Compound = 'Compound',
  Choice = 'Choice',
}

/**
 * Base interface for all rule types
 */
export interface Rule {
  type: RuleType;
}

export interface SimpleRule extends Rule {
  type: RuleType.Simple;
  value: string;
}

export interface NegatedRule extends Rule {
  type: RuleType.Negated;
  value: Rule;
}

export interface DirectionalRule extends Rule {
  type: RuleType.Directional;
  origin: Rule;
  destination: Rule;
}

export interface CompoundRule extends Rule {
  type: RuleType.Compound;
  values: Rule[];
}

export interface ChoiceRule extends Rule {
  type: RuleType.Choice;
  values: Rule[];
}

/**
 * Creates a Parsimmon parser for adjacency rules
 */
const createAdjacencyParser = () => {
  // Forward declarations to handle recursion
  const rule: P.Parser<Rule> = P.lazy(() => P.alt(choiceRule, compoundRule, singleRule));
  
  // Simple rule (just text)
  const simpleRule: P.Parser<SimpleRule> = P.regexp(/[A-Za-z0-9]+/).map(value => ({
    type: RuleType.Simple,
    value
  }));
  
  // Negated rule (^Something)
  const negatedRule: P.Parser<NegatedRule> = P.string('^')
    .then(P.lazy(() => singleRule))
    .map(value => ({
      type: RuleType.Negated,
      value
    }));
  
  // Directional rule ([A>B])
  const directionalRule: P.Parser<DirectionalRule> = P.seq(
    P.string('['),
    P.lazy(() => rule),
    P.string('>'),
    P.lazy(() => rule),
    P.string(']')
  ).map(([, origin, , destination]) => ({
    type: RuleType.Directional,
    origin,
    destination
  }));
  
  // Parenthesized rule
  const parenRule: P.Parser<Rule> = P.seq(
    P.string('(').skip(P.optWhitespace),
    P.lazy(() => rule),
    P.optWhitespace.skip(P.string(')'))
  ).map(([, r]) => r);
  
  // Single rule (one of the basic types)
  const singleRule: P.Parser<Rule> = P.alt(
    parenRule,
    negatedRule,
    directionalRule,
    simpleRule
  );
  
  // Compound rule (A+B+C)
  const compoundRule: P.Parser<Rule> = P.seq(
    singleRule,
    P.seq(P.optWhitespace, P.string('+'), P.optWhitespace, singleRule)
      .map(([,,,r]) => r)
      .atLeast(1)
  ).map(([first, rest]) => {
    // If there's only one component and it's not already a compound, return it
    if (rest.length === 0) return first;
    
    // If first is already a compound rule, extend it
    if (first.type === RuleType.Compound) {
      return {
        type: RuleType.Compound,
        values: [...(first as CompoundRule).values, ...rest]
      };
    }
    
    // Otherwise create a new compound rule
    return {
      type: RuleType.Compound,
      values: [first, ...rest]
    };
  });
  
  // Choice rule (A|B|C)
  const choiceRule: P.Parser<Rule> = P.seq(
    P.alt(compoundRule, singleRule),
    P.seq(P.optWhitespace, P.string('|'), P.optWhitespace, P.alt(compoundRule, singleRule))
      .map(([,,,r]) => r)
      .atLeast(1)
  ).map(([first, rest]) => {
    // If there's only one option, return it
    if (rest.length === 0) return first;
    
    // If first is already a choice rule, extend it
    if (first.type === RuleType.Choice) {
      return {
        type: RuleType.Choice,
        values: [...(first as ChoiceRule).values, ...rest]
      };
    }
    
    // Otherwise create a new choice rule
    return {
      type: RuleType.Choice,
      values: [first, ...rest]
    };
  });
  
  // The final parser with whitespace handling
  return P.optWhitespace.then(rule).skip(P.optWhitespace);
};

/**
 * Parses an adjacency rule string into the rule object structure
 * @param input The rule string to parse
 * @returns The parsed rule or an error
 */
export function parseAdjacencyRule(input: string): Rule | Error {
  const parser = createAdjacencyParser();
  const result = parser.parse(input);
  
  if (result.status) {
    return result.value;
  } else {
    // We need to properly type the failure case
    const failure = result as P.Failure;
    return new Error(`Parse error at position ${failure.index.offset}: ${failure.expected.join(', ')}`);
  }
}

/**
 * Utility function to create a simple rule
 */
export function createSimpleRule(value: string): SimpleRule {
  return { type: RuleType.Simple, value };
}

/**
 * Utility function to create a negated rule
 */
export function createNegatedRule(value: Rule): NegatedRule {
  return { type: RuleType.Negated, value };
}

/**
 * Utility function to create a directional rule
 */
export function createDirectionalRule(origin: Rule, destination: Rule): DirectionalRule {
  return { type: RuleType.Directional, origin, destination };
}

/**
 * Utility function to create a compound rule
 */
export function createCompoundRule(values: Rule[]): CompoundRule {
  return { type: RuleType.Compound, values };
}

/**
 * Utility function to create a choice rule
 */
export function createChoiceRule(values: Rule[]): ChoiceRule {
  return { type: RuleType.Choice, values };
} 