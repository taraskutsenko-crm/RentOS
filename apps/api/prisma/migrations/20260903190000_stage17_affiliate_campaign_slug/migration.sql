-- AlterTable
ALTER TABLE "affiliate_campaigns" ADD COLUMN     "slug" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_campaigns_slug_key" ON "affiliate_campaigns"("slug");
