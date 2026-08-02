#!/usr/bin/env node
// Fails if a markdown file links to a local file that doesn't exist. Only
// checks link *targets* resolve on disk — it does not validate in-page
// anchors (heading-slug rules are a heuristic, not a fact you can check
// reliably from the file system, so that's deliberately out of scope here
// rather than faked). See docs/ARCHITECTURE_LOCK.md 1.18 and
// docs/DECISIONS.md D-040.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const LINK_PATTERN = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** Checks one markdown file's local links against `repoRoot`. Returns `{ ok, errors }`. */
export function checkLinksInFile(filePath, repoRoot) {
  const contents = readFileSync(filePath, "utf8");
  const fileDir = path.dirname(filePath);
  const errors = [];
  let checked = 0;

  for (const match of contents.matchAll(LINK_PATTERN)) {
    const target = match[1];

    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) {
      continue; // any URL scheme, or an in-page anchor — not checked here
    }

    const [targetPath] = target.split("#");
    if (!targetPath) continue;

    checked += 1;
    const resolved = path.resolve(fileDir, decodeURIComponent(targetPath));
    if (!existsSync(resolved)) {
      const relSource = path.relative(repoRoot, filePath);
      errors.push(
        `${relSource}: broken link -> ${target} (resolved: ${path.relative(repoRoot, resolved)})`,
      );
    }
  }

  return { ok: errors.length === 0, checked, errors };
}

/** Recursively collects `.md` files, skipping common non-source directories. */
export function collectMarkdownFiles(
  dir,
  skipDirs = new Set(["node_modules", ".git", ".next", ".turbo", "dist", "coverage"]),
) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      files.push(...collectMarkdownFiles(path.join(dir, entry.name), skipDirs));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

function runAsCli() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.join(__dirname, "..");

  const files = collectMarkdownFiles(path.join(repoRoot, "docs"));
  for (const rootFile of ["README.md", "CONTRIBUTING.md"]) {
    const filePath = path.join(repoRoot, rootFile);
    if (existsSync(filePath)) files.push(filePath);
  }

  let hasError = false;
  let totalChecked = 0;
  for (const filePath of files) {
    const result = checkLinksInFile(filePath, repoRoot);
    totalChecked += result.checked;
    if (!result.ok) {
      hasError = true;
      for (const error of result.errors) console.error(error);
    }
  }

  if (hasError) {
    console.error(`\nBroken local documentation links found. See docs/ARCHITECTURE_LOCK.md 1.18.`);
    process.exit(1);
  }

  console.log(
    `OK: ${totalChecked} local documentation links across ${files.length} files resolve.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAsCli();
}
