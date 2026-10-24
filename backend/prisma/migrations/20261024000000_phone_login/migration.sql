-- Connexion par téléphone : e-mail facultatif, numéro vérifié par SMS, codes de connexion
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL,
ADD COLUMN "verifiedPhone" TEXT;

CREATE UNIQUE INDEX "users_verifiedPhone_key" ON "users"("verifiedPhone");

CREATE TABLE "phone_codes" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "phone_codes_phone_idx" ON "phone_codes"("phone");
