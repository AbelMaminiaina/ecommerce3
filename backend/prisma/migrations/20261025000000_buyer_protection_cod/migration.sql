-- Paiement à la livraison
ALTER TYPE "PaymentMethod" ADD VALUE 'cash_on_delivery';

-- Paiement garanti : réception confirmée avant tout reversement au vendeur, litiges
CREATE TYPE "DisputeResolution" AS ENUM ('refund', 'release');

ALTER TABLE "orders" ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "receivedAt" TIMESTAMP(3),
ADD COLUMN "receivedBy" TEXT,
ADD COLUMN "disputeOpenedAt" TIMESTAMP(3),
ADD COLUMN "disputeReason" TEXT,
ADD COLUMN "disputeResolvedAt" TIMESTAMP(3),
ADD COLUMN "disputeResolution" "DisputeResolution",
ADD COLUMN "disputeNote" TEXT;

-- Commandes déjà livrées : considérées comme reçues (elles restent reversables au vendeur)
UPDATE "orders" SET "deliveredAt" = "updatedAt", "receivedAt" = "updatedAt", "receivedBy" = 'auto'
WHERE "status" = 'delivered';

CREATE INDEX "orders_status_receivedAt_idx" ON "orders"("status", "receivedAt");
