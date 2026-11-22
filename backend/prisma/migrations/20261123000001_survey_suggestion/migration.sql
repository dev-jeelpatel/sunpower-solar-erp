-- The technician recommends on-grid or off-grid after seeing the roof and the meter.
ALTER TABLE surveys
  ADD COLUMN suggested_system_type system_type,
  ADD COLUMN suggestion_reason     VARCHAR(500);
