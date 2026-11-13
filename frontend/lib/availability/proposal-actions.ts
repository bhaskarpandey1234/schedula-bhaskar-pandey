"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function call(name: string, args: Record<string, string>) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  revalidatePath("/patient/appointments", "page");
  revalidatePath("/patient/notifications", "page");
  revalidatePath("/patient/payments", "page");
  return data;
}

export async function approveElasticProposal(proposalId: string) { return call("approve_elastic_booking_proposal", { p_proposal_id: proposalId }); }
export async function chooseElasticProposalSlot(proposalId: string, slotId: string) { return call("choose_elastic_booking_slot", { p_proposal_id: proposalId, p_slot_id: slotId }); }
export async function rejectElasticProposal(proposalId: string) { return call("reject_elastic_booking_proposal", { p_proposal_id: proposalId }); }
