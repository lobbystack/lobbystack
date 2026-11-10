/** A page's `searchParams`, as Next passes them. */
export type PageSearchParams = Record<string, string | string[] | undefined>;

/** `path` with the page's query string, so a server redirect keeps it. */
export function withSearchParams(path: string, searchParams: PageSearchParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}
