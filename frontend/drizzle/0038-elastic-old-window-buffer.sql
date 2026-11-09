-- Elastic edits use the effective old window start as a three-hour safety buffer.
DO $migration$
DECLARE
  v_function record;
  v_definition text;
  v_date_guard text := '  IF p_occurrence_date <= (now() AT TIME ZONE v_timezone)::date THEN RAISE EXCEPTION ''Only future occurrences can be edited''; END IF;';
  v_old_window text := '  IF v_old_start IS NULL THEN v_old_start := v_session.start_time; v_old_end := v_session.end_time; END IF;';
  v_new_old_window text := v_old_window || E'\n  IF ((p_occurrence_date + v_old_start) AT TIME ZONE v_timezone) <= now() + interval ''3 hours'' THEN RAISE EXCEPTION ''Availability changes must be made at least 3 hours before the current window starts''; END IF;';
BEGIN
  FOR v_function IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('preview_doctor_occurrence_adjustment', 'apply_doctor_occurrence_adjustment')
      AND pg_get_function_identity_arguments(p.oid) IN ('p_session_id uuid, p_occurrence_date date, p_start_time time without time zone, p_end_time time without time zone', 'p_session_id uuid, p_occurrence_date date, p_start_time time without time zone, p_end_time time without time zone, p_assignments jsonb')
  LOOP
    v_definition := pg_get_functiondef(v_function.oid);
    v_definition := replace(v_definition, v_date_guard || E'\n', '');
    IF position(v_old_window IN v_definition) = 0 THEN
      RAISE EXCEPTION 'Elastic RPC % does not contain the expected old-window resolution', v_function.proname;
    END IF;
    v_definition := replace(v_definition, v_old_window, v_new_old_window);
    EXECUTE v_definition;
  END LOOP;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
