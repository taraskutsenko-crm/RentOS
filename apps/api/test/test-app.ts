import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { Test, type TestingModuleBuilder } from "@nestjs/testing";
import cookieParser from "cookie-parser";

import { AppModule } from "../src/app.module";

/**
 * Boots the real application (real Postgres, real crypto) for integration
 * tests. Rate limiting is disabled for NODE_ENV=test via ThrottlerModule's
 * `skipIf` (see app.module.ts) — not overridden here, since `.overrideGuard`
 * cannot intercept guards registered via APP_GUARD.
 */
export async function createTestApp(
  customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });

  if (customize) {
    builder = customize(builder);
  }

  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();
  return app;
}
