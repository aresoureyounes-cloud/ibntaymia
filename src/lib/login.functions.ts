import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Sign in with either a full email or a bare username.
 *
 * Accounts in this project live on several mail domains (idaroom.dz,
 * demo.idarroom.dz, gmail.com...), so a client-side "username + fixed domain"
 * guess fails for most of them. Resolution happens server-side against the
 * auth directory.
 *
 * On failure we explain WHY (unknown account / wrong password / disabled /
 * unconfirmed email / no role assigned) so staff can fix the account instead
 * of guessing. This is a closed staff platform, so account-existence
 * disclosure is an accepted trade-off requested by the owner.
 */

const input = z.object({
  identifier: z.string().trim().min(2).max(255),
  password: z.string().min(1).max(72),
});

export const ERR = {
  UNKNOWN: "لا يوجد حساب بهذا الاسم أو البريد. تحقّق من الكتابة أو اطلب من الإدارة إنشاء الحساب.",
  AMBIGUOUS:
    "اسم المستخدم هذا مرتبط بأكثر من حساب. أدخل البريد الإلكتروني الكامل بدل الاسم المختصر.",
  AMBIGUOUS_LIST: (emails: string[]) =>
    `اسم المستخدم هذا مرتبط بأكثر من حساب (${emails.join(" ، ")}). أدخل البريد الإلكتروني الكامل.`,
  PASSWORD: "كلمة المرور غير صحيحة. يمكن للإدارة إعادة تعيينها من صفحة «الحسابات والأدوار».",
  DISABLED: "هذا الحساب معطّل حاليًا. تواصل مع الإدارة لإعادة تفعيله.",
  UNCONFIRMED: "البريد الإلكتروني لهذا الحساب غير مُفعّل بعد. تواصل مع الإدارة لتأكيده.",
  NOROLE: "الحساب موجود لكن لم يُسند له أي دور بعد، لذلك لا يمكنه الدخول. تواصل مع الإدارة.",
  RATE: "محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم أعد المحاولة.",
} as const;

type AdminUser = {
  id: string;
  email?: string | undefined;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  banned_until?: string | null;
};

/** Normalize what staff actually type: stray spaces, NBSP, RTL marks, Arabic digits. */
function normalize(raw: string): string {
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  return raw
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\u00a0]/g, "")
    .replace(/[٠-٩]/g, (d) => String(arabicDigits.indexOf(d)))
    .trim()
    .toLowerCase();
}

async function findUser(identifier: string): Promise<
  | { kind: "found"; user: AdminUser }
  | { kind: "unknown" }
  | { kind: "ambiguous"; emails: string[] }
> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const needle = normalize(identifier);
  const wantsEmail = needle.includes("@");
  const exact: AdminUser[] = [];
  const byUsername: AdminUser[] = [];

  for (let page = 1; page <= 25; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    for (const u of data.users) {
      const record = u as AdminUser & { new_email?: string | null };
      const email = (record.email ?? "").toLowerCase();
      // An account whose email change is still pending keeps signing in with
      // the old address, so both addresses must resolve to the same account.
      const pending = (record.new_email ?? "").toLowerCase();
      if (!email && !pending) continue;
      if (wantsEmail) {
        if (email === needle || pending === needle) exact.push(record);
      } else if (email.split("@")[0] === needle || pending.split("@")[0] === needle) {
        byUsername.push(record);
      }
    }
    if (data.users.length < 200) break;
  }

  const matches = exact.length ? exact : byUsername;
  if (matches.length === 0) return { kind: "unknown" };
  if (matches.length > 1) {
    return { kind: "ambiguous", emails: matches.map((m) => m.email ?? "").filter(Boolean) };
  }
  return { kind: "found", user: matches[0]! };
}

export const signInWithIdentifier = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }) => {
    const found = await findUser(data.identifier);
    if (found.kind === "unknown") throw new Error(ERR.UNKNOWN);
    if (found.kind === "ambiguous") {
      throw new Error(found.emails.length ? ERR.AMBIGUOUS_LIST(found.emails) : ERR.AMBIGUOUS);
    }

    const user = found.user;
    const email = (user.email ?? "").toLowerCase();

    // Account-state checks before attempting the password.
    if (user.banned_until && new Date(user.banned_until).getTime() > Date.now()) {
      throw new Error(ERR.DISABLED);
    }
    if (!user.email_confirmed_at && !user.confirmed_at) {
      throw new Error(ERR.UNCONFIRMED);
    }

    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const client = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (url, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
            h.delete("Authorization");
          }
          h.set("apikey", key);
          return fetch(url, { ...init, headers: h });
        },
      },
    });

    const { data: result, error } = await client.auth.signInWithPassword({
      email,
      password: data.password,
    });

    if (error || !result.session) {
      const msg = (error?.message ?? "").toLowerCase();
      if (msg.includes("rate") || error?.status === 429) throw new Error(ERR.RATE);
      if (msg.includes("confirm")) throw new Error(ERR.UNCONFIRMED);
      if (msg.includes("banned") || msg.includes("disabled")) throw new Error(ERR.DISABLED);
      throw new Error(ERR.PASSWORD);
    }

    // Role check — an account with no role has nothing to open.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    if (!roles || roles.length === 0) {
      throw new Error(ERR.NOROLE);
    }

    return {
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
      roles: roles.map((r) => r.role as string),
    };
  });
