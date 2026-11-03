-- The protected job runner needs recipient email addresses without granting its
-- connection role direct access to auth.users.
CREATE OR REPLACE FUNCTION public.notification_delivery_context(p_delivery_id uuid)
RETURNS TABLE(
  email text,
  phone text,
  recipient_name text,
  doctor_name text,
  clinic_name text,
  timezone text,
  slot_start_at timestamptz,
  slot_end_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT u.email,
         COALESCE(patient.phone, doctor.phone) AS phone,
         COALESCE(recipient_profile.full_name, 'Schedula user') AS recipient_name,
         doctor_profile.full_name AS doctor_name,
         doctor.clinic_name,
         doctor.timezone,
         slot.slot_start_at,
         slot.slot_end_at
  FROM public.notification_deliveries delivery
  JOIN public.appointments appointment ON appointment.id = delivery.appointment_id
  JOIN public.appointment_slots slot ON slot.id = appointment.slot_id
  JOIN public.doctors doctor ON doctor.id = appointment.doctor_id
  JOIN public.profiles doctor_profile ON doctor_profile.id = doctor.id
  JOIN public.profiles recipient_profile ON recipient_profile.id = delivery.recipient_id
  LEFT JOIN public.patients patient ON patient.id = delivery.recipient_id
  LEFT JOIN auth.users u ON u.id = delivery.recipient_id
  WHERE delivery.id = p_delivery_id;
$$;

REVOKE ALL ON FUNCTION public.notification_delivery_context(uuid) FROM PUBLIC;

NOTIFY pgrst, 'reload schema';
