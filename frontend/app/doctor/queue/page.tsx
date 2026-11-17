import { connection } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { getQueueBoard } from "@/lib/queue/queries";
import { QueueBoard } from "@/components/queue/queue-board";

export const instant = false;

export default async function DoctorQueuePage() {
  await connection();
  const account = await requireRole("doctor");
  return <QueueBoard role="doctor" rows={await getQueueBoard(undefined, account.user.id)} />;
}
