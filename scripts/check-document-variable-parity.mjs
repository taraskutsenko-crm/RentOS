#!/usr/bin/env node
// Fails if the backend and frontend document-variable registries diverge —
// same governance convention as check-permission-sync.mjs (see
// docs/ARCHITECTURE_LOCK.md 1.10), applied to the set of `{{dot.path}}`
// variables VariableResolverService.buildContext actually populates.
// Parses real TypeScript ASTs rather than regexing source text.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";

/** Extracts the flat `DOCUMENT_VARIABLE_PATHS = [...] as const` string array from the backend registry. */
export function parseBackendVariableFile(filePath) {
  const sourceText = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);

  let paths = null;

  function unwrapAsConst(node) {
    return ts.isAsExpression(node) ? node.expression : node;
  }

  ts.forEachChild(sourceFile, (statement) => {
    if (!ts.isVariableStatement(statement)) return;
    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== "DOCUMENT_VARIABLE_PATHS") continue;
      if (!decl.initializer) continue;
      const unwrapped = unwrapAsConst(decl.initializer);
      if (!ts.isArrayLiteralExpression(unwrapped)) continue;
      paths = unwrapped.elements
        .filter((element) => ts.isStringLiteral(element))
        .map((element) => element.text);
    }
  });

  if (!paths) {
    throw new Error(`${filePath}: could not find a DOCUMENT_VARIABLE_PATHS string array const`);
  }
  return paths;
}

/** Extracts every `path: "..."` string literal from the frontend registry's `DOCUMENT_VARIABLES` array-of-objects. */
export function parseFrontendVariableFile(filePath) {
  const sourceText = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);

  let paths = null;

  ts.forEachChild(sourceFile, (statement) => {
    if (!ts.isVariableStatement(statement)) return;
    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== "DOCUMENT_VARIABLES") continue;
      if (!decl.initializer || !ts.isArrayLiteralExpression(decl.initializer)) continue;

      const collected = [];
      for (const element of decl.initializer.elements) {
        if (!ts.isObjectLiteralExpression(element)) continue;
        for (const property of element.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          if (!ts.isIdentifier(property.name) || property.name.text !== "path") continue;
          if (ts.isStringLiteral(property.initializer)) {
            collected.push(property.initializer.text);
          }
        }
      }
      paths = collected;
    }
  });

  if (!paths) {
    throw new Error(
      `${filePath}: could not find a DOCUMENT_VARIABLES array of {path: "..."} objects`,
    );
  }
  return paths;
}

function diffSets(a, b) {
  const setB = new Set(b);
  return [...new Set(a)].filter((value) => !setB.has(value)).sort();
}

/** Compares two already-parsed path lists. Returns `{ ok, errors }` — never throws for a genuine mismatch. */
export function compareVariableRegistries(
  backendPaths,
  frontendPaths,
  labels = { backend: "backend", frontend: "frontend" },
) {
  const errors = [];
  const setA = new Set(backendPaths);
  const setB = new Set(frontendPaths);
  const sameSize = setA.size === setB.size;
  const sameMembers = sameSize && [...setA].every((value) => setB.has(value));

  if (!sameMembers) {
    const onlyBackend = diffSets(backendPaths, frontendPaths);
    const onlyFrontend = diffSets(frontendPaths, backendPaths);
    let message = "Document variable paths mismatch:";
    if (onlyBackend.length > 0)
      message += `\n  Only in ${labels.backend}: ${onlyBackend.join(", ")}`;
    if (onlyFrontend.length > 0)
      message += `\n  Only in ${labels.frontend}: ${onlyFrontend.join(", ")}`;
    errors.push(message);
  }

  return { ok: errors.length === 0, errors };
}

function runAsCli() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.join(__dirname, "..");
  const backendPath = path.join(
    repoRoot,
    "apps",
    "api",
    "src",
    "documents",
    "rendering",
    "document-variable-registry.ts",
  );
  const frontendPath = path.join(
    repoRoot,
    "apps",
    "web",
    "src",
    "lib",
    "document-variable-registry.ts",
  );

  const backendPaths = parseBackendVariableFile(backendPath);
  const frontendPaths = parseFrontendVariableFile(frontendPath);
  const result = compareVariableRegistries(backendPaths, frontendPaths, {
    backend: "apps/api",
    frontend: "apps/web",
  });

  if (!result.ok) {
    for (const error of result.errors) console.error(`\n${error}`);
    console.error(
      "\napps/api/.../document-variable-registry.ts and apps/web/.../document-variable-registry.ts must stay in sync.",
    );
    process.exit(1);
  }

  console.log(`OK: document variable registries in sync (${backendPaths.length} variables).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAsCli();
}
