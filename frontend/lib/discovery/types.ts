export type DoctorDirectoryRecord = {
  doctor_id: string;
  full_name: string;
  specialty: string;
  clinic_name: string;
  experience_years: number;
  available_dates: string[];
  consultation_fee_minor?: number | null;
  consultation_currency?: string | null;
};

export type DoctorDetailRecord = DoctorDirectoryRecord & {
  biography: string;
  timezone: string;
};

export type DoctorSlot = {
  slot_id: string;
  slot_start_at: string;
  slot_end_at: string;
  timezone: string;
  capacity: number;
  remaining_capacity: number;
  consultation_fee_minor?: number | null;
  consultation_currency?: string | null;
};
