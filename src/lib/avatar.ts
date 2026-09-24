import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve a stored avatar value to a usable image URL.
 * Stored values may be:
 *  - a full http(s) URL (legacy / OAuth provider) → returned as-is
 *  - a storage path inside the `avatars` bucket (e.g. "<uid>/avatar.jpg") → signed
 *  - null/empty → null
 */
export async function resolveAvatarUrl(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const { data, error } = await supabase.storage.from("avatars").createSignedUrl(value, 60 * 60); // 1h
  if (error) return null;
  return data?.signedUrl ?? null;
}
