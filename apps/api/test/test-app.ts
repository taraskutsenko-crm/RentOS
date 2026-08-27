import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { Test, type TestingModuleBuilder } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import { AppModule } from "../src/app.module";
import { HELMET_OPTIONS } from "../src/security-headers";

/**
 * Boots the real application (real Postgres, real crypto) for integration
 * tests. Rate limiting is disabled for NODE_ENV=test via ThrottlerModule's
 * `skipIf` (see app.module.ts) — not overridden here, since `.overrideGuard`
 * cannot intercept guards registered via APP_GUARD.
 *
 * Applies the same helmet() config as main.ts's real bootstrap (via the
 * shared HELMET_OPTIONS) — previously this harness applied no security
 * headers at all, which is exactly how a real Cross-Origin-Resource-Policy
 * misconfiguration (blocking every cross-origin <img> load) went untested
 * until a real Docker browser walkthrough caught it. See main.ts.
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
  app.use(helmet(HELMET_OPTIONS));
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
