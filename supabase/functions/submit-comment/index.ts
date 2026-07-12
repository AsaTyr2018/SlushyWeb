import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) => new Response(
  JSON.stringify(body),
  { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
);

const digest = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
};

const verifyTurnstile = async (token: string, ip: string) => {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return true;

  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  if (ip) form.set("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  const result = await response.json();
  return result.success === true;
};

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const payload = await request.json();
    const recipeId = String(payload.recipe_id ?? "").trim();
    const authorName = String(payload.author_name ?? "").trim();
    const body = String(payload.body ?? "").trim();
    const language = payload.language === "en" ? "en" : "de";
    const honeypot = String(payload.website ?? "").trim();
    const elapsed = Number(payload.elapsed_ms ?? 0);
    const turnstileToken = String(payload.turnstile_token ?? "");

    if (honeypot || elapsed < 2500) return json({ error: "spam_rejected" }, 400);
    if (!/^[a-z0-9-]{1,64}$/.test(recipeId)) return json({ error: "invalid_recipe" }, 400);
    if (authorName.length < 2 || authorName.length > 60) return json({ error: "invalid_name" }, 400);
    if (body.length < 3 || body.length > 1200) return json({ error: "invalid_comment" }, 400);

    const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
    if (!await verifyTurnstile(turnstileToken, ip)) return json({ error: "captcha_failed" }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const salt = Deno.env.get("RATE_LIMIT_SALT") ?? serviceKey.slice(-24);
    const clientHash = await digest(`${ip}:${salt}`);
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

    const { data: rate } = await supabase
      .from("comment_rate_limits")
      .select("window_started_at, attempts")
      .eq("client_hash", clientHash)
      .maybeSingle();

    const windowMs = 15 * 60 * 1000;
    const withinWindow = rate && Date.now() - new Date(rate.window_started_at).getTime() < windowMs;
    if (withinWindow && rate.attempts >= 5) return json({ error: "rate_limited" }, 429);

    const nextRate = withinWindow
      ? { client_hash: clientHash, window_started_at: rate.window_started_at, attempts: rate.attempts + 1 }
      : { client_hash: clientHash, window_started_at: new Date().toISOString(), attempts: 1 };
    await supabase.from("comment_rate_limits").upsert(nextRate);

    const { error } = await supabase.from("comments").insert({
      recipe_id: recipeId,
      author_name: authorName,
      body,
      language,
      status: "pending",
    });
    if (error) throw error;

    return json({ accepted: true, status: "pending" }, 202);
  } catch (error) {
    console.error(error);
    return json({ error: "submission_failed" }, 500);
  }
});

