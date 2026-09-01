-- CreateIndex
CREATE INDEX "invoices_tenantId_issueDate_idx" ON "invoices"("tenantId", "issueDate");

-- CreateIndex
CREATE INDEX "payments_tenantId_paymentDate_idx" ON "payments"("tenantId", "paymentDate");

-- CreateIndex
CREATE INDEX "rental_deposits_tenantId_receivedAt_idx" ON "rental_deposits"("tenantId", "receivedAt");
