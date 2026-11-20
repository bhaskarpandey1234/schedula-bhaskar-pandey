"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PatientClinicalRecord } from "@/lib/clinical/queries";
import {
  calculateAge,
  formatDateString,
  parseMedicalDetails,
} from "@/lib/clinical/vitals";
import { Calendar, HeartPulse, Mail, Pencil, Phone, Plus, UserRound } from "lucide-react";

export type PatientProfileData = {
  fullName: string;
  email: string;
  phone?: string | null;
  dateOfBirth?: string | null;
  patientId: string;
};

function getInitials(name: string) {
  return (
    name
      .replace(/^Dr\.\s*/i, "")
      .split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "PT"
  );
}

function calculateBMI(heightStr: string, weightStr: string): string {
  const heightVal = parseFloat(heightStr);
  const weightVal = parseFloat(weightStr);
  if (!heightVal || !weightVal) return "—";

  const heightInMeters = heightVal > 3 ? heightVal / 100 : heightVal;
  const bmi = weightVal / (heightInMeters * heightInMeters);
  if (isNaN(bmi) || bmi <= 0 || bmi > 100) return "—";

  const rounded = bmi.toFixed(1);
  if (bmi < 18.5) return `${rounded} · Underweight`;
  if (bmi < 25) return `${rounded} · Normal`;
  if (bmi < 30) return `${rounded} · Overweight`;
  return `${rounded} · Obese`;
}

export function PatientProfileOverview({
  patient,
  record,
  onEditPersonal,
  onAddCondition,
  role = "patient",
}: {
  patient: PatientProfileData;
  record: PatientClinicalRecord;
  onEditPersonal?: () => void;
  onAddCondition?: () => void;
  role?: "patient" | "doctor";
}) {
  const { vitals } = parseMedicalDetails(record.medical_history?.medical_details);

  const conditions = record.medical_history?.conditions?.items ?? [];

  const displayAge = calculateAge(patient.dateOfBirth);
  const displayDob = formatDateString(patient.dateOfBirth);
  const displayGender = vitals.gender || "—";
  const displayBloodGroup = vitals.bloodGroup || "—";
  const displayHeight = vitals.height || "—";
  const displayWeight = vitals.weight || "—";
  const displayBmi = calculateBMI(displayHeight, displayWeight);

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 1. PATIENT IDENTITY BANNER                                                */}
      {/* ========================================================================= */}
      {role === "doctor" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-100 bg-sky-50/40 px-4 py-3 dark:border-sky-900/30 dark:bg-sky-950/20 shadow-2xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="font-bold text-sm text-[#1D2153] dark:text-white">
              {patient.fullName}
            </span>
            {displayAge !== "—" && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-medium">
                <Calendar className="size-3 text-sky-600 dark:text-sky-400" />
                <span>Age: {displayAge}</span>
              </span>
            )}
            {patient.phone && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Phone className="size-3 text-sky-600 dark:text-sky-400" />
                <span>{patient.phone}</span>
              </span>
            )}
            {patient.email && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Mail className="size-3 text-sky-600 dark:text-sky-400" />
                <span>{patient.email}</span>
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-3xl border border-sky-100 dark:border-sky-950 bg-card p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-5">
              <div className="shrink-0">
                <div className="flex size-18 sm:size-20 items-center justify-center rounded-full bg-sky-500/15 border-2 border-sky-400/30 text-sky-800 dark:text-sky-200 text-2xl font-bold shadow-xs">
                  {getInitials(patient.fullName)}
                </div>
              </div>

              <div className="space-y-1.5">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1D2153] dark:text-white">
                  {patient.fullName}
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Link
                    href="/patient/profile"
                    className="font-medium text-sky-600 dark:text-sky-400 hover:underline inline-flex items-center gap-1"
                  >
                    <span>Manage phone & email in My Profile →</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. CORE HEALTH PROFILE (Personal Information & Medical Conditions)        */}
      {/* ========================================================================= */}
      <div className="grid gap-6 md:grid-cols-2 items-start">
        {/* Card 1: Personal & Biometric Vitals */}
        <Card className="rounded-2xl border shadow-xs">
          <CardHeader className="border-b bg-muted/20 pb-3">
            <CardTitle className="flex items-center justify-between gap-2 text-sm font-bold text-[#1D2153] dark:text-white">
              <span className="flex items-center gap-2">
                <UserRound className="size-4 text-sky-600 dark:text-sky-400" />
                Personal & Biometric Vitals
              </span>
              {role !== "doctor" && onEditPersonal && (
                <Button type="button" variant="ghost" size="icon" onClick={onEditPersonal} aria-label="Edit personal and biometric details">
                  <Pencil className="size-3.5" />
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between py-1 border-b border-border/50">
              <span className="text-muted-foreground">
                {role === "doctor" ? "Age" : "Date of Birth"}
              </span>
              <span className="font-semibold text-foreground">
                {role === "doctor" ? (
                  displayAge
                ) : (
                  <>
                    {displayDob} <span className="text-muted-foreground font-normal">({displayAge})</span>
                  </>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-border/50">
              <span className="text-muted-foreground">Gender</span>
              <span className="font-semibold text-foreground">{displayGender}</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-border/50">
              <span className="text-muted-foreground">Blood Group</span>
              <span className="font-semibold text-foreground">{displayBloodGroup}</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-border/50">
              <span className="text-muted-foreground">Height</span>
              <span className="font-semibold text-foreground">{displayHeight}</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-border/50">
              <span className="text-muted-foreground">Weight</span>
              <span className="font-semibold text-foreground">{displayWeight}</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-muted-foreground">Body Mass Index (BMI)</span>
              <span className="font-semibold text-foreground">{displayBmi}</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Health conditions */}
        <Card className="rounded-2xl border shadow-xs">
          <CardHeader className="border-b bg-muted/20 pb-3">
            <CardTitle className="flex items-center justify-between gap-2 text-sm font-bold text-[#1D2153] dark:text-white">
              <span className="flex items-center gap-2">
                <HeartPulse className="size-4 text-sky-600 dark:text-sky-400" />
                Health conditions
              </span>
              {role !== "doctor" && onAddCondition && (
                <Button type="button" variant="ghost" size="icon" onClick={onAddCondition} aria-label="Add health condition">
                  <Plus className="size-3.5" />
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 text-xs">
            {conditions.length === 0 ? (
              <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed bg-muted/20 p-3 text-muted-foreground">
                <span>No conditions added yet.</span>
                {role !== "doctor" && onAddCondition && (
                  <Button type="button" size="sm" variant="outline" onClick={onAddCondition}>
                    <Plus className="size-3.5" /> Add condition
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {conditions.map((condition, index) => (
                  <span key={`${condition.name}-${index}`} className="rounded-full border bg-muted/30 px-2.5 py-1 font-medium text-foreground">
                    {condition.name}
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
