import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/telegram-dispatch")({
  server: { handlers: { POST: async ({ request }) => {
    const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
    const rejected = await authenticateCronRequest(request);
    if (rejected) return rejected;
    const gatewayKey = process.env["LOVABLE_API_KEY"];
    const connectionKey = process.env["TELEGRAM_API_KEY"];
    if (!gatewayKey || !connectionKey) return Response.json({ error: "Telegram not configured" }, { status: 503 });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { dispatchTelegramAlerts } = await import("@/lib/telegram-alerts.server");
    const result = await dispatchTelegramAlerts(supabaseAdmin, gatewayKey, connectionKey, "https://idara25.lovable.app");
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } } },
});