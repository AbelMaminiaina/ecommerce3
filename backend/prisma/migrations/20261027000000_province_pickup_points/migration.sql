-- Livraison en province (zones), points relais, suivi des colis
-- AlterEnum


ALTER TYPE "DeliveryMethod" ADD VALUE 'province';
ALTER TYPE "DeliveryMethod" ADD VALUE 'relais';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "carrier" TEXT,
ADD COLUMN     "pickupPointId" TEXT,
ADD COLUMN     "shippingZone" TEXT,
ADD COLUMN     "trackingNumber" TEXT;

-- CreateTable
CREATE TABLE "shipping_zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cities" TEXT[],
    "price" INTEGER NOT NULL,
    "delay" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_points" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "phone" TEXT,
    "openingHours" TEXT,
    "instructions" TEXT,
    "fee" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pickup_points_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_pickupPointId_fkey" FOREIGN KEY ("pickupPointId") REFERENCES "pickup_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Zones de départ (tarifs et délais indicatifs, à ajuster dans l'administration > Livraison)
INSERT INTO "shipping_zones" ("id", "name", "cities", "price", "delay", "isDefault", "sortOrder", "updatedAt") VALUES
  (gen_random_uuid()::text, 'Hautes Terres', ARRAY['Antsirabe', 'Ambatolampy', 'Ambositra', 'Fianarantsoa', 'Arivonimamo', 'Miarinarivo', 'Tsiroanomandidy'], 8000, '2 à 4 jours', false, 1, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Côte Est', ARRAY['Toamasina', 'Tamatave', 'Moramanga', 'Brickaville', 'Fenoarivo Atsinanana', 'Ambatondrazaka', 'Mananjary', 'Manakara'], 8000, '2 à 4 jours', false, 2, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Nord-Ouest', ARRAY['Mahajanga', 'Majunga', 'Maevatanana', 'Marovoay', 'Antsohihy'], 10000, '3 à 5 jours', false, 3, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Nord', ARRAY['Antsiranana', 'Diego Suarez', 'Ambanja', 'Nosy Be', 'Sambava', 'Antalaha', 'Vohemar', 'Andapa'], 15000, '4 à 7 jours', false, 4, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Sud', ARRAY['Toliara', 'Tulear', 'Ihosy', 'Morondava', 'Taolagnaro', 'Fort-Dauphin', 'Ambovombe', 'Farafangana'], 15000, '4 à 7 jours', false, 5, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Autres villes', ARRAY[]::text[], 15000, '5 à 8 jours', true, 99, CURRENT_TIMESTAMP);
