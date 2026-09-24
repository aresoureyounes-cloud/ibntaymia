import { createFileRoute } from "@tanstack/react-router";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * Admin-only endpoint used by the `idaroom demo …` CLI commands.
 *
 * Security model:
 *  - The caller MUST send valid credentials of a signed-up user that holds the
 *    `admin` role (verified through the publishable client + has_role RPC).
 *  - Every mutation is restricted to the demo email domain, so this endpoint can
 *    never touch a real staff/parent account.
 */

const DEMO_DOMAIN = "demo.idarroom.dz";

const ROLES = ["admin", "director", "supervisor", "teacher", "parent", "student", "gate_monitor"] as const;

const bodySchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(6).max(200),
  action: z.enum(["list", "create", "disable", "enable", "password", "link"]),
  target: z.string().max(200).optional(),
  role: z.enum(ROLES).optional(),
  name: z.string().max(120).optional(),
  newPassword: z.string().min(8).max(72).optional(),
  className: z.string().max(120).optional(),
  cardUid: z.string().max(64).optional(),
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function isDemo(email: string) {
  return email.toLowerCase().endsWith(`@${DEMO_DOMAIN}`);
}

export const Route = createFileRoute("/api/public/cli-demo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ ok: false, error: "INVALID_JSON" }, 400);
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return json({ ok: false, error: "INVALID_INPUT", details: parsed.error.issues.map((i) => i.message) }, 400);
        }
        const body = parsed.data;

        const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
        const publishable =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
        if (!url || !publishable) return json({ ok: false, error: "SERVER_NOT_CONFIGURED" }, 500);

        // 1) authenticate the caller
        const authClient = createClient(url, publishable, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: session, error: signInError } = await authClient.auth.signInWithPassword({
          email: body.email,
          password: body.password,
        });
        if (signInError || !session?.user) return json({ ok: false, error: "UNAUTHORIZED" }, 401);

        // 2) authorize: admin role only
        const { data: isAdmin, error: roleError } = await authClient.rpc("has_role", {
          _user_id: session.user.id,
          _role: "admin",
        });
        if (roleError || !isAdmin) return json({ ok: false, error: "FORBIDDEN" }, 403);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = supabaseAdmin as unknown as SupabaseClient;

        const findUser = async (email: string) => {
          for (let page = 1; page <= 20; page++) {
            const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
            if (error) throw new Error(error.message);
            const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
            if (hit) return hit;
            if (data.users.length < 200) return null;
          }
          return null;
        };

        try {
          /* ---------------------------------------------------------- list */
          if (body.action === "list") {
            const accounts: Array<Record<string, unknown>> = [];
            for (let page = 1; page <= 20; page++) {
              const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
              if (error) throw new Error(error.message);
              for (const u of data.users) {
                if (!isDemo(u.email ?? "")) continue;
                accounts.push({
                  id: u.id,
                  email: u.email,
                  name: (u.user_metadata as Record<string, unknown> | null)?.["full_name"] ?? null,
                  disabled: Boolean((u as unknown as { banned_until?: string | null }).banned_until),
                  lastSignInAt: u.last_sign_in_at ?? null,
                });
              }
              if (data.users.length < 200) break;
            }
            const ids = accounts.map((a) => a["id"] as string);
            const { data: roles } = await admin.from("user_roles").select("user_id, role").in("user_id", ids);
            const { data: students } = await admin
              .from("students")
              .select("id, user_id, full_name, class_id, classes(name)")
              .in("user_id", ids);
            const studentIds = (students ?? []).map((s: Record<string, unknown>) => s["id"] as string);
            const { data: cards } = studentIds.length
              ? await admin.from("rfid_cards").select("card_uid, student_id, status").in("student_id", studentIds)
              : { data: [] as Record<string, unknown>[] };

            for (const acc of accounts) {
              acc["role"] =
                (roles ?? []).find((r: Record<string, unknown>) => r["user_id"] === acc["id"])?.["role"] ?? null;
              const st = (students ?? []).find((s: Record<string, unknown>) => s["user_id"] === acc["id"]) as
                | Record<string, unknown>
                | undefined;
              acc["student"] = st
                ? {
                    id: st["id"],
                    className: (st["classes"] as { name?: string } | null)?.name ?? null,
                    cardUid:
                      (cards ?? []).find((c: Record<string, unknown>) => c["student_id"] === st["id"])?.["card_uid"] ??
                      null,
                  }
                : null;
            }
            accounts.sort((a, b) => String(a["email"]).localeCompare(String(b["email"])));
            return json({ ok: true, action: "list", count: accounts.length, accounts });
          }

          /* ------------------------------------------------- target lookup */
          const target = (body.target ?? "").trim().toLowerCase();
          if (!target) return json({ ok: false, error: "TARGET_REQUIRED" }, 400);
          const targetEmail = target.includes("@") ? target : `${target}@${DEMO_DOMAIN}`;
          if (!isDemo(targetEmail)) {
            return json({ ok: false, error: "NOT_A_DEMO_ACCOUNT", hint: `only @${DEMO_DOMAIN} is allowed` }, 400);
          }

          /* -------------------------------------------------------- create */
          if (body.action === "create") {
            if (!body.role) return json({ ok: false, error: "ROLE_REQUIRED" }, 400);
            const password = body.newPassword ?? "Demo@2026";
            const fullName = body.name ?? targetEmail.split("@")[0];
            let user = await findUser(targetEmail);
            if (user) {
              const { error } = await admin.auth.admin.updateUserById(user.id, {
                password,
                email_confirm: true,
                ban_duration: "none",
                user_metadata: { full_name: fullName },
              });
              if (error) throw new Error(error.message);
            } else {
              const { data, error } = await admin.auth.admin.createUser({
                email: targetEmail,
                password,
                email_confirm: true,
                user_metadata: { full_name: fullName },
              });
              if (error) throw new Error(error.message);
              user = data.user;
            }
            const uid = user!.id;
            await admin.from("staff_whitelist").delete().ilike("email", targetEmail);
            if (body.role !== "student") {
              await admin
                .from("staff_whitelist")
                .insert({ email: targetEmail, role: body.role, full_name: fullName, note: "cli demo" });
            }
            await admin.from("profiles").upsert({ id: uid, full_name: fullName, preferred_language: "ar" });
            await admin.from("user_roles").delete().eq("user_id", uid);
            const { error: roleErr } = await admin.from("user_roles").insert({ user_id: uid, role: body.role });
            if (roleErr) throw new Error(roleErr.message);
            return json({
              ok: true,
              action: "create",
              email: targetEmail,
              role: body.role,
              name: fullName,
              password,
            });
          }

          const user = await findUser(targetEmail);
          if (!user) return json({ ok: false, error: "NOT_FOUND", email: targetEmail }, 404);

          /* ------------------------------------------------ disable/enable */
          if (body.action === "disable" || body.action === "enable") {
            const disable = body.action === "disable";
            const { error } = await admin.auth.admin.updateUserById(user.id, {
              ban_duration: disable ? "876000h" : "none",
            });
            if (error) throw new Error(error.message);
            return json({ ok: true, action: body.action, email: targetEmail, disabled: disable });
          }

          /* ------------------------------------------------------ password */
          if (body.action === "password") {
            if (!body.newPassword) return json({ ok: false, error: "NEW_PASSWORD_REQUIRED" }, 400);
            const { error } = await admin.auth.admin.updateUserById(user.id, {
              password: body.newPassword,
              email_confirm: true,
            });
            if (error) throw new Error(error.message);
            return json({ ok: true, action: "password", email: targetEmail });
          }

          /* ---------------------------------------------------------- link */
          if (body.action === "link") {
            if (!body.className && !body.cardUid) {
              return json({ ok: false, error: "CLASS_OR_CARD_REQUIRED" }, 400);
            }
            const fullName =
              body.name ??
              ((user.user_metadata as Record<string, unknown> | null)?.["full_name"] as string | undefined) ??
              targetEmail.split("@")[0]!;

            let classId: string | null = null;
            if (body.className) {
              const { data: existing } = await admin
                .from("classes")
                .select("id")
                .eq("name", body.className)
                .maybeSingle();
              if (existing) classId = existing["id"] as string;
              else {
                const { data, error } = await admin
                  .from("classes")
                  .insert({ name: body.className, level: "ثانوي", branch: body.className.split(" - ")[1] ?? null })
                  .select("id")
                  .single();
                if (error) throw new Error(error.message);
                classId = data["id"] as string;
              }
            }

            const { data: existingStudent } = await admin
              .from("students")
              .select("id")
              .eq("user_id", user.id)
              .maybeSingle();
            let studentId: string;
            if (existingStudent) {
              studentId = existingStudent["id"] as string;
              if (classId) await admin.from("students").update({ class_id: classId }).eq("id", studentId);
            } else {
              const { data, error } = await admin
                .from("students")
                .insert({ full_name: fullName, user_id: user.id, class_id: classId, fake_email: targetEmail })
                .select("id")
                .single();
              if (error) throw new Error(error.message);
              studentId = data["id"] as string;
            }

            let cardUid: string | null = null;
            if (body.cardUid) {
              cardUid = body.cardUid.trim().toUpperCase();
              const { data: card } = await admin
                .from("rfid_cards")
                .select("id")
                .eq("card_uid", cardUid)
                .maybeSingle();
              if (card) {
                const { error } = await admin
                  .from("rfid_cards")
                  .update({ student_id: studentId, status: "active", assigned_at: new Date().toISOString() })
                  .eq("id", card["id"] as string);
                if (error) throw new Error(error.message);
              } else {
                const { error } = await admin.from("rfid_cards").insert({
                  card_uid: cardUid,
                  student_id: studentId,
                  status: "active",
                  assigned_at: new Date().toISOString(),
                });
                if (error) throw new Error(error.message);
              }
            }

            return json({
              ok: true,
              action: "link",
              email: targetEmail,
              studentId,
              className: body.className ?? null,
              cardUid,
            });
          }

          return json({ ok: false, error: "UNKNOWN_ACTION" }, 400);
        } catch (e) {
          return json({ ok: false, error: e instanceof Error ? e.message : "INTERNAL_ERROR" }, 500);
        } finally {
          await authClient.auth.signOut();
        }
      },
    },
  },
});
