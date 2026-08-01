import { describe, expect, it } from "vitest";

import { resolveVariables } from "./variable-resolver.service";

describe("resolveVariables", () => {
  it("substitutes a simple dot-path placeholder", () => {
    const result = resolveVariables("Hello {{customer.name}}!", {
      customer: { name: "Jane Doe" },
    });
    expect(result).toBe("Hello Jane Doe!");
  });

  it("substitutes multiple placeholders, including repeats", () => {
    const result = resolveVariables("{{company.name}} — {{company.name}}", {
      company: { name: "Acme" },
    });
    expect(result).toBe("Acme — Acme");
  });

  it("resolves an unknown/undefined path to an empty string, never throwing", () => {
    const result = resolveVariables("Value: [{{does.not.exist}}]", {});
    expect(result).toBe("Value: []");
  });

  it("resolves a path pointing at an object (not a leaf) to an empty string", () => {
    const result = resolveVariables("[{{customer}}]", { customer: { name: "Jane" } });
    expect(result).toBe("[]");
  });

  it("HTML-escapes resolved values by default (no raw-HTML injection)", () => {
    const result = resolveVariables("{{notes}}", {
      notes: `<script>alert("xss")</script> & "quoted" 'text'`,
    });
    expect(result).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &quot;quoted&quot; &#39;text&#39;",
    );
  });

  it("supports arbitrary future nested paths without any resolver changes", () => {
    const result = resolveVariables("{{data.custom.deeply.nested}}", {
      data: { custom: { deeply: { nested: "found it" } } },
    });
    expect(result).toBe("found it");
  });

  it("stringifies numbers and booleans", () => {
    const result = resolveVariables("{{a}} {{b}}", { a: 42, b: true });
    expect(result).toBe("42 true");
  });

  it("tolerates whitespace inside the placeholder braces", () => {
    const result = resolveVariables("{{ customer.name }}", { customer: { name: "Jane" } });
    expect(result).toBe("Jane");
  });

  it("leaves non-placeholder text untouched", () => {
    const result = resolveVariables("Plain text with { single braces } and no vars", {});
    expect(result).toBe("Plain text with { single braces } and no vars");
  });
});
