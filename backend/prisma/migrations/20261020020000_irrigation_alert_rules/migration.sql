-- Server-side irrigation alerts: per-shed detector switch and timings.
ALTER TABLE "device_settings"
  ADD COLUMN "irrigation_sensor" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "heat_no_irrigation_min" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "prolonged_irrigation_min" INTEGER NOT NULL DEFAULT 30;
