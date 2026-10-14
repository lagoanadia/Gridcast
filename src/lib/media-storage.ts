import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cloud storage for photos and videos (Supabase Storage). Instagram and TikTok download the file from a public URL,
 * so files must live somewhere that outlives a deploy. The browser uploads straight to storage with a signed token,
 * which also avoids the ~4.5 MB request limit of Vercel functions.
 */
export const MEDIA_BUCKET = "gridcast-media";
export const STORAGE_PREFIX = `supabase://${MEDIA_BUCKET}/`;

type Env = Record<string, string | undefined>;

export function supabaseConfig(env: Env = process.env) {
  const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || "";
  return url && serviceKey ? { url, serviceKey, anonKey } : null;
}

export const mediaStorageEnabled = (env: Env = process.env) => supabaseConfig(env) !== null;

/** "<user>/<id>.<ext>" with the extension reduced to safe characters. */
export function objectPath(userId: string, id: string, fileName: string) {
  const ext = (fileName.toLowerCase().match(/\.([a-z0-9]{1,5})$/)?.[1]) ?? "bin";
  return `${userId}/${id}.${ext}`;
}

export const isStoragePath = (filePath: string | undefined) => !!filePath?.startsWith(STORAGE_PREFIX);

let cached: { client: SupabaseClient; ready: Promise<void> } | null = null;

function admin() {
  const cfg = supabaseConfig();
  if (!cfg) throw new Error("Supabase Storage is not configured");
  if (!cached) {
    const client = createClient(cfg.url, cfg.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const ready = (async () => {
      const { error } = await client.storage.createBucket(MEDIA_BUCKET, { public: true });
      if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(error.message);
    })().catch((e) => { cached = null; throw e; });
    cached = { client, ready };
  }
  return cached;
}

export function publicUrlFor(path: string): string {
  return admin().client.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** A one-time token the browser uses to upload exactly one file to exactly this path. */
export async function createSignedUpload(path: string) {
  const { client, ready } = admin();
  await ready;
  const { data, error } = await client.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(error?.message ?? "could not sign upload");
  return { token: data.token, path: data.path ?? path, publicUrl: publicUrlFor(path) };
}

export async function removeObject(path: string) {
  const { client, ready } = admin();
  await ready;
  await client.storage.from(MEDIA_BUCKET).remove([path]);
}

/** The upload really happened if the public URL answers. */
export async function objectExists(path: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(publicUrlFor(path), { method: "HEAD", signal: AbortSignal.timeout(8_000) });
    return res.ok;
  } catch {
    return false;
  }
}
