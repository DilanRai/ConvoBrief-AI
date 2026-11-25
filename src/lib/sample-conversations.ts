import type { ConversationSourceType, SummaryMode } from "@/types/convobrief";

export interface SampleConversationPreset {
  id: string;
  label: string;
  badge: string;
  sourceType: ConversationSourceType;
  recommendedMode: SummaryMode;
  transcript: string;
}

export const SAMPLE_CONVERSATIONS: SampleConversationPreset[] = [
  {
    id: "tech-incident",
    label: "Sev-1 Checkout Latency Incident",
    badge: "Technical / Engineering",
    sourceType: "meeting",
    recommendedMode: "technical",
    transcript: `[09:02:10] Elena Rostova: Good morning everyone, thanks for jumping on fast.
[09:02:18] Marcus Vance: Morning!
[09:02:22] Priya Nair: Hi team, I can hear you clearly.
[09:02:35] Elena Rostova: Since 08:40 UTC after deploying payment_service v2.4.1, Stripe checkout latency jumped from 180ms to 4200ms and HTTP 502 errors hit 14% of European transactions.
[09:03:12] Marcus Vance: Looking at Datadog right now. Previously in v2.3.9 our PostgreSQL connection pool stayed under 40% utilization, but right now primary connections are maxed out at 98%.
[09:04:05] Priya Nair: I found the root cause problem: the new fraud-check middleware runs an unindexed query on the webhook_events table on every checkout request, and Redis caching was accidentally bypassed when retry_flag is true.
[09:04:19] Priya Nair: Repeat alert from PagerDuty: PostgreSQL primary connection pool saturation at 98% on payment_service v2.4.1.
[09:05:01] Marcus Vance: Let's roll back v2.4.1 to v2.3.9 immediately so customers aren't blocked.
[09:05:45] Elena Rostova: Wait — if we roll back v2.4.1 completely, do we break the new PSD2 compliance token schema that migrated at 08:30 UTC?
[09:06:30] Priya Nair: Good catch. Rolling back the binary would fail on the migrated column. Instead, we can toggle the feature flag DISABLE_LIVE_WEBHOOK_SCAN in Redis within 2 minutes and deploy a concurrent PostgreSQL index on webhook_events(customer_id, created_at).
[09:07:15] Elena Rostova: Actually, instead of rolling back v2.4.1, we decided to disable the live scan via Redis feature flag immediately and apply the concurrent PostgreSQL index patch.
[09:07:48] Priya Nair: I will toggle DISABLE_LIVE_WEBHOOK_SCAN in production right now and monitor error rates within 15 minutes.
[09:08:20] Marcus Vance: I'll prepare and test the concurrent PostgreSQL index migration script by EOD Thursday so we can safely re-enable fraud scanning.
[09:08:55] Elena Rostova: We also need to draft an external SLA post-mortem report for Enterprise merchants affected by the 14% HTTP 502 spike.
[09:09:20] Marcus Vance: Risk to flag: if holiday traffic exceeds 10,000 req/s before PgBouncer pooling limits are tuned, we could hit connection exhaustion again.
[09:09:50] Priya Nair: One question before we drop — do we need Legal sign-off before sending fee credits to the affected German merchants?
[09:10:05] Elena Rostova: Thanks everyone, let's execute the mitigation now!`,
  },
  {
    id: "q3-roadmap-meeting",
    label: "Q3 Enterprise Launch & Pricing Sync",
    badge: "Executive / Meeting",
    sourceType: "meeting",
    recommendedMode: "meeting",
    transcript: `[14:00] David Kim: Hey everyone!
[14:00] Hannah Abbott: Hello David, good afternoon!
[14:01] Sofia Morales: Hi all, glad to be here.
[14:02] David Kim: Let's review our Q3 Enterprise SSO & Audit Log launch timeline for Acme Financial Corp and Horizon Bank.
[14:03] Hannah Abbott: Last quarter Acme Financial Corp requested SAML 2.0 SSO and automated SOC2 exports as a hard requirement for their $120,000 annual renewal.
[14:04] Sofia Morales: Engineering finished SAML 2.0 integration with Okta, but we hit a problem with bulk PDF audit exports timing out when workspaces exceed 500,000 events.
[14:05] David Kim: Initially I thought we should launch the full Enterprise tier on July 1st.
[14:06] Sofia Morales: I recommend moving large audit exports to an asynchronous background worker with S3 signed download links, which takes 6 engineering days.
[14:07] Hannah Abbott: If July 1st is risky, Horizon Bank told me they prefer a rock-solid release over an unstable early build, as long as we ship before July 15.
[14:08] David Kim: Agreed. Instead of launching on July 1st, we decided to move the Enterprise tier launch date to July 14, 2026 and adopt the asynchronous S3 export architecture.
[14:09] Sofia Morales: I will implement the asynchronous S3 audit export worker and load-test 1 million events by July 8, 2026.
[14:10] Hannah Abbott: Hannah Abbott will send the updated July 14 release schedule and sandbox credentials to Acme Financial Corp by Friday at 5pm.
[14:11] David Kim: The enterprise pricing page copy also needs to be updated with the new seat minimums.
[14:12] Hannah Abbott: Should we grandfather existing Pro workspaces at $49/seat or migrate them automatically in Q4?`,
  },
  {
    id: "whatsapp-multilingual",
    label: "Global Logistics WhatsApp Thread",
    badge: "WhatsApp / Multilingual",
    sourceType: "whatsapp",
    recommendedMode: "detailed",
    transcript: `[18/05/2026, 09:15:02] Messages and calls are end-to-end encrypted. No one outside of this chat can read or listen to them.
[18/05/2026, 09:15:20] Carlos Mendez: Hola equipo! Good morning everyone.
[18/05/2026, 09:15:45] Claire Dubois: Bonjour Carlos! Hi Liam!
[18/05/2026, 09:16:02] Liam O'Connor: Morning! 👍
[18/05/2026, 09:17:10] Carlos Mendez: Tenemos un problema en el puerto de Valencia: customs inspection delayed 400 smart-sensor units scheduled for the Berlin warehouse.
[18/05/2026, 09:18:30] Claire Dubois: <Media omitted>
[18/05/2026, 09:19:05] Claire Dubois: We have 180 backup units in our Lyon hub that we can ship via express freight to Berlin within 24 hours so the client demo isn't blocked.
[18/05/2026, 09:20:15] Liam O'Connor: That solves the immediate gap! Acordamos enviar the 180 backup units from Lyon to Berlin today and route the remaining Valencia shipment directly to Munich once customs clears.
[18/05/2026, 09:21:10] Claire Dubois: Je vais book the DHL express freight from Lyon before 14:00 today.
[18/05/2026, 09:22:00] Carlos Mendez: Voy a enviar los certificados CE actualizados al agente de aduanas para el viernes.
[18/05/2026, 09:23:12] Liam O'Connor: Who covers the extra €1,400 express freight surcharge under the distributor contract?
[18/05/2026, 09:23:40] Carlos Mendez: Gracias!`,
  },
  {
    id: "email-support",
    label: "Enterprise API Rate-Limit Email Thread",
    badge: "Email / Support",
    sourceType: "email",
    recommendedMode: "executive",
    transcript: `From: Jordan Blake <j.blake@vanguardhealth.org>
To: Enterprise Support <support@cloudscale.io>
Date: Mon, 18 May 2026 11:14:00 +0000
Subject: Urgent: Production HL7 Sync hitting HTTP 429 limits

Our nightly patient appointment sync for Vanguard Health Systems started failing at 02:00 EST with HTTP 429 Too Many Requests after onboarding 12 regional clinics. Currently 8,500 patient reminders are delayed. We need our API quota raised from 600 req/min to 3,000 req/min immediately or a batch ingestion endpoint.

From: Nina Patel <nina.patel@cloudscale.io>
To: Jordan Blake <j.blake@vanguardhealth.org>
Date: Mon, 18 May 2026 11:42:00 +0000
Subject: Re: Urgent: Production HL7 Sync hitting HTTP 429 limits

Hi Jordan, I investigated your workspace telemetry. The spike comes from polling individual patient records sequentially instead of using our /v2/appointments/bulk endpoint (which processes 200 records per call).
We decided to approve an immediate temporary burst quota increase to 2,500 req/min for 14 days so your backlog clears today.
Nina Patel will apply the 2,500 req/min burst quota override within 1 hour.
Please migrate the clinic sync connector to /v2/appointments/bulk by June 1, 2026 to maintain sub-100ms SLA performance.
One open question: does your HIPAA BAA addendum already cover the new Midwest clinic tenant IDs?`,
  },
  {
    id: "chatgpt-architecture",
    label: "ChatGPT Event-Driven Architecture Session",
    badge: "ChatGPT Transcript",
    sourceType: "chatgpt",
    recommendedMode: "quick",
    transcript: `User: Hi ChatGPT!
ChatGPT: Hello! How can I help you today?
User: Our monolithic FastAPI billing service takes 18 seconds to generate PDF invoices synchronously during checkout, causing browser timeouts when traffic spikes above 300 concurrent users.
ChatGPT: Generating PDFs synchronously inside the checkout HTTP request lifecycle ties up FastAPI worker threads. I recommend decoupling invoice rendering by publishing an InvoiceRequested event to Redis Streams or RabbitMQ, returning HTTP 202 Accepted immediately with an order receipt, and running dedicated worker pods to render PDFs and upload them to AWS S3.
User: Should we use RabbitMQ or PostgreSQL LISTEN/NOTIFY if we already run PostgreSQL 16 and process 15,000 invoices per day?
ChatGPT: At 15,000 invoices per day (~0.17 jobs/sec average, ~5 jobs/sec peak), introducing RabbitMQ adds unnecessary operational overhead. Using a PostgreSQL-backed job queue table with FOR UPDATE SKIP LOCKED gives transactional outbox guarantees with zero extra infrastructure.
User: That makes total sense. We decided to use PostgreSQL FOR UPDATE SKIP LOCKED for the async invoice queue instead of adding RabbitMQ, and store rendered PDFs in AWS S3. We also need to configure dead-letter retry alerts after 3 failed render attempts.`,
  },
];
