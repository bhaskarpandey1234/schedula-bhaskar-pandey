import jsPDF from "jspdf";
import type { ClinicalPrescription } from "@/lib/clinical/queries";
import { calculateAge } from "@/lib/clinical/vitals";

export type PrescriptionPdfMetadata = {
  prescription: ClinicalPrescription;
  clinicName?: string;
  clinicAddress?: string;
  clinicPhone?: string;
  doctorName: string;
  doctorSpecialty?: string;
  doctorRegistrationNo?: string;
  doctorPhone?: string;
  patientName: string;
  patientGender?: string;
  patientDob?: string;
  patientPhone?: string;
  consultationDate: string;
  allergies?: string;
};

export function generatePrescriptionPdf(metadata: PrescriptionPdfMetadata): jsPDF {
  const {
    prescription,
    clinicName = "SCHEDULA HEALTH CLINIC",
    clinicAddress = "Clinical Care Center, Healthcare Tower, Floor 3",
    clinicPhone = "+91 (080) 4123-4567",
    doctorName,
    doctorSpecialty = "General Medicine & Clinical Care",
    doctorRegistrationNo = "REG-IN-2024-8192",
    doctorPhone,
    patientName,
    patientGender = "Not specified",
    patientDob,
    patientPhone,
    consultationDate,
    allergies = "No known drug allergies",
  } = metadata;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const leftMargin = 15;
  const rightMargin = 195;
  const contentWidth = rightMargin - leftMargin; // 180mm

  // Top header border line / accent
  doc.setDrawColor(24, 76, 120); // Medical Navy
  doc.setLineWidth(1.5);
  doc.line(leftMargin, 12, rightMargin, 12);

  doc.setDrawColor(70, 130, 180); // Secondary Blue accent
  doc.setLineWidth(0.4);
  doc.line(leftMargin, 13.5, rightMargin, 13.5);

  // Clinic Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(24, 76, 120);
  doc.text(clinicName.toUpperCase(), leftMargin, 21);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(90, 100, 110);
  doc.text("OUTPATIENT CLINICAL DEPARTMENT • MEDICAL CONSULTATION RECORD", leftMargin, 25.5);
  doc.text(`${clinicAddress} • Tel: ${clinicPhone}`, leftMargin, 29.5);

  // Doctor Details (Header Right Side)
  const formattedDoctorName = doctorName.startsWith("Dr.") ? doctorName : `Dr. ${doctorName}`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(30, 41, 59);
  doc.text(formattedDoctorName, rightMargin, 20.5, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`${doctorSpecialty} (MBBS, MD)`, rightMargin, 25, { align: "right" });
  doc.text(`Medical Council Reg: ${doctorRegistrationNo}`, rightMargin, 29, { align: "right" });
  if (doctorPhone) {
    doc.text(`Contact: ${doctorPhone}`, rightMargin, 33, { align: "right" });
  }

  // Horizontal divider
  let currentY = 36;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.6);
  doc.line(leftMargin, currentY, rightMargin, currentY);

  // Patient & Consultation Particulars Box
  currentY += 4;
  const boxTop = currentY;
  const boxHeight = 25;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.roundedRect(leftMargin, boxTop, contentWidth, boxHeight, 1.5, 1.5, "FD");

  // Column 1: Patient details
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("PATIENT NAME:", leftMargin + 4, boxTop + 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(patientName, leftMargin + 30, boxTop + 6);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("GENDER / AGE:", leftMargin + 4, boxTop + 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  const calculatedAge = calculateAge(patientDob);
  const ageDisplay = calculatedAge !== "—" ? `${calculatedAge} / ${patientGender}` : patientGender;
  doc.text(ageDisplay, leftMargin + 30, boxTop + 12);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("ALLERGIES:", leftMargin + 4, boxTop + 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  if (allergies.toLowerCase().includes("known") && !allergies.toLowerCase().includes("no known")) {
    doc.setTextColor(185, 28, 28); // Red warning for allergies
  } else {
    doc.setTextColor(30, 41, 59);
  }
  doc.text(allergies, leftMargin + 30, boxTop + 18);

  // Column 2: Consultation & Prescription metadata
  const col2X = leftMargin + 105;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("DATE OF VISIT:", col2X, boxTop + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text(consultationDate, col2X + 26, boxTop + 6);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("PRESCRIPTION ID:", col2X, boxTop + 12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(24, 76, 120);
  const rxIdShort = `RX-${prescription.id.slice(0, 8).toUpperCase()}`;
  doc.text(rxIdShort, col2X + 26, boxTop + 12);

  if (patientPhone) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("PHONE:", col2X, boxTop + 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text(patientPhone, col2X + 26, boxTop + 18);
  }

  currentY = boxTop + boxHeight + 6;

  // Diagnosis / Clinical Assessment (if in prescription notes)
  const notesText = prescription.notes || "";
  let diagnosisText = "";
  let adviceText = "";

  if (notesText.includes("Diagnosis:")) {
    const parts = notesText.split(/\n\n+/);
    const diagPart = parts.find((p) => p.startsWith("Diagnosis:"));
    if (diagPart) {
      diagnosisText = diagPart.replace("Diagnosis:", "").trim();
      adviceText = parts.filter((p) => !p.startsWith("Diagnosis:")).join("\n\n").trim();
    } else {
      adviceText = notesText.trim();
    }
  } else {
    adviceText = notesText.trim();
  }

  if (diagnosisText) {
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(leftMargin, currentY, contentWidth, 9, 1, 1, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text("PROVISIONAL DIAGNOSIS / CLINICAL ASSESSMENT:", leftMargin + 3, currentY + 6);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(diagnosisText, leftMargin + 80, currentY + 6);

    currentY += 13;
  }

  // Classic Rx Symbol
  doc.setFont("times", "bolditalic");
  doc.setFontSize(22);
  doc.setTextColor(24, 76, 120);
  doc.text("Rx", leftMargin, currentY + 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("(Prescribed Medications & Regimen)", leftMargin + 14, currentY + 3);

  currentY += 8;

  // Medications Table Header
  const colWidths = {
    num: 8,
    name: 52,
    dosage: 24,
    frequency: 30,
    duration: 22,
    instructions: 46,
  };

  const tableHeaderY = currentY;
  const headerHeight = 7;

  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.rect(leftMargin, tableHeaderY, contentWidth, headerHeight, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);

  let currentX = leftMargin;
  doc.text("#", currentX + 2.5, tableHeaderY + 4.8);

  currentX += colWidths.num;
  doc.text("MEDICATION NAME", currentX + 2, tableHeaderY + 4.8);

  currentX += colWidths.name;
  doc.text("DOSAGE", currentX + 2, tableHeaderY + 4.8);

  currentX += colWidths.dosage;
  doc.text("FREQUENCY & TIMING", currentX + 2, tableHeaderY + 4.8);

  currentX += colWidths.frequency;
  doc.text("DURATION", currentX + 2, tableHeaderY + 4.8);

  currentX += colWidths.duration;
  doc.text("INSTRUCTIONS", currentX + 2, tableHeaderY + 4.8);

  currentY = tableHeaderY + headerHeight;

  // Table Body Rows
  const items = prescription.items && prescription.items.length > 0
    ? prescription.items
    : [];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);

  items.forEach((item, index) => {
    const isAlt = index % 2 === 1;

    // Calculate text wrapping for medication name and instructions
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    const nameLines = doc.splitTextToSize(item.medication_name, colWidths.name - 3);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    const instLines = item.instructions
      ? doc.splitTextToSize(item.instructions, colWidths.instructions - 3)
      : [];

    const nameBlockHeight = nameLines.length * 4.2 + 3.5;
    const instBlockHeight = instLines.length * 3.8 + 3.5;
    const rowHeight = Math.max(9.5, nameBlockHeight, instBlockHeight);

    if (isAlt) {
      doc.setFillColor(248, 250, 252);
      doc.rect(leftMargin, currentY, contentWidth, rowHeight, "F");
    }

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(leftMargin, currentY + rowHeight, rightMargin, currentY + rowHeight);

    let cellX = leftMargin;

    // Col 1: Num
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(String(index + 1), cellX + 2.5, currentY + 5.5);

    // Col 2: Name
    cellX += colWidths.num;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    const nameY = nameLines.length > 1 ? currentY + 4.5 : currentY + 5.5;
    doc.text(nameLines, cellX + 2, nameY);

    // Col 3: Dosage
    cellX += colWidths.name;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 41, 59);
    doc.text(item.dosage, cellX + 2, currentY + 5.5);

    // Col 4: Frequency
    cellX += colWidths.dosage;
    doc.text(item.frequency, cellX + 2, currentY + 5.5);

    // Col 5: Duration
    cellX += colWidths.frequency;
    doc.text(item.duration, cellX + 2, currentY + 5.5);

    // Col 6: Instructions
    cellX += colWidths.duration;
    if (item.instructions && instLines.length > 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      const instY = instLines.length > 1 ? currentY + 4.5 : currentY + 5.5;
      doc.text(instLines, cellX + 2, instY);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
    } else {
      doc.setTextColor(148, 163, 184);
      doc.text("As advised", cellX + 2, currentY + 5.5);
    }

    currentY += rowHeight;
  });

  // Outer border around table
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.rect(leftMargin, tableHeaderY, contentWidth, currentY - tableHeaderY, "S");

  currentY += 8;

  // Advice & Special Directions Box
  if (adviceText) {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);

    const adviceLines = doc.splitTextToSize(adviceText, contentWidth - 8);
    const adviceBoxHeight = Math.max(16, adviceLines.length * 4.5 + 8);

    doc.roundedRect(leftMargin, currentY, contentWidth, adviceBoxHeight, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text("GENERAL ADVICE, DIET & LIFESTYLE INSTRUCTIONS:", leftMargin + 4, currentY + 5.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text(adviceLines, leftMargin + 4, currentY + 10.5);

    currentY += adviceBoxHeight + 8;
  }

  // Footer Section
  const footerStartY = 248;

  // Divider above footer
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.line(leftMargin, footerStartY, rightMargin, footerStartY);

  // Digital Signature Block (Bottom Right)
  const signBlockX = rightMargin - 65;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(24, 76, 120);
  doc.text("DIGITALLY AUTHORIZED BY:", signBlockX, footerStartY + 6);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(formattedDoctorName, signBlockX, footerStartY + 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`${doctorSpecialty}`, signBlockX, footerStartY + 16.5);
  doc.text(`Reg: ${doctorRegistrationNo}`, signBlockX, footerStartY + 20.5);
  doc.text(`Issued: ${consultationDate}`, signBlockX, footerStartY + 24.5);

  // Disclaimer / Telemedicine Compliance Notice (Bottom Left)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("IMPORTANT NOTICE & TELEMEDICINE COMPLIANCE", leftMargin, footerStartY + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  const disclaimerLines = [
    "1. This is a computer-generated prescription valid under Telemedicine Practice Guidelines.",
    "2. Take medicines strictly as per dosage and schedule advised by your treating practitioner.",
    "3. Keep all medicines out of reach of children. Store in a cool, dry place.",
    "4. In case of adverse reactions, discontinue medication and report immediately to emergency care.",
  ];
  disclaimerLines.forEach((line, idx) => {
    doc.text(line, leftMargin, footerStartY + 10.5 + idx * 4);
  });

  // Very bottom security line
  doc.setFont("helvetica", "italic");
  doc.setFontSize(6.5);
  doc.setTextColor(160, 174, 192);
  doc.text(
    `Schedula Healthcare Platform • Verification Hash: ${prescription.id} • Page 1 of 1`,
    pageWidth / 2,
    pageHeight - 6,
    { align: "center" },
  );

  return doc;
}

export function downloadPrescriptionPdf(metadata: PrescriptionPdfMetadata) {
  const doc = generatePrescriptionPdf(metadata);
  const cleanPatientName = metadata.patientName.replace(/[^a-zA-Z0-9]/g, "_");
  const cleanDate = metadata.consultationDate.replace(/[^a-zA-Z0-9]/g, "-");
  const filename = `Prescription-${cleanPatientName}-${cleanDate}.pdf`;
  doc.save(filename);
}
