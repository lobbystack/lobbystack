/* eslint-disable @typescript-eslint/no-explicit-any */

function createApiNode(path: string): any {
  return new Proxy(
    function apiReference() {
      return path;
    },
    {
      get(_target, prop: string | symbol) {
        if (prop === "_path") {
          return path;
        }
        if (prop === "toString") {
          return () => path;
        }
        if (typeof prop !== "string") {
          return undefined;
        }
        const nextPath = path ? `${path}.${prop}` : prop;
        return createApiNode(nextPath);
      },
      apply() {
        return path;
      },
    },
  );
}

export const api: any = createApiNode("");

export function getFunctionPath(reference: { _path?: string } | string): string {
  if (typeof reference === "string") {
    return reference;
  }
  if (reference && typeof reference === "object" && typeof reference._path === "string") {
    return reference._path;
  }
  if (typeof reference === "function") {
    return String((reference as { _path?: string })._path ?? "");
  }
  return String(reference);
}

export function getFunctionName(reference: { _path?: string } | string): string {
  const path = getFunctionPath(reference);
  const parts = path.split(".");
  return parts[parts.length - 1] ?? path;
}
