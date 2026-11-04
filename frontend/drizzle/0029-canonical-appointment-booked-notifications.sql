-- Ensure every confirmed appointment creates one canonical booking notification
-- for both participants. Delivery preferences decide the channels independently.

CREATE OR REPLACE FUNCTION public.enqueue_appointment_lifecycle_notifications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status = 'confirmed' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status <> 'confirmed')) THEN
    INSERT INTO notifications(recipient_id, appointment_id, type, title, message, dedupe_key)
      SELECT NEW.patient_id, NEW.id, 'appointment_booked', 'Appointment confirmed',
             'Your appointment has been booked successfully.', 'appointment-booked-patient/' || NEW.id::text
      WHERE NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.recipient_id = NEW.patient_id
          AND n.appointment_id = NEW.id
          AND n.type = 'appointment_booked'
      )
      ON CONFLICT DO NOTHING;

    INSERT INTO notifications(recipient_id, appointment_id, type, title, message, dedupe_key)
      SELECT NEW.doctor_id, NEW.id, 'appointment_booked', 'New appointment booked',
             'A patient has booked one of your available slots.', 'appointment-booked-doctor/' || NEW.id::text
      WHERE NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.recipient_id = NEW.doctor_id
          AND n.appointment_id = NEW.id
          AND n.type = 'appointment_booked'
      )
      ON CONFLICT DO NOTHING;
  END IF;

  IF NEW.status = 'cancelled' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status <> 'cancelled')) THEN
    INSERT INTO notifications(recipient_id, appointment_id, type, title, message, dedupe_key)
      VALUES (NEW.doctor_id, NEW.id, 'appointment_cancelled', 'Appointment cancelled',
              'A patient appointment was cancelled.', 'appointment-cancelled-doctor/' || NEW.id::text)
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
