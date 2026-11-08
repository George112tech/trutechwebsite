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
};

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
    .select('id, client_name, title, message, kind, status, allow_download, active, expires_at, viewed_at, created_at')
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

async function getDelivery(req: Request, token: string | null) {
  const d = await findDelivery(token);
  if (!d) return json(req, 404, { error: 'not_found' });

  const [{ data: files, error: filesError }, { data: links, error: linksError }, { data: reviews }, whatsapp] = await Promise.all([
    db.from('site_delivery_files').select('id, path, name, size, mime').eq('delivery_id', d.id).order('sort_order').order('created_at'),
    d.allow_download
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
      const download = d.allow_download ? await bucket.createSignedUrl(f.path, LINK_TTL, { download: f.name }) : null;
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
    allow_download: d.allow_download,
    created_at: d.created_at,
    files: items,
    links: (links ?? []).map((l) => ({ id: l.id, format: l.format, label: l.label, url: directDownload(l.url) })),
    reviews: reviews ?? [],
    whatsapp,
  });
}

async function postReview(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(req, 400, { error: 'bad_request' });
  }
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
    if (req.method === 'POST') return await postReview(req);
    return json(req, 405, { error: 'method_not_allowed' });
  } catch (e) {
    console.error(e);
    return json(req, 500, { error: 'server_error' });
  }
});
