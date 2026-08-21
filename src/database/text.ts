const DEFAULT_STORAGE_LIMIT = 16_000;
const MAX_SEARCH_TERMS = 24;

export function serializeValue(
  value: unknown,
  limit = DEFAULT_STORAGE_LIMIT,
): string {
  let serialized: string;

  if (typeof value === "string") {
    serialized = value;
  } else {
    try {
      serialized = JSON.stringify(value) ?? "null";
    } catch {
      serialized = String(value);
    }
  }

  const normalized = serialized.trim() || "null";
  return normalized.length <= limit
    ? normalized
    : `${normalized.slice(0, limit)}\n[truncated]`;
}

export function buildSearchQuery(value: unknown): string | null {
  const terms = buildSearchTerms(value);

  if (terms.length === 0) {
    return null;
  }

  return terms
    .map((term) => `"${term.replaceAll('"', '""')}"*`)
    .join(" OR ");
}

export function buildSearchTerms(value: unknown): string[] {
  const terms = serializeValue(value, 4_000)
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}_-]{2,}/gu);

  return terms ? [...new Set(terms)].slice(0, MAX_SEARCH_TERMS) : [];
}
