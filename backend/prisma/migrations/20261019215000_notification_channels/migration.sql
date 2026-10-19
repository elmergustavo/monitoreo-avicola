-- CreateEnum
CREATE TYPE "channel_type" AS ENUM ('telegram', 'whatsapp');

-- CreateEnum
CREATE TYPE "delivery_status" AS ENUM ('pending', 'sent', 'failed', 'skipped');

-- CreateTable
CREATE TABLE "notification_channels" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "type" "channel_type" NOT NULL,
    "address" VARCHAR(64) NOT NULL,
    "label" VARCHAR(120),
    "is_group" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_inbound_at" TIMESTAMPTZ(3),
    "linked_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_link_codes" (
    "code" VARCHAR(16) NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "channel_type" NOT NULL,
    "is_group" BOOLEAN NOT NULL DEFAULT false,
    "address" VARCHAR(64),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_link_codes_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" UUID NOT NULL,
    "telegram" BOOLEAN NOT NULL DEFAULT true,
    "whatsapp" BOOLEAN NOT NULL DEFAULT true,
    "include_warnings" BOOLEAN NOT NULL DEFAULT true,
    "quiet_start" VARCHAR(5),
    "quiet_end" VARCHAR(5),
    "daily_summary" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "notification_id" UUID,
    "alert_id" UUID,
    "device_id" UUID,
    "kind" "notification_kind" NOT NULL,
    "severity" "alert_severity",
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "attachment" JSONB,
    "status" "delivery_status" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" VARCHAR(500),
    "provider_message_id" VARCHAR(120),
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_channels_user_id_idx" ON "notification_channels"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_channels_type_address_key" ON "notification_channels"("type", "address");

-- CreateIndex
CREATE INDEX "channel_link_codes_user_id_idx" ON "channel_link_codes"("user_id");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_next_attempt_at_idx" ON "notification_deliveries"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "notification_deliveries_channel_id_created_at_idx" ON "notification_deliveries"("channel_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_deliveries_created_at_idx" ON "notification_deliveries"("created_at");

-- AddForeignKey
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_linked_by_id_fkey" FOREIGN KEY ("linked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_link_codes" ADD CONSTRAINT "channel_link_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "notification_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
