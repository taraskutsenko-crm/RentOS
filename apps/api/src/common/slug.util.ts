const DIACRITICS_PATTERN = /[̀-ͯ]/g;

/** Converts arbitrary text into a URL-safe, lowercase slug fragment. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(DIACRITICS_PATTERN, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Appends a short random suffix, used to disambiguate slug collisions. */
export function withRandomSuffix(slug: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${slug}-${suffix}`;
}
