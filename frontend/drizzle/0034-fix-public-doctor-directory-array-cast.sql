-- Fix runtime type inference in the public directory ordering expression.
CREATE OR REPLACE FUNCTION public.public_doctor_directory(p_search text DEFAULT NULL, p_specialty text DEFAULT NULL)
RETURNS TABLE(doctor_id uuid, full_name text, specialty text, clinic_name text, experience_years integer, available_dates date[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_doctor_id uuid;
BEGIN
  FOR v_doctor_id IN
    SELECT d.id
    FROM doctors d
    JOIN profiles p ON p.id = d.id
      AND p.role = 'doctor'
      AND NULLIF(trim(p.full_name), '') IS NOT NULL
  LOOP
    PERFORM public.materialize_recurring_availability_slots(v_doctor_id);
  END LOOP;

  RETURN QUERY
  SELECT d.id, p.full_name, d.specialty, d.clinic_name, d.experience_years,
    COALESCE(availability.available_dates, ARRAY[]::date[])
  FROM doctors d
  JOIN profiles p ON p.id = d.id
    AND p.role = 'doctor'
    AND NULLIF(trim(p.full_name), '') IS NOT NULL
  LEFT JOIN LATERAL (
    SELECT array_agg(
      DISTINCT (s.slot_start_at AT TIME ZONE d.timezone)::date
      ORDER BY (s.slot_start_at AT TIME ZONE d.timezone)::date
    ) AS available_dates
    FROM appointment_slots s
    JOIN availability_sessions a ON a.id = s.availability_session_id
    WHERE s.doctor_id = d.id
      AND s.status = 'available'
      AND a.status = 'active'
      AND s.slot_start_at >= now()
      AND s.allocated_count < s.capacity
  ) availability ON true
  WHERE (NULLIF(trim(p_search), '') IS NULL OR p.full_name ILIKE '%' || trim(p_search) || '%')
    AND (NULLIF(trim(p_specialty), '') IS NULL OR d.specialty ILIKE trim(p_specialty))
  ORDER BY cardinality(COALESCE(availability.available_dates, ARRAY[]::date[])) DESC, p.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.public_doctor_directory(text, text) TO anon, authenticated;
