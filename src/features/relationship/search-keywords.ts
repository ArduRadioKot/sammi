export const SEARCH_KEYWORD_LIMIT = 8;
export const SEARCH_KEYWORD_LENGTH = 100;

export function parseSearchKeywords(value: string): string[] {
  const unique = new Map<string, string>();
  for (const raw of value.split(/[\n,;]+/)) {
    const keyword = raw.trim();
    if (keyword && !unique.has(keyword.toLowerCase())) unique.set(keyword.toLowerCase(), keyword);
  }
  return [...unique.values()];
}

export function searchKeywordError(keywords: string[]) {
  return keywords.length > SEARCH_KEYWORD_LIMIT || keywords.some((word) => word.length > SEARCH_KEYWORD_LENGTH)
    ? "Укажите до 8 ключевых фраз, до 100 символов в каждой."
    : "";
}
