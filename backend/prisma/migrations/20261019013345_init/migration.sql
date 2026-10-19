-- CreateEnum
CREATE TYPE "event_type" AS ENUM ('irrigation_on', 'irrigation_off', 'heat_alert_no_irrigation', 'prolonged_irrigation_alert', 'sensor_error');

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "shed" VARCHAR(100) NOT NULL,
    "api_key_hash" CHAR(64) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "readings" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "temperature" DECIMAL(5,2) NOT NULL,
    "humidity" DECIMAL(5,2),
    "irrigation" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "type" "event_type" NOT NULL,
    "temperature" DECIMAL(5,2),
    "duration_min" DECIMAL(8,2),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_settings" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "temp_min" DECIMAL(5,2) NOT NULL DEFAULT 27,
    "temp_max" DECIMAL(5,2) NOT NULL DEFAULT 30,
    "temp_alert" DECIMAL(5,2) NOT NULL DEFAULT 32,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "device_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "devices_api_key_hash_key" ON "devices"("api_key_hash");

-- CreateIndex
CREATE INDEX "readings_device_id_created_at_idx" ON "readings"("device_id", "created_at");

-- CreateIndex
CREATE INDEX "events_device_id_created_at_idx" ON "events"("device_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "device_settings_device_id_key" ON "device_settings"("device_id");

-- AddForeignKey
ALTER TABLE "readings" ADD CONSTRAINT "readings_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_settings" ADD CONSTRAINT "device_settings_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
