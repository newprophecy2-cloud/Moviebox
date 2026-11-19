-- 002_stream_delivery.sql: Stream delivery mode preferences and resolver telemetry

ALTER TABLE provider_configs ADD COLUMN default_stream_delivery TEXT NOT NULL DEFAULT 'proxy';
ALTER TABLE provider_configs ADD COLUMN proxy_delivery_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE provider_configs ADD COLUMN direct_delivery_enabled INTEGER NOT NULL DEFAULT 1;
