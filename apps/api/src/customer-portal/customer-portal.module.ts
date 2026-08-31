import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule, JwtService } from "@nestjs/jwt";
import type { ApiEnv } from "@rentos/shared";

import { AssetFilesModule } from "../asset-files/asset-files.module";
import { AssetsModule } from "../assets/assets.module";
import { AuditModule } from "../audit/audit.module";
import { PasswordService } from "../auth/password.service";
import { CompanyBrandingModule } from "../company-branding/company-branding.module";
import { CustomersModule } from "../customers/customers.module";
import { DocumentsModule } from "../documents/documents.module";
import { EmailModule } from "../email/email.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { RentalsModule } from "../rentals/rentals.module";
import { StorageModule } from "../storage/storage.module";
import { TenantsModule } from "../tenants/tenants.module";
import { PortalAssetsController } from "./assets/portal-assets.controller";
import { PortalAssetsService } from "./assets/portal-assets.service";
import { CustomerAuthGuard } from "./auth/guards/customer-auth.guard";
import { PortalBrandingController } from "./branding/portal-branding.controller";
import { PortalAuthController } from "./auth/portal-auth.controller";
import { PortalAuthService } from "./auth/portal-auth.service";
import { CUSTOMER_JWT_SERVICE, CustomerTokenService } from "./auth/customer-token.service";
import { PortalDamageReportsController } from "./damage-reports/portal-damage-reports.controller";
import { PortalDamageReportsService } from "./damage-reports/portal-damage-reports.service";
import { PortalDashboardController } from "./dashboard/portal-dashboard.controller";
import { PortalDashboardService } from "./dashboard/portal-dashboard.service";
import { PortalDocumentsController } from "./documents/portal-documents.controller";
import { PortalDocumentsService } from "./documents/portal-documents.service";
import { PortalExtensionRequestsController } from "./extension-requests/portal-extension-requests.controller";
import { PortalExtensionRequestsService } from "./extension-requests/portal-extension-requests.service";
import { CustomerPortalInvitationsController } from "./invitations/customer-portal-invitations.controller";
import { CustomerPortalInvitationsService } from "./invitations/customer-portal-invitations.service";
import { PortalMessagesController } from "./messages/portal-messages.controller";
import { PortalMessagesService } from "./messages/portal-messages.service";
import { PortalNotificationsController } from "./notifications/portal-notifications.controller";
import { PortalNotificationsService } from "./notifications/portal-notifications.service";
import { PortalRentalsController } from "./rentals/portal-rentals.controller";
import { PortalRentalsService } from "./rentals/portal-rentals.service";
import { StaffPortalController } from "./staff/staff-portal.controller";

/**
 * Deliberately does NOT import AuthModule — a customer-portal session must
 * never be able to resolve through, or share any provider instance with,
 * the staff auth stack (see CustomerAuthGuard's doc comment). PasswordService
 * is provided directly here, the same way DocumentsModule already provides
 * it directly rather than via AuthModule (which doesn't export it). This
 * module's own JwtModule.registerAsync() is a fully separate JwtService
 * instance, signed with JWT_CUSTOMER_ACCESS_SECRET — see
 * docs/adr/0012-customer-portal.md.
 */
@Module({
  imports: [
    TenantsModule,
    PermissionsModule,
    CustomersModule,
    RentalsModule,
    DocumentsModule,
    AssetsModule,
    AssetFilesModule,
    StorageModule,
    AuditModule,
    EmailModule,
    CompanyBrandingModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<ApiEnv, true>) => ({
        secret: configService.get("JWT_CUSTOMER_ACCESS_SECRET", { infer: true }),
        signOptions: {
          expiresIn: configService.get("ACCESS_TOKEN_TTL_SECONDS", { infer: true }),
        },
      }),
    }),
  ],
  controllers: [
    PortalAuthController,
    PortalBrandingController,
    CustomerPortalInvitationsController,
    PortalRentalsController,
    PortalDocumentsController,
    PortalNotificationsController,
    PortalExtensionRequestsController,
    PortalDamageReportsController,
    PortalMessagesController,
    PortalAssetsController,
    PortalDashboardController,
    StaffPortalController,
  ],
  providers: [
    PasswordService,
    { provide: CUSTOMER_JWT_SERVICE, useExisting: JwtService },
    CustomerTokenService,
    CustomerAuthGuard,
    PortalAuthService,
    CustomerPortalInvitationsService,
    PortalRentalsService,
    PortalDocumentsService,
    PortalNotificationsService,
    PortalExtensionRequestsService,
    PortalDamageReportsService,
    PortalMessagesService,
    PortalAssetsService,
    PortalDashboardService,
  ],
  exports: [CustomerTokenService, CustomerAuthGuard],
})
export class CustomerPortalModule {}
