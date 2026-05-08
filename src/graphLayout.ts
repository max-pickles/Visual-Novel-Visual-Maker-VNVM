/**
 * graphLayout.ts
 * Sugiyama-style layered auto-layout engine. Ported from legacy IDE.
 * Works with VNV Maker's VNScene/VNProject node model.
 */
import DirectedGraph from 'graphology';
import { connectedComponents } from 'graphology-components';
import { topologicalGenerations } from 'graphology-dag';

export interface LayoutNode {
  id: string;
  width: number;
  height: number;
  position: { x: number; y: number };
  isSpoke?: boolean;
}

export interface LayoutEdge {
  sourceId: string;
  targetId: string;
}

export interface LayoutCluster {
  id: string;
  nodeIds: string[];
}

export interface LayoutConfig {
  paddingX: number;
  paddingY: number;
  componentSpacing: number;
  clusterSpacingX: number;
  clusterSpacingY: number;
  defaultWidth: number;
  defaultHeight: number;
  /** Y-offset for cross-axis normalisation */
  crossAxisBase: number;
}

export const DEFAULT_STORY_CONFIG: LayoutConfig = {
  paddingX: 150,
  paddingY: 50,
  componentSpacing: 200,
  clusterSpacingX: 220,
  clusterSpacingY: 180,
  defaultWidth: 160,
  defaultHeight: 90,
  crossAxisBase: 100,
};

/** Build a directed graphology graph, filtering edges to non-existent nodes. */
export function buildGraph<N extends LayoutNode, E extends LayoutEdge>(
  nodes: N[],
  edges: E[],
): DirectedGraph {
  const graph = new DirectedGraph();
  const nodeIds = new Set<string>();
  nodes.forEach(node => { graph.addNode(node.id); nodeIds.add(node.id); });
  edges.forEach(edge => {
    if (!nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId)) return;
    if (!graph.hasDirectedEdge(edge.sourceId, edge.targetId)) {
      graph.addDirectedEdge(edge.sourceId, edge.targetId);
    }
  });
  return graph;
}

/** Get connected components preserving input order. */
export function getConnectedComponents<N extends LayoutNode, E extends LayoutEdge>(
  nodes: N[],
  edges: E[],
): string[][] {
  return connectedComponents(buildGraph(nodes, edges));
}

/** BFS layer assignment for cyclic components (cycle-safe). */
function bfsLayers(
  componentNodeIds: string[],
  graph: DirectedGraph,
  componentNodeSet: Set<string>,
  ignoreEdges?: Set<string>
): string[][] {
  const inDegree = new Map<string, number>();
  componentNodeIds.forEach(id => {
    let degree = 0;
    graph.forEachInEdge(id, (_edge, _attrs, source) => {
      if (componentNodeSet.has(source)) {
        if (ignoreEdges && ignoreEdges.has(`${source}||${id}`)) return;
        degree++;
      }
    });
    inDegree.set(id, degree);
  });

  const visited = new Set<string>();
  const layers: string[][] = [];
  const queue: string[] = [];

  componentNodeIds.forEach(id => { if ((inDegree.get(id) ?? 0) === 0) queue.push(id); });
  if (queue.length === 0 && componentNodeIds.length > 0) queue.push(componentNodeIds[0]);

  while (visited.size < componentNodeIds.length) {
    if (queue.length === 0) {
      let minDeg = Infinity; let seed = '';
      for (const id of componentNodeIds) {
        if (visited.has(id)) continue;
        const deg = inDegree.get(id) ?? 0;
        if (deg < minDeg) { minDeg = deg; seed = id; }
      }
      if (seed) queue.push(seed);
    }
    if (queue.length === 0) break;

    const layerSize = queue.length;
    const currentLayer: string[] = [];
    for (let i = 0; i < layerSize; i++) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      currentLayer.push(current);
      graph.forEachOutEdge(current, (_edge, _attrs, _source, target) => {
        if (!componentNodeSet.has(target) || visited.has(target)) return;
        if (ignoreEdges && ignoreEdges.has(`${current}||${target}`)) return;
        inDegree.set(target, (inDegree.get(target) ?? 1) - 1);
        if ((inDegree.get(target) ?? 0) <= 0) queue.push(target);
      });
    }
    if (currentLayer.length > 0) layers.push(currentLayer);
  }
  return layers;
}

/**
 * Main layout entry point. Computes a Sugiyama-style layered layout.
 * @param direction 'lr' = left-to-right, 'td' = top-down
 */
export function computeLayeredLayoutGeneric<N extends LayoutNode>(
  nodes: N[],
  edges: LayoutEdge[],
  direction: 'lr' | 'td',
  config: LayoutConfig = DEFAULT_STORY_CONFIG,
): N[] {
  if (nodes.length === 0) return [];

  const { paddingX, paddingY, componentSpacing, defaultWidth, defaultHeight, crossAxisBase } = config;
  const nodeMap = new Map(nodes.map(node => [node.id, node]));
  const graph = buildGraph(nodes, edges);
  const components = connectedComponents(graph);
  const finalPositions = new Map<string, { x: number; y: number }>();
  let currentOffsetPrimary = 0;

  components.forEach(componentNodeIds => {
    const componentNodeSet = new Set(componentNodeIds);
    
    // --- HUB-AND-SPOKE PRE-PROCESSING ---
    // Detect "Hub and Spoke" story quirks:
    // A node S is a "spoke" of hub H if:
    // 1. S has exactly 1 incoming edge (ignoring duplicates), which comes from H.
    // 2. S has 0 outgoing edges, OR exactly 1 outgoing edge that goes back to H.
    const inEdges = new Map<string, string[]>();
    const outEdges = new Map<string, string[]>();
    componentNodeIds.forEach(id => {
      inEdges.set(id, []);
      outEdges.set(id, []);
    });
    
    graph.forEachEdge((_edge, _attrs, source, target) => {
      if (componentNodeSet.has(source) && componentNodeSet.has(target)) {
        inEdges.get(target)!.push(source);
        outEdges.get(source)!.push(target);
      }
    });

    const spokes = new Map<string, string>(); // spokeId -> hubId
    const spokeBackEdges = new Set<string>(); // "spokeId||hubId"

    componentNodeIds.forEach(id => {
      // Use Set to ignore duplicate edges
      const ins = new Set(inEdges.get(id)!);
      const outs = new Set(outEdges.get(id)!);
      
      if (ins.size === 1) {
        const potentialHub = Array.from(ins)[0];
        // Only treat true loops as spokes. Dead ends (outs.size === 0) should flow to the next layer.
        if (outs.size === 1 && outs.has(potentialHub)) {
          spokes.set(id, potentialHub);
          spokeBackEdges.add(`${id}||${potentialHub}`);
        }
      }
    });
    // ------------------------------------

    let layers: string[][];
    try {
      const subgraph = new DirectedGraph();
      componentNodeIds.forEach(id => subgraph.addNode(id));
      graph.forEachEdge((_edge, _attrs, source, target) => {
        if (componentNodeSet.has(source) && componentNodeSet.has(target)) {
          // Ignore spoke back-edges to prevent artificial cycle creation
          if (spokeBackEdges.has(`${source}||${target}`)) return;
          if (!subgraph.hasDirectedEdge(source, target)) subgraph.addDirectedEdge(source, target);
        }
      });
      layers = topologicalGenerations(subgraph);
    } catch {
      layers = bfsLayers(componentNodeIds, graph, componentNodeSet, spokeBackEdges);
    }

    const nodeToLayer = new Map<string, number>();
    layers.forEach((layer, i) => layer.forEach(id => nodeToLayer.set(id, i)));

    // Remove spokes from their current layers
    for (let i = 0; i < layers.length; i++) {
      layers[i] = layers[i].filter(id => !spokes.has(id));
    }

    // Insert spokes into their hub's layer
    spokes.forEach((hubId, spokeId) => {
      const node = nodeMap.get(spokeId);
      if (node) node.isSpoke = true;

      const parentLayerIdx = nodeToLayer.get(hubId);
      if (parentLayerIdx !== undefined) {
        const layerArray = layers[parentLayerIdx];
        const parentPos = layerArray.indexOf(hubId);
        if (parentPos !== -1) {
          layerArray.splice(parentPos + 1, 0, spokeId);
          nodeToLayer.set(spokeId, parentLayerIdx);
        } else {
          // Fallback if hub was also removed (unlikely but safe)
          layerArray.push(spokeId);
          nodeToLayer.set(spokeId, parentLayerIdx);
        }
      }
    });

    layers = layers.filter(layer => layer.length > 0);

    let layerPrimary = 0;
    layers.forEach(layer => {
      let maxCrossSize = 0;
      let totalCrossSize = 0;

      layer.forEach(id => {
        const node = nodeMap.get(id);
        if (!node) return;
        const primarySize = direction === 'lr' ? node.width : node.height;
        const crossSize   = direction === 'lr' ? node.height : node.width;
        maxCrossSize   = Math.max(maxCrossSize, primarySize);
        totalCrossSize += crossSize;
      });

      totalCrossSize += (layer.length - 1) * paddingY;
      let currentCross = -totalCrossSize / 2;

      layer.forEach(id => {
        const node = nodeMap.get(id);
        if (!node) return;
        const primarySize = direction === 'lr' ? node.width : node.height;
        const crossSize   = direction === 'lr' ? node.height : node.width;
        const primary = currentOffsetPrimary + layerPrimary + (maxCrossSize - primarySize) / 2;
        const cross   = currentCross + crossAxisBase;

        finalPositions.set(id, direction === 'lr'
          ? { x: primary, y: cross }
          : { x: cross, y: primary });

        currentCross += crossSize + paddingY;
      });

      layerPrimary += maxCrossSize + paddingX;
    });

    const componentPrimary = Math.max(layerPrimary - paddingX, direction === 'lr' ? defaultWidth : defaultHeight);
    currentOffsetPrimary += componentPrimary + componentSpacing;
  });

  // Normalise cross-axis
  if (finalPositions.size > 0) {
    let minCross = Infinity;
    finalPositions.forEach(pos => { const cross = direction === 'lr' ? pos.y : pos.x; minCross = Math.min(minCross, cross); });
    const shift = crossAxisBase - minCross;
    finalPositions.forEach(pos => { if (direction === 'lr') pos.y += shift; else pos.x += shift; });
  }

  return nodes.map(node => ({
    ...node,
    position: finalPositions.get(node.id) ?? node.position,
  }));
}

/** Build clusters from nodes by grouping mode. */
export function buildClustersGeneric<N extends LayoutNode>(
  nodes: N[],
  edges: LayoutEdge[],
  groupingMode: 'none' | 'connected-component' | 'filename-prefix',
  prefixExtractor: (node: N) => string | null,
): LayoutCluster[] {
  if (groupingMode === 'connected-component') {
    return getConnectedComponents(nodes, edges).map((nodeIds, index) => ({
      id: `component-${index}`,
      nodeIds,
    }));
  }

  if (groupingMode === 'filename-prefix') {
    const clusters = new Map<string, string[]>();
    const singletons: string[] = [];
    nodes.forEach(node => {
      const prefix = prefixExtractor(node);
      if (!prefix) { singletons.push(node.id); return; }
      const list = clusters.get(prefix) ?? [];
      list.push(node.id);
      clusters.set(prefix, list);
    });
    const result: LayoutCluster[] = [];
    clusters.forEach((nodeIds, id) => {
      if (nodeIds.length > 1) result.push({ id, nodeIds });
      else singletons.push(nodeIds[0]);
    });
    singletons.forEach((id, index) => result.push({ id: `single-${index}-${id}`, nodeIds: [id] }));
    return result;
  }

  return nodes.map(node => ({ id: node.id, nodeIds: [node.id] }));
}

/**
 * Radial (Star) layout algorithm for Hub / Web narrative formations.
 * Places the highest degree node at the center and orbits connected nodes around it.
 */
export function computeRadialLayout<N extends LayoutNode>(
  nodes: N[],
  edges: LayoutEdge[],
  config: LayoutConfig = DEFAULT_STORY_CONFIG,
): N[] {
  if (nodes.length === 0) return [];
  
  // Find hub node
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  nodes.forEach(n => { inDegree.set(n.id, 0); outDegree.set(n.id, 0); });
  edges.forEach(e => {
    if (outDegree.has(e.sourceId)) outDegree.set(e.sourceId, outDegree.get(e.sourceId)! + 1);
    if (inDegree.has(e.targetId)) inDegree.set(e.targetId, inDegree.get(e.targetId)! + 1);
  });

  let hubId = nodes[0].id;
  let maxDegree = -1;
  nodes.forEach(n => {
    const deg = (inDegree.get(n.id) || 0) + (outDegree.get(n.id) || 0);
    if (deg > maxDegree) { maxDegree = deg; hubId = n.id; }
  });

  // Calculate BFS distance from hub
  const dist = new Map<string, number>();
  const queue: {id: string, d: number}[] = [{id: hubId, d: 0}];
  dist.set(hubId, 0);
  
  // Adjacency list
  const adj = new Map<string, string[]>();
  nodes.forEach(n => adj.set(n.id, []));
  edges.forEach(e => {
    if (adj.has(e.sourceId)) adj.get(e.sourceId)!.push(e.targetId);
    if (adj.has(e.targetId)) adj.get(e.targetId)!.push(e.sourceId);
  });

  while (queue.length > 0) {
    const { id, d } = queue.shift()!;
    adj.get(id)!.forEach(neighbor => {
      if (!dist.has(neighbor)) {
        dist.set(neighbor, d + 1);
        queue.push({ id: neighbor, d: d + 1 });
      }
    });
  }

  // Any unreachable nodes put at distance 1
  nodes.forEach(n => { if (!dist.has(n.id)) dist.set(n.id, 1); });

  // Group by distance
  const layers = new Map<number, string[]>();
  let maxDist = 0;
  dist.forEach((d, id) => {
    if (!layers.has(d)) layers.set(d, []);
    layers.get(d)!.push(id);
    if (d > maxDist) maxDist = d;
  });

  const finalPositions = new Map<string, { x: number; y: number }>();
  finalPositions.set(hubId, { x: 0, y: 0 });

  const radiusStep = 450; // Distance between concentric circles

  for (let d = 1; d <= maxDist; d++) {
    const layerNodes = layers.get(d) || [];
    if (layerNodes.length === 0) continue;
    
    const radius = d * radiusStep;
    const angleStep = (2 * Math.PI) / layerNodes.length;
    
    layerNodes.forEach((id, i) => {
      const angle = i * angleStep;
      finalPositions.set(id, {
        x: Math.round(Math.cos(angle) * radius),
        y: Math.round(Math.sin(angle) * radius)
      });
    });
  }

  // Shift everything so minimum x, y is at config.paddingX, config.paddingY
  let minX = Infinity, minY = Infinity;
  finalPositions.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
  });

  const offsetX = config.paddingX - minX + 300;
  const offsetY = config.paddingY - minY + 100;

  return nodes.map(node => ({
    ...node,
    position: finalPositions.has(node.id) 
      ? { x: finalPositions.get(node.id)!.x + offsetX, y: finalPositions.get(node.id)!.y + offsetY }
      : node.position
  }));
}

/**
 * Force-directed (spring + repulsion) layout for open-world RPG graphs.
 * Produces an organic 2D spread similar to Twine's map view.
 * Uses adjacency-list spring forces (O(E)) + full repulsion (O(n²)).
 */
export function computeForceDirectedLayout<N extends LayoutNode>(
  nodes: N[],
  edges: LayoutEdge[],
  config: LayoutConfig = DEFAULT_STORY_CONFIG,
): N[] {
  if (nodes.length === 0) return [];
  if (nodes.length === 1) return [{ ...nodes[0], position: { x: config.paddingX + 400, y: config.paddingY + 300 } }];

  const NODE_W = config.defaultWidth  || 220;
  const NODE_H = config.defaultHeight || 110;
  // Natural spring length — must be comfortably larger than node diagonal so nodes don't overlap
  const SPRING_LEN  = Math.max(NODE_W, NODE_H) * 3.8;  // ~836px for 220-wide nodes — wider spread
  const SPRING_K    = 0.045;
  const REPULSION   = 220000;
  const GRAVITY     = 0.0008;   // very weak — let nodes spread naturally
  const DAMPING     = 0.82;
  const MAX_SPEED   = 80;
  const ITERATIONS  = 500;

  // Build adjacency list (undirected) for O(E) spring forces
  const adjList = new Map<string, Set<string>>();
  nodes.forEach(n => adjList.set(n.id, new Set()));
  edges.forEach(e => {
    if (adjList.has(e.sourceId) && adjList.has(e.targetId)) {
      adjList.get(e.sourceId)!.add(e.targetId);
      adjList.get(e.targetId)!.add(e.sourceId);
    }
  });

  // Seeded positions: arrange on a wide, squat ellipse to avoid symmetry lock
  const pos: Record<string, { x: number; y: number }> = {};
  const vel: Record<string, { x: number; y: number }> = {};
  const CX = 3000, CY = 1800;
  const RX = Math.max(nodes.length * 18, 800);
  const RY = Math.max(nodes.length * 9,  400);
  nodes.forEach((n, i) => {
    const angle = (i / nodes.length) * 2 * Math.PI;
    pos[n.id] = {
      x: CX + Math.cos(angle) * RX + (Math.random() - 0.5) * 60,
      y: CY + Math.sin(angle) * RY + (Math.random() - 0.5) * 40,
    };
    vel[n.id] = { x: 0, y: 0 };
  });

  const nodeList = nodes.map(n => n.id);

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Cooling: reduce forces over time for stability
    const cool = 1 - iter / ITERATIONS;
    const force: Record<string, { x: number; y: number }> = {};
    nodeList.forEach(id => { force[id] = { x: 0, y: 0 }; });

    // ── Repulsion: every pair pushes apart ─────────────────────────────────
    for (let i = 0; i < nodeList.length; i++) {
      for (let j = i + 1; j < nodeList.length; j++) {
        const a = nodeList[i], b = nodeList[j];
        const dx = pos[a].x - pos[b].x;
        const dy = pos[a].y - pos[b].y;
        const distSq = Math.max(dx * dx + dy * dy, 1);
        const dist   = Math.sqrt(distSq);
        const f = REPULSION / distSq;
        const fx = (dx / dist) * f;
        const fy = (dy / dist) * f;
        force[a].x += fx;  force[a].y += fy;
        force[b].x -= fx;  force[b].y -= fy;
      }
    }

    // ── Spring attraction: only actual connected pairs ──────────────────────
    nodeList.forEach(a => {
      adjList.get(a)!.forEach(b => {
        if (b < a) return; // process each undirected edge once
        const dx = pos[b].x - pos[a].x;
        const dy = pos[b].y - pos[a].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const disp = dist - SPRING_LEN;
        const fx = (dx / dist) * disp * SPRING_K;
        const fy = (dy / dist) * disp * SPRING_K;
        force[a].x += fx;  force[a].y += fy;
        force[b].x -= fx;  force[b].y -= fy;
      });
    });

    // ── Gravity: pull toward centre ────────────────────────────────────────
    nodeList.forEach(id => {
      force[id].x += (CX - pos[id].x) * GRAVITY;
      force[id].y += (CY - pos[id].y) * GRAVITY;
    });

    // ── Integrate ──────────────────────────────────────────────────────────
    nodeList.forEach(id => {
      vel[id].x = (vel[id].x + force[id].x * cool) * DAMPING;
      vel[id].y = (vel[id].y + force[id].y * cool) * DAMPING;
      const spd = Math.sqrt(vel[id].x ** 2 + vel[id].y ** 2);
      if (spd > MAX_SPEED) {
        vel[id].x = (vel[id].x / spd) * MAX_SPEED;
        vel[id].y = (vel[id].y / spd) * MAX_SPEED;
      }
      pos[id].x += vel[id].x;
      pos[id].y += vel[id].y;
    });
  }

  // Normalize so min corner = (paddingX, paddingY)
  let minX = Infinity, minY = Infinity;
  nodeList.forEach(id => {
    if (pos[id].x < minX) minX = pos[id].x;
    if (pos[id].y < minY) minY = pos[id].y;
  });
  nodeList.forEach(id => {
    pos[id].x = Math.round(pos[id].x + config.paddingX - minX);
    pos[id].y = Math.round(pos[id].y + config.paddingY - minY);
  });

  return nodes.map(n => ({ ...n, position: pos[n.id] ?? n.position }));
}

/**
 * Dispatcher for narrative-aware layout engine.
 */
export function computeAutoLayout<N extends LayoutNode>(
  nodes: N[],
  edges: LayoutEdge[],
  formation: 'flow' | 'hub' | 'parallel' | 'world' | 'rpg' | 'tutorial',
  config: LayoutConfig = DEFAULT_STORY_CONFIG
): N[] {
  if (formation === 'hub') {
    return computeRadialLayout(nodes, edges, config);
  }

  if (formation === 'world') {
    return computeForceDirectedLayout(nodes, edges, config);
  }

  if (formation === 'rpg') {
    return computeMaxRpgLayout(nodes, edges, config);
  }

  if (formation === 'tutorial') {
    return computeTutorialLayout(nodes, edges, config);
  }
  
  if (formation === 'parallel') {
    // Modify config to spread columns wider for better parallel visual separation
    const parallelConfig = { ...config, paddingY: config.paddingY * 2.5, componentSpacing: config.componentSpacing * 1.5 };
    return computeLayeredLayoutGeneric(nodes, edges, 'lr', parallelConfig);
  }

  // Default 'flow' is Sugiyama DAG
  return computeLayeredLayoutGeneric(nodes, edges, 'lr', config);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAX RPG LAYOUT — Geographical map layout inspired by Max's Twine methodology
// ─────────────────────────────────────────────────────────────────────────────

/** Classify a node by its semantic name to determine geography type. */
type GeoType = 'highway' | 'ascend' | 'descend' | 'satellite' | 'normal';

function classifyGeoType(name: string): GeoType {
  const n = name.toLowerCase();

  // Satellites: leaf NPCs and items — orbit their parent room
  if (/^npc[\s_-]|^item[\s_-]|^shop[\s_-]/.test(n)) return 'satellite';

  // Ascending zones — physically go UP the canvas
  if (/tower|roof|sky|top[\s_-]|level[\s_-]|floor[\s_-]|climb|height|summit|cloud|space|planet|star[\s_-]|astroid|cannon/.test(n)) return 'ascend';

  // Descending zones — physically go DOWN the canvas
  if (/cave|ocean|sea|water|under|pit|basement|bottom|depth|swim|dive|lake|river|call|phone/.test(n)) return 'descend';

  // Highways: main overworld traversal nodes — form the horizontal equator
  if (/^plaza[\s_-]|^road[\s_-]|^path[\s_-]|^city[\s_-\d]|^forest[\s_\d]|^area[\s_-]|^zone[\s_-]|^world[\s_-]|^region/.test(n)) return 'highway';

  return 'normal';
}

/**
 * Max RPG Layout — mirrors the exact geographical mapping methodology from
 * "The Meme King" Twine map:
 *
 * • Highway nodes (plaza, forest, city, ocean) → horizontal equator spine
 * • Ascending nodes (tower, sky, space)        → stack UPWARD from their parent
 * • Descending nodes (cave, ocean, pit)        → stack DOWNWARD from their parent
 * • Satellite nodes (npc, item)                → tight orbit around parent room
 * • Everything else                            → fills in above/below the equator
 */
export function computeMaxRpgLayout<N extends LayoutNode>(
  nodes: N[],
  edges: LayoutEdge[],
  config: LayoutConfig = DEFAULT_STORY_CONFIG,
): N[] {
  if (nodes.length === 0) return [];

  const NODE_W    = config.defaultWidth  || 220;
  const NODE_H    = config.defaultHeight || 110;
  const H_GAP     = NODE_W + 120;  // horizontal gap between highway nodes
  const V_GAP     = NODE_H + 80;   // vertical gap between stacked nodes
  const EQUATOR_Y = 3000;          // baseline Y for the main highway
  const ORBIT_R   = NODE_H * 1.5;  // radius for satellite orbits

  // ── Build adjacency maps ────────────────────────────────────────────────────
  const childrenOf = new Map<string, string[]>();
  const parentOf   = new Map<string, string>();
  nodes.forEach(n => childrenOf.set(n.id, []));

  edges.forEach(e => {
    if (!childrenOf.has(e.sourceId) || !childrenOf.has(e.targetId)) return;
    if (!childrenOf.get(e.sourceId)!.includes(e.targetId)) {
      childrenOf.get(e.sourceId)!.push(e.targetId);
    }
    if (!parentOf.has(e.targetId)) {
      parentOf.set(e.targetId, e.sourceId);
    }
  });

  const nodeById = new Map<string, N>(nodes.map(n => [n.id, n]));
  const pos      = new Map<string, { x: number; y: number }>();
  const placed   = new Set<string>();

  // ── Step 1: Identify highway nodes ─────────────────────────────────────────
  // Highways are either named as such, OR have many connections (high-traffic hubs)
  const degree = new Map<string, number>();
  nodes.forEach(n => degree.set(n.id, 0));
  edges.forEach(e => {
    degree.set(e.sourceId, (degree.get(e.sourceId) ?? 0) + 1);
    degree.set(e.targetId, (degree.get(e.targetId) ?? 0) + 1);
  });
  const avgDegree = nodes.length > 0
    ? [...degree.values()].reduce((a, b) => a + b, 0) / nodes.length : 1;

  const highwayNodes = nodes.filter(n => {
    const geo = classifyGeoType(n.id);
    const isNamedHighway = geo === 'highway';
    const isHeavyHub = (degree.get(n.id) ?? 0) >= Math.max(4, avgDegree * 2);
    return isNamedHighway || isHeavyHub;
  });

  // Sort highway nodes by their connectivity depth (BFS from start → left-to-right)
  const startId = nodes[0]?.id;
  const bfsOrder = new Map<string, number>();
  const queue = [startId];
  bfsOrder.set(startId, 0);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const rank = bfsOrder.get(cur) ?? 0;
    childrenOf.get(cur)?.forEach(child => {
      if (!bfsOrder.has(child)) {
        bfsOrder.set(child, rank + 1);
        queue.push(child);
      }
    });
  }
  highwayNodes.sort((a, b) => (bfsOrder.get(a.id) ?? 999) - (bfsOrder.get(b.id) ?? 999));

  // Place highway nodes along the equator
  highwayNodes.forEach((n, i) => {
    pos.set(n.id, { x: config.paddingX + i * H_GAP, y: EQUATOR_Y });
    placed.add(n.id);
  });

  // ── Step 2: Place ascending / descending chains ─────────────────────────────
  const placeChain = (
    nodeId: string,
    parentX: number,
    parentY: number,
    direction: 1 | -1,  // -1 = up (ascend), +1 = down (descend)
    depth: number,
  ) => {
    if (placed.has(nodeId) || depth > 20) return;
    placed.add(nodeId);
    const x = parentX;
    const y = parentY + direction * V_GAP;
    pos.set(nodeId, { x, y });
    // Recurse on children of same geo type
    childrenOf.get(nodeId)?.forEach(child => {
      if (placed.has(child)) return;
      const childGeo = classifyGeoType(child);
      if (childGeo === 'satellite') return; // handled later
      placeChain(child, x, y, direction, depth + 1);
    });
  };

  // For each highway node, look at its children and route them up/down/flat
  highwayNodes.forEach(hw => {
    const hwPos = pos.get(hw.id)!;
    childrenOf.get(hw.id)?.forEach((childId, idx) => {
      if (placed.has(childId)) return;
      const childGeo = classifyGeoType(childId);
      if (childGeo === 'satellite') return;
      if (childGeo === 'ascend') {
        placeChain(childId, hwPos.x + (idx - 0.5) * (H_GAP / 2), hwPos.y, -1, 0);
      } else if (childGeo === 'descend') {
        placeChain(childId, hwPos.x + (idx - 0.5) * (H_GAP / 2), hwPos.y, 1, 0);
      } else {
        // Side rooms — place slightly above/below the equator, alternating
        const sideY = hwPos.y + (idx % 2 === 0 ? -1 : 1) * V_GAP;
        pos.set(childId, { x: hwPos.x, y: sideY });
        placed.add(childId);
      }
    });
  });

  // ── Step 3: Place all remaining unplaced non-satellite nodes ───────────────
  // Group unplaced nodes by their closest placed ancestor
  let colIdx = 0;
  nodes.forEach(n => {
    if (placed.has(n.id) || classifyGeoType(n.id) === 'satellite') return;
    // Try to find a placed ancestor for context
    let anchorX = config.paddingX + colIdx * H_GAP;
    let anchorY = EQUATOR_Y;
    let cur: string | undefined = parentOf.get(n.id);
    const seen = new Set<string>();
    while (cur && !placed.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = parentOf.get(cur);
    }
    if (cur && pos.has(cur)) {
      const anchorPos = pos.get(cur)!;
      anchorX = anchorPos.x;
      anchorY = anchorPos.y;
    } else {
      colIdx++;
    }
    const geo = classifyGeoType(n.id);
    const offsetY = geo === 'ascend' ? -V_GAP * 2 : geo === 'descend' ? V_GAP * 2 : 0;
    pos.set(n.id, { x: anchorX, y: anchorY + offsetY });
    placed.add(n.id);
    // Recurse on unplaced children
    placeChain(n.id, anchorX, anchorY + offsetY, geo === 'ascend' ? -1 : 1, 0);
  });

  // ── Step 4: Orbit satellites around their parent room ─────────────────────
  nodes.forEach(n => {
    if (classifyGeoType(n.id) !== 'satellite') return;
    const par = parentOf.get(n.id);
    if (!par || !pos.has(par)) {
      // No parent found — place in a row at the bottom
      pos.set(n.id, { x: config.paddingX + (colIdx++) * H_GAP, y: EQUATOR_Y + V_GAP * 3 });
      return;
    }
    const siblings = nodes.filter(
      s => classifyGeoType(s.id) === 'satellite' && parentOf.get(s.id) === par
    );
    const myIdx   = siblings.findIndex(s => s.id === n.id);
    const total   = siblings.length;
    // Spread around a semicircle below the parent
    const angle = Math.PI + myIdx * (Math.PI / Math.max(total, 1));
    const pPos  = pos.get(par)!;
    pos.set(n.id, {
      x: Math.round(pPos.x + Math.cos(angle) * ORBIT_R * (myIdx % 2 === 0 ? 1 : 1.5)),
      y: Math.round(pPos.y + Math.abs(Math.sin(angle)) * ORBIT_R + NODE_H * 0.5),
    });
  });

  // ── Step 5: Normalise: shift everything so min = (paddingX, paddingY) ─────
  let minX = Infinity, minY = Infinity;
  pos.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
  });
  pos.forEach((p, id) => {
    pos.set(id, {
      x: Math.round(p.x - minX + config.paddingX),
      y: Math.round(p.y - minY + config.paddingY),
    });
  });

  return nodes.map(n => ({
    ...n,
    position: pos.get(n.id) ?? { x: config.paddingX, y: config.paddingY },
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// TUTORIAL LAYOUT — Semantically-aware: Menu → Hub → Section Columns → Lessons
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tutorial Layout — purpose-built for hub-loop tutorial structures.
 *
 * Mirrors the Ren'Py tutorial's actual architecture:
 *
 *          [Main Menu / Start]           ← Row 0, force-centred
 *                   │
 *          [Hub / Lesson Select]         ← Row 1, force-centred
 *          ┌────────┴────────┐
 *    [Quickstart Group]  [In-Depth Group]← Row 2, side-by-side section grids
 *     L1  L2  L3           L8  L9  L10
 *     L4  L5  L6           L11 L12
 *     L7                   L13
 *      │
 *    [Sub-Lesson]                        ← directly below parent lesson
 *
 * Algorithm:
 *  1. Build in/out degree maps + BFS depth from root
 *  2. Classify each node: menu | hub | lesson | sub_lesson
 *  3. Hub forced to horizontal centre, menu centred above it
 *  4. Lessons at BFS depth 2 grouped into section-clusters by their
 *     connected-component membership (disconnected = separate section)
 *  5. Each section grid-packed into columns of ≤ LESSONS_PER_COL
 *  6. Sub-lessons (depth ≥ 3) nested directly below their parent
 *  7. Normalise so min corner = (paddingX, paddingY)
 */
export function computeTutorialLayout<N extends LayoutNode>(
  nodes: N[],
  edges: LayoutEdge[],
  config: LayoutConfig = DEFAULT_STORY_CONFIG,
): N[] {
  if (nodes.length === 0) return [];

  // ── Tuned constants ────────────────────────────────────────────────────────
  const NODE_W         = config.defaultWidth  || 220;
  const NODE_H         = config.defaultHeight || 110;
  const ROW_GAP        = 300;   // vertical gap between rows
  const COL_GAP        = 120;   // horizontal gap between lesson columns within a section
  const SECTION_GAP    = 260;   // extra horizontal gap between section groups
  const LESSONS_PER_COL = 7;    // lessons per column before wrapping
  const ORIGIN_X       = config.paddingX || 100;
  const ORIGIN_Y       = config.paddingY || 100;

  // ── Build adjacency / degree maps ─────────────────────────────────────────
  const outEdges = new Map<string, string[]>();
  const inEdges  = new Map<string, string[]>();
  nodes.forEach(n => { outEdges.set(n.id, []); inEdges.set(n.id, []); });
  edges.forEach(e => {
    if (!outEdges.has(e.sourceId) || !outEdges.has(e.targetId)) return;
    outEdges.get(e.sourceId)!.push(e.targetId);
    inEdges.get(e.targetId)!.push(e.sourceId);
  });

  // ── BFS depth from root(s) ─────────────────────────────────────────────────
  // Roots = nodes with no incoming edges from within the set
  const nodeIds = new Set(nodes.map(n => n.id));
  const depth   = new Map<string, number>();
  const queue: string[] = [];

  nodes.forEach(n => {
    const validIn = inEdges.get(n.id)!.filter(s => nodeIds.has(s));
    if (n.id === 'main_menu' || validIn.length === 0) { depth.set(n.id, 0); queue.push(n.id); }
  });
  // Fallback: seed with first node if no roots found (all cyclic)
  if (queue.length === 0 && nodes.length > 0) { depth.set(nodes[0].id, 0); queue.push(nodes[0].id); }

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const d   = depth.get(cur)!;
    outEdges.get(cur)!.forEach(child => {
      if (!depth.has(child)) { depth.set(child, d + 1); queue.push(child); }
    });
  }
  // Any unreachable nodes → depth 2 (treat as lessons)
  nodes.forEach(n => { if (!depth.has(n.id)) depth.set(n.id, 2); });

  // ── Classify roles ─────────────────────────────────────────────────────────
  type TRole = 'menu' | 'hub' | 'lesson' | 'sub_lesson';
  const role = new Map<string, TRole>();

  nodes.forEach(n => {
    const d       = depth.get(n.id)!;
    const outDeg  = outEdges.get(n.id)!.filter(t => nodeIds.has(t)).length;
    const label   = n.id.toLowerCase();
    let r: TRole;

    if (d === 0) {
      r = 'menu';
    } else if (d === 1 || outDeg >= 3 || label.includes('hub') || label.includes('select')) {
      r = 'hub';
    } else if (d === 2) {
      r = 'lesson';
    } else {
      r = 'sub_lesson';
    }
    role.set(n.id, r);
  });

  // ── Grouping logic replaced by Spine and Ribs placement ────────────────────

  const menuNodes     = nodes.filter(n => role.get(n.id) === 'menu');
  const hubNodes      = nodes.filter(n => role.get(n.id) === 'hub');
  const lessonNodes   = nodes.filter(n => role.get(n.id) === 'lesson');
  const subNodes      = nodes.filter(n => role.get(n.id) === 'sub_lesson');

  const pos = new Map<string, { x: number; y: number }>();
  let currentY = 0;

  // Track the next available X position for any given Y row
  const nextXForY = new Map<number, number>();

  // 1. Place the Spine (Menu -> Hub -> Lessons)
  const placeSpineNode = (n: N) => {
    pos.set(n.id, { x: 0, y: currentY });
    nextXForY.set(currentY, (n.width || NODE_W) + COL_GAP * 2);
    currentY += NODE_H + ROW_GAP;
  };

  menuNodes.forEach(placeSpineNode);
  hubNodes.forEach(placeSpineNode);
  
  // Sort lessons by ID to ensure consistent spine ordering
  lessonNodes.sort((a, b) => a.id.localeCompare(b.id));
  lessonNodes.forEach(placeSpineNode);

  // 2. Place the Ribs (Sub-lessons extending horizontally to the right)
  // Sort by depth so parents are placed before children
  subNodes.sort((a, b) => depth.get(a.id)! - depth.get(b.id)!);

  subNodes.forEach(n => {
    const parents = inEdges.get(n.id) || [];
    const placedParentId = parents.find(pId => pos.has(pId));
    
    let targetY = 0;
    if (placedParentId) {
      targetY = pos.get(placedParentId)!.y;
    } else {
      // Fallback if disconnected
      targetY = currentY;
      nextXForY.set(targetY, 0);
      currentY += NODE_H + ROW_GAP;
    }

    const startX = nextXForY.get(targetY) || 0;
    pos.set(n.id, { x: startX, y: targetY });
    
    // Increment the next available X for this horizontal row
    nextXForY.set(targetY, startX + (n.width || NODE_W) + COL_GAP);
  });

  // 3. Fallback for any unplaced nodes
  nodes.forEach(n => {
    if (!pos.has(n.id)) {
      pos.set(n.id, { x: 0, y: currentY });
      currentY += NODE_H + ROW_GAP;
    }
  });

  // ── Normalise: shift min to (ORIGIN_X, ORIGIN_Y) ──────────────────────────
  let minX = Infinity, minY = Infinity;
  pos.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
  });

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  return nodes.map(n => ({
    ...n,
    position: {
      x: Math.round((pos.get(n.id)?.x ?? 0) - minX + ORIGIN_X),
      y: Math.round((pos.get(n.id)?.y ?? 0) - minY + ORIGIN_Y),
    },
  }));
}

