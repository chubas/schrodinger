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

export function matchAdjacencies(adj1: AdjacencyRule, adj2: AdjacencyRule): boolean {
  // First check if they're the same type
  if (isSimpleAdjacency(adj1) && isSimpleAdjacency(adj2)) {
    return matchSimpleAdjacencies(adj1, adj2);
  }

  if (isDirectionalAdjacency(adj1) && isDirectionalAdjacency(adj2)) {
    return matchDirectionalAdjacencies(adj1, adj2);
  }

  if (isCompoundAdjacency(adj1) && isCompoundAdjacency(adj2)) {
    return matchCompoundAdjacencies(adj1, adj2);
  }

  // Different types never match
  return false;
}