// Client portal for the Trutech Business website.
//
// Clients open a private link (/client/#<token>). The page calls this
// function, which looks the token up with the service role and returns the
// delivery: its message, short-lived links to the files, download links
// (when downloads are allowed) and earlier reviews. Clients can't read the
// tables or the private bucket themselves.
//
//   GET  ?t=<token>                              → the delivery
//   POST { t, name, decision, rating?, comment } → saves a review
//   POST { action: "pay", t, email, name?, return_url }
//                                                → starts a checkout
//   POST { action: "verify", t, pay? }           → checks whether it was paid
//
// Paid downloads: on a final delivery the admin can ask for a fixed amount
// through Paystack or SeevPlus. Until the provider itself says the payment
// succeeded (asked server to server, with the secret key, for at least the
// amount due, in GHS), no download link leaves this function: the Google
// Drive links are held back and the uploaded files are sent as previews only.
// The browser is never trusted about a payment. The secret keys are the ones
// saved in the admin (Settings); the PAYSTACK_SECRET_KEY and
// SEEVPLUS_SECRET_KEY function secrets are the fallback.
//
// Deployed with verify_jwt off: the token in the link is the credential.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Where the website is served from: GitHub Pages, Cloudflare Pages (the main
// address and each build's own address, like https://21e0341f.trutechwebsite.pages.dev)
// and local development.
const ORIGINS = [
  'https://ridgevalley111243.github.io',
  'https://trutechwebsite.pages.dev',
  'http://localhost:4321',
  'http://localhost:4599',
];
const allowed = (origin: string) => ORIGINS.includes(origin) || /^https:\/\/[a-z0-9-]+\.trutechwebsite\.pages\.dev$/.test(origin);
const LINK_TTL = 60 * 60 * 6; // signed file links last 6 hours
const MAX_REVIEWS = 50;

const PAYSTACK = 'https://api.paystack.co';
const SEEVPLUS = 'https://api.seevplus.com/api/v1/developer/payments';
type Provider = 'paystack' | 'seevplus';
// Amounts go to both providers in pesewas: GHS 5.00 is 500.
const toPesewas = (ghs: number) => Math.round(ghs * 100);
// Words SeevPlus may use for a payment's state.
const SEEV_PAID = new Set(['paid', 'success', 'successful', 'succeeded', 'completed', 'complete', 'approved', 'settled']);
const SEEV_FAILED = new Set(['failed', 'failure', 'declined', 'cancelled', 'canceled', 'reversed', 'rejected', 'error', 'expired']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Delivery = {
  id: string;
  client_name: string;
  title: string;
  message: string;
  kind: 'review' | 'delivery';
  status: string;
  allow_download: boolean;
  active: boolean;
  expires_at: string | null;
  viewed_at: string | null;
  created_at: string;
  pay_provider: Provider | null;
  pay_amount: number | null;
  paid_at: string | null;
  paid_reference: string | null;
};

type Payment = {
  id: string;
  delivery_id: string;
  provider: Provider;
  amount: number;
  reference: string | null;
  status: 'creating' | 'pending' | 'paid' | 'failed';
};

/** A final delivery with a provider and an amount asks for payment. */
const needsPayment = (d: Delivery) => d.kind === 'delivery' && Boolean(d.pay_provider) && Number(d.pay_amount) > 0;
/** Downloads stay locked until the payment is confirmed. */
const locked = (d: Delivery) => needsPayment(d) && !d.paid_at;

function cors(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': allowed(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  };
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function findDelivery(token: unknown): Promise<Delivery | null> {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const { data, error } = await db
    .from('site_deliveries')
    .select(
      'id, client_name, title, message, kind, status, allow_download, active, expires_at, viewed_at, created_at, pay_provider, pay_amount, paid_at, paid_reference',
    )
    .eq('token', token)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.active) return null;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null;
  return data as Delivery;
}

// A Google Drive file shared as "Anyone with the link" downloads straight
// away from this address; other links are used as they are.
function directDownload(url: string) {
  try {
    const u = new URL(url);
    if (u.hostname !== 'drive.google.com') return url;
    const id = u.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] ?? u.searchParams.get('id');
    return id ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}` : url;
  } catch {
    return url;
  }
}

async function ownerWhatsapp(): Promise<string> {
  const { data } = await db.from('site_settings').select('data').eq('id', 1).maybeSingle();
  return String(data?.data?.whatsapp ?? '').replace(/\D/g, '');
}

/* ---------- payments ---------- */

async function secretKey(provider: Provider): Promise<string | null> {
  const { data } = await db.rpc('site_get_payment_key', { p_provider: provider });
  return (data as string) || Deno.env.get(provider === 'paystack' ? 'PAYSTACK_SECRET_KEY' : 'SEEVPLUS_SECRET_KEY') || null;
}

// The useful part of a SeevPlus reply, wherever they put it.
function seevPayload(body: any) {
  const d = body?.data ?? body ?? {};
  return d.payment ?? d.session ?? d;
}

function hostIs(url: unknown, domain: string) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' && (u.hostname === domain || u.hostname.endsWith('.' + domain));
  } catch {
    return false;
  }
}

/** Asks the provider for a checkout page. Returns its address and reference, or why not. */
async function startCheckout(d: Delivery, pay: { id: string; email: string; name: string; back: string }, key: string) {
  const amount = toPesewas(Number(d.pay_amount));
  const meta = { delivery_id: d.id, payment_id: pay.id, client: d.client_name, project: d.title };
  if (d.pay_provider === 'paystack') {
    const reference = `TT-${pay.id.replaceAll('-', '')}`;
    const res = await fetch(`${PAYSTACK}/transaction/initialize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: pay.email, amount, currency: 'GHS', reference, callback_url: pay.back, metadata: meta }),
    });
    const out = await res.json().catch(() => ({}));
    const url = out?.data?.authorization_url;
    if (!res.ok || out?.status !== true || !hostIs(url, 'paystack.com') || out?.data?.reference !== reference) {
      console.error('paystack initialize failed', res.status, JSON.stringify(out).slice(0, 600));
      return { error: String(out?.message ?? `Paystack answered ${res.status}`).slice(0, 300) };
    }
    return { url: String(url), reference };
  }
  const res = await fetch(SEEVPLUS, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Idempotency-Key': `tt_${pay.id}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'checkout',
      amount,
      currency: 'GHS',
      recipient: { name: pay.name, email: pay.email },
      redirect_url: pay.back,
      meta,
    }),
  });
  const out = await res.json().catch(() => ({}));
  const p = seevPayload(out);
  // SeevPlus must be charging exactly what we asked for.
  const amountOk = p.amount === undefined || Number(p.amount) === amount;
  if (!res.ok || out?.success === false || !hostIs(p.checkout_url, 'seevplus.com') || !p.reference || !amountOk) {
    console.error('seevplus create failed', res.status, JSON.stringify(out).slice(0, 600));
    const e = out?.error ?? out?.message;
    const why = !amountOk ? 'SeevPlus changed the amount' : typeof e === 'string' ? e : (e?.message ?? `SeevPlus answered ${res.status}`);
    return { error: String(why).slice(0, 300) };
  }
  return { url: String(p.checkout_url), reference: String(p.reference) };
}

/** What the provider says about one checkout: paid in full, failed, or still open. */
async function providerState(row: Payment, key: string): Promise<{ state: 'paid' | 'failed' | 'pending'; status: string; note?: string }> {
  const due = toPesewas(Number(row.amount));
  if (row.provider === 'paystack') {
    const res = await fetch(`${PAYSTACK}/transaction/verify/${encodeURIComponent(row.reference!)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const out = await res.json().catch(() => ({}));
    // Paystack answers 400 for a reference the client never opened.
    if (!res.ok || out?.status !== true) return { state: 'pending', status: `http ${res.status}` };
    const tx = out.data ?? {};
    const status = String(tx.status ?? '').toLowerCase();
    if (status === 'success') {
      if (tx.reference !== row.reference) return { state: 'pending', status, note: 'Reference does not match' };
      if (String(tx.currency).toUpperCase() !== 'GHS') return { state: 'pending', status, note: `Paid in ${tx.currency}, not GHS` };
      if (!(Number(tx.amount) >= due)) return { state: 'pending', status, note: `GHS ${(Number(tx.amount) / 100).toFixed(2)} was paid, GHS ${Number(row.amount).toFixed(2)} was due` };
      return { state: 'paid', status };
    }
    return { state: status === 'failed' || status === 'reversed' ? 'failed' : 'pending', status };
  }
  const res = await fetch(`${SEEVPLUS}/${encodeURIComponent(row.reference!)}`, { headers: { Authorization: `Bearer ${key}` } });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return { state: 'pending', status: `http ${res.status}` };
  const p = seevPayload(out);
  const status = String(p.status ?? p.payment_status ?? '').toLowerCase();
  if (SEEV_PAID.has(status)) {
    const paid = Number(p.amount_paid ?? p.paid_amount ?? p.amount);
    if (p.reference && String(p.reference) !== row.reference) return { state: 'pending', status, note: 'Reference does not match' };
    if (p.currency && String(p.currency).toUpperCase() !== 'GHS') return { state: 'pending', status, note: `Paid in ${p.currency}, not GHS` };
    // The checkout was made here for exactly the amount due, so a reply with
    // no amount is still this checkout; one with an amount must be enough.
    if (Number.isFinite(paid) && paid < due) return { state: 'pending', status, note: `GHS ${(paid / 100).toFixed(2)} was paid, GHS ${Number(row.amount).toFixed(2)} was due` };
    return { state: 'paid', status };
  }
  return { state: SEEV_FAILED.has(status) ? 'failed' : 'pending', status };
}

/** Checks one checkout with its provider and unlocks the delivery when it was paid. */
async function checkPayment(row: Payment): Promise<boolean> {
  const now = new Date().toISOString();
  const unlock = async () => {
    await db
      .from('site_deliveries')
      .update({ paid_at: now, paid_reference: `${row.provider}:${row.reference}` })
      .eq('id', row.delivery_id)
      .is('paid_at', null);
  };
  if (row.status === 'paid') {
    await unlock();
    return true;
  }
  if (!row.reference || row.status !== 'pending') return false;
  const key = await secretKey(row.provider);
  if (!key) return false;
  let result: Awaited<ReturnType<typeof providerState>>;
  try {
    result = await providerState(row, key);
  } catch (e) {
    console.error('payment check failed', row.provider, row.reference, e);
    return false;
  }
  if (result.state === 'paid') {
    const { error } = await db
      .from('site_delivery_payments')
      .update({ status: 'paid', provider_status: result.status, paid_at: now, checked_at: now, error: null })
      .eq('id', row.id);
    if (error) throw error;
    await unlock();
    return true;
  }
  if (result.note) console.error('payment needs checking', row.provider, row.reference, result.note);
  await db
    .from('site_delivery_payments')
    .update({ status: result.state, provider_status: result.status, checked_at: now, error: result.note ?? null })
    .eq('id', row.id);
  return false;
}

/** Re-checks the delivery's open checkouts from the last two days. True when one was paid. */
async function checkOpenPayments(d: Delivery): Promise<boolean> {
  const { data: rows } = await db
    .from('site_delivery_payments')
    .select('id, delivery_id, provider, amount, reference, status')
    .eq('delivery_id', d.id)
    .in('status', ['pending', 'paid'])
    .gte('created_at', new Date(Date.now() - 2 * 86400e3).toISOString())
    .order('created_at', { ascending: false })
    .limit(5);
  for (const row of (rows ?? []) as Payment[]) if (await checkPayment(row)) return true;
  return false;
}

async function startPayment(req: Request, body: Record<string, unknown>) {
  const d = await findDelivery(body.t);
  if (!d) return json(req, 404, { error: 'not_found' });
  if (!needsPayment(d)) return json(req, 400, { error: 'no_payment' });
  if (!locked(d) || (await checkOpenPayments(d))) return json(req, 200, { paid: true });

  const email = String(body.email ?? '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(req, 400, { error: 'bad_email' });
  const name = String(body.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) || d.client_name;
  // Where the provider sends the client back to: the client page they came from.
  let back: URL;
  try {
    back = new URL(String(body.return_url ?? ''));
  } catch {
    return json(req, 400, { error: 'bad_return' });
  }
  if (!allowed(back.origin) || !/\/client\/?$/.test(back.pathname)) return json(req, 400, { error: 'bad_return' });

  const provider = d.pay_provider!;
  const key = await secretKey(provider);
  if (!key) return json(req, 503, { error: 'not_set_up' });

  // At most 5 unfinished checkouts per delivery per hour.
  const { count } = await db
    .from('site_delivery_payments')
    .select('id', { count: 'exact', head: true })
    .eq('delivery_id', d.id)
    .in('status', ['creating', 'pending'])
    .gte('created_at', new Date(Date.now() - 3600e3).toISOString());
  if ((count ?? 0) >= 5) return json(req, 429, { error: 'too_many' });

  const id = crypto.randomUUID();
  const { error: insertError } = await db
    .from('site_delivery_payments')
    .insert({ id, delivery_id: d.id, provider, amount: d.pay_amount, payer_name: name, payer_email: email, status: 'creating' });
  if (insertError) throw insertError;

  let started: Awaited<ReturnType<typeof startCheckout>>;
  try {
    started = await startCheckout(d, { id, email, name, back: `${back.origin}${back.pathname}?pay=${id}` }, key);
  } catch (e) {
    console.error('checkout could not be started', provider, e);
    started = { error: 'The payment provider could not be reached' };
  }
  if ('error' in started) {
    await db.from('site_delivery_payments').update({ status: 'failed', error: started.error }).eq('id', id);
    return json(req, 502, { error: 'provider_failed' });
  }
  const { error: saveError } = await db
    .from('site_delivery_payments')
    .update({ reference: started.reference, checkout_url: started.url, status: 'pending' })
    .eq('id', id);
  if (saveError) throw saveError;
  return json(req, 200, { payment: id, checkout_url: started.url });
}

async function verifyPayment(req: Request, body: Record<string, unknown>) {
  const d = await findDelivery(body.t);
  if (!d) return json(req, 404, { error: 'not_found' });
  if (!needsPayment(d)) return json(req, 400, { error: 'no_payment' });
  if (!locked(d)) return json(req, 200, { paid: true });
  if (typeof body.pay === 'string' && UUID.test(body.pay)) {
    const { data: row } = await db
      .from('site_delivery_payments')
      .select('id, delivery_id, provider, amount, reference, status')
      .eq('id', body.pay)
      .eq('delivery_id', d.id)
      .maybeSingle();
    if (row && (await checkPayment(row as Payment))) return json(req, 200, { paid: true });
  }
  return json(req, 200, { paid: await checkOpenPayments(d) });
}

/* ---------- the delivery ---------- */

async function getDelivery(req: Request, token: string | null) {
  let d = await findDelivery(token);
  if (!d) return json(req, 404, { error: 'not_found' });
  // A client who paid and then closed the page: unlock when they come back.
  if (locked(d) && (await checkOpenPayments(d))) d = (await findDelivery(token)) ?? d;
  const isLocked = locked(d);
  // Paying unlocks the downloads; otherwise the admin's switch decides.
  const canDownload = !isLocked && (d.allow_download || needsPayment(d));

  const [{ data: files, error: filesError }, { data: links, error: linksError }, { data: reviews }, whatsapp] = await Promise.all([
    db.from('site_delivery_files').select('id, path, name, size, mime').eq('delivery_id', d.id).order('sort_order').order('created_at'),
    canDownload || isLocked
      ? db.from('site_delivery_links').select('id, format, label, url').eq('delivery_id', d.id).order('sort_order').order('created_at')
      : Promise.resolve({ data: [], error: null }),
    db
      .from('site_delivery_reviews')
      .select('reviewer_name, decision, rating, comment, created_at')
      .eq('delivery_id', d.id)
      .order('created_at'),
    ownerWhatsapp(),
  ]);
  if (filesError) throw filesError;
  if (linksError) throw linksError;

  const bucket = db.storage.from('client-files');
  const items = await Promise.all(
    (files ?? []).map(async (f) => {
      const view = await bucket.createSignedUrl(f.path, LINK_TTL);
      const download = canDownload ? await bucket.createSignedUrl(f.path, LINK_TTL, { download: f.name }) : null;
      return { id: f.id, name: f.name, size: f.size, mime: f.mime, url: view.data?.signedUrl ?? null, download: download?.data?.signedUrl ?? null };
    }),
  );

  if (!d.viewed_at) await db.from('site_deliveries').update({ viewed_at: new Date().toISOString() }).eq('id', d.id);

  return json(req, 200, {
    client_name: d.client_name,
    title: d.title,
    message: d.message,
    kind: d.kind,
    status: d.status,
    allow_download: canDownload,
    created_at: d.created_at,
    files: items,
    // While payment is due, the client sees which formats are waiting but
    // never their links.
    links: (links ?? []).map((l) => ({ id: l.id, format: l.format, label: l.label, url: isLocked ? null : directDownload(l.url) })),
    payment: needsPayment(d)
      ? { required: true, paid: !isLocked, provider: d.pay_provider, amount: Number(d.pay_amount), currency: 'GHS' }
      : { required: false },
    reviews: reviews ?? [],
    whatsapp,
  });
}

async function postReview(req: Request, body: Record<string, unknown>) {
  const d = await findDelivery(body.t);
  if (!d) return json(req, 404, { error: 'not_found' });

  const decision = String(body.decision ?? '');
  if (!['approve', 'changes', 'feedback'].includes(decision)) return json(req, 400, { error: 'bad_decision' });
  const name = String(body.name ?? '').trim().slice(0, 120);
  const comment = String(body.comment ?? '').trim().slice(0, 4000);
  const rating = Number.isInteger(body.rating) && (body.rating as number) >= 1 && (body.rating as number) <= 5 ? body.rating : null;
  if (decision === 'changes' && !comment) return json(req, 400, { error: 'comment_required' });

  const { count } = await db.from('site_delivery_reviews').select('id', { count: 'exact', head: true }).eq('delivery_id', d.id);
  if ((count ?? 0) >= MAX_REVIEWS) return json(req, 429, { error: 'too_many' });

  const { error } = await db.from('site_delivery_reviews').insert({ delivery_id: d.id, reviewer_name: name, decision, rating, comment });
  if (error) throw error;

  const status =
    decision === 'changes' ? 'changes_requested' : decision === 'approve' ? (d.kind === 'delivery' ? 'delivered' : 'approved') : null;
  if (status) await db.from('site_deliveries').update({ status }).eq('id', d.id);

  return json(req, 200, { ok: true, whatsapp: await ownerWhatsapp() });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  try {
    if (req.method === 'GET') return await getDelivery(req, new URL(req.url).searchParams.get('t'));
    if (req.method === 'POST') {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return json(req, 400, { error: 'bad_request' });
      }
      if (body.action === 'pay') return await startPayment(req, body);
      if (body.action === 'verify') return await verifyPayment(req, body);
      return await postReview(req, body);
    }
    return json(req, 405, { error: 'method_not_allowed' });
  } catch (e) {
    console.error(e);
    return json(req, 500, { error: 'server_error' });
  }
});
