// Tests for the repo-governance safeguard scripts (docs/DECISIONS.md D-040).
// Run with: node --test scripts/governance-checks.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { flattenKeys, checkI18nParity } from "./check-i18n-parity.mjs";
import { parsePermissionFile, comparePermissionRegistries } from "./check-permission-sync.mjs";
import { checkLinksInFile, collectMarkdownFiles } from "./check-doc-links.mjs";
import {
  parseBackendVariableFile,
  parseFrontendVariableFile,
  compareVariableRegistries,
} from "./check-document-variable-parity.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

function makeTempDir() {
  return mkdtempSync(path.join(tmpdir(), "rentos-governance-check-"));
}

// --- i18n parity -----------------------------------------------------

test("flattenKeys flattens nested objects into dot-path keys", () => {
  assert.deepEqual(flattenKeys({ a: { b: "x", c: "y" }, d: "z" }).sort(), ["a.b", "a.c", "d"]);
});

test("checkI18nParity passes against the real repo's locale files", () => {
  const localesDir = path.join(repoRoot, "packages", "localization", "src", "locales");
  const result = checkI18nParity(localesDir);
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.ok(result.languages.length >= 2);
});

test("checkI18nParity fails when a locale is missing a key", () => {
  const dir = makeTempDir();
  try {
    mkdirSync(path.join(dir, "en"));
    mkdirSync(path.join(dir, "de"));
    writeFileSync(path.join(dir, "en", "common.json"), JSON.stringify({ a: { b: "1" }, c: "2" }));
    writeFileSync(path.join(dir, "de", "common.json"), JSON.stringify({ a: { b: "1" } })); // missing "c"

    const result = checkI18nParity(dir);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("Missing in de") && e.includes("c")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("checkI18nParity fails when a locale has an extra key", () => {
  const dir = makeTempDir();
  try {
    mkdirSync(path.join(dir, "en"));
    mkdirSync(path.join(dir, "de"));
    writeFileSync(path.join(dir, "en", "common.json"), JSON.stringify({ a: "1" }));
    writeFileSync(path.join(dir, "de", "common.json"), JSON.stringify({ a: "1", b: "2" })); // extra "b"

    const result = checkI18nParity(dir);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("Extra in de") && e.includes("b")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- permission sync ---------------------------------------------------

test("parsePermissionFile + comparePermissionRegistries pass on the real repo's registries", () => {
  const backend = parsePermissionFile(
    path.join(repoRoot, "apps", "api", "src", "permissions", "permission.ts"),
  );
  const frontend = parsePermissionFile(
    path.join(repoRoot, "apps", "web", "src", "lib", "permissions.ts"),
  );
  const result = comparePermissionRegistries(backend, frontend);
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.ok(backend.allPermissions.length > 0);
});

test("comparePermissionRegistries fails when ALL_PERMISSIONS diverges", () => {
  const backend = {
    allPermissions: ["a.read", "a.write"],
    rolePermissions: { OWNER: ["a.read", "a.write"] },
  };
  const frontend = { allPermissions: ["a.read"], rolePermissions: { OWNER: ["a.read"] } };
  const result = comparePermissionRegistries(backend, frontend);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("ALL_PERMISSIONS mismatch")));
});

test("comparePermissionRegistries fails when a role's permission set diverges", () => {
  const backend = {
    allPermissions: ["a.read"],
    rolePermissions: { OWNER: ["a.read"], VIEWER: ["a.read"] },
  };
  const frontend = {
    allPermissions: ["a.read"],
    rolePermissions: { OWNER: ["a.read"], VIEWER: [] },
  };
  const result = comparePermissionRegistries(backend, frontend);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("ROLE_PERMISSIONS.VIEWER mismatch")));
});

test("comparePermissionRegistries passes when registries match exactly", () => {
  const backend = {
    allPermissions: ["a.read", "a.write"],
    rolePermissions: { OWNER: ["a.read", "a.write"] },
  };
  const frontend = {
    allPermissions: ["a.write", "a.read"],
    rolePermissions: { OWNER: ["a.write", "a.read"] },
  };
  const result = comparePermissionRegistries(backend, frontend);
  assert.equal(result.ok, true);
});

// --- document variable parity --------------------------------------------

test("parseBackendVariableFile + parseFrontendVariableFile pass on the real repo's registries", () => {
  const backendPaths = parseBackendVariableFile(
    path.join(
      repoRoot,
      "apps",
      "api",
      "src",
      "documents",
      "rendering",
      "document-variable-registry.ts",
    ),
  );
  const frontendPaths = parseFrontendVariableFile(
    path.join(repoRoot, "apps", "web", "src", "lib", "document-variable-registry.ts"),
  );
  const result = compareVariableRegistries(backendPaths, frontendPaths);
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.ok(backendPaths.length > 0);
});

test("compareVariableRegistries fails when a path exists only on one side", () => {
  const backendPaths = ["company.name", "customer.name"];
  const frontendPaths = ["company.name"];
  const result = compareVariableRegistries(backendPaths, frontendPaths);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("customer.name")));
});

test("compareVariableRegistries passes regardless of declaration order", () => {
  const backendPaths = ["company.name", "customer.name"];
  const frontendPaths = ["customer.name", "company.name"];
  const result = compareVariableRegistries(backendPaths, frontendPaths);
  assert.equal(result.ok, true);
});

// --- doc links -----------------------------------------------------------

test("checkLinksInFile passes against the real repo's README.md", () => {
  const result = checkLinksInFile(path.join(repoRoot, "README.md"), repoRoot);
  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.ok(result.checked > 0);
});

test("checkLinksInFile ignores external URLs and in-page anchors", () => {
  const dir = makeTempDir();
  try {
    const filePath = path.join(dir, "doc.md");
    writeFileSync(
      filePath,
      "[external](https://example.com/x) [anchor](#section) [mail](mailto:a@b.com)\n",
    );
    const result = checkLinksInFile(filePath, dir);
    assert.equal(result.ok, true);
    assert.equal(result.checked, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("checkLinksInFile fails on a broken relative link", () => {
  const dir = makeTempDir();
  try {
    const filePath = path.join(dir, "doc.md");
    writeFileSync(filePath, "[broken](./does-not-exist.md)\n");
    const result = checkLinksInFile(filePath, dir);
    assert.equal(result.ok, false);
    assert.ok(result.errors[0].includes("does-not-exist.md"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("checkLinksInFile passes on a link that resolves", () => {
  const dir = makeTempDir();
  try {
    writeFileSync(path.join(dir, "target.md"), "# Target\n");
    const filePath = path.join(dir, "doc.md");
    writeFileSync(filePath, "[ok](./target.md)\n");
    const result = checkLinksInFile(filePath, dir);
    assert.equal(result.ok, true);
    assert.equal(result.checked, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("collectMarkdownFiles finds the real docs/ tree and skips node_modules-style dirs", () => {
  const files = collectMarkdownFiles(path.join(repoRoot, "docs"));
  assert.ok(files.some((f) => f.endsWith("ARCHITECTURE_LOCK.md")));
  assert.ok(files.some((f) => f.endsWith("ROADMAP.md")));
});
