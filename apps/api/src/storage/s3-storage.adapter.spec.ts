import { ConfigService } from "@nestjs/config";
import type { ApiEnv } from "@rentos/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { S3StorageAdapter } from "./s3-storage.adapter";

const send = vi.fn();

vi.mock("@aws-sdk/client-s3", () => {
  class NotFound extends Error {}
  class S3Client {
    send = send;
    destroy = vi.fn();
  }
  class Command {
    type: string;
    input: unknown;
    constructor(type: string, input: unknown) {
      this.type = type;
      this.input = input;
    }
  }
  return {
    S3Client,
    PutObjectCommand: class extends Command {
      constructor(input: unknown) {
        super("Put", input);
      }
    },
    GetObjectCommand: class extends Command {
      constructor(input: unknown) {
        super("Get", input);
      }
    },
    DeleteObjectCommand: class extends Command {
      constructor(input: unknown) {
        super("Delete", input);
      }
    },
    HeadObjectCommand: class extends Command {
      constructor(input: unknown) {
        super("Head", input);
      }
    },
    NotFound,
  };
});

function configFrom(values: Partial<ApiEnv>): ConfigService<ApiEnv, true> {
  return {
    get: (key: keyof ApiEnv) => values[key],
  } as unknown as ConfigService<ApiEnv, true>;
}

const FULL_CONFIG: Partial<ApiEnv> = {
  S3_REGION: "auto",
  S3_BUCKET: "havelio-uploads",
  S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
  S3_SECRET_ACCESS_KEY: "secret",
  S3_FORCE_PATH_STYLE: true,
};

describe("S3StorageAdapter", () => {
  beforeEach(() => {
    send.mockReset();
  });

  it("throws a clear, actionable error when required S3 config is missing", () => {
    expect(() => new S3StorageAdapter(configFrom({}))).toThrow(
      /S3_REGION.*S3_BUCKET.*S3_ACCESS_KEY_ID.*S3_SECRET_ACCESS_KEY/,
    );
  });

  it("put() writes the object with its content type, never a public ACL", async () => {
    send.mockResolvedValue({});
    const adapter = new S3StorageAdapter(configFrom(FULL_CONFIG));

    await adapter.put("tenants/t1/documents/d1/x.pdf", Buffer.from("pdf bytes"), "application/pdf");

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]![0] as { type: string; input: Record<string, unknown> };
    expect(command.type).toBe("Put");
    expect(command.input).toMatchObject({
      Bucket: "havelio-uploads",
      Key: "tenants/t1/documents/d1/x.pdf",
      ContentType: "application/pdf",
    });
    expect(command.input.ACL).toBeUndefined();
  });

  it("read() returns the object's full bytes as a Buffer", async () => {
    const bytes = new TextEncoder().encode("hello world");
    send.mockResolvedValue({ Body: { transformToByteArray: () => Promise.resolve(bytes) } });
    const adapter = new S3StorageAdapter(configFrom(FULL_CONFIG));

    const result = await adapter.read("tenants/t1/x.pdf");

    expect(result.toString()).toBe("hello world");
  });

  it("delete() is a no-op-safe call (never throws for the caller to handle)", async () => {
    send.mockResolvedValue({});
    const adapter = new S3StorageAdapter(configFrom(FULL_CONFIG));
    await expect(adapter.delete("tenants/t1/x.pdf")).resolves.toBeUndefined();
  });

  it("exists() returns true when HeadObject succeeds and false on a 404 NotFound", async () => {
    const adapter = new S3StorageAdapter(configFrom(FULL_CONFIG));

    send.mockResolvedValueOnce({});
    await expect(adapter.exists("tenants/t1/present.pdf")).resolves.toBe(true);

    const { NotFound } = (await import("@aws-sdk/client-s3")) as unknown as {
      NotFound: new () => Error;
    };
    send.mockRejectedValueOnce(new NotFound());
    await expect(adapter.exists("tenants/t1/missing.pdf")).resolves.toBe(false);
  });

  it("exists() rethrows a genuine (non-404) error", async () => {
    const adapter = new S3StorageAdapter(configFrom(FULL_CONFIG));
    send.mockRejectedValueOnce(new Error("network timeout"));
    await expect(adapter.exists("tenants/t1/x.pdf")).rejects.toThrow("network timeout");
  });
});
