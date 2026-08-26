-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "sourceRentalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "quotes_sourceRentalId_key" ON "quotes"("sourceRentalId");

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_sourceRentalId_fkey" FOREIGN KEY ("sourceRentalId") REFERENCES "rentals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

