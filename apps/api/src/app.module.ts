import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { apiEnvSchema } from "@rentos/shared";

import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, unknown>) => apiEnvSchema.parse(config),
    }),
    PrismaModule,
    HealthModule,
  ],
})
export class AppModule {}
