import ts from "typescript";

/** Read literal React Router paths without executing the historical application. */
export function referenceUiRoutes(source: string): string[] {
  const file = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const routes = new Set<string>();
  function walk(node: ts.Node, parentPath = "") {
    const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : undefined;
    if (opening?.tagName.getText(file) === "Route") {
      const attributes = opening.attributes.properties;
      const pathAttribute = attributes.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(file) === "path");
      const initializer = pathAttribute && ts.isJsxAttribute(pathAttribute) ? pathAttribute.initializer : undefined;
      const expression = initializer && ts.isJsxExpression(initializer) ? initializer.expression : initializer;
      const path = expression && ts.isStringLiteralLike(expression) ? expression.text : undefined;
      const index = attributes.some(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(file) === "index");
      const joined = path?.startsWith("/") ? path : path ? `${parentPath}/${path}` : parentPath;
      const normalized = joined.replace(/\/\*$/, "").replace(/\/+$/, "") || "/";
      if ((path !== undefined && path !== "*") || index) routes.add(normalized);
      if (ts.isJsxElement(node)) for (const child of node.children) walk(child, path === "*" ? parentPath : normalized);
      return;
    }
    ts.forEachChild(node, child => walk(child, parentPath));
  }
  walk(file);
  return [...routes].sort();
}
