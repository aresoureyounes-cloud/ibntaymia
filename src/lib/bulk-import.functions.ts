import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const rowSchema = z.object({
  full_name: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(255).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  gender: z.enum(["M", "F"]).optional().nullable(),
  date_of_birth: z.string().trim().max(20).optional().nullable(),
  class_name: z.string().trim().max(120).optional().nullable(),
});

const KIND = z.enum([
  "student",
  "teacher",
  "admin",
  "director",
  "supervisor",
  "gate_monitor",
  "parent",
  "editor", // alias -> supervisor
]);

const input = z.object({
  kind: KIND,
  create_badge: z.boolean().default(false),
  rows: z.array(rowSchema).min(1).max(500),
});

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 40) || "user";
}

function randomPassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out + "@1";
}

function randomBadgeUid() {
  const hex = "0123456789ABCDEF";
  let out = "04";
  for (let i = 0; i < 12; i++) out += hex[Math.floor(Math.random() * 16)];
  return out;
}

export const bulkImportAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    // Authorization: admin only
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (isAdmin !== true) throw new Error("Forbidden: admin only");

    type Role = "student" | "teacher" | "admin" | "director" | "supervisor" | "gate_monitor" | "parent";
    const role: Role = data.kind === "editor" ? "supervisor" : (data.kind as Role);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Preload existing classes for student rows
    const classCache = new Map<string, string>();
    async function ensureClassId(name: string | null | undefined) {
      if (!name) return null;
      const key = name.trim();
      if (!key) return null;
      if (classCache.has(key)) return classCache.get(key)!;
      const { data: existing } = await supabaseAdmin
        .from("classes")
        .select("id")
        .eq("name", key)
        .maybeSingle();
      if (existing) {
        classCache.set(key, existing.id);
        return existing.id;
      }
      const { data: created, error } = await supabaseAdmin
        .from("classes")
        .insert({ name: key, level: null, branch: null })
        .select("id")
        .single();
      if (error) throw error;
      classCache.set(key, created.id);
      return created.id;
    }

    const results: Array<{
      full_name: string;
      email: string | null;
      password: string | null;
      badge_uid: string | null;
      status: "created" | "existed" | "error";
      error?: string;
    }> = [];

    const emailDomain = "idarroom.local";

    for (const row of data.rows) {
      try {
        const email =
          row.email?.toLowerCase() ||
          `${slugify(row.full_name)}.${Math.random().toString(36).slice(2, 6)}@${emailDomain}`;
        const password = randomPassword();

        // Find or create auth user
        let userId: string | null = null;
        let status: "created" | "existed" = "created";

        // Try to find existing by paginated search (cheap for small batches)
        {
          const { data: list } = await supabaseAdmin.auth.admin.listUsers({
            page: 1,
            perPage: 200,
          });
          const found = list?.users.find(
            (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
          );
          if (found) {
            userId = found.id;
            status = "existed";
          }
        }

        if (!userId) {
          const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: row.full_name, phone: row.phone },
          });
          if (error) throw error;
          userId = created.user.id;
        }

        // Profile
        await supabaseAdmin.from("profiles").upsert({
          id: userId,
          full_name: row.full_name,
          phone: row.phone ?? null,
          preferred_language: "ar",
        });

        // Role: replace with the requested one
        await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).eq("role", role);
        await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: userId, role })
          .select()
          .single()
          .then(() => null, () => null);

        // Staff whitelist (so future re-signups keep role) — not for students/parents
        if (["admin", "director", "supervisor", "teacher", "gate_monitor"].includes(role)) {
          await supabaseAdmin
            .from("staff_whitelist")
            .upsert(
              { email, full_name: row.full_name, role, note: "bulk import" },
              { onConflict: "full_name" },
            );
        }

        let badge_uid: string | null = null;

        // Student-specific: create students row + rfid card
        if (role === "student") {
          const classId = await ensureClassId(row.class_name);
          const { data: existingStudent } = await supabaseAdmin
            .from("students")
            .select("id")
            .eq("user_id", userId)
            .maybeSingle();
          let studentId = existingStudent?.id ?? null;
          if (studentId) {
            await supabaseAdmin
              .from("students")
              .update({
                full_name: row.full_name,
                gender: row.gender ?? null,
                date_of_birth: row.date_of_birth ?? null,
                class_id: classId,
                fake_email: email,
                fake_phone: row.phone ?? null,
              })
              .eq("id", studentId);
          } else {
            const { data: sIns, error: sErr } = await supabaseAdmin
              .from("students")
              .insert({
                full_name: row.full_name,
                gender: row.gender ?? null,
                date_of_birth: row.date_of_birth ?? null,
                class_id: classId,
                user_id: userId,
                fake_email: email,
                fake_phone: row.phone ?? null,
              })
              .select("id")
              .single();
            if (sErr) throw sErr;
            studentId = sIns.id;
          }

          if (data.create_badge && studentId) {
            badge_uid = randomBadgeUid();
            await supabaseAdmin.from("rfid_cards").insert({
              card_uid: badge_uid,
              student_id: studentId,
              status: "active",
              assigned_at: new Date().toISOString(),
            });
          }
        } else if (data.create_badge) {
          // For staff badges, we can still generate a UID (no rfid record — table is student-scoped)
          badge_uid = randomBadgeUid();
        }

        results.push({
          full_name: row.full_name,
          email,
          password: status === "created" ? password : null,
          badge_uid,
          status,
        });
      } catch (e) {
        results.push({
          full_name: row.full_name,
          email: row.email ?? null,
          password: null,
          badge_uid: null,
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return { results };
  });
