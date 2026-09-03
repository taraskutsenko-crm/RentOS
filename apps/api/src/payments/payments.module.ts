import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { BillingModule } from "../billing/billing.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { RentalsModule } from "../rentals/rentals.module";
import { TenantsModule } from "../tenants/tenants.module";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";

@Module({
  // RentalsModule (exports RentalDepositsService) — applyDeposit() reuses
  // RentalDepositsService.getBalance as the one canonical "how much of
  // this deposit is still available" calculation, never recomputing it
  // itself (see docs/DECISIONS.md). BillingModule (FeatureEntitlementGuard)
  // — Stage 17 closure pass: recording/voiding a payment requires the
  // PAYMENTS_DEBT_MANAGEMENT feature (Business+); viewing already-recorded
  // payments never does (see PaymentsController's own doc comment).
  imports: [TenantsModule, AuditModule, PermissionsModule, RentalsModule, BillingModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
