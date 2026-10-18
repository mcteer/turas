/** Stable byte-bounded pages: the next page starts after the actual previous
 * page, rather than skipping `limit` records when the byte bound ends it early. */
export function contextPage<T>(entries: readonly T[], page: number, limit: number,
  byteLimit = 24 * 1024) {
  const pages: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  let oversized = 0;
  for (const entry of entries) {
    const size = Buffer.byteLength(JSON.stringify(entry));
    if (size > byteLimit) { oversized++; continue; }
    if (current.length >= limit || bytes + size > byteLimit) {
      pages.push(current); current = []; bytes = 0;
    }
    current.push(entry); bytes += size;
  }
  if (current.length) pages.push(current);
  return { entries: pages[page - 1] ?? [], hasNextPage: page < pages.length,
    oversized };
}
