import { NextResponse } from "next/server";
import { assistantConfig, assistantErrorStatus, requireAssistantPilotAccess } from "@/lib/assistant/config";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { role?: "doctor" | "patient" };
    const role = body.role === "doctor" ? "doctor" : "patient";
    await requireAssistantPilotAccess(role);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": assistantConfig.geminiApiKey }, body: JSON.stringify({ uses: 1, expireTime: expiresAt, newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(), liveConnectConstraints: { model: assistantConfig.liveModel, config: { responseModalities: ["AUDIO"], sessionResumption: {} } } }) });
    if (!response.ok) return NextResponse.json({ error: "Voice quota or token provisioning is unavailable" }, { status: response.status === 429 ? 429 : 503 });
    const token = await response.json();
    return NextResponse.json({ token: token.name, model: assistantConfig.liveModel, expiresAt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Voice unavailable" }, { status: assistantErrorStatus(error) });
  }
}
