import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

const sign = (body: string) => createHmac("sha256", "test-secret").update(body).digest("hex");
const URL = "/api/webhooks/bookings";

test("il webhook rifiuta richieste non autenticate", async ({ request }) => {
  const body = JSON.stringify([{ id: "x", type: "webhook.test", data: {} }]);
  expect((await request.post(URL, { data: body })).status()).toBe(401);
  expect((await request.post(URL, { data: body, headers: { "x-signature": "00".repeat(32) } })).status()).toBe(401);
  expect((await request.post(`${URL}?token=sbagliato`, { data: body })).status()).toBe(401);
});

test("accetta firma HMAC, Bearer o token nell'URL (senza sessione utente) e valida il JSON", async ({ request }) => {
  const body = "non è json";
  const viaSig = await request.post(URL, { data: body, headers: { "x-signature": sign(body) }, maxRedirects: 0 });
  expect(viaSig.status()).toBe(400);
  expect((await viaSig.json()).error.code).toBe("INVALID_JSON");
  expect((await request.post(`${URL}?token=test-secret`, { data: body })).status()).toBe(400);
  expect((await request.post(URL, { data: body, headers: { authorization: "Bearer test-secret" } })).status()).toBe(400);
});

test("un array vuoto è rifiutato", async ({ request }) => {
  expect((await request.post(`${URL}?token=test-secret`, { data: "[]" })).status()).toBe(400);
});

test("il webhook Stripe rifiuta richieste senza firma valida", async ({ request }) => {
  const res = await request.post("/api/webhooks/stripe", { data: "{}", headers: { "stripe-signature": "t=1,v1=00" } });
  expect([400, 503]).toContain(res.status());
});

test("il webhook dei lead rifiuta richieste non autenticate e accetta il token nell'URL", async ({ request }) => {
  const lead = { data: { "e-mail": "x@y.it" }, leadgenId: "1" };
  expect((await request.post("/api/webhooks/leads", { data: lead })).status()).toBe(401);
  expect((await request.post("/api/webhooks/leads?token=test-secret", { data: "[]" })).status()).toBe(400);
});
