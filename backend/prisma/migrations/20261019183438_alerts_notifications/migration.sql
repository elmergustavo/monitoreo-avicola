-- CreateEnum
CREATE TYPE "alert_kind" AS ENUM ('heat_no_irrigation', 'prolonged_irrigation', 'sensor_error', 'device_offline', 'sustained_heat', 'sustained_cold');

-- CreateEnum
CREATE TYPE "alert_severity" AS ENUM ('critical', 'warning');

-- CreateEnum
CREATE TYPE "alert_status" AS ENUM ('open', 'acknowledged', 'resolved');

-- CreateEnum
CREATE TYPE "notification_kind" AS ENUM ('alert_opened', 'alert_reminder', 'alert_escalated', 'alert_resolved', 'daily_summary', 'test');

-- AlterTable
ALTER TABLE "device_settings" ADD COLUMN     "escalate_after_min" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "offline_after_min" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "reminder_every_min" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "sustained_cold_min" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "sustained_heat_min" INTEGER NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "kind" "alert_kind" NOT NULL,
    "severity" "alert_severity" NOT NULL,
    "status" "alert_status" NOT NULL DEFAULT 'open',
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trigger_temperature" DECIMAL(5,2),
    "peak_temperature" DECIMAL(5,2),
    "acknowledged_at" TIMESTAMPTZ(3),
    "acknowledged_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "resolved_by_id" UUID,
    "resolution" VARCHAR(255),
    "last_notified_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reminder_count" INTEGER NOT NULL DEFAULT 0,
    "escalated_at" TIMESTAMPTZ(3),
    "metadata" JSONB,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "alert_id" UUID,
    "kind" "notification_kind" NOT NULL,
    "severity" "alert_severity",
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alerts_status_opened_at_idx" ON "alerts"("status", "opened_at");

-- CreateIndex
CREATE INDEX "alerts_device_id_opened_at_idx" ON "alerts"("device_id", "opened_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one unresolved alert per device and kind. Opening an alert that is
-- already open fails on this index, which makes opening idempotent.
CREATE UNIQUE INDEX "alerts_device_id_kind_unresolved_key" ON "alerts"("device_id", "kind") WHERE "status" <> 'resolved';
