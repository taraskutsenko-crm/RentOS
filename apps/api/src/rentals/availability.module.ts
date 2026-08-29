import { Module } from "@nestjs/common";

import { AvailabilityService } from "./availability.service";

/**
 * `AvailabilityService` on its own — split out of `RentalsModule` so any
 * module can consult the canonical availability engine (e.g. `AssetsModule`,
 * for the Assets list's "available right now" column) without importing all
 * of Rentals, which would create a module import cycle (`RentalsModule`
 * already imports `AssetsModule`). `RentalsModule` re-exports this module,
 * so every existing consumer that imported `RentalsModule` for
 * `AvailabilityService` keeps working unchanged.
 */
@Module({
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
