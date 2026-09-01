import { IsDateString } from "class-validator";

/**
 * Everything else a Payment Demand needs (creditor/debtor/bank identity,
 * original amount/due date, outstanding balance, country/language
 * template selection, demand number) is derived server-side at generation
 * time — see PaymentDemandsService.create. The only thing staff actually
 * decides is the new deadline being given to the customer.
 */
export class CreatePaymentDemandDto {
  @IsDateString()
  requestedDeadline!: string;
}
