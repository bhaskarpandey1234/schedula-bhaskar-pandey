export const specialtyOptions = ["General Medicine", "Cardiology", "Dermatology", "Endocrinology", "Gynecology", "Neurology", "Orthopedics", "Pediatrics", "Psychiatry", "Radiology", "Other"];
export const experienceOptions = Array.from({ length: 41 }, (_, index) => ({ value: String(index), label: `${index} ${index === 1 ? "year" : "years"}` }));
export const timezoneOptions = ["Asia/Kolkata", "Asia/Singapore", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Australia/Sydney", "UTC"];

export function generateDoctorBio({ specialty, clinicName, experienceYears }: { specialty: string; clinicName: string; experienceYears: string | number }) {
  const years = Number(experienceYears);
  const experience = years === 0 ? "building a thoughtful foundation in patient care" : `bringing ${years} ${years === 1 ? "year" : "years"} of experience`;
  return `A ${specialty || "healthcare"} professional at ${clinicName || "our clinic"}, ${experience}. Focused on clear communication, practical treatment plans, and a welcoming care experience for every patient.`;
}
