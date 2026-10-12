-- Relances automatiques : rappel de paiement, retard d'expédition du vendeur, stock bas
ALTER TABLE "orders" ADD COLUMN "paymentReminderSentAt" TIMESTAMP(3),
ADD COLUMN "shippingAlertSentAt" TIMESTAMP(3);

ALTER TABLE "products" ADD COLUMN "lowStockAlertAt" TIMESTAMP(3);
