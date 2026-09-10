-- CreateIndex
CREATE INDEX "Contact_createdAt_id_idx" ON "Contact"("createdAt", "id");

-- CreateIndex
CREATE INDEX "Contact_name_id_idx" ON "Contact"("name", "id");

-- CreateIndex
CREATE INDEX "Contact_company_id_idx" ON "Contact"("company", "id");
