-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN,
    "emailVerified" BOOLEAN,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopSettings" (
    "shop" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "syncRequested" BOOLEAN NOT NULL DEFAULT false,
    "lastPolledAt" TIMESTAMP(3),
    "lastError" TEXT,
    "uninstalledAt" TIMESTAMP(3),

    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "GiftSync" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "rewardId" INTEGER NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "creatorName" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "reward" JSONB,
    "draftOrderId" TEXT,
    "orderId" TEXT,
    "orderName" TEXT,
    "shipment" JSONB,
    "creationAttempted" BOOLEAN NOT NULL DEFAULT false,
    "fulfillRequest" JSONB,
    "fulfilled" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedShipment" TEXT,
    "lastError" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftSync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookReceipt" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GiftSync_shop_nextAttemptAt_idx" ON "GiftSync"("shop", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "GiftSync_shop_rewardId_key" ON "GiftSync"("shop", "rewardId");

