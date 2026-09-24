import { createFileRoute } from "@tanstack/react-router";

/**
 * Public, read-only endpoint consumed by the `idaroom` Linux CLI.
 * Returns app version, release notes and service health so terminal
 * commands (`idaroom status`, `idaroom health`, `idaroom version --json`)
 * can work without opening a desktop window.
 */
export const Route = createFileRoute("/api/public/cli")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;

        let version = { version: "unknown", releaseDate: "", notes: [] as string[] };
        let webOk = false;
        try {
          const res = await fetch(`${origin}/version.json`, { headers: { accept: "application/json" } });
          webOk = res.ok;
          if (res.ok) version = await res.json();
        } catch {
          webOk = false;
        }

        const supabaseUrl = process.env.VITE_SUPABASE_URL ?? "";
        let dbOk = false;
        if (supabaseUrl) {
          try {
            const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
              headers: { apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "" },
            });
            dbOk = res.ok;
          } catch {
            dbOk = false;
          }
        }

        return new Response(
          JSON.stringify({
            app: "IDAROOM",
            origin,
            version: version.version,
            releaseDate: version.releaseDate,
            notes: version.notes,
            services: { web: webOk, backend: dbOk },
            healthy: webOk && dbOk,
            time: new Date().toISOString(),
          }),
          { headers: { "content-type": "application/json", "cache-control": "no-store" } },
        );
      },
    },
  },
});
