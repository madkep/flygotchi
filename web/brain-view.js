// Display-only sampling. Original node indices and simulation arrays stay intact.
function sampleBrainView(frame, maxNodes = 160, maxEdges = 180) {
  if (!frame?.nodes?.length) return { nodes: [], edges: [] };
  const groups = new Map();
  frame.nodes.forEach((node, index) => {
    const key = `${node.super_class || ''}:${node.side || ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(index);
  });
  // Round-robin anatomical classes and sides; spread samples through each group.
  const buckets = [...groups.values()].map(indices => {
    const step = Math.max(1, Math.ceil(indices.length / maxNodes));
    return indices.filter((_, i) => i % step === 0);
  });
  const selected = new Set();
  for (let offset = 0; selected.size < Math.min(maxNodes, frame.nodes.length); offset++) {
    let added = false;
    for (const bucket of buckets) {
      if (offset < bucket.length && selected.size < maxNodes) {
        selected.add(bucket[offset]); added = true;
      }
    }
    if (!added) break;
  }
  return {
    nodes: [...selected].map(index => ({ ...frame.nodes[index], sourceIndex: index })),
    edges: (frame.edges || []).filter(edge => selected.has(edge.from) && selected.has(edge.to)).slice(0, maxEdges),
  };
}
