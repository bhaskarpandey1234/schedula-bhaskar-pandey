import { fileURLToPath, pathToFileURL } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: fileURLToPath(new URL("../.env.local", import.meta.url)) });

export const demoCredentials = {
  doctor: { email: "pilot.doctor@schedula.example", name: "Dr. Mira Sen", password: "PilotPassword123!" },
  doctor2: { email: "pilot.doctor2@schedula.example", name: "Dr. Rajesh Kumar", password: "PilotPassword123!" },
  patient: { email: "pilot.patient@schedula.example", name: "Arjun Pilot", password: "PilotPassword123!" },
  patient2: { email: "priya.patient@schedula.example", name: "Priya Sharma", password: "PilotPassword123!" },
  patient3: { email: "rohan.patient@schedula.example", name: "Rohan Gupta", password: "PilotPassword123!" },
  patient4: { email: "ananya.patient@schedula.example", name: "Ananya Verma", password: "PilotPassword123!" },
  patient5: { email: "vikram.patient@schedula.example", name: "Vikram Malhotra", password: "PilotPassword123!" },
  staff: { email: "pilot.staff@schedula.example", name: "Schedula Reception Desk", password: "PilotPassword123!" },
};

const pilotTimezone = "Asia/Kolkata";

function dateInTimezone(date, timezone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dateOffset(days) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

const dateAt = (date, hour, minute) =>
  `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+05:30`;

export async function ensureUser(admin, user, password, role) {
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  let existing = listed.users.find((c) => c.email?.toLowerCase() === user.email.toLowerCase());

  if (!existing) {
    const { data, error } = await admin.auth.admin.createUser({
      email: user.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: user.name, role, synthetic: true },
    });
    if (error || !data.user) throw error ?? new Error(`Could not create ${role} user.`);
    existing = data.user;
  } else {
    const updates = {
      email_confirm: true,
      user_metadata: { full_name: user.name, role, synthetic: true },
      password,
      ban_duration: "none",
    };
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, updates);
    if (error || !data.user) throw error ?? new Error(`Could not update ${role} user.`);
    existing = data.user;
  }
  return existing.id;
}

export async function seedClinicalDemo(env = process.env) {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
  const databaseUrl = env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required in frontend/.env.local");
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("Ensuring demo Auth accounts...");
  const doctorId = await ensureUser(admin, demoCredentials.doctor, demoCredentials.doctor.password, "doctor");
  const doctor2Id = await ensureUser(admin, demoCredentials.doctor2, demoCredentials.doctor2.password, "doctor");
  const patient1Id = await ensureUser(admin, demoCredentials.patient, demoCredentials.patient.password, "patient");
  const patient2Id = await ensureUser(admin, demoCredentials.patient2, demoCredentials.patient2.password, "patient");
  const patient3Id = await ensureUser(admin, demoCredentials.patient3, demoCredentials.patient3.password, "patient");
  const patient4Id = await ensureUser(admin, demoCredentials.patient4, demoCredentials.patient4.password, "patient");
  const patient5Id = await ensureUser(admin, demoCredentials.patient5, demoCredentials.patient5.password, "patient");
  const staffId = await ensureUser(admin, demoCredentials.staff, demoCredentials.staff.password, "staff");

  const sql = postgres(databaseUrl, { max: 1, prepare: false });

  try {
    const today = dateInTimezone(new Date(), pilotTimezone);
    const visit1Date = dateOffset(-3);
    const visit2Date = dateOffset(-14);
    const visit3Date = dateOffset(-42);

    let activeAppointmentId = "";
    let calledAppointmentId = "";

    await sql.begin(async (tx) => {
      await tx.unsafe("SET LOCAL session_replication_role = 'replica'");

      // 1. Upsert Profiles
      await tx`
        INSERT INTO public.profiles (id, full_name, role)
        VALUES
          (${doctorId}, ${demoCredentials.doctor.name}, 'doctor'),
          (${doctor2Id}, ${demoCredentials.doctor2.name}, 'doctor'),
          (${patient1Id}, ${demoCredentials.patient.name}, 'patient'),
          (${patient2Id}, ${demoCredentials.patient2.name}, 'patient'),
          (${patient3Id}, ${demoCredentials.patient3.name}, 'patient'),
          (${patient4Id}, ${demoCredentials.patient4.name}, 'patient'),
          (${patient5Id}, ${demoCredentials.patient5.name}, 'patient'),
          (${staffId}, ${demoCredentials.staff.name}, 'staff')
        ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role
      `;

      // 2. Clinic
      const existingClinic = await tx`SELECT id FROM public.clinics LIMIT 1`;
      let clinicId = existingClinic[0]?.id;
      if (!clinicId) {
        const [c] = await tx`INSERT INTO public.clinics (name, timezone) VALUES ('Schedula Central Healthcare', ${pilotTimezone}) RETURNING id`;
        clinicId = c.id;
      }

      // 3. Doctors
      await tx`
        INSERT INTO public.doctors (id, clinic_id, specialty, clinic_name, experience_years, biography, timezone, consultation_fee_minor, consultation_currency, phone)
        VALUES
          (${doctorId}, ${clinicId}, 'General Medicine & Cardiology', 'Schedula Central Healthcare', 15, 'Senior consultant physician specializing in internal medicine, cardiac wellness, hypertension, and preventive care.', ${pilotTimezone}, 80000, 'INR', '+919900000001'),
          (${doctor2Id}, ${clinicId}, 'Pulmonology', 'Schedula Central Healthcare', 12, 'Consultant pulmonologist with clinical focus on respiratory allergies, asthma, and chronic pulmonary diseases.', ${pilotTimezone}, 90000, 'INR', '+919900000003')
        ON CONFLICT (id) DO UPDATE SET
          specialty = EXCLUDED.specialty,
          clinic_name = EXCLUDED.clinic_name,
          experience_years = EXCLUDED.experience_years,
          biography = EXCLUDED.biography,
          timezone = EXCLUDED.timezone,
          consultation_fee_minor = EXCLUDED.consultation_fee_minor,
          phone = EXCLUDED.phone
      `;

      // 4. Staff membership
      await tx`
        INSERT INTO public.staff_clinic_memberships (staff_id, clinic_id)
        VALUES (${staffId}, ${clinicId})
        ON CONFLICT (staff_id) DO UPDATE SET clinic_id = EXCLUDED.clinic_id
      `;

      // 5. Patient Records
      await tx`
        INSERT INTO public.patients (id, phone, date_of_birth)
        VALUES
          (${patient1Id}, '+919876500001', '1992-06-15'),
          (${patient2Id}, '+919876500002', '1996-03-22'),
          (${patient3Id}, '+919876500003', '1988-11-10'),
          (${patient4Id}, '+919876500004', '2001-08-05'),
          (${patient5Id}, '+919876500005', '1975-01-14')
        ON CONFLICT (id) DO UPDATE SET phone = EXCLUDED.phone, date_of_birth = EXCLUDED.date_of_birth
      `;

      // 6. Medical History for Patient 1 (Arjun Pilot)
      const arjunMedicalDetails = JSON.stringify({
        vitals: {
          gender: "Male",
          bloodGroup: "O+",
          height: "178 cm",
          weight: "72 kg",
          primaryContactName: "Suman Pilot",
          primaryContactPhone: "+91 98765 12345",
        },
        healthProfile: {
          currentConcerns: [
            { description: "Occasional tension headaches in afternoons after screen work", onset: "3 weeks" },
            { description: "Mild lower back stiffness upon prolonged sitting", onset: "2 months" },
          ],
          pastSurgeries: [
            { procedure: "Arthroscopic Right Knee Surgery", approximateDate: "2022", notes: "Sports injury meniscus repair, full recovery" },
            { procedure: "Laparoscopic Appendectomy", approximateDate: "2018", notes: "Uneventful healing" },
          ],
          selfReportedMedications: [
            { name: "Vitamin D3 60,000 IU", dosage: "1 Capsule", frequency: "Once weekly", duration: "Ongoing", source: "Patient-reported" },
            { name: "Omega-3 Fish Oil", dosage: "1000 mg", frequency: "Once daily", duration: "Ongoing", source: "Patient-reported" },
          ],
        },
        notes: "Patient maintains regular aerobic exercise. Non-smoker. Regular annual health checks.",
      });

      const arjunAllergies = {
        status: "recorded",
        items: [
          { substance: "Penicillin", severity: "severe", reaction: "Anaphylaxis and generalized urticaria" },
          { substance: "Ibuprofen / NSAIDs", severity: "moderate", reaction: "Gastric irritation and facial puffiness" },
          { substance: "Peanuts", severity: "mild", reaction: "Contact dermatitis / localized itching" },
        ],
      };

      const arjunConditions = {
        items: [
          { name: "Essential Hypertension", status: "active", notes: "Well-controlled with lifestyle and medication" },
          { name: "Allergic Rhinitis", status: "active", notes: "Seasonal pollen triggers in spring/autumn" },
          { name: "Acute Gastritis", status: "resolved", notes: "Treated in 2024 with 4-week PPI regimen" },
        ],
      };

      await tx`DELETE FROM public.patient_medical_history_versions WHERE patient_id = ${patient1Id}`;
      await tx`
        INSERT INTO public.patient_medical_history_versions (
          patient_id, version, allergies, conditions, medical_details, source,
          verification_status, authored_by, verified_by, verified_at, created_at
        )
        VALUES
          (
            ${patient1Id}, 1, ${tx.json(arjunAllergies)}, ${tx.json(arjunConditions)},
            ${arjunMedicalDetails}, 'doctor_recorded', 'clinician_verified',
            ${doctorId}, ${doctorId}, ${dateAt(visit1Date, 10, 0)}, ${dateAt(visit1Date, 10, 0)}
          )
      `;

      // Medical History for Patient 2 (Priya Sharma)
      const priyaMedicalDetails = JSON.stringify({
        vitals: {
          gender: "Female",
          bloodGroup: "B+",
          height: "165 cm",
          weight: "58 kg",
          primaryContactName: "Rahul Sharma",
          primaryContactPhone: "+91 98765 22222",
        },
        healthProfile: {
          currentConcerns: [
            { description: "Unilateral throbbing headache with photophobia and nausea", onset: "2 days" },
            { description: "Neck stiffness related to desk posture", onset: "1 month" },
          ],
          pastSurgeries: [
            { procedure: "Surgical Wisdom Tooth Extraction", approximateDate: "2023", notes: "Local anesthesia, healed well" },
          ],
          selfReportedMedications: [
            { name: "Magnesium Glycinate 400mg", dosage: "1 Tablet", frequency: "Once daily at night", duration: "Ongoing", source: "Patient-reported" },
          ],
        },
        notes: "Desk engineer working long hours with monitors. Hydration needs reinforcement.",
      });

      const priyaAllergies = {
        status: "recorded",
        items: [
          { substance: "Sulfa Antibiotics", severity: "severe", reaction: "Generalized erythema and cutaneous rash" },
          { substance: "Aspirin", severity: "moderate", reaction: "Bronchospasm and hives" },
        ],
      };

      const priyaConditions = {
        items: [
          { name: "Migraine with Aura", status: "active", notes: "Triggered by sleep deprivation and bright screen glare" },
          { name: "Cervical Myofascial Strain", status: "active", notes: "Postural ergonomics counseling initiated" },
        ],
      };

      await tx`DELETE FROM public.patient_medical_history_versions WHERE patient_id = ${patient2Id}`;
      await tx`
        INSERT INTO public.patient_medical_history_versions (
          patient_id, version, allergies, conditions, medical_details, source,
          verification_status, authored_by, verified_by, verified_at, created_at
        )
        VALUES
          (
            ${patient2Id}, 1, ${tx.json(priyaAllergies)}, ${tx.json(priyaConditions)},
            ${priyaMedicalDetails}, 'doctor_recorded', 'clinician_verified',
            ${doctorId}, ${doctorId}, ${dateAt(today, 9, 0)}, ${dateAt(today, 9, 0)}
          )
      `;

      // Helper to ensure availability session and slot
      async function createSlot(docId, sessDate, startHour, startMin, endHour, endMin) {
        const startTime = `${String(startHour).padStart(2, "0")}:${String(startMin).padStart(2, "0")}:00`;
        const endTime = `${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}:00`;
        const startAt = dateAt(sessDate, startHour, startMin);
        const endAt = dateAt(sessDate, endHour, endMin);

        let [sess] = await tx`
          SELECT id FROM public.availability_sessions
          WHERE doctor_id = ${docId} AND session_date = ${sessDate} AND start_time = ${startTime}::time LIMIT 1
        `;
        if (!sess) {
          [sess] = await tx`
            INSERT INTO public.availability_sessions (
              doctor_id, kind, scheduling_type, session_date, start_time, end_time,
              timezone, interval_minutes, capacity, session_start_at, session_end_at
            )
            VALUES (
              ${docId}, 'custom', 'wave', ${sessDate}, ${startTime}::time, ${endTime}::time,
              ${pilotTimezone}, 30, 1, ${startAt}, ${endAt}
            )
            RETURNING id
          `;
        }

        let [slot] = await tx`
          SELECT id FROM public.appointment_slots
          WHERE availability_session_id = ${sess.id} AND slot_start_at = ${startAt}::timestamptz LIMIT 1
        `;
        if (!slot) {
          [slot] = await tx`
            INSERT INTO public.appointment_slots (
              availability_session_id, doctor_id, slot_start_at, slot_end_at, capacity, allocated_count, status
            )
            VALUES (${sess.id}, ${docId}, ${startAt}::timestamptz, ${endAt}::timestamptz, 1, 1, 'available')
            RETURNING id
          `;
        }
        return slot.id;
      }

      // 7. Past Consultations for Arjun Pilot (Strictly one booking per doctor per day)
      // Visit 1: 3 days ago with Dr. Mira Sen
      await tx`
        DELETE FROM public.appointments a
        USING public.appointment_slots s
        WHERE a.slot_id = s.id
          AND a.patient_id = ${patient1Id}
          AND a.doctor_id = ${doctorId}
          AND (s.slot_start_at AT TIME ZONE ${pilotTimezone})::date = ${visit1Date}::date
      `;
      const slot1Id = await createSlot(doctorId, visit1Date, 10, 0, 10, 30);
      const [appt1] = await tx`
        INSERT INTO public.appointments (patient_id, doctor_id, slot_id, status, completed_at, reason, refund_policy_snapshot)
        VALUES (
          ${patient1Id}, ${doctorId}, ${slot1Id}, 'completed', ${dateAt(visit1Date, 10, 25)},
          'Seasonal allergic rhinitis and routine BP check', '24h full refund; 2h partial refund'
        )
        RETURNING id
      `;

      await tx`
        INSERT INTO public.visit_summary_versions (appointment_id, doctor_id, patient_id, version, summary, status, authored_by, published_at, created_at)
        VALUES (
          ${appt1.id}, ${doctorId}, ${patient1Id}, 1,
          'Patient presented with mild seasonal allergy symptoms and routine BP monitoring. Blood pressure recorded at 124/82 mmHg, pulse 72 bpm regular. Bilateral chest clear, pharynx mild erythema. Advised warm saline gargles, adequate hydration, and symptomatic pharmacotherapy.',
          'published', ${doctorId}, ${dateAt(visit1Date, 10, 25)}, ${dateAt(visit1Date, 10, 25)}
        )
      `;

      const [rx1] = await tx`
        INSERT INTO public.prescriptions (appointment_id, doctor_id, patient_id, status, notes, published_at, created_at)
        VALUES (
          ${appt1.id}, ${doctorId}, ${patient1Id}, 'published',
          'Diagnosis: Acute Allergic Rhinosinusitis & Mild Pharyngitis\n\nDirections: Drink warm fluids regularly. Avoid direct exposure to cold air or dust allergens.',
          ${dateAt(visit1Date, 10, 25)}, ${dateAt(visit1Date, 10, 25)}
        )
        RETURNING id
      `;

      await tx`
        INSERT INTO public.prescription_items (prescription_id, medication_name, dosage, frequency, duration, instructions, sort_order)
        VALUES
          (${rx1.id}, 'Amoxicillin & Clavulanate 625mg', '1 Tablet', '1-0-1 (Twice daily)', '5 days', 'Take after food with water. Complete entire course.', 0),
          (${rx1.id}, 'Montelukast & Levocetirizine', '1 Tablet', '0-0-1 (Night)', '10 days', 'Take at bedtime. Avoid late night driving.', 1),
          (${rx1.id}, 'Paracetamol 650mg', '1 Tablet', 'SOS (As needed)', '3 days', 'Take only if fever > 100°F or body ache persists.', 2)
      `;

      // Visit 2: 14 days ago with Dr. Rajesh Kumar (Pulmonology)
      await tx`
        DELETE FROM public.appointments a
        USING public.appointment_slots s
        WHERE a.slot_id = s.id
          AND a.patient_id = ${patient1Id}
          AND a.doctor_id = ${doctor2Id}
          AND (s.slot_start_at AT TIME ZONE ${pilotTimezone})::date = ${visit2Date}::date
      `;
      const slot2Id = await createSlot(doctor2Id, visit2Date, 11, 0, 11, 30);
      const [appt2] = await tx`
        INSERT INTO public.appointments (patient_id, doctor_id, slot_id, status, completed_at, reason, refund_policy_snapshot)
        VALUES (
          ${patient1Id}, ${doctor2Id}, ${slot2Id}, 'completed', ${dateAt(visit2Date, 11, 28)},
          'Respiratory follow-up and chest tightness evaluation', '24h full refund; 2h partial refund'
        )
        RETURNING id
      `;

      await tx`
        INSERT INTO public.visit_summary_versions (appointment_id, doctor_id, patient_id, version, summary, status, authored_by, published_at, created_at)
        VALUES (
          ${appt2.id}, ${doctor2Id}, ${patient1Id}, 1,
          'Pulmonary evaluation for post-viral dry cough. SpO2 99% on room air. Lungs clear to auscultation bilaterally. Peak flow rate within normal expected range. Advised inhaler maintenance course.',
          'published', ${doctor2Id}, ${dateAt(visit2Date, 11, 28)}, ${dateAt(visit2Date, 11, 28)}
        )
      `;

      const [rx2] = await tx`
        INSERT INTO public.prescriptions (appointment_id, doctor_id, patient_id, status, notes, published_at, created_at)
        VALUES (
          ${appt2.id}, ${doctor2Id}, ${patient1Id}, 'published',
          'Diagnosis: Seasonal Bronchial Hyperresponsiveness\n\nDirections: Rinse mouth thoroughly with water after inhalation.',
          ${dateAt(visit2Date, 11, 28)}, ${dateAt(visit2Date, 11, 28)}
        )
        RETURNING id
      `;

      await tx`
        INSERT INTO public.prescription_items (prescription_id, medication_name, dosage, frequency, duration, instructions, sort_order)
        VALUES
          (${rx2.id}, 'Budesonide & Formoterol Inhaler 200mcg', '1 Puff', '1-0-1 (Twice daily)', '1 month', 'Rinse mouth after each puff', 0),
          (${rx2.id}, 'Pantoprazole 40mg', '1 Tablet', '1-0-0 (Morning)', '14 days', 'Take 30 minutes before breakfast', 1)
      `;

      // Visit 3: 42 days ago with Dr. Mira Sen (Annual Preventive Health & Lipid Evaluation)
      await tx`
        DELETE FROM public.appointments a
        USING public.appointment_slots s
        WHERE a.slot_id = s.id
          AND a.patient_id = ${patient1Id}
          AND a.doctor_id = ${doctorId}
          AND (s.slot_start_at AT TIME ZONE ${pilotTimezone})::date = ${visit3Date}::date
      `;
      const slot3Id = await createSlot(doctorId, visit3Date, 14, 0, 14, 30);
      const [appt3] = await tx`
        INSERT INTO public.appointments (patient_id, doctor_id, slot_id, status, completed_at, reason, refund_policy_snapshot)
        VALUES (
          ${patient1Id}, ${doctorId}, ${slot3Id}, 'completed', ${dateAt(visit3Date, 14, 25)},
          'Annual preventive health checkup and lipid panel evaluation', '24h full refund; 2h partial refund'
        )
        RETURNING id
      `;

      await tx`
        INSERT INTO public.visit_summary_versions (appointment_id, doctor_id, patient_id, version, summary, status, authored_by, published_at, created_at)
        VALUES (
          ${appt3.id}, ${doctorId}, ${patient1Id}, 1,
          'Comprehensive annual metabolic profile review. ECG normal sinus rhythm. Fasting lipid panel demonstrated borderline elevated LDL cholesterol (138 mg/dL). Lifestyle modifications and low-dose statin therapy initiated with 3-month follow-up recommended.',
          'published', ${doctorId}, ${dateAt(visit3Date, 14, 25)}, ${dateAt(visit3Date, 14, 25)}
        )
      `;

      const [rx3] = await tx`
        INSERT INTO public.prescriptions (appointment_id, doctor_id, patient_id, status, notes, published_at, created_at)
        VALUES (
          ${appt3.id}, ${doctorId}, ${patient1Id}, 'published',
          'Diagnosis: Dyslipidemia & Preventive Cardiac Health\n\nDirections: Maintain a low saturated-fat diet. Daily 30-minute brisk cardiovascular exercise.',
          ${dateAt(visit3Date, 14, 25)}, ${dateAt(visit3Date, 14, 25)}
        )
        RETURNING id
      `;

      await tx`
        INSERT INTO public.prescription_items (prescription_id, medication_name, dosage, frequency, duration, instructions, sort_order)
        VALUES
          (${rx3.id}, 'Atorvastatin 10mg', '1 Tablet', '0-0-1 (Night)', 'Ongoing', 'Take daily at bedtime after dinner. Follow up in 3 months with fasting lipid profile.', 0),
          (${rx3.id}, 'Metformin 500mg', '1 Tablet', '1-0-1 (Twice daily)', 'Ongoing', 'Take with or immediately after meals to reduce gastrointestinal discomfort.', 1),
          (${rx3.id}, 'Vitamin B-Complex with Zinc', '1 Capsule', '1-0-0 (Morning)', '1 month', 'Take after breakfast with a full glass of water.', 2)
      `;

      // 8. Queue Session for Today
      let [qSession] = await tx`
        SELECT id FROM public.queue_sessions WHERE doctor_id = ${doctorId} AND service_date = ${today} LIMIT 1
      `;
      if (!qSession) {
        [qSession] = await tx`
          INSERT INTO public.queue_sessions (clinic_id, doctor_id, service_date, timezone, last_token)
          VALUES (${clinicId}, ${doctorId}, ${today}, ${pilotTimezone}, 5)
          RETURNING id
        `;
      } else {
        await tx`UPDATE public.queue_sessions SET last_token = 5 WHERE id = ${qSession.id}`;
      }

      // Reset queue entries for today's session to avoid token number collisions across seed runs
      await tx`DELETE FROM public.queue_entries WHERE session_id = ${qSession.id}`;

      // -------------------------------------------------------------
      // TODAY'S DOCTOR QUEUE PATIENTS (Dr. Mira Sen) - Clock-Aligned Evening Slots
      // -------------------------------------------------------------

      const slotPast1 = await createSlot(doctorId, today, 18, 30, 19, 0);
      const slotToday1 = await createSlot(doctorId, today, 19, 0, 19, 30);
      const slotToday2 = await createSlot(doctorId, today, 19, 30, 20, 0);
      const slotToday3 = await createSlot(doctorId, today, 20, 0, 20, 30);
      const slotTodayDoc2 = await createSlot(doctor2Id, today, 19, 0, 19, 30);

      // Clean up all appointments on today for demo doctors to ensure 100% clean single-booking slots
      await tx`
        DELETE FROM public.appointments a
        USING public.appointment_slots s
        WHERE a.slot_id = s.id
          AND (s.slot_start_at AT TIME ZONE ${pilotTimezone})::date = ${today}::date
          AND a.doctor_id IN (${doctorId}, ${doctor2Id})
      `;

      // PATIENT 1 (Slot Past: 18:30 - 19:00): Rohan Gupta (Completed at 6:50 PM with Dr. Mira Sen)
      let [existingAppt1] = await tx`
        SELECT id FROM public.appointments WHERE patient_id = ${patient3Id} AND doctor_id = ${doctorId} AND slot_id = ${slotPast1} LIMIT 1
      `;
      let apptToday1Id = existingAppt1?.id;
      if (!apptToday1Id) {
        const [a] = await tx`
          INSERT INTO public.appointments (patient_id, doctor_id, slot_id, status, completed_at, reason, refund_policy_snapshot)
          VALUES (${patient3Id}, ${doctorId}, ${slotPast1}, 'completed', ${dateAt(today, 18, 50)}, 'Routine cardiac risk profile and fasting sugar check', 'Demo')
          RETURNING id
        `;
        apptToday1Id = a.id;
      } else {
        await tx`
          UPDATE public.appointments
          SET status = 'completed', completed_at = ${dateAt(today, 18, 50)}, reason = 'Routine cardiac risk profile and fasting sugar check', updated_at = now()
          WHERE id = ${apptToday1Id}
        `;
      }

      await tx`
        INSERT INTO public.appointment_attendance (appointment_id, status, checked_in_at, checked_in_by)
        VALUES (${apptToday1Id}, 'checked_in', ${dateAt(today, 18, 20)}, ${staffId})
        ON CONFLICT (appointment_id) DO UPDATE SET status = 'checked_in', checked_in_at = ${dateAt(today, 18, 20)}
      `;

      await tx`
        INSERT INTO public.queue_entries (session_id, appointment_id, token_number, status, priority_at, checked_in_at, consultation_started_at, completed_at)
        VALUES (${qSession.id}, ${apptToday1Id}, 1, 'completed', ${dateAt(today, 18, 30)}, ${dateAt(today, 18, 20)}, ${dateAt(today, 18, 30)}, ${dateAt(today, 18, 50)})
        ON CONFLICT (appointment_id) DO UPDATE SET status = 'completed', completed_at = ${dateAt(today, 18, 50)}
      `;

      // Today's prescription for Rohan Gupta (Dr. Mira Sen)
      let [rxToday1] = await tx`SELECT id FROM public.prescriptions WHERE appointment_id = ${apptToday1Id} LIMIT 1`;
      if (!rxToday1) {
        [rxToday1] = await tx`
          INSERT INTO public.prescriptions (appointment_id, doctor_id, patient_id, status, notes, published_at, created_at)
          VALUES (
            ${apptToday1Id}, ${doctorId}, ${patient3Id}, 'published',
            'Diagnosis: Borderline Dyslipidemia & Lifestyle Guidance\n\nDirections: Daily brisk walk for 30 minutes. Low saturated-fat diet.',
            ${dateAt(today, 18, 48)}, ${dateAt(today, 18, 48)}
          )
          RETURNING id
        `;
      } else {
        await tx`
          UPDATE public.prescriptions
          SET status = 'published', notes = 'Diagnosis: Borderline Dyslipidemia & Lifestyle Guidance\n\nDirections: Daily brisk walk for 30 minutes. Low saturated-fat diet.', updated_at = now()
          WHERE id = ${rxToday1.id}
        `;
      }

      await tx`DELETE FROM public.prescription_items WHERE prescription_id = ${rxToday1.id}`;
      await tx`
        INSERT INTO public.prescription_items (prescription_id, medication_name, dosage, frequency, duration, instructions, sort_order)
        VALUES
          (${rxToday1.id}, 'Atorvastatin 10mg', '1 Tablet', '0-0-1 (Night)', '1 month', 'Take at bedtime after dinner.', 0),
          (${rxToday1.id}, 'Omega-3 Fish Oil 1000mg', '1 Capsule', '1-0-0 (Morning)', '1 month', 'Take after breakfast with water.', 1)
      `;

      // PATIENT 2 (Slot 1: 19:00 - 19:30): Priya Sharma (Completed at 7:25 PM with Dr. Mira Sen)
      let [existingAppt2] = await tx`
        SELECT id FROM public.appointments WHERE patient_id = ${patient2Id} AND doctor_id = ${doctorId} AND slot_id = ${slotToday1} LIMIT 1
      `;
      let apptToday2Id = existingAppt2?.id;
      if (!apptToday2Id) {
        const [a] = await tx`
          INSERT INTO public.appointments (patient_id, doctor_id, slot_id, status, completed_at, reason, refund_policy_snapshot)
          VALUES (${patient2Id}, ${doctorId}, ${slotToday1}, 'completed', ${dateAt(today, 19, 25)}, 'Chronic migraine follow-up and acute headache episode', 'Demo')
          RETURNING id
        `;
        apptToday2Id = a.id;
      } else {
        await tx`
          UPDATE public.appointments
          SET status = 'completed', completed_at = ${dateAt(today, 19, 25)}, reason = 'Chronic migraine follow-up and acute headache episode', updated_at = now()
          WHERE id = ${apptToday2Id}
        `;
      }

      await tx`
        INSERT INTO public.appointment_attendance (appointment_id, status, checked_in_at, checked_in_by)
        VALUES (${apptToday2Id}, 'checked_in', ${dateAt(today, 18, 55)}, ${staffId})
        ON CONFLICT (appointment_id) DO UPDATE SET status = 'checked_in', checked_in_at = ${dateAt(today, 18, 55)}
      `;

      await tx`
        INSERT INTO public.queue_entries (session_id, appointment_id, token_number, status, priority_at, checked_in_at, consultation_started_at, completed_at)
        VALUES (${qSession.id}, ${apptToday2Id}, 2, 'completed', ${dateAt(today, 19, 0)}, ${dateAt(today, 18, 55)}, ${dateAt(today, 19, 0)}, ${dateAt(today, 19, 25)})
        ON CONFLICT (appointment_id) DO UPDATE SET status = 'completed', completed_at = ${dateAt(today, 19, 25)}
      `;

      // Today's prescription for Priya Sharma
      let [rxToday2] = await tx`SELECT id FROM public.prescriptions WHERE appointment_id = ${apptToday2Id} LIMIT 1`;
      if (!rxToday2) {
        [rxToday2] = await tx`
          INSERT INTO public.prescriptions (appointment_id, doctor_id, patient_id, status, notes, published_at, created_at)
          VALUES (
            ${apptToday2Id}, ${doctorId}, ${patient2Id}, 'published',
            'Diagnosis: Common Migraine with Aura\n\nDirections: Keep a migraine headache trigger diary. Avoid bright glare.',
            ${dateAt(today, 19, 22)}, ${dateAt(today, 19, 22)}
          )
          RETURNING id
        `;
      } else {
        await tx`
          UPDATE public.prescriptions
          SET status = 'published', notes = 'Diagnosis: Common Migraine with Aura\n\nDirections: Keep a migraine headache trigger diary. Avoid bright glare.', updated_at = now()
          WHERE id = ${rxToday2.id}
        `;
      }

      await tx`DELETE FROM public.prescription_items WHERE prescription_id = ${rxToday2.id}`;
      await tx`
        INSERT INTO public.prescription_items (prescription_id, medication_name, dosage, frequency, duration, instructions, sort_order)
        VALUES
          (${rxToday2.id}, 'Naproxen 500mg', '1 Tablet', 'SOS (As needed)', '5 days', 'Take with food at onset of severe headache.', 0),
          (${rxToday2.id}, 'Flunarizine 10mg', '1 Tablet', '0-0-1 (Night)', '1 month', 'Take at bedtime for prophylactic prevention.', 1)
      `;

      // PATIENT 3 (Slot 2: 19:30 - 20:00): ARJUN PILOT - IN ROOM (Inside cabin consultation right now!)
      let [existingAppt3] = await tx`
        SELECT id FROM public.appointments WHERE patient_id = ${patient1Id} AND doctor_id = ${doctorId} AND slot_id = ${slotToday2} LIMIT 1
      `;
      let apptToday3Id = existingAppt3?.id;
      if (!apptToday3Id) {
        const [a] = await tx`
          INSERT INTO public.appointments (patient_id, doctor_id, slot_id, status, reason, refund_policy_snapshot)
          VALUES (${patient1Id}, ${doctorId}, ${slotToday2}, 'confirmed', 'Active in-cabin hypertension and cardiovascular follow-up', 'Demo')
          RETURNING id
        `;
        apptToday3Id = a.id;
      } else {
        await tx`
          UPDATE public.appointments
          SET status = 'confirmed', completed_at = NULL, reason = 'Active in-cabin hypertension and cardiovascular follow-up', updated_at = now()
          WHERE id = ${apptToday3Id}
        `;
      }
      activeAppointmentId = apptToday3Id;

      await tx`
        INSERT INTO public.appointment_attendance (appointment_id, status, checked_in_at, checked_in_by)
        VALUES (${apptToday3Id}, 'checked_in', ${dateAt(today, 19, 25)}, ${staffId})
        ON CONFLICT (appointment_id) DO UPDATE SET status = 'checked_in', checked_in_at = ${dateAt(today, 19, 25)}
      `;

      await tx`
        INSERT INTO public.queue_entries (session_id, appointment_id, token_number, status, priority_at, checked_in_at, consultation_started_at)
        VALUES (${qSession.id}, ${apptToday3Id}, 3, 'in_consultation', ${dateAt(today, 19, 30)}, ${dateAt(today, 19, 25)}, ${dateAt(today, 19, 30)})
        ON CONFLICT (appointment_id) DO UPDATE SET status = 'in_consultation', consultation_started_at = ${dateAt(today, 19, 30)}, completed_at = NULL
      `;

      // Draft prescription for Arjun Pilot (Dr. Mira Sen can edit/complete during demo)
      let [rxToday3] = await tx`SELECT id FROM public.prescriptions WHERE appointment_id = ${apptToday3Id} LIMIT 1`;
      if (!rxToday3) {
        [rxToday3] = await tx`
          INSERT INTO public.prescriptions (appointment_id, doctor_id, patient_id, status, notes, published_at, created_at)
          VALUES (
            ${apptToday3Id}, ${doctorId}, ${patient1Id}, 'draft',
            'Diagnosis: Stage 1 Essential Hypertension (Therapy Optimization)\n\nDirections: Continue regular BP monitoring. Avoid excessive sodium.',
            NULL, ${dateAt(today, 19, 32)}
          )
          RETURNING id
        `;
      } else {
        await tx`
          UPDATE public.prescriptions
          SET status = 'draft', notes = 'Diagnosis: Stage 1 Essential Hypertension (Therapy Optimization)\n\nDirections: Continue regular BP monitoring. Avoid excessive sodium.', updated_at = now()
          WHERE id = ${rxToday3.id}
        `;
      }

      await tx`DELETE FROM public.prescription_items WHERE prescription_id = ${rxToday3.id}`;
      await tx`
        INSERT INTO public.prescription_items (prescription_id, medication_name, dosage, frequency, duration, instructions, sort_order)
        VALUES
          (${rxToday3.id}, 'Telmisartan 40mg', '1 Tablet', '1-0-0 (Morning)', '1 month', 'Take 30 minutes after breakfast with water. Monitor BP weekly.', 0),
          (${rxToday3.id}, 'Rosuvastatin 10mg', '1 Tablet', '0-0-1 (Night)', '1 month', 'Take at bedtime with water.', 1),
          (${rxToday3.id}, 'Vitamin C 500mg (Chewable)', '1 Tablet', '1-0-0 (Morning)', '15 days', 'Chew thoroughly after morning meal.', 2)
      `;

      // PATIENT 4 (Slot 3: 20:00 - 20:30): Ananya Verma (Waiting in waiting room)
      let [existingAppt4] = await tx`
        SELECT id FROM public.appointments WHERE patient_id = ${patient4Id} AND doctor_id = ${doctorId} AND slot_id = ${slotToday3} LIMIT 1
      `;
      let apptToday4Id = existingAppt4?.id;
      if (!apptToday4Id) {
        const [a] = await tx`
          INSERT INTO public.appointments (patient_id, doctor_id, slot_id, status, reason, refund_policy_snapshot)
          VALUES (${patient4Id}, ${doctorId}, ${slotToday3}, 'confirmed', 'Dermatology referral consultation & allergic skin rash', 'Demo')
          RETURNING id
        `;
        apptToday4Id = a.id;
      } else {
        await tx`
          UPDATE public.appointments
          SET status = 'confirmed', completed_at = NULL, reason = 'Dermatology referral consultation & allergic skin rash', updated_at = now()
          WHERE id = ${apptToday4Id}
        `;
      }

      await tx`
        INSERT INTO public.appointment_attendance (appointment_id, status, checked_in_at, checked_in_by)
        VALUES (${apptToday4Id}, 'checked_in', ${dateAt(today, 19, 15)}, ${staffId})
        ON CONFLICT (appointment_id) DO UPDATE SET status = 'checked_in', checked_in_at = ${dateAt(today, 19, 15)}
      `;

      await tx`
        INSERT INTO public.queue_entries (session_id, appointment_id, token_number, status, priority_at, checked_in_at)
        VALUES (${qSession.id}, ${apptToday4Id}, 4, 'waiting', ${dateAt(today, 20, 0)}, ${dateAt(today, 19, 15)})
        ON CONFLICT (appointment_id) DO UPDATE SET status = 'waiting', called_at = NULL, consultation_started_at = NULL, completed_at = NULL
      `;

      // -------------------------------------------------------------
      // TODAY'S IN-CABIN CONSULTATION FOR DR. RAJESH KUMAR (Pulmonology) - 7:00 PM to 7:30 PM
      // -------------------------------------------------------------
      let [qSessionDoc2] = await tx`
        SELECT id FROM public.queue_sessions WHERE doctor_id = ${doctor2Id} AND service_date = ${today} LIMIT 1
      `;
      if (!qSessionDoc2) {
        [qSessionDoc2] = await tx`
          INSERT INTO public.queue_sessions (clinic_id, doctor_id, service_date, timezone, last_token)
          VALUES (${clinicId}, ${doctor2Id}, ${today}, ${pilotTimezone}, 1)
          RETURNING id
        `;
      }
      await tx`DELETE FROM public.queue_entries WHERE session_id = ${qSessionDoc2.id}`;

      // Vikram Malhotra for Dr. Rajesh Kumar (keeps Arjun Pilot unique to Dr. Mira Sen)
      let [existingActiveApptDoc2] = await tx`
        SELECT id FROM public.appointments WHERE patient_id = ${patient5Id} AND doctor_id = ${doctor2Id} AND slot_id = ${slotTodayDoc2} LIMIT 1
      `;
      let apptDoc2Id = existingActiveApptDoc2?.id;
      if (existingActiveApptDoc2) {
        await tx`
          UPDATE public.appointments
          SET status = 'confirmed', completed_at = NULL, reason = 'Active pulmonary spirometry and inhaler titration', updated_at = now()
          WHERE id = ${apptDoc2Id}
        `;
      } else {
        const [a] = await tx`
          INSERT INTO public.appointments (patient_id, doctor_id, slot_id, status, reason, refund_policy_snapshot)
          VALUES (${patient5Id}, ${doctor2Id}, ${slotTodayDoc2}, 'confirmed', 'Active pulmonary spirometry and inhaler titration', 'Demo')
          RETURNING id
        `;
        apptDoc2Id = a.id;
      }

      await tx`
        INSERT INTO public.appointment_attendance (appointment_id, status, checked_in_at, checked_in_by)
        VALUES (${apptDoc2Id}, 'checked_in', ${dateAt(today, 18, 55)}, ${staffId})
        ON CONFLICT (appointment_id) DO UPDATE SET status = 'checked_in', checked_in_at = ${dateAt(today, 18, 55)}
      `;

      await tx`
        INSERT INTO public.queue_entries (session_id, appointment_id, token_number, status, priority_at, checked_in_at, consultation_started_at)
        VALUES (${qSessionDoc2.id}, ${apptDoc2Id}, 1, 'in_consultation', ${dateAt(today, 19, 0)}, ${dateAt(today, 18, 55)}, ${dateAt(today, 19, 5)})
        ON CONFLICT (appointment_id) DO UPDATE SET status = 'in_consultation', consultation_started_at = ${dateAt(today, 19, 5)}, completed_at = NULL
      `;
    });

    console.log("\n=======================================================================");
    console.log("   🎉 COMPLETE CLINICAL DEMO SEED DATA LOADED SUCCESSFULLY! 🎉");
    console.log("=======================================================================");
    console.log("\n[1] DOCTOR PORTAL DEMO (Dr. Mira Sen - General Medicine & Cardiology):");
    console.log(`    Login:      ${demoCredentials.doctor.email}`);
    console.log(`    Password:   ${demoCredentials.doctor.password}`);
    console.log(`    Live Queue: http://localhost:3000/doctor/queue`);
    console.log("\n    Doctor Queue Patients (for today - Clock Aligned):");
    console.log("    - T001: Rohan Gupta       (18:30 - 19:00) -> [Completed] In 'Completed' tab, prescription published");
    console.log("    - T002: Priya Sharma      (19:00 - 19:30) -> [Completed] In 'Completed' tab, prescription published");
    console.log("    - T003: Arjun Pilot       (19:30 - 20:00) -> [In Room] In consultation inside cabin now (7:30 PM)! Complete button enabled");
    console.log("    - T004: Ananya Verma      (20:00 - 20:30) -> [Waiting] In 'Live Queue', ready with 'Call Patient'");
    console.log("\n    Direct History & Clinical Views:");
    console.log(`    - Arjun Pilot Live Consultation History: http://localhost:3000/doctor/queue/${activeAppointmentId}/history`);

    console.log("\n[2] PATIENT PORTAL DEMO (Arjun Pilot):");
    console.log(`    Login:      ${demoCredentials.patient.email}`);
    console.log(`    Password:   ${demoCredentials.patient.password}`);
    console.log(`    History:    http://localhost:3000/patient/history`);
    console.log("    Highlights:");
    console.log("    - Tab 1 Overview: Complete biometrics, allergies, active conditions");
    console.log("    - Tab 2 Completed Visits: Calendar with dates from 3 days ago, 2 weeks ago, 6 weeks ago");
    console.log("    - Tab 3 Medications: 'Start Date' column with active regimens and completed courses");
    console.log("    - Download Prescription: Non-overflowing, widened instructions layout");

    console.log("\n[3] SECOND PATIENT ACCOUNT (Priya Sharma):");
    console.log(`    Login:      ${demoCredentials.patient2.email}`);
    console.log(`    Password:   ${demoCredentials.patient2.password}`);
    console.log(`    History:    http://localhost:3000/patient/history`);

    console.log("\n[4] RECEPTION DESK STAFF (Check-in & Queue Management):");
    console.log(`    Login:      ${demoCredentials.staff.email}`);
    console.log(`    Password:   ${demoCredentials.staff.password}`);
    console.log(`    Board:      http://localhost:3000/reception/queue`);
    console.log("=======================================================================\n");

    return { activeAppointmentId, calledAppointmentId };
  } finally {
    await sql.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  seedClinicalDemo()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Clinical demo seed error:", err);
      process.exit(1);
    });
}
