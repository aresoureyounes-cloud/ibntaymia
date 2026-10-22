import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Account & role administration.
 *
 * Authorization model (enforced server-side, never trusted from the client):
 *  - `developer` : unrestricted. Only a developer may grant or revoke the
 *                  `developer` role, or modify/delete an account that holds it.
 *  - `admin`     : may manage ordinary accounts and non-developer roles.
 *  - everyone else: rejected with an explicit Arabic message.
 */

const ROLES = [
  "admin",
  "director",
  "supervisor",
  "teacher",
  "parent",
  "student",
  "gate_monitor",
  "developer",
] as const;
type Role = (typeof ROLES)[number];

const DENY_NOT_STAFF = "مرفوض: هذه الصفحة مخصّصة للمدير أو المبرّم فقط.";
const DENY_DEVELOPER_ONLY = "مرفوض: دور المبرّمج لا يمنحه أو يسحبه إلا مبرّمج آخر.";
const DENY_TOUCH_DEVELOPER = "مرفوض: لا يمكن للمدير تعديل أو حذف حساب يملك دور المبرّمج.";
const DENY_SELF_DELETE = "مرفوض: لا يمكنك حذف حسابك الخاص.";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function rolesOf(userId: string): Promise<Role[]> {
  const db = await admin();
  const { data, error } = await db.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.role as Role);
}

/** Throws unless the caller is admin or developer. Returns caller capabilities. */
async function authorize(callerId: string, callerDb: Awaited<ReturnType<typeof admin>>) {
  const [developer, administrator] = await Promise.all([
    callerDb.rpc("has_role", { _user_id: callerId, _role: "developer" }),
    callerDb.rpc("has_role", { _user_id: callerId, _role: "admin" }),
  ]);
  if (developer.error) throw new Error(developer.error.message);
  if (administrator.error) throw new Error(administrator.error.message);
  const isDeveloper = developer.data === true;
  const isAdmin = administrator.data === true;
  if (!isDeveloper && !isAdmin) throw new Error(DENY_NOT_STAFF);
  return { isDeveloper, isAdmin };
}

async function guardTarget(isDeveloper: boolean, targetId: string) {
  if (isDeveloper) return;
  const target = await rolesOf(targetId);
  if (target.includes("developer")) throw new Error(DENY_TOUCH_DEVELOPER);
}

/* ------------------------------------------------------------------ list */

export const listAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await authorize(context.userId, context.supabase);
    const db = await admin();

    const users: Array<{
      id: string;
      email: string | null;
      createdAt: string;
      lastSignInAt: string | null;
      disabled: boolean;
    }> = [];
    for (let page = 1; page <= 25; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      for (const u of data.users) {
        users.push({
          id: u.id,
          email: u.email ?? null,
          createdAt: u.created_at,
          lastSignInAt: u.last_sign_in_at ?? null,
          disabled: Boolean((u as { banned_until?: string | null }).banned_until),
        });
      }
      if (data.users.length < 200) break;
    }

    const ids = users.map((u) => u.id);
    const { data: roleRows } = await db
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", ids);
    const { data: profiles } = await db.from("profiles").select("id, full_name").in("id", ids);

    return users
      .map((u) => ({
        ...u,
        fullName: profiles?.find((p) => p.id === u.id)?.full_name ?? null,
        roles: (roleRows ?? []).filter((r) => r.user_id === u.id).map((r) => r.role as Role),
      }))
      .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
  });

/* ---------------------------------------------------------------- create */

const createInput = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
  fullName: z.string().trim().min(2).max(120),
  roles: z.array(z.enum(ROLES)).min(1).max(8),
});

export const createAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createInput.parse(d))
  .handler(async ({ data, context }) => {
    const { isDeveloper } = await authorize(context.userId, context.supabase);
    if (data.roles.includes("developer") && !isDeveloper) throw new Error(DENY_DEVELOPER_ONLY);

    const db = await admin();
    const { data: created, error } = await db.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (error) throw new Error(error.message);
    const uid = created.user.id;

    await db
      .from("profiles")
      .upsert({ id: uid, full_name: data.fullName, preferred_language: "ar" });
    await db.from("user_roles").delete().eq("user_id", uid);
    const { error: rErr } = await db
      .from("user_roles")
      .insert(data.roles.map((role) => ({ user_id: uid, role })));
    if (rErr) throw new Error(rErr.message);

    return { userId: uid };
  });

/* ---------------------------------------------------------------- update */

const updateInput = z.object({
  userId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(255).optional(),
});

export const updateAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { isDeveloper } = await authorize(context.userId, context.supabase);
    await guardTarget(isDeveloper, data.userId);

    const db = await admin();
    if (data.email || data.fullName) {
      const { error } = await db.auth.admin.updateUserById(data.userId, {
        ...(data.email ? { email: data.email, email_confirm: true } : {}),
        ...(data.fullName ? { user_metadata: { full_name: data.fullName } } : {}),
      });
      if (error) throw new Error(error.message);
    }
    if (data.fullName) {
      await db.from("profiles").upsert({ id: data.userId, full_name: data.fullName });
    }
    return { ok: true };
  });

/* ----------------------------------------------------------------- roles */

const rolesInput = z.object({
  userId: z.string().uuid(),
  roles: z.array(z.enum(ROLES)).max(8),
});

export const setAccountRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rolesInput.parse(d))
  .handler(async ({ data, context }) => {
    const { isDeveloper } = await authorize(context.userId, context.supabase);
    const current = await rolesOf(data.userId);
    const next = Array.from(new Set(data.roles));

    const touchesDeveloper =
      current.includes("developer") !== next.includes("developer") || current.includes("developer");
    if (touchesDeveloper && !isDeveloper) throw new Error(DENY_DEVELOPER_ONLY);

    if (
      data.userId === context.userId &&
      current.includes("developer") &&
      !next.includes("developer")
    ) {
      throw new Error("مرفوض: لا يمكنك سحب دور المبرّمج من حسابك الحالي.");
    }

    const db = await admin();
    await db.from("user_roles").delete().eq("user_id", data.userId);
    if (next.length) {
      const { error } = await db
        .from("user_roles")
        .insert(next.map((role) => ({ user_id: data.userId, role })));
      if (error) throw new Error(error.message);
    }
    return { roles: next };
  });

/* -------------------------------------------------------------- password */

const passwordInput = z.object({
  userId: z.string().uuid(),
  password: z.string().min(8).max(72),
});

export const setAccountPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => passwordInput.parse(d))
  .handler(async ({ data, context }) => {
    const { isDeveloper } = await authorize(context.userId, context.supabase);
    await guardTarget(isDeveloper, data.userId);
    const db = await admin();
    const { error } = await db.auth.admin.updateUserById(data.userId, {
      password: data.password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------------------- reset to temporary password */

/** Readable, strong temporary password (no ambiguous characters). */
function makeTempPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "@#%*!?";
  const all = upper + lower + digits + symbols;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const pick = (set: string, i: number) => set[bytes[i]! % set.length]!;
  const chars = [pick(upper, 0), pick(lower, 1), pick(digits, 2), pick(symbols, 3)];
  for (let i = 4; i < bytes.length; i++) chars.push(pick(all, i));
  // shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = bytes[i]! % (i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

export const resetAccountPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { isDeveloper } = await authorize(context.userId, context.supabase);
    await guardTarget(isDeveloper, data.userId);
    const db = await admin();

    const { data: target, error: getErr } = await db.auth.admin.getUserById(data.userId);
    if (getErr) throw new Error(getErr.message);
    const email = target.user?.email ?? null;

    const password = makeTempPassword();
    const { error } = await db.auth.admin.updateUserById(data.userId, {
      password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);

    // Best-effort notification: the built-in recovery email lets the user pick
    // a new password without waiting for the temporary one to be relayed.
    let emailSent = false;
    let emailError: string | null = null;
    if (email) {
      const { error: mailErr } = await db.auth.resetPasswordForEmail(email);
      if (mailErr) emailError = mailErr.message;
      else emailSent = true;
    }

    return { password, email, emailSent, emailError };
  });

/* ------------------------------------------------------- enable / disable */

const toggleInput = z.object({ userId: z.string().uuid(), disabled: z.boolean() });

export const setAccountDisabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => toggleInput.parse(d))
  .handler(async ({ data, context }) => {
    const { isDeveloper } = await authorize(context.userId, context.supabase);
    await guardTarget(isDeveloper, data.userId);
    if (data.userId === context.userId && data.disabled) {
      throw new Error("مرفوض: لا يمكنك تعطيل حسابك الخاص.");
    }
    const db = await admin();
    const { error } = await db.auth.admin.updateUserById(data.userId, {
      ban_duration: data.disabled ? "876000h" : "none",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------------------------------------------------------- delete */

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { isDeveloper } = await authorize(context.userId, context.supabase);
    if (data.userId === context.userId) throw new Error(DENY_SELF_DELETE);
    await guardTarget(isDeveloper, data.userId);
    const db = await admin();
    const { error } = await db.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
