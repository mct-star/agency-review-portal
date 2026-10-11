import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { ContentPrincipal } from "./principal";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SKEW_SECONDS = 60;
const MAX_BODY_BYTES = 4 * 1024 * 1024;

export class ContentError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export function contentSignature(method: string, path: string, timestamp: string, body: Uint8Array, secret: string): string {
  const digest = createHash("sha256").update(body).digest("hex");
  return createHmac("sha256", secret).update([method.toUpperCase(), path, timestamp, digest].join("\n")).digest("hex");
}

export async function verifyContentRequest(request: Request): Promise<ContentPrincipal> {
  const secret = process.env.CONTENT_BRIDGE_SECRET;
  const companyId = process.env.CONTENT_BRIDGE_COMPANY_ID;
  const userId = process.env.CONTENT_BRIDGE_USER_ID;
  if (!secret || secret.length < 32 || !companyId || !UUID.test(companyId) || !userId || !UUID.test(userId)) {
    throw new ContentError("Content connection is not configured.", 503);
  }
  const timestamp = request.headers.get("x-content-timestamp") || "";
  const signature = request.headers.get("x-content-signature") || "";
  if (!/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > MAX_SKEW_SECONDS || !/^[a-f0-9]{64}$/.test(signature)) {
    throw new ContentError("Unauthorised content request.", 401);
  }
  const reader = request.clone().body?.getReader();
  const chunks: Uint8Array[]=[];let size=0;
  if(reader) while(true) {
    const {value,done}=await reader.read();if(done) break;
    size+=value.byteLength;
    if(size>MAX_BODY_BYTES) {void reader.cancel();throw new ContentError("Upload media directly to the signed storage URL. Audio must be under 4 MB.",413);}
    chunks.push(value);
  }
  const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
  const url = new URL(request.url);
  const expected = contentSignature(request.method, url.pathname + url.search, timestamp, body, secret);
  if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) {
    throw new ContentError("Unauthorised content request.", 401);
  }
  const db = await createAdminSupabaseClient();
  const actorEmail = process.env.CONTENT_BRIDGE_ACTOR_EMAIL || "mct@agencybristol.com";
  const claimedActor = request.headers.get("x-content-actor");
  if (claimedActor && claimedActor !== actorEmail) throw new ContentError("Content actor is not authorised.", 403);
  const { data: admin, error } = await db.from("users").select("id, role, email").eq("id", userId).maybeSingle();
  if (error) throw new ContentError("Content authorisation could not be checked.", 503);
  if (!admin || admin.role !== "admin" || admin.email !== actorEmail) throw new ContentError("Content administrator is not authorised.", 403);
  return {
    id: admin.id, role: "admin", companyId,
    model: process.env.CONTENT_MARKEY_MODEL || "claude-sonnet-5-5",
    modelLabel: process.env.CONTENT_MARKEY_MODEL_LABEL || "Claude Sonnet 5.5",
  };
}
