-- The technician may also say that neither system suits the site.
ALTER TABLE surveys
  ALTER COLUMN suggested_system_type TYPE VARCHAR(10) USING suggested_system_type::text,
  ADD CONSTRAINT surveys_suggestion_chk CHECK (suggested_system_type IN ('on_grid','off_grid','none'));
