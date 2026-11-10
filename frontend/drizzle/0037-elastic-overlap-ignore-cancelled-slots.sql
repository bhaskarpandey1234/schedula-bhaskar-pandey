-- Elastic overlap checks must ignore cancelled slots left by date-specific overrides.
DO $migration$
DECLARE
  v_function record;
  v_definition text;
  v_old text := 'AND a.status = ''active'' AND (';
  v_new text := 'AND a.status = ''active'' AND s.status = ''available'' AND (';
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
    IF position(v_old IN v_definition) = 0 THEN
      RAISE EXCEPTION 'Elastic RPC % does not contain the expected overlap predicate', v_function.proname;
    END IF;
    v_definition := replace(v_definition, v_old, v_new);
    EXECUTE v_definition;
  END LOOP;
END;
$migration$;

NOTIFY pgrst, 'reload schema';
