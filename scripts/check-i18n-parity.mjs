#!/usr/bin/env node
// Fails if locale JSON files under a locales directory don't carry
// identical key structure. See docs/ARCHITECTURE_LOCK.md 1.14 and
// docs/DECISIONS.md D-040.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/** Flattens a nested JSON object into a sorted array of dot-path keys. */
export function flattenKeys(value, prefix = "") {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [prefix];
  }
  const keys = Object.keys(value);
  if (keys.length === 0) {
    return [prefix];
  }
  return keys.flatMap((key) => flattenKeys(value[key], prefix ? `${prefix}.${key}` : key));
}

/**
 * Checks every `<localesDir>/<lang>/common.json` for identical key
 * structure. Returns `{ ok, languages, errors }` — never throws for a
 * genuine mismatch (only for I/O/parse failure), so callers (CLI or
 * tests) can inspect the result instead of parsing stderr text.
 */
export function checkI18nParity(localesDir) {
  const languages = readdirSync(localesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (languages.length === 0) {
    return { ok: false, languages, errors: [`No locale directories found under ${localesDir}`] };
  }

  const keysByLanguage = new Map();
  for (const language of languages) {
    const filePath = path.join(localesDir, language, "common.json");
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    keysByLanguage.set(language, new Set(flattenKeys(parsed)));
  }

  const referenceLanguage = languages.includes("en") ? "en" : languages[0];
  const referenceKeys = keysByLanguage.get(referenceLanguage);

  const errors = [];
  for (const language of languages) {
    if (language === referenceLanguage) continue;
    const keys = keysByLanguage.get(language);

    const missing = [...referenceKeys].filter((key) => !keys.has(key)).sort();
    const extra = [...keys].filter((key) => !referenceKeys.has(key)).sort();

    if (missing.length > 0 || extra.length > 0) {
      let message = `Localization key mismatch: ${language} vs ${referenceLanguage}`;
      if (missing.length > 0)
        message += `\n  Missing in ${language} (${missing.length}): ${missing.join(", ")}`;
      if (extra.length > 0)
        message += `\n  Extra in ${language} (${extra.length}): ${extra.join(", ")}`;
      errors.push(message);
    }
  }

  return { ok: errors.length === 0, languages, errors };
}

function runAsCli() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const localesDir = path.join(__dirname, "..", "packages", "localization", "src", "locales");
  const result = checkI18nParity(localesDir);

  if (!result.ok) {
    for (const error of result.errors) console.error(`\n${error}`);
    console.error(
      `\nAll ${result.languages.length} locale files must carry identical key structure. See docs/ARCHITECTURE_LOCK.md 1.14.`,
    );
    process.exit(1);
  }

  console.log(
    `OK: ${result.languages.length} locale files (${result.languages.join(", ")}) have identical key structure.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAsCli();
}
