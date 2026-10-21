import { expect, it } from "vitest";

import { parseDeploymentMode } from "./index";

it("reads a deployment mode, and nothing from a value that names none", () => {
  expect(parseDeploymentMode("cloud")).toBe("cloud");
  expect(parseDeploymentMode(" self_hosted_standard ")).toBe("self_hosted_standard");
  expect(parseDeploymentMode("development")).toBe("development");
  expect(parseDeploymentMode("production")).toBeUndefined();
  expect(parseDeploymentMode("")).toBeUndefined();
  expect(parseDeploymentMode(undefined)).toBeUndefined();
});
