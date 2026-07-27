import { Controller, Get } from "@nestjs/common";

import { Public } from "../auth/decorators/public.decorator";
import { PrismaService } from "../prisma/prisma.service";

interface HealthCheckResult {
  status: "ok" | "error";
  uptime: number;
  timestamp: string;
  database: "up" | "down";
}

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check(): Promise<HealthCheckResult> {
    const databaseUp = await this.isDatabaseUp();

    return {
      status: databaseUp ? "ok" : "error",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: databaseUp ? "up" : "down",
    };
  }

  private async isDatabaseUp(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
