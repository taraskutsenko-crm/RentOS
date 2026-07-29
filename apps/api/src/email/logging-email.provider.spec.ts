import { describe, expect, it } from "vitest";

import { LoggingEmailProvider } from "./logging-email.provider";

describe("LoggingEmailProvider", () => {
  it("always reports success without actually sending anything", async () => {
    const provider = new LoggingEmailProvider();
    const result = await provider.send({
      to: "customer@example.com",
      subject: "Your quote",
      html: "<p>hi</p>",
    });
    expect(result).toEqual({ success: true });
  });

  it("does not throw when attachments are omitted", async () => {
    const provider = new LoggingEmailProvider();
    await expect(provider.send({ to: "a@b.com", subject: "s", html: "<p>x</p>" })).resolves.toEqual(
      { success: true },
    );
  });
});
