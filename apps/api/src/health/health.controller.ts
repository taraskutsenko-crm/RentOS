import { Controller, Get } from "@nestjs/common";

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
