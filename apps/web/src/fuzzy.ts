/** Tiny fzf-like scorer: subsequence match, bonus for word starts and adjacency. */
export function fuzzyScore(query: string, text: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  let score = 0;
  let prev = -2;
  for (let ti = 0; ti < t.length && qi < q.length; ti += 1) {
    if (t[ti] === q[qi]) {
      score += 1;
      if (ti === prev + 1) score += 2;
      if (ti === 0 || /[\s#@._-]/.test(t[ti - 1]!)) score += 3;
      prev = ti;
      qi += 1;
    }
  }
  if (qi < q.length) return 0;
  return score + Math.max(0, 10 - t.length / 10);
}

export function fuzzyFilter<T>(query: string, items: T[], text: (item: T) => string): T[] {
  if (!query) return items;
  return items
    .map((item) => ({ item, s: fuzzyScore(query, text(item)) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.item);
}
