import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

interface NotificationRecord {
  id: string;
  title: string;
  message: string;
  kind: string;
  link: string | null;
}

interface WebhookPayload {
  type: string;
  table: string;
  schema: string;
  record: NotificationRecord | null;
}

interface Delivery {
  delivery_id: string;
  expo_push_token: string;
  platform: "android" | "ios";
}

function ticketIdFromLink(link: string | null): string | null {
  return link?.match(/\/console\/tickets\/([0-9a-f-]{36})/i)?.[1] ?? null;
}

export default {
  fetch: withSupabase({ auth: "secret" }, async (request, context) => {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const payload = (await request.json()) as WebhookPayload;
    if (
      payload.type !== "INSERT" ||
      payload.schema !== "public" ||
      payload.table !== "user_notifications" ||
      !payload.record
    ) {
      return Response.json({ ignored: true });
    }

    const notification = payload.record;
    const { data, error } = await context.supabaseAdmin.rpc(
      "claim_mobile_push_deliveries",
      { p_notification_id: notification.id, p_limit: 100 },
    );
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const results: Array<{ id: string; sent: boolean }> = [];
    for (const delivery of (data ?? []) as Delivery[]) {
      let sent = false;
      let expoTicketId: string | null = null;
      let lastError: string | null = null;

      for (let attempt = 0; attempt < 3 && !sent; attempt += 1) {
        try {
          const response = await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: delivery.expo_push_token,
              title: notification.title,
              body: notification.message,
              sound: "default",
              priority: "high",
              channelId: delivery.platform === "android" ? "default" : undefined,
              data: {
                notificationId: notification.id,
                kind: notification.kind,
                ticketId: ticketIdFromLink(notification.link),
                link: notification.link,
              },
            }),
          });
          const body = await response.json();
          const ticket = body.data ?? body;
          sent = response.ok && ticket.status === "ok";
          expoTicketId = ticket.id ?? null;
          lastError = sent
            ? null
            : String(ticket.message ?? ticket.details?.error ?? "Push delivery failed");

          if (ticket.details?.error === "DeviceNotRegistered") {
            await context.supabaseAdmin
              .from("mobile_push_devices")
              .update({ active: false, updated_at: new Date().toISOString() })
              .eq("expo_push_token", delivery.expo_push_token);
            break;
          }
        } catch (sendError) {
          lastError =
            sendError instanceof Error ? sendError.message : "Push delivery failed";
        }
      }

      await context.supabaseAdmin
        .from("mobile_push_deliveries")
        .update({
          status: sent ? "sent" : "failed",
          expo_ticket_id: expoTicketId,
          sent_at: sent ? new Date().toISOString() : null,
          last_error: lastError?.slice(0, 500) ?? null,
          next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", delivery.delivery_id);
      results.push({ id: delivery.delivery_id, sent });
    }

    return Response.json({ processed: results.length, results });
  }),
};
