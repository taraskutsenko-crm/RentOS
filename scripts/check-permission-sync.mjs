#!/usr/bin/env node
// Fails if two permission-registry TS files (backend/frontend) diverge in
// their ALL_PERMISSIONS set or their ROLE_PERMISSIONS map. Parses real
// TypeScript ASTs (via the `typescript` package already used to build this
// repo) rather than regexing source text, so it can't be fooled by
// reformatting and won't silently pass on a genuine structural change it
// can't parse. See docs/ARCHITECTURE_LOCK.md 1.10 and docs/DECISIONS.md
// D-040.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";

/**
 * Extracts every top-level `const` array-of-string-literals declaration
 * (optionally `as const`, optionally containing `...spread`s of earlier
 * declarations) plus the `ROLE_PERMISSIONS` object literal from one file.
 */
export function parsePermissionFile(filePath) {
  const sourceText = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);

  const arrayConsts = new Map();
  let rolePermissionsNode = null;

  function unwrapAsConst(node) {
    return ts.isAsExpression(node) ? node.expression : node;
  }

  function stringArrayLiteral(node) {
    const unwrapped = unwrapAsConst(node);
    if (!ts.isArrayLiteralExpression(unwrapped)) return null;
    const values = [];
    for (const element of unwrapped.elements) {
      if (ts.isStringLiteral(element)) {
        values.push(element.text);
      } else if (ts.isSpreadElement(element) && ts.isIdentifier(element.expression)) {
        const resolved = arrayConsts.get(element.expression.text);
        if (!resolved) {
          throw new Error(
            `${filePath}: cannot resolve spread "...${element.expression.text}" — declared after use, or not a recognized array const`,
          );
        }
        values.push(...resolved);
      } else {
        throw new Error(
          `${filePath}: unrecognized array element (not a string literal or a resolvable spread) — permission-sync check needs updating for this new syntax`,
        );
      }
    }
    return values;
  }

  ts.forEachChild(sourceFile, (statement) => {
    if (!ts.isVariableStatement(statement)) return;
    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
      const name = decl.name.text;

      if (name === "ROLE_PERMISSIONS") {
        if (ts.isObjectLiteralExpression(decl.initializer)) {
          rolePermissionsNode = decl.initializer;
        }
        continue;
      }

      const asArray = stringArrayLiteral(decl.initializer);
      if (asArray) {
        arrayConsts.set(name, asArray);
      }
    }
  });

  if (!rolePermissionsNode) {
    throw new Error(`${filePath}: could not find a ROLE_PERMISSIONS object literal`);
  }

  const rolePermissions = {};
  for (const property of rolePermissionsNode.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const roleName = property.name.text;
    const initializer = property.initializer;

    if (ts.isIdentifier(initializer)) {
      const resolved = arrayConsts.get(initializer.text);
      if (!resolved) {
        throw new Error(
          `${filePath}: ROLE_PERMISSIONS.${roleName} references unresolved identifier "${initializer.text}"`,
        );
      }
      rolePermissions[roleName] = resolved;
      continue;
    }

    const asArray = stringArrayLiteral(initializer);
    if (!asArray) {
      throw new Error(
        `${filePath}: ROLE_PERMISSIONS.${roleName} is not an array literal or resolvable identifier`,
      );
    }
    rolePermissions[roleName] = asArray;
  }

  const allPermissions = arrayConsts.get("ALL_PERMISSIONS");
  if (!allPermissions) {
    throw new Error(`${filePath}: could not find an ALL_PERMISSIONS array const`);
  }

  return { allPermissions, rolePermissions };
}

function sortedSetEqual(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) return false;
  for (const value of setA) if (!setB.has(value)) return false;
  return true;
}

function diffSets(a, b) {
  const setB = new Set(b);
  return [...new Set(a)].filter((value) => !setB.has(value)).sort();
}

/**
 * Compares two already-parsed permission registries. Returns
 * `{ ok, errors }` — never throws for a genuine mismatch.
 */
export function comparePermissionRegistries(
  backend,
  frontend,
  labels = { backend: "backend", frontend: "frontend" },
) {
  const errors = [];

  if (!sortedSetEqual(backend.allPermissions, frontend.allPermissions)) {
    const onlyBackend = diffSets(backend.allPermissions, frontend.allPermissions);
    const onlyFrontend = diffSets(frontend.allPermissions, backend.allPermissions);
    let message = "ALL_PERMISSIONS mismatch:";
    if (onlyBackend.length > 0)
      message += `\n  Only in ${labels.backend}: ${onlyBackend.join(", ")}`;
    if (onlyFrontend.length > 0)
      message += `\n  Only in ${labels.frontend}: ${onlyFrontend.join(", ")}`;
    errors.push(message);
  }

  const roles = new Set([
    ...Object.keys(backend.rolePermissions),
    ...Object.keys(frontend.rolePermissions),
  ]);
  for (const role of roles) {
    const backendPerms = backend.rolePermissions[role];
    const frontendPerms = frontend.rolePermissions[role];
    if (!backendPerms || !frontendPerms) {
      errors.push(`Role "${role}" is missing from one of the two registries.`);
      continue;
    }
    if (!sortedSetEqual(backendPerms, frontendPerms)) {
      const onlyBackend = diffSets(backendPerms, frontendPerms);
      const onlyFrontend = diffSets(frontendPerms, backendPerms);
      let message = `ROLE_PERMISSIONS.${role} mismatch:`;
      if (onlyBackend.length > 0)
        message += `\n  Only in ${labels.backend}: ${onlyBackend.join(", ")}`;
      if (onlyFrontend.length > 0)
        message += `\n  Only in ${labels.frontend}: ${onlyFrontend.join(", ")}`;
      errors.push(message);
    }
  }

  return { ok: errors.length === 0, errors };
}

function runAsCli() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.join(__dirname, "..");
  const backendPath = path.join(repoRoot, "apps", "api", "src", "permissions", "permission.ts");
  const frontendPath = path.join(repoRoot, "apps", "web", "src", "lib", "permissions.ts");

  const backend = parsePermissionFile(backendPath);
  const frontend = parsePermissionFile(frontendPath);
  const result = comparePermissionRegistries(backend, frontend, {
    backend: "apps/api",
    frontend: "apps/web",
  });

  if (!result.ok) {
    for (const error of result.errors) console.error(`\n${error}`);
    console.error(
      "\napps/api/src/permissions/permission.ts and apps/web/src/lib/permissions.ts must stay in sync. See docs/ARCHITECTURE_LOCK.md 1.10.",
    );
    process.exit(1);
  }

  const roleCount = new Set([
    ...Object.keys(backend.rolePermissions),
    ...Object.keys(frontend.rolePermissions),
  ]).size;
  console.log(
    `OK: permission registries in sync (${backend.allPermissions.length} permissions, ${roleCount} roles).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAsCli();
}
