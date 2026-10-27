export function terminalHull({ cells, root, targets, size = 96, diagonalGuard = false }) {
  const graphCells = [...new Set(cells)].sort((a, b) => a - b);
  const present = new Set(graphCells);
  if (!Number.isInteger(size) || size < 1 || graphCells.some(cell => !Number.isInteger(cell) || cell < 0 || cell >= size * size)) {
    throw new RangeError('cells must contain valid grid indices');
  }
  const marked = [...new Set([root, ...targets])].sort((a, b) => a - b);
  if (!marked.length || marked.some(cell => !present.has(cell))) throw new RangeError('root and targets must be present in cells');

  const neighbors = new Map();
  for (const cell of graphCells) {
    const x = cell % size, y = Math.floor(cell / size), adjacent = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
      const next = ny * size + nx;
      if (!present.has(next)) continue;
      if (diagonalGuard && dx && dy && (present.has(y * size + nx) || present.has(ny * size + x))) continue;
      adjacent.push(next);
    }
    neighbors.set(cell, adjacent);
  }

  const discovery = new Map(), low = new Map(), parent = new Map(), edgeStack = [], blocks = [];
  let clock = 0;
  discovery.set(root, ++clock); low.set(root, clock);
  const dfs = [{ cell: root, next: 0 }];
  while (dfs.length) {
    const frame = dfs[dfs.length - 1], adjacent = neighbors.get(frame.cell);
    if (frame.next < adjacent.length) {
      const next = adjacent[frame.next++];
      if (!discovery.has(next)) {
        parent.set(next, frame.cell); edgeStack.push([frame.cell, next]);
        discovery.set(next, ++clock); low.set(next, clock); dfs.push({ cell: next, next: 0 });
      } else if (next !== parent.get(frame.cell) && discovery.get(next) < discovery.get(frame.cell)) {
        edgeStack.push([frame.cell, next]);
        low.set(frame.cell, Math.min(low.get(frame.cell), discovery.get(next)));
      }
    } else {
      dfs.pop();
      if (parent.has(frame.cell)) {
        const up = parent.get(frame.cell);
        low.set(up, Math.min(low.get(up), low.get(frame.cell)));
        if (low.get(frame.cell) >= discovery.get(up)) {
          const block = new Set();
          let edge;
          do {
            edge = edgeStack.pop(); block.add(edge[0]); block.add(edge[1]);
          } while (edge[0] !== up || edge[1] !== frame.cell);
          blocks.push([...block].sort((a, b) => a - b));
        }
      }
    }
  }
  if (discovery.size !== graphCells.length) throw new RangeError('root and targets must be in one connected graph');

  const cellNode = new Map(graphCells.map((cell, index) => [cell, blocks.length + index]));
  const blockCount = blocks.length, tree = Array.from({ length: blockCount + graphCells.length }, () => []);
  for (let index = 0; index < blocks.length; index++) for (const cell of blocks[index]) {
    const vertexNode = cellNode.get(cell);
    tree[index].push(vertexNode); tree[vertexNode].push(index);
  }
  const markedNodes = marked.map(cell => cellNode.get(cell));
  const markedSet = new Set(markedNodes);
  const degree = tree.map(row => row.length), queue = [];
  for (let node = 0; node < tree.length; node++) if (degree[node] <= 1 && !markedSet.has(node)) queue.push(node);
  const retained = new Uint8Array(tree.length);
  retained.fill(1);
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head];
    if (!retained[node] || degree[node] > 1 || markedSet.has(node)) continue;
    retained[node] = 0;
      for (const next of tree[node]) if (retained[next] && --degree[next] === 1 && !markedSet.has(next)) queue.push(next);
  }
  const hullSet = new Set();
  for (let index = 0; index < blocks.length; index++) if (retained[index]) for (const cell of blocks[index]) hullSet.add(cell);
  for (const cell of marked) hullSet.add(cell);
  const hullCells = [...hullSet].sort((a, b) => a - b);
  const outside = new Set(graphCells.filter(cell => !hullSet.has(cell))), pendantComponents = [];
  while (outside.size) {
    const first = outside.values().next().value, component = [], pending = [first]; outside.delete(first);
    while (pending.length) {
      const cell = pending.pop(); component.push(cell);
      for (const next of neighbors.get(cell)) if (outside.delete(next)) pending.push(next);
    }
    pendantComponents.push(component.sort((a, b) => a - b));
  }
  pendantComponents.sort((a, b) => a[0] - b[0]);
  return { hullCells, pendantComponents };
}
