import { redirect } from "next/navigation";
import { connection } from "next/server";
import { resolvePortalDestination } from "@/lib/auth/guards";

export const instant = false;

export default async function ContinuePage() {
  await connection();
  redirect(await resolvePortalDestination());
}
