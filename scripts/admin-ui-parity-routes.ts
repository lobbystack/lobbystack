export function routeShape(path: string): string {
  return path.split(/[?#]/)[0]!.replace(/\[[^\]]+\]/g, "[]").replace(/:[^/]+/g, "[]");
}

export function withoutLocaleSegment(path: string): string {
  return path.replace(/^\/\[locale\](?=\/|$)/, "") || "/";
}

export function resolvePortVisualPath(path: string, locale: string, localizedPortRoutes: string[]): string {
  const shape = routeShape(path);
  const localized = localizedPortRoutes.some((route) => routeShape(withoutLocaleSegment(route)) === shape);
  return localized ? `/${locale}${path === "/" ? "" : path}` : path;
}
