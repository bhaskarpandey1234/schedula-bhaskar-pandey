import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function ErrorState({ title = "Something went wrong", description, action }: { title?: string; description: string; action?: React.ReactNode }) {
  return <Alert variant="destructive"><AlertCircle className="size-4" /><AlertTitle>{title}</AlertTitle><AlertDescription>{description}{action ? <span className="mt-3 block">{action}</span> : null}</AlertDescription></Alert>;
}
