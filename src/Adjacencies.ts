import { Rule, parseAdjacencyRule, RuleType, SimpleRule, NegatedRule, DirectionalRule, CompoundRule, ChoiceRule } from "./AdjacencyGrammar.js";

/**
 * Type guard functions for each rule type
 */
export function isSimpleRule(rule: Rule): rule is SimpleRule {
  return rule.type === RuleType.Simple;
}

export function isNegatedRule(rule: Rule): rule is NegatedRule {
  return rule.type === RuleType.Negated;
}

export function isDirectionalRule(rule: Rule): rule is DirectionalRule {
  return rule.type === RuleType.Directional;
}

export function isCompoundRule(rule: Rule): rule is CompoundRule {
  return rule.type === RuleType.Compound;
}

export function isChoiceRule(rule: Rule): rule is ChoiceRule {
  return rule.type === RuleType.Choice;
}

/**
 * Checks if two rules match according to the adjacency rules
 * @param ruleA First rule to compare
 * @param ruleB Second rule to compare
 * @returns True if the rules match, false otherwise
 */
export function matchRules(ruleA: Rule, ruleB: Rule): boolean {
  // Simple rules match if they have the same value
  if (isSimpleRule(ruleA) && isSimpleRule(ruleB)) {
    return (ruleA as SimpleRule).value === (ruleB as SimpleRule).value;
  }
  
  // Negated rules match if the contained rules don't match
  if (isNegatedRule(ruleA)) {
    return !matchRules((ruleA as NegatedRule).value, ruleB);
  }
  if (isNegatedRule(ruleB)) {
    return !matchRules(ruleA, (ruleB as NegatedRule).value);
  }
  
  // Directional rules match if origin from one matches destination from other and vice versa
  if (isDirectionalRule(ruleA) && isDirectionalRule(ruleB)) {
    // Cast to directional rules
    const directionalA = ruleA as DirectionalRule;
    const directionalB = ruleB as DirectionalRule;
    return matchRules(directionalA.origin, directionalB.destination) && 
           matchRules(directionalA.destination, directionalB.origin);
  }
  
  // Compound rules match if they have the same number of elements and each matches in order
  if (isCompoundRule(ruleA) && isCompoundRule(ruleB)) {
    // Cast to compound rules
    const compoundA = ruleA as CompoundRule;
    const compoundB = ruleB as CompoundRule;
    if (compoundA.values.length !== compoundB.values.length) {
      return false;
    }
    
    return compoundA.values.every((valueA, index) => 
      matchRules(valueA, compoundB.values[index])
    );
  }
  
  // Choice rules match if any of their values match
  if (isChoiceRule(ruleA)) {
    return (ruleA as ChoiceRule).values.some(valueA => matchRules(valueA, ruleB));
  }
  if (isChoiceRule(ruleB)) {
    return (ruleB as ChoiceRule).values.some(valueB => matchRules(ruleA, valueB));
  }
  
  // If types don't match, they don't match
  return false;
}

/**
 * Matches two adjacency rules to see if they are compatible
 * Using the new grammar-based approach
 * 
 * @param a First adjacency rule as a string
 * @param b Second adjacency rule as a string
 * @returns Boolean indicating if the adjacencies match
 */
export function matchAdjacencies(a: string, b: string): boolean {
  try {
    // Parse adjacency rules using the grammar
    const ruleA = parseAdjacencyRule(a);
    if (ruleA instanceof Error) {
      console.error(`Error parsing adjacency rule "${a}": ${ruleA.message}`);
      return false;
    }
    
    const ruleB = parseAdjacencyRule(b);
    if (ruleB instanceof Error) {
      console.error(`Error parsing adjacency rule "${b}": ${ruleB.message}`);
      return false;
    }
    
    // Use grammar-based rule matching
    return matchRules(ruleA, ruleB);
  } catch (e) {
    console.error(`Error matching adjacencies "${a}" and "${b}": ${e}`);
    return false;
  }
}