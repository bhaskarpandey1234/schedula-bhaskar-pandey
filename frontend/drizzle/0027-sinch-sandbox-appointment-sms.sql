-- Appointment SMS provider support and canonical confirmation deduplication.
-- Appointment confirmation is the external SMS event. Payment confirmation remains
-- available in-app and by email, but does not create a second SMS for the patient.

CREATE OR REPLACE FUNCTION public.enqueue_notification_delivery()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO notification_deliveries(notification_id, recipient_id, appointment_id, channel, template, status, scheduled_at, dedupe_key)
  SELECT NEW.id, NEW.recipient_id, NEW.appointment_id, channels.channel,
         NEW.type::text, 'pending'::notification_delivery_status, now(),
         COALESCE(NEW.dedupe_key, 'notification/' || NEW.id::text) || '/' || channels.channel
  FROM (
    SELECT 'email'::notification_channel AS channel
    WHERE EXISTS (
      SELECT 1 FROM notification_preferences p
      WHERE p.recipient_id = NEW.recipient_id AND p.operational_email
    )
      AND NOT (
        NEW.type = 'appointment_booked'::notification_type
        AND EXISTS (
          SELECT 1 FROM payments payment
          WHERE payment.appointment_id = NEW.appointment_id
        )
      )
    UNION ALL
    SELECT 'sms'::notification_channel
    WHERE NEW.type <> 'payment_confirmed'::notification_type
      AND EXISTS (
        SELECT 1 FROM notification_preferences p
        WHERE p.recipient_id = NEW.recipient_id AND p.operational_sms
      )
  ) channels
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN NEW;
END;
$$;

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
