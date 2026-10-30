export type CareAreaMeta = {
  title: string;
  concernTitle: string;
  doctorType: string;
  description: string;
  imageUrl: string;
  tags: string[];
  iconKey: "heart" | "sparkles" | "brain" | "bone" | "baby" | "stethoscope" | "eye" | "smile" | "shield";
};

export const careAreasBySpecialty: Record<string, string[]> = {
  Cardiology: ["Chest Pain", "High BP", "Heart Health"],
  Dermatology: ["Acne & Pimples", "Skin Rashes", "Eczema Care"],
  Neurology: ["Headache & Migraines", "Nerve Pain", "Stroke Prevention"],
  "Orthopedic Surgery": ["Joint & Knee Pain", "Sports Injury", "Arthritis"],
  Orthopedics: ["Bone & Joint Pain", "Spine Health", "Mobility Care"],
  Pediatrics: ["Child Wellness", "Infant Fever", "Vaccinations"],
  "General Medicine": ["Viral Fever", "Cough & Cold", "Annual Physical"],
  Ophthalmology: ["Cataract Check", "Blurry Vision", "Eye Strain"],
  Psychiatry: ["Anxiety & Stress", "Mood Disorders", "Sleep Issues"],
  Gynecology: ["PCOS & Periods", "Pregnancy Care", "Hormone Health"],
  Dentist: ["Teeth Pain & Decay", "Root Canal", "Teeth Cleaning & Whitening"],
  Dietitian: ["Weight Management", "Diabetes Nutrition", "PCOS Diet & Health"],
  Physiotherapy: ["Muscle & Back Pain", "Sports Injury Rehab", "Post-Op Physical Therapy"],
};

export const careAreaMetaBySpecialty: Record<string, CareAreaMeta> = {
  Dentist: {
    title: "Dentist",
    concernTitle: "Teething troubles? Schedule a dental checkup",
    doctorType: "Dentists & Dental Surgeons",
    description: "Explore comprehensive tooth pain relief, root canal therapy, braces, dental implants and regular hygiene checkups.",
    imageUrl: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&q=80&w=600",
    tags: ["Teeth Pain", "Cavities", "Root Canal", "Whitening"],
    iconKey: "smile",
  },
  Gynecology: {
    title: "Gynecologist/Obstetrician",
    concernTitle: "Explore for women's health, pregnancy and infertility treatments",
    doctorType: "Gynecologists & Obstetricians",
    description: "Confidential consultations for menstrual health, PCOS/PCOD, fertility concerns, pregnancy care and post-delivery recovery.",
    imageUrl: "https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&q=80&w=600",
    tags: ["Period Doubts", "Pregnancy Care", "PCOS / PCOD", "Fertility"],
    iconKey: "shield",
  },
  Dietitian: {
    title: "Dietitian/Nutrition",
    concernTitle: "Get guidance on eating right, weight management and sports nutrition",
    doctorType: "Clinical Dietitians & Nutritionists",
    description: "Personalized clinical diet charts for weight loss, diabetes control, thyroid health, and muscle recovery.",
    imageUrl: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&q=80&w=600",
    tags: ["Weight Loss", "Diabetes Diet", "Thyroid Health", "Gut Health"],
    iconKey: "sparkles",
  },
  Physiotherapy: {
    title: "Physiotherapist",
    concernTitle: "Pulled a muscle? Get it treated by a trained physiotherapist",
    doctorType: "Physical Therapists",
    description: "Restorative manual therapy for neck/back pain, sports injuries, ligament strains, and post-surgery mobility rehabilitation.",
    imageUrl: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&q=80&w=600",
    tags: ["Back & Neck Pain", "Sports Injury", "Post-Op Rehab", "Mobility"],
    iconKey: "bone",
  },
  Cardiology: {
    title: "Cardiology",
    concernTitle: "Chest Discomfort, BP & Heart Health",
    doctorType: "Cardiologists",
    description: "Consult verified cardiologists for blood pressure, chest pain, palpitations, and ECG checks.",
    imageUrl: "https://images.unsplash.com/photo-1628348068343-c6a848d2b6dd?auto=format&fit=crop&q=80&w=600",
    tags: ["Chest Pain", "High BP", "Heart Health"],
    iconKey: "heart",
  },
  Dermatology: {
    title: "Dermatology",
    concernTitle: "Acne, Pimples, Rashes & Skin Issues",
    doctorType: "Dermatologists",
    description: "Expert skin care for severe acne, breakouts, eczema, fungal infections, and mole checks.",
    imageUrl: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&q=80&w=600",
    tags: ["Acne & Pimples", "Skin Rashes", "Eczema Care"],
    iconKey: "sparkles",
  },
  "General Medicine": {
    title: "General Medicine",
    concernTitle: "Cold, Cough, Fever, Flu & Fatigue",
    doctorType: "General Physicians",
    description: "Everyday health consults for seasonal infections, persistent fever, fatigue, and annual tests.",
    imageUrl: "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&q=80&w=600",
    tags: ["Viral Fever", "Cough & Cold", "Annual Physical"],
    iconKey: "stethoscope",
  },
  "Orthopedic Surgery": {
    title: "Orthopedic Surgery",
    concernTitle: "Joint, Knee, Back Pain & Fractures",
    doctorType: "Orthopedic Surgeons",
    description: "Specialized bone and joint care for arthritis, ligament tears, spine stiffness, and sports trauma.",
    imageUrl: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&q=80&w=600",
    tags: ["Knee Pain", "Sports Injury", "Arthritis"],
    iconKey: "bone",
  },
  Orthopedics: {
    title: "Orthopedics",
    concernTitle: "Bone & Joint Pain, Muscle Stiffness",
    doctorType: "Orthopedists",
    description: "Comprehensive mobility care, tendon rehabilitation, osteoporosis, and chronic muscle pain.",
    imageUrl: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&q=80&w=600",
    tags: ["Bone & Joint", "Back Pain", "Rehabilitation"],
    iconKey: "bone",
  },
  Pediatrics: {
    title: "Pediatrics",
    concernTitle: "Child Illness, Fever & Growth Checks",
    doctorType: "Pediatricians",
    description: "Warm, gentle care for baby wellness, childhood cough, vaccinations, and growth milestones.",
    imageUrl: "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&q=80&w=600",
    tags: ["Child Wellness", "Infant Fever", "Vaccinations"],
    iconKey: "baby",
  },
  Neurology: {
    title: "Neurology",
    concernTitle: "Severe Headaches, Migraines & Nerve Pain",
    doctorType: "Neurologists",
    description: "Dedicated diagnosis for chronic migraines, memory loss, numbness, tremors, and stroke risks.",
    imageUrl: "https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&q=80&w=600",
    tags: ["Headache & Migraine", "Nerve Pain", "Stroke Prevention"],
    iconKey: "brain",
  },
  Ophthalmology: {
    title: "Ophthalmology",
    concernTitle: "Blurry Vision, Eye Irritation & Cataract",
    doctorType: "Eye Specialists",
    description: "Complete eye health exams, cataract screening, glaucoma treatment, and prescription checks.",
    imageUrl: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&q=80&w=600",
    tags: ["Cataract Check", "Blurry Vision", "Eye Strain"],
    iconKey: "eye",
  },
  Psychiatry: {
    title: "Psychiatry",
    concernTitle: "Depression, Anxiety, Stress & Insomnia",
    doctorType: "Psychiatrists & Counselors",
    description: "Safe, confidential psychiatric consultations for panic, clinical depression, and chronic stress.",
    imageUrl: "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&q=80&w=600",
    tags: ["Anxiety & Stress", "Mood Disorders", "Sleep Issues"],
    iconKey: "smile",
  },
};

export function careAreasForSpecialty(specialty: string): string[] {
  return (
    careAreasBySpecialty[specialty] ?? [
      "Routine consultations",
      "Preventive care",
      "Specialist guidance",
    ]
  );
}

export function getCareAreaMeta(specialty: string): CareAreaMeta {
  const found = careAreaMetaBySpecialty[specialty];
  if (found) return found;

  return {
    title: specialty,
    concernTitle: `Common ${specialty} Health Concerns`,
    doctorType: `${specialty} Specialists`,
    description: `Specialized clinical consultations and evidence-based patient care for ${specialty.toLowerCase()}.`,
    imageUrl: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&q=80&w=600",
    tags: careAreasForSpecialty(specialty),
    iconKey: "stethoscope",
  };
}

export type SchedulaHealthConcern = {
  id: string;
  title: string;
  subtitle: string;
  specialty: string;
  actionText: string;
  href: string;
  bgClass: string;
  avatarBorder: string;
  illustrationType:
    | "pregnancy"
    | "dermatology"
    | "wellness"
    | "cold"
    | "pediatrics"
    | "mental-health"
    | "orthopedics"
    | "dentistry";
};

export const SCHEDULA_HEALTH_CONCERNS: SchedulaHealthConcern[] = [
  {
    id: "pregnancy",
    title: "Period doubts or Pregnancy",
    subtitle: "Irregular cycles, pregnancy planning, PCOS",
    specialty: "Gynecology",
    actionText: "CONSULT NOW",
    href: "/doctors?specialty=Gynecology",
    bgClass: "bg-pink-50 border-pink-100/90 text-pink-700",
    avatarBorder: "border-pink-200/70",
    illustrationType: "pregnancy",
  },
  {
    id: "acne",
    title: "Acne, pimple or skin issues",
    subtitle: "Acne breakouts, rashes, hair fall",
    specialty: "Dermatology",
    actionText: "CONSULT NOW",
    href: "/doctors?specialty=Dermatology",
    bgClass: "bg-sky-50 border-sky-100/90 text-sky-700",
    avatarBorder: "border-sky-200/70",
    illustrationType: "dermatology",
  },
  {
    id: "wellness",
    title: "Performance issues in bed",
    subtitle: "Intimacy concerns, stamina, sexual health",
    specialty: "General Medicine",
    actionText: "CONSULT NOW",
    href: "/doctors?specialty=General+Medicine",
    bgClass: "bg-purple-50 border-purple-100/90 text-purple-700",
    avatarBorder: "border-purple-200/70",
    illustrationType: "wellness",
  },
  {
    id: "cold-cough",
    title: "Cold, cough or fever",
    subtitle: "Viral fever, throat infection, chills",
    specialty: "General Medicine",
    actionText: "CONSULT NOW",
    href: "/doctors?specialty=General+Medicine",
    bgClass: "bg-cyan-50 border-cyan-100/90 text-cyan-700",
    avatarBorder: "border-cyan-200/70",
    illustrationType: "cold",
  },
  {
    id: "child",
    title: "Child not feeling well",
    subtitle: "Baby fever, tummy ache, immunization",
    specialty: "Pediatrics",
    actionText: "CONSULT NOW",
    href: "/doctors?specialty=Pediatrics",
    bgClass: "bg-indigo-50 border-indigo-100/90 text-indigo-700",
    avatarBorder: "border-indigo-200/70",
    illustrationType: "pediatrics",
  },
  {
    id: "depression",
    title: "Depression or anxiety",
    subtitle: "Stress, panic attacks, low mood, sleep",
    specialty: "Psychiatry",
    actionText: "CONSULT NOW",
    href: "/doctors?specialty=Psychiatry",
    bgClass: "bg-rose-50 border-rose-100/90 text-rose-700",
    avatarBorder: "border-rose-200/70",
    illustrationType: "mental-health",
  },
  {
    id: "joints",
    title: "Joint, knee or back pain",
    subtitle: "Arthritis, sports sprains, spine aches",
    specialty: "Orthopedic Surgery",
    actionText: "CONSULT NOW",
    href: "/doctors?specialty=Orthopedic+Surgery",
    bgClass: "bg-amber-50 border-amber-100/90 text-amber-700",
    avatarBorder: "border-amber-200/70",
    illustrationType: "orthopedics",
  },
  {
    id: "teeth",
    title: "Teeth pain or decay",
    subtitle: "Toothache, root canal, bleeding gums",
    specialty: "Dentist",
    actionText: "CONSULT NOW",
    href: "/doctors?specialty=Dentist",
    bgClass: "bg-emerald-50 border-emerald-100/90 text-emerald-700",
    avatarBorder: "border-emerald-200/70",
    illustrationType: "dentistry",
  },
];
