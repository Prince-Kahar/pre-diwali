// Supabase Edge Function: handle-payment-webhook
// Cryptographic Webhook Signature Verification & Idempotent Processing

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hmac } from "https://deno.land/x/hmac@v2.0.1/mod.ts";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
    if (!webhookSecret) {
      return new Response("Webhook secret not configured on server", { status: 500 });
    }

    const signature = req.headers.get("x-razorpay-signature");
    if (!signature) {
      return new Response("Missing webhook signature header", { status: 400 });
    }

    const rawBody = await req.text();

    // Verify HMAC SHA-256 signature
    const expectedSignature = hmac("sha256", webhookSecret, rawBody, "utf8", "hex");
    if (signature !== expectedSignature) {
      return new Response("Invalid webhook signature", { status: 400 });
    }

    const payload = JSON.parse(rawBody);
    const eventType = payload.event;
    const eventId = payload.id || `evt_${Date.now()}`;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Check Idempotency: Prevent duplicate processing of the same webhook event
    const { data: existingEvent } = await supabase
      .from("payment_webhook_events")
      .select("id")
      .eq("provider", "RAZORPAY")
      .eq("provider_event_id", eventId)
      .maybeSingle();

    if (existingEvent) {
      return new Response(JSON.stringify({ status: "already_processed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Record Webhook Event
    await supabase.from("payment_webhook_events").insert({
      provider: "RAZORPAY",
      provider_event_id: eventId,
      processing_status: "PROCESSING",
      payload_snapshot: payload,
    });

    // 3. Process payment.captured event
    if (eventType === "payment.captured") {
      const paymentEntity = payload.payload?.payment?.entity;
      const orderId = paymentEntity?.order_id;
      const paymentId = paymentEntity?.id;
      const amount = paymentEntity?.amount; // minor units (paise)
      const notes = paymentEntity?.notes || {};
      const registrationId = notes.registration_id;

      if (registrationId) {
        // Authoritatively verify expected amount matches database
        const { data: reg } = await supabase
          .from("registrations")
          .select("id, expected_amount_minor_units")
          .eq("id", registrationId)
          .single();

        if (reg && reg.expected_amount_minor_units === amount) {
          // Update Registration to PAID
          await supabase
            .from("registrations")
            .update({ payment_status: "PAID", updated_at: new Date().toISOString() })
            .eq("id", registrationId);

          // Insert or Update Payment record
          await supabase.from("payments").upsert({
            registration_id: registrationId,
            provider: "RAZORPAY",
            provider_order_id: orderId,
            provider_payment_id: paymentId,
            expected_amount_minor_units: amount,
            currency: "INR",
            status: "PAID",
            verification_method: "GATEWAY_SIGNATURE",
            verified_at: new Date().toISOString(),
          }, { onConflict: "provider_order_id" });

          // Generate Unique Pass Token & SHA-256 Hash
          const randomBytes = new Uint8Array(24);
          crypto.getRandomValues(randomBytes);
          const rawToken = `PREDIWALI_PASS_${Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
          
          const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawToken));
          const tokenHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

          // Issue Entry Pass
          await supabase.from("entry_passes").insert({
            registration_id: registrationId,
            token_hash: tokenHash,
            status: "VALID",
            issued_at: new Date().toISOString(),
          });
        }
      }
    }

    // Mark webhook as PROCESSED
    await supabase
      .from("payment_webhook_events")
      .update({ processing_status: "PROCESSED", processed_at: new Date().toISOString() })
      .eq("provider", "RAZORPAY")
      .eq("provider_event_id", eventId);

    return new Response(JSON.stringify({ status: "success" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Webhook handler failed";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
