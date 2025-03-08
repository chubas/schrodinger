import { TileDefFactory } from "./TileDef.js";

export type SimpleAdjacency = string[];

export type DirectionalAdjacency = {
  from: string;
  to: string;
};

export type CompoundAdjacency = (string | DirectionalAdjacency)[];

export type AdjacencyRule = SimpleAdjacency | DirectionalAdjacency | CompoundAdjacency;

function isSimpleAdjacency(adj: AdjacencyRule): adj is SimpleAdjacency {
  return Array.isArray(adj) && adj.every(item => typeof item === 'string');
}

function isDirectionalAdjacency(adj: AdjacencyRule): adj is DirectionalAdjacency {
  return !Array.isArray(adj) && 'from' in adj && 'to' in adj;
}

function isCompoundAdjacency(adj: AdjacencyRule): adj is CompoundAdjacency {
  return Array.isArray(adj) && adj.some(item => typeof item !== 'string');
}

function matchSimpleAdjacencies(adj1: SimpleAdjacency, adj2: SimpleAdjacency): boolean {
  // For simple adjacencies, all tokens must match (order doesn't matter)
  if (adj1.length !== adj2.length) return false;

  const tokens1 = new Set(adj1);
  return adj2.every(token => tokens1.has(token));
}

function matchDirectionalAdjacencies(adj1: DirectionalAdjacency, adj2: DirectionalAdjacency): boolean {
  // Directional adjacencies match if they are complementary
  // console.log('Matching directional adjacencies:', adj1, adj2)
  return adj1.from === adj2.to && adj1.to === adj2.from;
}

function matchCompoundAdjacencies(adj1: CompoundAdjacency, adj2: CompoundAdjacency): boolean {
  if (adj1.length !== adj2.length) return false;
  // For each position, if both are strings they must match exactly
  // If both are directional, they must be complementary
  // If they're different types, no match
  for (let i = 0; i < adj1.length; i++) {
    const item1 = adj1[i];
    const item2 = adj2[i];

    if (typeof item1 === 'string' && typeof item2 === 'string') {
      if (item1 !== item2) return false;
    } else if (typeof item1 === 'object' && typeof item2 === 'object') {
      if (!matchDirectionalAdjacencies(item1, item2)) return false;
    } else {
      return false;
    }
  }

  return true;
}

export function matchAdjacencies(adj1: string | AdjacencyRule, adj2: string | AdjacencyRule): boolean {

  // console.log('COMPARING: ', JSON.stringify(adj1), ' and ', JSON.stringify(adj2))

  // Parse strings into AdjacencyRules
  const rule1 = typeof adj1 === 'string' ? TileDefFactory.parseAdjacencyRule(adj1) : adj1;
  const rule2 = typeof adj2 === 'string' ? TileDefFactory.parseAdjacencyRule(adj2) : adj2;
  // console.log({ rule1, rule2 })

  // First check if they're the same type
  if (isSimpleAdjacency(rule1) && isSimpleAdjacency(rule2)) {
    // console.log("Simple")
    return matchSimpleAdjacencies(rule1, rule2);
  }

  if (isDirectionalAdjacency(rule1) && isDirectionalAdjacency(rule2)) {
    // console.log("directional")
    return matchDirectionalAdjacencies(rule1, rule2);
  }

  if (isCompoundAdjacency(rule1) && isCompoundAdjacency(rule2)) {
    let r = matchCompoundAdjacencies(rule1, rule2);
    // console.log("compound")
    // console.log('compound', {r})
    return r
  }

  // Different types never match
  return false;
}