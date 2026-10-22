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
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "")
      .slice(0, 40) || "user"
  );
}

function randomPassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return (
    Array.from(crypto.getRandomValues(new Uint8Array(20)), (byte) =>
      chars.charAt(byte % chars.length),
    ).join("") + "@1Aa"
  );
}

function randomBadgeUid() {
  return (
    "04" +
    Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
      byte.toString(16).padStart(2, "0"),
    )
      .join("")
      .toUpperCase()
  );
}

function checked<T extends { error: { message: string } | null }>(result: T): T {
  if (result.error) throw new Error(result.error.message);
  return result;
}

export const bulkImportAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    // Authorization: admin only
    const { data: isAdmin } = checked(
      await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      }),
    );
    if (isAdmin !== true) throw new Error("Forbidden: admin only");

    type Role =
      "student" | "teacher" | "admin" | "director" | "supervisor" | "gate_monitor" | "parent";
    const role: Role = data.kind === "editor" ? "supervisor" : (data.kind as Role);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isDeveloper } = checked(
      await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "developer",
      }),
    );
    const usersByEmail = new Map<string, string>();
    for (let page = 1; ; page++) {
      const { data: list } = checked(
        await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 }),
      );
      for (const account of list.users) {
        if (account.email) usersByEmail.set(account.email.toLowerCase(), account.id);
      }
      if (list.users.length < 200) break;
    }

    // Preload existing classes for student rows
    const classCache = new Map<string, string>();
    async function ensureClassId(name: string | null | undefined) {
      if (!name) return null;
      const key = name.trim();
      if (!key) return null;
      const cached = classCache.get(key);
      if (cached) return cached;
      const { data: existing } = checked(
        await supabaseAdmin.from("classes").select("id").eq("name", key).maybeSingle(),
      );
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
      let createdUserId: string | null = null;
      try {
        const email =
          row.email?.toLowerCase() ||
          `${slugify(row.full_name)}.${crypto.randomUUID()}@${emailDomain}`;
        const password = randomPassword();

        // Find or create auth user
        let userId: string | null = null;
        let status: "created" | "existed" = "created";

        const existingId = usersByEmail.get(email);
        if (existingId) {
          userId = existingId;
          status = "existed";
          const { data: roles } = checked(
            await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
          );
          if (!isDeveloper && roles?.some((r) => r.role === "developer")) {
            throw new Error("مرفوض: لا يمكن للمدير تعديل حساب يملك دور المبرمج عبر الاستيراد.");
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
          createdUserId = userId;
        }

        // Profile
        checked(
          await supabaseAdmin.from("profiles").upsert({
            id: userId,
            full_name: row.full_name,
            phone: row.phone ?? null,
            preferred_language: "ar",
          }),
        );

        // Add the requested role without a delete/insert gap or removing other roles.
        checked(
          await supabaseAdmin
            .from("user_roles")
            .upsert({ user_id: userId, role }, { onConflict: "user_id,role" }),
        );

        let badge_uid: string | null = null;

        // Student-specific: create students row + rfid card
        if (role === "student") {
          const classId = await ensureClassId(row.class_name);
          const { data: existingStudent } = checked(
            await supabaseAdmin.from("students").select("id").eq("user_id", userId).maybeSingle(),
          );
          let studentId = existingStudent?.id ?? null;
          if (studentId) {
            checked(
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
                .eq("id", studentId),
            );
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
            checked(
              await supabaseAdmin.from("rfid_cards").insert({
                card_uid: badge_uid,
                student_id: studentId,
                status: "active",
                assigned_at: new Date().toISOString(),
              }),
            );
          }
        } else if (data.create_badge) {
          // For staff badges, we can still generate a UID (no rfid record — table is student-scoped)
          badge_uid = randomBadgeUid();
        }

        // Persist whitelist last, only after the account's dependent writes succeed.
        if (["admin", "director", "supervisor", "teacher", "gate_monitor"].includes(role)) {
          checked(
            await supabaseAdmin
              .from("staff_whitelist")
              .upsert(
                { email, full_name: row.full_name, role, note: "bulk import" },
                { onConflict: "full_name" },
              ),
          );
        }
        usersByEmail.set(email, userId);
        results.push({
          full_name: row.full_name,
          email,
          password: status === "created" ? password : null,
          badge_uid,
          status,
        });
      } catch (e) {
        let cleanupError: string | null = null;
        if (createdUserId) {
          const studentCleanup = await supabaseAdmin.from("students").delete().eq("user_id", createdUserId);
          const cleanup = await supabaseAdmin.auth.admin.deleteUser(createdUserId);
          cleanupError = [studentCleanup.error?.message, cleanup.error?.message].filter(Boolean).join("؛ ") || null;
        }
        results.push({
          full_name: row.full_name,
          email: row.email ?? null,
          password: null,
          badge_uid: null,
          status: "error",
          error: `${e instanceof Error ? e.message : String(e)}${cleanupError ? " — تعذر حذف الحساب غير المكتمل: " + cleanupError : ""}`,
        });
      }
    }

    return { results };
  });
