-- AlterTable
ALTER TABLE "havelio_subscriptions" ADD COLUMN     "scheduledBillingInterval" "BillingInterval",
ADD COLUMN     "scheduledPlan" "HavelioPlan";
