-- Paiement par carte bancaire (Stripe) et par PayPal
ALTER TYPE "PaymentMethod" ADD VALUE 'stripe';
ALTER TYPE "PaymentMethod" ADD VALUE 'paypal';

-- Montant et devise réellement demandés au prestataire (recoupés avant validation)
ALTER TABLE "payment_attempts" ADD COLUMN "providerAmount" INTEGER,
ADD COLUMN "providerCurrency" TEXT;
