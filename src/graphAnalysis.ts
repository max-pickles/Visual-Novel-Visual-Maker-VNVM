import type { LayoutNode, LayoutEdge } from './graphLayout';

export type NarrativeFormation = 'flow' | 'hub' | 'parallel' | 'world' | 'rpg' | 'tutorial';

/**
 * Analyzes the topology of the VN scene graph to determine its high-level shape.
 */
export function detectFormation(nodes: LayoutNode[], edges: LayoutEdge[]): NarrativeFormation {
  if (nodes.length <= 3) return 'flow';

  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  
  nodes.forEach(n => {
    inDegree.set(n.id, 0);
    outDegree.set(n.id, 0);
  });

  edges.forEach(e => {
    if (!inDegree.has(e.sourceId) || !inDegree.has(e.targetId)) return;
    outDegree.set(e.sourceId, outDegree.get(e.sourceId)! + 1);
    inDegree.set(e.targetId, inDegree.get(e.targetId)! + 1);
  });

  // 0. World-map (Open-World RPG) Detection
  // Key signal: many bidirectional edge pairs (A→B AND B→A both exist).
  // This indicates freely traversable areas, not a narrative DAG.
  // We check what fraction of all edges have a reverse counterpart.
  const edgeSet = new Set(edges.map(e => `${e.sourceId}||${e.targetId}`));
  let biDirCount = 0;
  edges.forEach(e => {
    if (edgeSet.has(`${e.targetId}||${e.sourceId}`)) biDirCount++;
  });
  const biDirRatio = edges.length > 0 ? biDirCount / edges.length : 0;
  const avgDegree = nodes.length > 0 ? (edges.length * 2) / nodes.length : 0;

  // Signal 1: many bidirectional pairs → open-world map traversal
  // Signal 2: large graph (100+ nodes) with avg degree >= 2 → complex non-linear world
  // Signal 3: dense graph regardless of size
  const isLargeWorld = nodes.length >= 80 && avgDegree >= 2;
  const isDenseSmall = avgDegree >= 4;
  if (biDirRatio >= 0.3 || isLargeWorld || isDenseSmall) {
    return 'world';
  }

  // 1. Hub (Web) Detection
  // A hub typically has a very high in-degree and out-degree because many scenes jump back to it.
  let maxDegree = 0;
  let hubNodeId = '';
  
  nodes.forEach(n => {
    const total = inDegree.get(n.id)! + outDegree.get(n.id)!;
    if (total > maxDegree) {
      maxDegree = total;
      hubNodeId = n.id;
    }
  });

  // If a single node is connected to a huge chunk of the graph, it's likely a cyclic hub
  // Criteria: connected to at least 40% of all nodes, and has both in/out branching
  if (maxDegree >= Math.max(4, nodes.length * 0.4) && outDegree.get(hubNodeId)! >= 3 && inDegree.get(hubNodeId)! >= 2) {
    return 'hub';
  }

  // 2. Parallel Routes Detection
  // If the graph splits and has multiple disconnected endings that are "long"
  // For now, if there are many terminal nodes (ends), we classify as parallel to widen the layout
  let terminalCount = 0;
  nodes.forEach(n => {
    if (outDegree.get(n.id) === 0) terminalCount++;
  });
  
  if (terminalCount >= Math.max(3, nodes.length * 0.3)) {
    return 'parallel';
  }

  // 3. Default DAG Flow (Trunks, Diamonds, Gauntlets)
  return 'flow';
}
