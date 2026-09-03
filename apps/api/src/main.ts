import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { ApiEnv } from "@rentos/shared";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import { AppModule } from "./app.module";
import { HELMET_OPTIONS } from "./security-headers";

async function bootstrap(): Promise<void> {
  // rawBody: true preserves the raw request-body Buffer on req.rawBody
  // alongside Nest's normal JSON body parsing — needed for
  // StripeWebhooksController to verify Stripe's signature against the
  // exact bytes Stripe signed (a re-serialized/parsed JSON body would not
  // byte-match). Every other route is unaffected. See
  // docs/DECISIONS.md and billing/stripe-webhooks.controller.ts.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const configService = app.get(ConfigService<ApiEnv, true>);

  // Web and API are always different origins in this deployment (different
  // ports locally, different subdomains in production — see
  // docker-compose.yml/NEXT_PUBLIC_API_URL) and the web app embeds
  // API-served files directly (asset image galleries, Handover/Return
  // attachment thumbnails — see AssetFilesManager/DocumentAttachments), so
  // helmet's default `Cross-Origin-Resource-Policy: same-origin` silently
  // blocks every one of those `<img src>` loads at the browser level (a
  // real bug found live: uploaded photos returned 201 and were correctly
  // persisted, but rendered as broken images —
  // net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin). See security-headers.ts —
  // shared with the e2e test harness so this never silently regresses
  // again. Every actual data endpoint still requires the cookie-based auth
  // + CORS allow-list below; this only concerns no-cors resource loads.
  app.use(helmet(HELMET_OPTIONS));
  app.use(cookieParser());

  app.enableCors({
    origin: configService.get("WEB_ORIGIN", { infer: true }),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = configService.get("PORT", { infer: true });

  await app.listen(port);
}

void bootstrap();
