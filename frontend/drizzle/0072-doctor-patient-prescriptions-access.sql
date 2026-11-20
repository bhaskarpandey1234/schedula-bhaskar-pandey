CREATE OR REPLACE FUNCTION public.doctor_active_patient_prescriptions(p_appointment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_patient_id uuid;
  v_res jsonb;
BEGIN
  PERFORM public.assert_verified_user(auth.uid());

  SELECT a.patient_id INTO v_patient_id
  FROM public.appointments a
  JOIN public.profiles p ON p.id = auth.uid()
  LEFT JOIN public.queue_entries e ON e.appointment_id = a.id
  WHERE a.id = p_appointment_id
    AND a.doctor_id = auth.uid()
    AND p.role = 'doctor'
    AND (
      e.status IN ('in_consultation', 'completed')
      OR a.status = 'completed'
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prescriptions accessible only to treating doctor during consultation or for completed visits' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'appointment_id', p.appointment_id,
        'doctor_id', p.doctor_id,
        'patient_id', p.patient_id,
        'status', p.status,
        'notes', p.notes,
        'published_at', p.published_at,
        'created_at', p.created_at,
        'items', (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id', pi.id,
                'prescription_id', pi.prescription_id,
                'medication_name', pi.medication_name,
                'dosage', pi.dosage,
                'frequency', pi.frequency,
                'duration', pi.duration,
                'instructions', pi.instructions,
                'sort_order', pi.sort_order
              ) ORDER BY pi.sort_order ASC
            ),
            '[]'::jsonb
          )
          FROM public.prescription_items pi
          WHERE pi.prescription_id = p.id
        )
      ) ORDER BY p.published_at DESC NULLS LAST, p.created_at DESC
    ),
    '[]'::jsonb
  ) INTO v_res
  FROM public.prescriptions p
  WHERE p.patient_id = v_patient_id
    AND (p.status = 'published' OR p.appointment_id = p_appointment_id);

  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.doctor_active_patient_prescriptions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.doctor_active_patient_prescriptions(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
