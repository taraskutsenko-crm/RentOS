import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ApiEnv } from "@rentos/shared";
import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";

import { Public } from "../auth/decorators/public.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

type UpDown = "up" | "down";

interface ReadinessCheckResult {
  status: "ok" | "error";
  uptime: number;
  timestamp: string;
  database: UpDown;
  storage: UpDown;
  redis: UpDown;
}

interface LivenessCheckResult {
  status: "ok";
  uptime: number;
  timestamp: string;
}

/**
 * `/health` is readiness — every dependency this process actually needs to
 * serve real traffic (Postgres, the bound StorageAdapter, Redis
 * connectivity) is genuinely exercised, never assumed up. `/health/live` is
 * liveness — process-only, no dependency checks, for an orchestrator that
 * distinguishes "restart me" from "stop routing to me" (see
 * docs/adr/0013-production-storage-and-email.md). No response ever
 * includes a connection string, credential, or stack trace — only a plain
 * up/down per dependency.
 */
@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService<ApiEnv, true>,
  ) {}

  @Public()
  @Get()
  async check(): Promise<ReadinessCheckResult> {
    const [databaseUp, storageUp, redisUp] = await Promise.all([
      this.isDatabaseUp(),
      this.isStorageUp(),
      this.isRedisUp(),
    ]);
    const allUp = databaseUp && storageUp && redisUp;

    return {
      status: allUp ? "ok" : "error",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: databaseUp ? "up" : "down",
      storage: storageUp ? "up" : "down",
      redis: redisUp ? "up" : "down",
    };
  }

  @Public()
  @Get("live")
  live(): LivenessCheckResult {
    return { status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() };
  }

  private async isDatabaseUp(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  /** A real round-trip through whichever StorageAdapter is bound (local filesystem or S3-compatible) — never assumed up merely because it was configured. */
  private async isStorageUp(): Promise<boolean> {
    try {
      const key = `health-checks/${randomUUID()}`;
      await this.storageService.store(key, {
        originalname: "health-check.txt",
        mimetype: "text/plain",
        size: 2,
        buffer: Buffer.from("ok"),
      });
      await this.storageService.delete(key);
      return true;
    } catch {
      return false;
    }
  }

  /** A bare TCP connectivity check against REDIS_URL's host:port — no Redis client dependency exists in this codebase yet (Redis is provisioned for future use, e.g. a job queue — see ARCHITECTURE_LOCK.md Part 3), so this deliberately doesn't add one just for a health ping. */
  private isRedisUp(): Promise<boolean> {
    let host: string;
    let port: number;
    try {
      const url = new URL(this.configService.get("REDIS_URL", { infer: true }));
      host = url.hostname;
      port = Number(url.port) || 6379;
    } catch {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      const socket = createConnection({ host, port, timeout: 1500 });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("timeout", () => {
        socket.destroy();
        resolve(false);
      });
      socket.once("error", () => resolve(false));
    });
  }
}
