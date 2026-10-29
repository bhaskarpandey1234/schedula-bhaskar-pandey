export const careAreasBySpecialty: Record<string, string[]> = {
  Cardiology: ["Heart health checks", "Blood pressure care", "Cholesterol guidance"],
  Dermatology: ["Acne and skin changes", "Rashes and irritation", "Hair and scalp care"],
  Pediatrics: ["Child wellness visits", "Growth and development", "Everyday childhood illness"],
  "General Medicine": ["Routine health concerns", "Preventive checkups", "Long-term condition care"],
  Orthopedics: ["Joint and muscle pain", "Sports injuries", "Mobility support"],
  Gynecology: ["Wellness visits", "Reproductive health", "Hormonal concerns"],
};
export function careAreasForSpecialty(specialty: string) { return careAreasBySpecialty[specialty] ?? ["Routine consultations", "Preventive care", "Personalized guidance"]; }
