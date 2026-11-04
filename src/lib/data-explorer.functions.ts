import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DATA_TABLES } from "@/lib/data-explorer";

const tableNames = DATA_TABLES.map((t) => t.name) as [string, ...string[]];
const tableSchema = z.enum(tableNames);

// Only admin or developer may browse/edit raw data. Checked with the caller-scoped client.
async function authorize(ctx: { supabase: any; userId: string }) {
  for (const r of ["developer", "admin"] as const) {
    const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: r });
    if (data === true) return;
  }
  throw new Error("غير مسموح: هذه الصفحة للمسؤول أو المبرمج فقط");
}

function meta(name: string) {
  const t = DATA_TABLES.find((x) => x.name === name);
  if (!t) throw new Error("جدول غير معروف");
  return t;
}

export const listRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        table: tableSchema,
        search: z.string().max(200).default(""),
        page: z.number().int().min(0).max(10000).default(0),
        pageSize: z.number().int().min(10).max(200).default(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await authorize(context);
    const t = meta(data.table);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = (supabaseAdmin.from as any)(t.name).select("*", { count: "exact" });
    const s = data.search.trim().replace(/[,()%]/g, " ");
    if (s && t.searchColumns.length) {
      q = q.or(t.searchColumns.map((c) => `${c}.ilike.%${s}%`).join(","));
    }
    if (t.orderBy) q = q.order(t.orderBy, { ascending: false });
    const from = data.page * data.pageSize;
    const { data: rows, error, count } = await q.range(from, from + data.pageSize - 1);
    if (error) throw new Error(error.message);
    return { rows: JSON.parse(JSON.stringify(rows ?? [])) as Record<string, unknown>[], count: count ?? 0 };
  });

const rowValues = z.record(z.string(), z.unknown());

export const saveRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ table: tableSchema, id: z.string().optional(), values: rowValues }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await authorize(context);
    const t = meta(data.table);
    if (t.readOnly) throw new Error("هذا الجدول للقراءة فقط");
    const values = { ...data.values };
    for (const k of ["created_at", "updated_at"]) delete values[k];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tbl = (supabaseAdmin.from as any)(t.name);
    if (data.id) {
      delete values[t.key];
      const { error } = await tbl.update(values).eq(t.key, data.id);
      if (error) throw new Error(error.message);
    } else {
      if (!values[t.key]) delete values[t.key];
      const { error } = await tbl.insert(values);
      if (error) throw new Error(error.message);
    }
    await supabaseAdmin.from("profile_audit_log").insert({
      user_id: context.userId,
      action: data.id ? "data_update" : "data_insert",
      details: { table: t.name, id: data.id ?? null },
    });
    return { ok: true };
  });

export const deleteRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ table: tableSchema, id: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    await authorize(context);
    const t = meta(data.table);
    if (t.readOnly || t.noDelete) throw new Error("الحذف غير مسموح في هذا الجدول");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from as any)(t.name).delete().eq(t.key, data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("profile_audit_log").insert({
      user_id: context.userId,
      action: "data_delete",
      details: { table: t.name, id: data.id },
    });
    return { ok: true };
  });

// Accounts: list sign-in accounts with last sign-in time, and update email/password/name.
export const listAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ search: z.string().max(200).default("") }).parse(d))
  .handler(async ({ data, context }) => {
    await authorize(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const all: { id: string; email: string; last_sign_in_at: string | null; created_at: string }[] = [];
    for (let page = 1; page <= 50; page++) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      for (const u of list.users)
        all.push({ id: u.id, email: u.email ?? "", last_sign_in_at: u.last_sign_in_at ?? null, created_at: u.created_at });
      if (list.users.length < 200) break;
    }
    const ids = all.map((u) => u.id);
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, phone").in("id", ids),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
    ]);
    const s = data.search.trim().toLowerCase();
    return all
      .map((u) => {
        const p = profiles?.find((x) => x.id === u.id);
        return {
          ...u,
          full_name: p?.full_name ?? "",
          phone: p?.phone ?? "",
          roles: (roles ?? []).filter((r) => r.user_id === u.id).map((r) => r.role as string),
        };
      })
      .filter((u) => !s || u.email.toLowerCase().includes(s) || u.full_name.toLowerCase().includes(s))
      .sort((a, b) => (b.last_sign_in_at ?? "").localeCompare(a.last_sign_in_at ?? ""));
  });

export const updateAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        email: z.string().trim().email().max(255).optional(),
        password: z.string().min(8).max(128).optional(),
        full_name: z.string().trim().max(200).optional(),
        phone: z.string().trim().max(40).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await authorize(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: { email?: string; password?: string; email_confirm?: boolean } = {};
    if (data.email) { patch.email = data.email; patch.email_confirm = true; }
    if (data.password) patch.password = data.password;
    if (Object.keys(patch).length) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, patch);
      if (error) throw new Error(error.message);
    }
    if (data.full_name !== undefined || data.phone !== undefined) {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ full_name: data.full_name, phone: data.phone })
        .eq("id", data.userId);
      if (error) throw new Error(error.message);
    }
    await supabaseAdmin.from("profile_audit_log").insert({
      user_id: context.userId,
      action: "account_update",
      details: { target: data.userId, email: !!data.email, password: !!data.password },
    });
    return { ok: true };
  });
