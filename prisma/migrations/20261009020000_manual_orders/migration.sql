ALTER TABLE "ShopSettings" ADD COLUMN "encryptedCredentials" TEXT,
ADD COLUMN "campaignIds" TEXT,
ADD COLUMN "automaticOrders" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GiftSync" ADD COLUMN "processingRequested" BOOLEAN NOT NULL DEFAULT false;
