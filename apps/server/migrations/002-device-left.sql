-- A device that leaves frees its measuring slot; its samples stay for export.
ALTER TABLE devices ADD COLUMN left_at INTEGER;
