import type {
  DoctorDirectoryRecord,
  DoctorDetailRecord,
  DoctorSlot,
} from "./types";
import type { DirectoryFilters } from "./filters";
import { getDummyDoctorPortrait } from "./dummy-portraits";

function getRollingDateKeys(): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

type RawDummyDoctor = {
  doctor_id: string;
  full_name: string;
  specialty: string;
  clinic_name: string;
  experience_years: number;
  biography: string;
  timezone: string;
  dayOffsets: number[];
  consultationHours: string;
};

const RAW_DUMMY_DOCTORS: RawDummyDoctor[] = [
  {
    doctor_id: "00000000-0000-4000-8000-000000000001",
    full_name: "Dr. Sarah Johnson, MD",
    specialty: "Cardiology",
    clinic_name: "City Heart Center, Suite 400",
    experience_years: 12,
    biography:
      "Board-certified cardiologist specializing in preventive cardiology, lipid management, echocardiography, and non-invasive diagnostic evaluations. Dr. Johnson emphasizes patient education, compassionate care, and lifestyle medicine to support long-term cardiovascular health.",
    timezone: "America/New_York",
    dayOffsets: [0, 1, 3, 5],
    consultationHours: "09:30 AM – 05:30 PM",
  },
  {
    doctor_id: "00000000-0000-4000-8000-000000000002",
    full_name: "Dr. Robert Smith, MD",
    specialty: "Dermatology",
    clinic_name: "Clear Skin Institute, East Wing",
    experience_years: 15,
    biography:
      "Dr. Robert Smith has over 15 years of dedicated dermatologic experience focusing on clinical dermatology, full-body skin cancer screenings, advanced acne therapies, eczema management, and minor surgical excision procedures with attentive patient care.",
    timezone: "America/New_York",
    dayOffsets: [0, 2, 4, 6],
    consultationHours: "08:30 AM – 04:30 PM",
  },
  {
    doctor_id: "00000000-0000-4000-8000-000000000003",
    full_name: "Dr. Emily Davis, MD, PhD",
    specialty: "Neurology",
    clinic_name: "St. Jude Neurological Institute",
    experience_years: 14,
    biography:
      "Associate Professor and fellowship-trained neurologist specializing in cognitive neurology, headache and migraine treatment, stroke prevention, and neuromuscular diagnostic evaluations. Dedicated to evidence-based, compassionate care for complex neurological conditions.",
    timezone: "America/New_York",
    dayOffsets: [1, 2, 4, 7],
    consultationHours: "09:00 AM – 05:00 PM",
  },
  {
    doctor_id: "00000000-0000-4000-8000-000000000004",
    full_name: "Dr. John Williams, DO, FACS",
    specialty: "Orthopedic Surgery",
    clinic_name: "Memorial Joint & Spine Center",
    experience_years: 18,
    biography:
      "Fellow of the American College of Surgeons with extensive clinical expertise in robotic-assisted joint replacement, sports arthroscopy, tendon repair, and musculoskeletal trauma rehabilitation. Focused on restoring patient mobility and active quality of life.",
    timezone: "America/New_York",
    dayOffsets: [0, 1, 4, 8],
    consultationHours: "08:00 AM – 04:00 PM",
  },
  {
    doctor_id: "00000000-0000-4000-8000-000000000005",
    full_name: "Dr. Aisha Patel, MBBS, MD",
    specialty: "Pediatrics",
    clinic_name: "Little Steps Pediatric Hospital",
    experience_years: 11,
    biography:
      "Dedicated pediatrician specializing in neonatal and child wellness exams, developmental milestone tracking, immunizations, and adolescent preventive care in a warm, welcoming clinical setting tailored to young patients and their families.",
    timezone: "America/New_York",
    dayOffsets: [0, 1, 2, 5],
    consultationHours: "09:00 AM – 06:00 PM",
  },
  {
    doctor_id: "00000000-0000-4000-8000-000000000006",
    full_name: "Dr. Marcus Welby, MD",
    specialty: "General Medicine",
    clinic_name: "Metropolitan Health Clinic",
    experience_years: 20,
    biography:
      "Senior primary care physician with over two decades of clinical experience in adult wellness, chronic disease management for diabetes and hypertension, annual health checkups, and comprehensive holistic medical consultations.",
    timezone: "America/New_York",
    dayOffsets: [0, 1, 3, 6],
    consultationHours: "08:30 AM – 05:30 PM",
  },
  {
    doctor_id: "00000000-0000-4000-8000-000000000007",
    full_name: "Dr. Sophia Chen, MD",
    specialty: "Ophthalmology",
    clinic_name: "Bay Vision Eye Institute",
    experience_years: 13,
    biography:
      "Ophthalmic surgeon specializing in advanced cataract microsurgery, glaucoma management, diabetic retinopathy evaluation, and comprehensive vision health, combining precision surgical techniques with thoughtful bedside care.",
    timezone: "America/New_York",
    dayOffsets: [1, 3, 5, 9],
    consultationHours: "09:30 AM – 05:00 PM",
  },
  {
    doctor_id: "00000000-0000-4000-8000-000000000008",
    full_name: "Dr. David Miller, MD",
    specialty: "Psychiatry",
    clinic_name: "Mind & Behavioral Health Center",
    experience_years: 16,
    biography:
      "Board-certified adult psychiatrist specializing in mood and anxiety disorders, stress resilience, cognitive behavioral approaches, and integrative medication management with utmost patient confidentiality and empathy.",
    timezone: "America/New_York",
    dayOffsets: [0, 3, 6, 10],
    consultationHours: "10:00 AM – 06:30 PM",
  },
  {
    doctor_id: "00000000-0000-4000-8000-000000000009",
    full_name: "Dr. Ananya Sharma, BDS, MDS",
    specialty: "Dentist",
    clinic_name: "SmileCraft Dental Studio & Implant Center",
    experience_years: 10,
    biography:
      "Specialist dental surgeon with over a decade of clinical experience in advanced root canal therapy, teeth whitening, cosmetic veneers, and restorative dental procedures with gentle, painless care.",
    timezone: "America/New_York",
    dayOffsets: [0, 1, 3, 5],
    consultationHours: "09:00 AM – 06:00 PM",
  },
  {
    doctor_id: "00000000-0000-4000-8000-000000000010",
    full_name: "Dr. Priya Sen, MBBS, MS (OBG)",
    specialty: "Gynecology",
    clinic_name: "Motherhood & Women's Health Clinic",
    experience_years: 14,
    biography:
      "Senior consultant obstetrician and gynecologist specializing in high-risk pregnancy care, PCOS/PCOD management, laparoscopic procedures, and comprehensive reproductive wellness.",
    timezone: "America/New_York",
    dayOffsets: [0, 2, 4, 7],
    consultationHours: "10:00 AM – 05:30 PM",
  },
  {
    doctor_id: "00000000-0000-4000-8000-000000000011",
    full_name: "Dr. Meera Nambiar, MSc, RD",
    specialty: "Dietitian",
    clinic_name: "NutriCare Clinical & Metabolic Center",
    experience_years: 8,
    biography:
      "Registered clinical dietitian and certified diabetes educator specializing in personalized therapeutic nutrition, medical weight loss, hormonal balance diets, and sports nutritional counseling.",
    timezone: "America/New_York",
    dayOffsets: [0, 1, 4, 6],
    consultationHours: "09:30 AM – 04:30 PM",
  },
  {
    doctor_id: "00000000-0000-4000-8000-000000000012",
    full_name: "Dr. Vikram Malhotra, BPT, MPT",
    specialty: "Physiotherapy",
    clinic_name: "ActiveLife Spine & Sports Rehabilitation",
    experience_years: 11,
    biography:
      "Senior physiotherapist specializing in spine rehabilitation, post-operative orthopedic recovery, sports injury treatment, kinesiology taping, and functional mobility restoration.",
    timezone: "America/New_York",
    dayOffsets: [0, 2, 3, 8],
    consultationHours: "08:30 AM – 05:00 PM",
  },
];
export const DUMMY_SPECIALTIES = Array.from(
  new Set(RAW_DUMMY_DOCTORS.map((d) => d.specialty))
).sort();

export function getDummyDoctors(): DoctorDirectoryRecord[] {
  const rollingDates = getRollingDateKeys();

  return RAW_DUMMY_DOCTORS.map((d) => ({
    doctor_id: d.doctor_id,
    full_name: d.full_name,
    specialty: d.specialty,
    clinic_name: d.clinic_name,
    experience_years: d.experience_years,
    profile_image_url: getDummyDoctorPortrait(d.doctor_id, d.specialty),
    available_dates: d.dayOffsets
      .map((offset) => rollingDates[offset])
      .filter((date): date is string => Boolean(date)),
  }));
}

export function getDummyDoctorDetail(doctorId: string): DoctorDetailRecord | null {
  const rollingDates = getRollingDateKeys();
  const found = RAW_DUMMY_DOCTORS.find((d) => d.doctor_id === doctorId);
  if (!found) return null;

  return {
    doctor_id: found.doctor_id,
    full_name: found.full_name,
    specialty: found.specialty,
    clinic_name: found.clinic_name,
    experience_years: found.experience_years,
    biography: found.biography,
    timezone: found.timezone,
    profile_image_url: getDummyDoctorPortrait(found.doctor_id, found.specialty),
    available_dates: found.dayOffsets
      .map((offset) => rollingDates[offset])
      .filter((date): date is string => Boolean(date)),
  };
}

export function getDummyDoctorSlots(doctorId: string): DoctorSlot[] {
  const doctor = getDummyDoctorDetail(doctorId);
  if (!doctor) return [];

  const slots: DoctorSlot[] = [];
  const times = [
    { startH: 9, startM: 30, endH: 10, endM: 15, cap: 3, rem: 2 },
    { startH: 11, startM: 0, endH: 11, endM: 45, cap: 2, rem: 1 },
    { startH: 14, startM: 15, endH: 15, endM: 0, cap: 3, rem: 3 },
    { startH: 16, startM: 0, endH: 16, endM: 45, cap: 2, rem: 1 },
  ];

  doctor.available_dates.slice(0, 4).forEach((dateStr, dateIdx) => {
    times.forEach((t, timeIdx) => {
      const startIso = `${dateStr}T${String(t.startH).padStart(2, "0")}:${String(t.startM).padStart(2, "0")}:00Z`;
      const endIso = `${dateStr}T${String(t.endH).padStart(2, "0")}:${String(t.endM).padStart(2, "0")}:00Z`;
      const slotIndexHex = (dateIdx * 4 + timeIdx + 1).toString(16).padStart(4, "0");

      slots.push({
        slot_id: `00000000-0000-4000-8000-${slotIndexHex.padStart(12, "0")}`,
        slot_start_at: startIso,
        slot_end_at: endIso,
        timezone: doctor.timezone,
        capacity: t.cap,
        remaining_capacity: t.rem,
      });
    });
  });

  return slots;
}

export function mergeWithDummyDoctors(
  dbDoctors: DoctorDirectoryRecord[],
  filters?: DirectoryFilters
): DoctorDirectoryRecord[] {
  const dummyList = getDummyDoctors();

  // Combine DB doctors with dummy doctors, prioritizing DB doctors
  const existingIds = new Set(dbDoctors.map((d) => d.doctor_id));
  const combined = [...dbDoctors];

  for (const dummy of dummyList) {
    if (!existingIds.has(dummy.doctor_id)) {
      combined.push(dummy);
    }
  }

  // Apply filters if provided
  if (!filters) return combined;

  const searchLower = filters.search?.toLowerCase().trim() || "";
  const specialtyLower = filters.specialty?.toLowerCase().trim() || "";

  return combined.filter((doc) => {
    if (specialtyLower && doc.specialty.toLowerCase() !== specialtyLower) {
      return false;
    }
    if (searchLower) {
      const matchName = doc.full_name.toLowerCase().includes(searchLower);
      const matchSpecialty = doc.specialty.toLowerCase().includes(searchLower);
      const matchClinic = doc.clinic_name.toLowerCase().includes(searchLower);
      if (!matchName && !matchSpecialty && !matchClinic) {
        return false;
      }
    }
    return true;
  });
}
