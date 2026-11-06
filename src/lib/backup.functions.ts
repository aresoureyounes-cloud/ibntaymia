import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BACKUP_TABLES, toCsv } from "@/lib/backup";

// Full export for the desktop backup. Admin or developer only, checked with the caller-scoped client.
export const exportBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    let ok = false;
    for (const r of ["developer", "admin"] as const) {
      const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: r });
      if (data === true) { ok = true; break; }
    }
    if (!ok) throw new Error("النسخ الاحتياطي للمسؤول أو المبرمج فقط");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const files: Record<string, string> = {};
    const counts: Record<string, number> = {};
    for (const table of BACKUP_TABLES) {
      const rows: Record<string, unknown>[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await (supabaseAdmin.from as any)(table).select("*").range(from, from + 999);
        if (error) throw new Error(`${table}: ${error.message}`);
        rows.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      counts[table] = rows.length;
      files[`${table}.json`] = JSON.stringify(rows);
      files[`${table}.csv`] = toCsv(rows);
    }
    files["manifest.json"] = JSON.stringify({ created_at: new Date().toISOString(), counts }, null, 2);
    return { files, counts };
  });
