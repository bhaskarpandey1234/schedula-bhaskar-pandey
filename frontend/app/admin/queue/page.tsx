import { connection } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { getQueueBoard } from "@/lib/queue/queries";
import { QueueBoard } from "@/components/queue/queue-board";

export const instant = false;

export default async function AdminQueuePage() {
  await connection();
  await requireRole("admin");
  return <QueueBoard role="admin" rows={await getQueueBoard()} />;
}
