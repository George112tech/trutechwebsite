// The admin app (src/pages/admin.astro): sign-in, portfolio, client work,
// settings and account. Everything is stored in Supabase; row level security
// only lets accounts listed in site_admins change anything.
import { createClient, type Session } from '@supabase/supabase-js';
import { CENTRED, CLIENT_PORTAL_URL, photoPos, photoPosStyle, STATUSES, SUPABASE_ANON_KEY, SUPABASE_URL, type PhotoPos } from '../lib/content';
import { esc } from '../lib/render';
import { DEFAULTS, GROUPS, type Field } from '../lib/texts';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'trutech-admin' },
});

const base = document.documentElement.dataset.base ?? '/';
const SITE = location.origin + base;
const MEDIA = 'site-media';
const FILES = 'client-files';
const MAX_CLIENT_FILE = 50 * 1024 * 1024; // the client-files bucket limit
// File formats offered for download links (see deliveryLinks in clientDetail).
const LINK_FORMATS = ['PNG', 'JPG', 'PDF', 'SVG', 'AI', 'EPS', 'PSD', 'AF', 'CDR', 'MP4', 'ZIP'];
const ICONS = ['tiktok', 'x', 'whatsapp', 'instagram', 'facebook', 'youtube', 'pinterest', 'telegram', 'snapchat', 'threads'];
const TYPES = ['Graphic design', 'Website', 'Web application', 'Management system', 'Digital commerce', 'Branding'];
const DELIVERY_STATUS: Record<string, string> = {
  awaiting_review: 'Awaiting review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  delivered: 'Delivered',
};

/* ---------- helpers ---------- */

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;
const main = () => $('[data-main]');
const attr = (v: unknown) => esc(String(v ?? ''));
const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
/** A link shown short: its site and the start of its path. */
const shortLink = (url: string) => {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 24 ? `${u.pathname.slice(0, 24)}…` : u.pathname;
    return u.hostname + path;
  } catch {
    return url;
  }
};
const ext = (name: string) => (name.includes('.') ? name.split('.').pop()!.toUpperCase().slice(0, 8) : 'FILE');
const oneLine = (v: FormDataEntryValue | null) => String(v ?? '').replace(/\s+/g, ' ').trim();
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'project';
const newToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
};
const clientLink = (token: string) => `${SITE}client/#${token}`;

let toastTimer: number | undefined;
function toast(message: string, bad = false) {
  const el = $('[data-toast]');
  el.textContent = message;
  el.classList.toggle('bad', bad);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), bad ? 6000 : 3500);
}

function friendly(error: unknown) {
  const e = error as { message?: string; code?: string; status?: number };
  if (e?.code === '23505') return 'Another project already uses this web address. Change the title or the address.';
  if (e?.code === '42501' || e?.status === 403) return 'Your account isn’t allowed to do that. Try signing in again.';
  if (e?.message?.includes('Failed to fetch')) return 'No connection. Check your internet and try again.';
  return e?.message ?? 'Something went wrong. Please try again.';
}

function show(view: 'loading' | 'login' | 'password' | 'app') {
  document.querySelectorAll<HTMLElement>('.adm > [data-view]').forEach((el) => (el.hidden = el.dataset.view !== view));
  if (view !== 'app') main().innerHTML = ''; // no admin data left on screen
  if (view === 'login') lockLogin();
}

/** An empty sign-in form that the browser can't fill in by itself. The fields
    stay read-only (which stops autofill) until they're touched or focused. */
function lockLogin() {
  const form = $<HTMLFormElement>('[data-login]');
  form.reset();
  form.querySelectorAll<HTMLInputElement>('[data-unlock]').forEach((input) => {
    input.value = '';
    input.readOnly = true;
  });
}

/** Upload with a progress callback (supabase-js uploads don't report progress). */
async function upload(bucket: string, path: string, file: Blob, contentType: string, onProgress?: (fraction: number) => void) {
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session has ended. Please sign in again.');
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
    xhr.setRequestHeader('Content-Type', contentType || 'application/octet-stream');
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('cache-control', 'max-age=31536000');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `Upload failed (${xhr.status}).`;
      try {
        message = JSON.parse(xhr.responseText).message ?? message;
      } catch {}
      if (xhr.status === 413 || /size/i.test(message)) message = 'That file is too large to upload.';
      if (/mime/i.test(message)) message = 'That file type can’t be used here.';
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
    xhr.send(file);
  });
}

/** Photos from a phone are large: convert to WebP, at most 1600px wide. */
async function optimiseImage(file: File): Promise<{ blob: Blob; type: string; ext: string }> {
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return { blob: file, type: file.type, ext: file.type === 'image/gif' ? 'gif' : 'svg' };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`“${file.name}” can’t be opened here. Please use a JPG, PNG or WebP image.`);
  }
  const scale = Math.min(1, 1600 / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.84));
  if (blob && blob.type === 'image/webp') return { blob, type: 'image/webp', ext: 'webp' };
  // No WebP here: keep PNGs as PNG so a transparent background stays transparent.
  if (file.type === 'image/png') {
    const png = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (png) return { blob: png, type: 'image/png', ext: 'png' };
  }
  const jpeg = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.86));
  if (!jpeg) throw new Error(`“${file.name}” couldn’t be converted.`);
  return { blob: jpeg, type: 'image/jpeg', ext: 'jpg' };
}

async function uploadImage(file: File, onProgress?: (f: number) => void, folder = 'projects') {
  const img = await optimiseImage(file);
  const path = `${folder}/${crypto.randomUUID()}.${img.ext}`;
  await upload(MEDIA, path, img.blob, img.type, onProgress);
  return sb.storage.from(MEDIA).getPublicUrl(path).data.publicUrl;
}

/** Paths of images this site uploaded (not the ones that ship with the website). */
const mediaPath = (url: string | null | undefined) => {
  const marker = `/storage/v1/object/public/${MEDIA}/`;
  return url && url.includes(marker) ? decodeURIComponent(url.split(marker)[1]) : null;
};

/* ---------- sign-in ---------- */

let session: Session | null = null;

async function enter() {
  const { data } = await sb.auth.getSession();
  session = data.session;
  if (!session) return show('login');
  const { data: admin, error } = await sb.from('site_admins').select('email, must_change_password').maybeSingle();
  if (error || !admin) {
    await sb.auth.signOut();
    session = null;
    show('login');
    const el = $('[data-login-error]');
    el.textContent = 'This account doesn’t have access to the website admin.';
    el.hidden = false;
    return;
  }
  if (admin.must_change_password) return show('password');
  show('app');
  route();
}

function setupGate() {
  $<HTMLFormElement>('[data-login]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const error = $('[data-login-error]');
    const button = $<HTMLButtonElement>('button', form);
    error.hidden = true;
    button.disabled = true;
    const data = new FormData(form);
    $<HTMLInputElement>('#l-password').value = ''; // never left in the form
    const { error: err } = await sb.auth.signInWithPassword({
      email: String(data.get('email')).trim(),
      password: String(data.get('password')),
    });
    button.disabled = false;
    if (err) {
      error.textContent = /invalid/i.test(err.message) ? 'Wrong email or password.' : friendly(err);
      error.hidden = false;
      return;
    }
    form.reset();
    enter();
  });

  $<HTMLFormElement>('[data-new-password]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const error = $('[data-password-error]');
    const data = new FormData(form);
    const password = String(data.get('password'));
    error.hidden = true;
    if (password.length < 10) return Object.assign(error, { hidden: false, textContent: 'Use at least 10 characters.' });
    if (password !== data.get('confirm')) return Object.assign(error, { hidden: false, textContent: 'The passwords don’t match.' });
    const { error: err } = await sb.auth.updateUser({ password });
    if (err) return Object.assign(error, { hidden: false, textContent: friendly(err) });
    await sb.rpc('site_password_changed');
    form.reset();
    toast('Password saved.');
    enter();
  });
}

/* ---------- router ---------- */

async function route() {
  if (!session) return;
  const [section = 'projects', id] = location.hash.replace(/^#\/?/, '').split('/');
  document.querySelectorAll<HTMLElement>('[data-nav]').forEach((a) =>
    a.dataset.nav === section ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'),
  );
  main().innerHTML = skeleton(Boolean(id) || section === 'settings' || section === 'texts' || section === 'account');
  main().setAttribute('aria-busy', 'true');
  window.scrollTo(0, 0);
  try {
    if (section === 'projects') await (id ? projectForm(id) : projectList());
    else if (section === 'clients') await (id ? clientDetail(id) : clientList());
    else if (section === 'settings') await settingsForm();
    else if (section === 'texts') await textsForm();
    else if (section === 'account') accountView();
    else location.hash = '#/projects';
  } catch (e) {
    main().innerHTML = `<p class="error">${attr(friendly(e))}</p>`;
  } finally {
    main().removeAttribute('aria-busy');
  }
}

/** Placeholder shaped like the view that's loading: a list or a form. */
function skeleton(form: boolean) {
  const line = (w: string) => `<span class="skel skel-line" style="width:${w}"></span>`;
  const head = `<div class="head"><div style="flex:1">${line('110px')}<span class="skel skel-title" style="width:min(70%,420px)"></span></div></div>`;
  const body = form
    ? [0, 1, 2]
        .map(() => `<section class="card panel">${line('140px')}<span class="skel" style="height:46px"></span>${line('100px')}<span class="skel" style="height:46px"></span></section>`)
        .join('')
    : `<ul class="list">${[0, 1, 2, 3]
        .map(() => `<li class="row"><span class="skel thumb"></span><span>${line('70%')}${line('45%')}</span><span class="skel skel-pill" style="width:72px;height:22px"></span></li>`)
        .join('')}</ul>`;
  return `<p class="sr-only" role="status">Loading…</p><div aria-hidden="true">${head}${body}</div>`;
}

/* ---------- portfolio ---------- */

async function projectList() {
  const { data, error } = await sb
    .from('site_projects')
    .select('id, slug, title, category, status, featured, published, cover, sort_order')
    .order('sort_order')
    .order('created_at');
  if (error) throw error;
  const rows = data ?? [];
  main().innerHTML = `
    <div class="head"><div><h1>Portfolio</h1><p class="hint">Everything on the Work page. Changes show on the site straight away.</p></div>
      <a class="btn btn-primary" href="#/projects/new">+ New project</a></div>
    ${
      rows.length
        ? `<ul class="list">${rows
            .map(
              (p) => `<li><a class="row" href="#/projects/${p.id}">
              ${p.cover ? `<img class="thumb" src="${attr(p.cover.startsWith('http') ? p.cover : base + p.cover.replace(/^\/+/, ''))}" alt="" loading="lazy" />` : '<span class="thumb" aria-hidden="true"></span>'}
              <span><strong>${esc(p.title)}</strong><small>${esc(p.category || 'No type')} · ${esc(p.status)}</small></span>
              <span class="pills">${p.featured ? '<span class="pill good">Home page</span>' : ''}${p.published ? '' : '<span class="pill warn">Hidden</span>'}<span class="pill muted">#${p.sort_order}</span></span>
            </a></li>`,
            )
            .join('')}</ul>`
        : '<p class="empty">No projects yet. Add your first one.</p>'
    }`;
}

type GalleryItem = { src: string; alt: string };

async function projectForm(id: string) {
  const isNew = id === 'new';
  let p: Record<string, any> = {
    title: '',
    slug: '',
    client: '',
    category: '',
    year: new Date().getFullYear(),
    status: 'Completed',
    summary: '',
    cover: null,
    gallery: [],
    services: [],
    link: '',
    featured: false,
    published: true,
    sort_order: 10,
    body: '',
  };
  if (!isNew) {
    const { data, error } = await sb.from('site_projects').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) {
      main().innerHTML = '<p class="error">This project no longer exists.</p><p><a href="#/projects">Back to portfolio</a></p>';
      return;
    }
    p = data;
  }
  const { data: cats } = await sb.from('site_projects').select('category');
  const types = [...new Set([...TYPES, ...(cats ?? []).map((c) => c.category).filter(Boolean)])];
  let cover: string | null = p.cover;
  let gallery: GalleryItem[] = Array.isArray(p.gallery) ? p.gallery.map((g: GalleryItem) => ({ src: g.src, alt: g.alt ?? '' })) : [];
  const uploaded: string[] = []; // uploaded while editing; deleted on save if no longer used
  const imgSrc = (src: string) => (src.startsWith('http') ? src : base + src.replace(/^\/+/, ''));

  main().innerHTML = `
    <a class="crumb" href="#/projects">← Portfolio</a>
    <div class="head"><h1>${isNew ? 'New project' : esc(p.title)}</h1>
      ${isNew ? '' : `<a class="btn btn-ghost btn-sm" href="${base}work/${attr(p.slug)}/" target="_blank" rel="noopener">View on site ↗</a>`}</div>
    <form data-project novalidate>
      <section class="card panel"><h2>About the project</h2>
        <div class="field"><label for="f-title">Title</label><textarea class="grow" rows="1" id="f-title" name="title" required maxlength="160">${attr(p.title)}</textarea></div>
        <div class="two">
          <div class="field"><label for="f-category">Type</label><input id="f-category" name="category" list="f-types" value="${attr(p.category)}" placeholder="e.g. Graphic design" />
            <p class="hint">The part before “·” becomes a filter on the Work page, e.g. “Web application · EdTech”.</p>
            <datalist id="f-types">${types.map((t) => `<option value="${attr(t)}"></option>`).join('')}</datalist></div>
          <div class="field"><label for="f-client">Client</label><textarea class="grow" rows="1" id="f-client" name="client" maxlength="160" placeholder="Who it was for">${attr(p.client)}</textarea></div>
        </div>
        <div class="two">
          <div class="field"><label for="f-status">Status</label><select id="f-status" name="status">${STATUSES.map((s) => `<option${s === p.status ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
          <div class="field"><label for="f-year">Year</label><input id="f-year" name="year" type="number" min="1990" max="2100" value="${attr(p.year)}" /></div>
        </div>
        <div class="field"><label for="f-summary">Short summary</label><textarea id="f-summary" name="summary" rows="3" maxlength="400" placeholder="One or two sentences for the project card.">${attr(p.summary)}</textarea></div>
        <div class="field"><label for="f-link">Live link</label><textarea class="grow" rows="1" id="f-link" name="link" inputmode="url" placeholder="https://…">${attr(p.link)}</textarea><p class="hint">For websites and systems that are online.</p></div>
        <div class="field"><label for="f-services">Services</label><textarea class="grow" rows="1" id="f-services" name="services" placeholder="Logo design, Flyers, Supabase">${attr((p.services ?? []).join(', '))}</textarea><p class="hint">Separate with commas.</p></div>
      </section>

      <section class="card panel"><h2>Cover image</h2>
        <p class="hint">Shown on the project card and at the top of the project page. Without one, a branded cover is made for you.</p>
        <div class="cover-box" data-cover></div>
      </section>

      <section class="card panel"><h2>Gallery</h2>
        <p class="hint">Designs or screenshots shown on the project page. Add a short description to each, for people using screen readers.</p>
        <div class="images" data-gallery></div>
        <div class="actions"><label class="upload">+ Add images<input type="file" accept="image/*" multiple data-add-gallery /></label></div>
        <div class="progress" data-progress hidden><span data-progress-text></span><progress max="1" value="0"></progress></div>
      </section>

      <section class="card panel"><h2>Project story</h2>
        <div class="field"><label for="f-body">Story</label><textarea id="f-body" name="body" rows="12" placeholder="## The need&#10;What problem did the client have?&#10;&#10;## The work&#10;- What you made&#10;- How it helps">${attr(p.body)}</textarea>
        <p class="hint">Start a line with “## ” for a heading, “- ” for a bullet, and wrap words in **double stars** for bold.</p></div>
      </section>

      <section class="card panel"><h2>On the site</h2>
        <label class="check"><input type="checkbox" name="published"${p.published ? ' checked' : ''} /> Show on the website</label>
        <label class="check"><input type="checkbox" name="featured"${p.featured ? ' checked' : ''} /> Show on the home page (Selected work shows the first three)</label>
        <div class="two">
          <div class="field"><label for="f-order">Order</label><input id="f-order" name="sort_order" type="number" value="${attr(p.sort_order)}" /><p class="hint">Lower numbers come first.</p></div>
          <div class="field"><label for="f-slug">Web address</label><input id="f-slug" name="slug" value="${attr(p.slug)}" placeholder="made from the title" pattern="[a-z0-9-]+" /><p class="hint">${esc(SITE)}work/<b data-slug-preview>${esc(p.slug || '…')}</b>/</p></div>
        </div>
      </section>

      <p class="error" role="alert" data-error hidden></p>
      <div class="actions sticky-actions">
        <button class="btn btn-primary" type="submit">${isNew ? 'Publish project' : 'Save changes'}</button>
        <a class="btn btn-ghost" href="#/projects">Cancel</a>
        ${isNew ? '' : '<button class="btn btn-danger" type="button" data-delete>Delete</button>'}
      </div>
    </form>`;

  const form = $<HTMLFormElement>('[data-project]');
  const slugInput = $<HTMLInputElement>('[name="slug"]', form);
  const titleInput = $<HTMLInputElement>('[name="title"]', form);
  let slugTouched = !isNew;
  slugInput.addEventListener('input', () => {
    slugTouched = true;
    $('[data-slug-preview]').textContent = slugInput.value || '…';
  });
  titleInput.addEventListener('input', () => {
    if (slugTouched) return;
    slugInput.value = slugify(titleInput.value);
    $('[data-slug-preview]').textContent = slugInput.value || '…';
  });

  const progress = (text: string | null, fraction = 0) => {
    const box = $('[data-progress]');
    box.hidden = text === null;
    if (text !== null) {
      $('[data-progress-text]').textContent = text;
      $<HTMLProgressElement>('progress', box).value = fraction;
    }
  };

  const drawCover = () => {
    $('[data-cover]').innerHTML = `${cover ? `<img src="${attr(imgSrc(cover))}" alt="Cover preview" loading="lazy" />` : ''}
      <label class="upload">${cover ? 'Replace cover' : '+ Add cover'}<input type="file" accept="image/*" data-add-cover /></label>
      ${cover ? '<button class="btn btn-ghost btn-sm" type="button" data-remove-cover>Remove</button>' : ''}`;
  };
  const drawGallery = () => {
    $('[data-gallery]').innerHTML = gallery.length
      ? gallery
          .map(
            (g, i) => `<div class="img-item" data-i="${i}"><img src="${attr(imgSrc(g.src))}" alt="" loading="lazy" />
            <input aria-label="Description of image ${i + 1}" placeholder="Description" value="${attr(g.alt)}" data-alt />
            <div class="tools"><button type="button" data-move="-1" aria-label="Move earlier"${i === 0 ? ' disabled' : ''}>←</button><button type="button" data-move="1" aria-label="Move later"${i === gallery.length - 1 ? ' disabled' : ''}>→</button><button type="button" data-remove aria-label="Remove image">✕</button></div></div>`,
          )
          .join('')
      : '<p class="hint">No images yet.</p>';
  };
  drawCover();
  drawGallery();

  form.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.matches('[data-alt]')) gallery[Number(t.closest<HTMLElement>('[data-i]')!.dataset.i)].alt = t.value;
  });
  form.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const item = t.closest<HTMLElement>('[data-i]');
    if (t.matches('[data-remove-cover]')) {
      cover = null;
      drawCover();
    } else if (item && t.matches('[data-remove]')) {
      gallery.splice(Number(item.dataset.i), 1);
      drawGallery();
    } else if (item && t.matches('[data-move]')) {
      const i = Number(item.dataset.i);
      const j = i + Number(t.dataset.move);
      [gallery[i], gallery[j]] = [gallery[j], gallery[i]];
      drawGallery();
    }
  });
  form.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    if (!input.files?.length || !(input.matches('[data-add-cover]') || input.matches('[data-add-gallery]'))) return;
    const files = [...input.files];
    const isCover = input.matches('[data-add-cover]');
    input.value = '';
    try {
      for (const [n, file] of files.entries()) {
        const label = `Uploading ${files.length > 1 ? `${n + 1} of ${files.length}: ` : ''}${file.name}`;
        progress(label);
        const url = await uploadImage(file, (f) => progress(label, f));
        uploaded.push(url);
        if (isCover) cover = url;
        else gallery.push({ src: url, alt: '' });
      }
      isCover ? drawCover() : drawGallery();
      toast(isCover ? 'Cover uploaded. Save to publish it.' : 'Images uploaded. Add descriptions, then save.');
    } catch (err) {
      toast(friendly(err), true);
      if (!isCover) drawGallery();
    } finally {
      progress(null);
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = $('[data-error]');
    error.hidden = true;
    const data = new FormData(form);
    const title = oneLine(data.get('title'));
    const slug = slugify(String(data.get('slug')).trim() || title);
    const link = oneLine(data.get('link')).replace(/\s+/g, '');
    const fail = (message: string) => Object.assign(error, { hidden: false, textContent: message });
    if (!title) return fail('Give the project a title.');
    if (link && !/^https?:\/\//i.test(link)) return fail('The live link must start with https://');
    const row = {
      title,
      slug,
      client: oneLine(data.get('client')),
      category: String(data.get('category')).trim(),
      year: Number(data.get('year')) || new Date().getFullYear(),
      status: String(data.get('status')),
      summary: String(data.get('summary')).trim(),
      link: link || null,
      services: oneLine(data.get('services'))
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      cover,
      gallery: gallery.map((g) => ({ src: g.src, alt: g.alt.trim() })),
      body: String(data.get('body')).trim(),
      published: data.get('published') === 'on',
      featured: data.get('featured') === 'on',
      sort_order: Number(data.get('sort_order')) || 0,
    };
    const button = $<HTMLButtonElement>('button[type="submit"]', form);
    button.disabled = true;
    const result = isNew ? await sb.from('site_projects').insert(row).select('id').single() : await sb.from('site_projects').update(row).eq('id', id).select('id').single();
    button.disabled = false;
    if (result.error) return fail(friendly(result.error));
    // Images replaced or removed while editing are deleted from storage.
    const kept = new Set([row.cover, ...row.gallery.map((g) => g.src)]);
    const before = [p.cover, ...(Array.isArray(p.gallery) ? p.gallery.map((g: GalleryItem) => g.src) : []), ...uploaded];
    const gone = [...new Set(before.filter((u) => u && !kept.has(u)).map(mediaPath).filter(Boolean))] as string[];
    if (gone.length) await sb.storage.from(MEDIA).remove(gone);
    uploaded.length = 0;
    toast(row.published ? 'Saved. It’s live on the website.' : 'Saved. It’s hidden from the website.');
    location.hash = '#/projects';
  });

  form.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if (!confirm(`Delete “${p.title}”? This can’t be undone.`)) return;
    const { error } = await sb.from('site_projects').delete().eq('id', id);
    if (error) return toast(friendly(error), true);
    const paths = [p.cover, ...gallery.map((g) => g.src), ...uploaded].map(mediaPath).filter(Boolean) as string[];
    if (paths.length) await sb.storage.from(MEDIA).remove(paths);
    toast('Project deleted.');
    location.hash = '#/projects';
  });
}

/* ---------- payments (final deliveries) ---------- */

type KeyInfo = { set: boolean; last4?: string; mode?: string; updated_at?: string };
type PayKeys = Record<'paystack' | 'seevplus', KeyInfo>;
const PROVIDERS: Record<string, string> = { paystack: 'Paystack', seevplus: 'SeevPlus' };
const ghs = (n: unknown) => `GHS ${Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Which secret keys are saved, or null when the database isn't set up for
    payments yet (supabase/migrations/…_delivery_payments.sql). */
async function paymentKeys(): Promise<PayKeys | null> {
  const { data, error } = await sb.rpc('site_payment_keys');
  return error || !data ? null : (data as PayKeys);
}

/* ---------- client work ---------- */

async function clientList() {
  const { data, error } = await sb
    .from('site_deliveries')
    .select('*, site_delivery_files(count), site_delivery_links(count), site_delivery_reviews(count)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  main().innerHTML = `
    <div class="head"><div><h1>Client work</h1><p class="hint">Private links where clients view their work, download files and send you their review.</p></div>
      <a class="btn btn-primary" href="#/clients/new">+ New client link</a></div>
    ${
      rows.length
        ? `<ul class="list">${rows
            .map((d: any) => {
              const files = (d.site_delivery_files?.[0]?.count ?? 0) + (d.site_delivery_links?.[0]?.count ?? 0);
              const reviews = d.site_delivery_reviews?.[0]?.count ?? 0;
              const tone = d.status === 'changes_requested' ? 'warn' : d.status === 'approved' || d.status === 'delivered' ? 'good' : '';
              return `<li><a class="row no-thumb" href="#/clients/${d.id}">
                <span><strong>${esc(d.title)}</strong><small>${esc(d.client_name)} · ${d.kind === 'delivery' ? 'Final delivery' : 'For review'} · ${files} file${files === 1 ? '' : 's'} · ${date(d.created_at)}</small></span>
                <span class="pills">${d.active ? '' : '<span class="pill muted">Link off</span>'}${d.kind === 'delivery' && d.pay_provider ? (d.paid_at ? '<span class="pill good">Paid</span>' : '<span class="pill warn">Awaiting payment</span>') : ''}${reviews ? `<span class="pill">${reviews} review${reviews === 1 ? '' : 's'}</span>` : ''}<span class="pill ${tone}">${DELIVERY_STATUS[d.status] ?? d.status}</span></span>
              </a></li>`;
            })
            .join('')}</ul>`
        : '<p class="empty">No client links yet. Create one to share work with a client.</p>'
    }`;
}

function deliveryFields(d: Record<string, any>, keys: PayKeys | null) {
  const provider = (key: 'paystack' | 'seevplus') =>
    `<label class="check"><input type="radio" name="pay_provider" value="${key}"${d.pay_provider === key ? ' checked' : ''}${keys?.[key].set || d.pay_provider === key ? '' : ' disabled'} /> ${PROVIDERS[key]}${keys?.[key].set ? '' : ' <span class="muted">(add its secret key in Settings first)</span>'}</label>`;
  const payment = keys
    ? `<fieldset class="field pay" data-pay${d.kind === 'delivery' ? '' : ' hidden'}><legend>Payment before download</legend>
      <label class="check"><input type="radio" name="pay_provider" value=""${d.pay_provider ? '' : ' checked'} /> No payment: the client downloads straight away</label>
      ${provider('paystack')}
      ${provider('seevplus')}
      <div class="field" data-pay-amount${d.pay_provider ? '' : ' hidden'}><label for="c-amount">Amount the client pays (GHS)</label><input id="c-amount" name="pay_amount" type="number" inputmode="decimal" min="1" max="100000" step="0.01" value="${attr(d.pay_amount ?? '')}" placeholder="e.g. 150" />
        <p class="hint">The client pays exactly this amount; the payment provider takes its fee out of it. The download buttons stay locked until the provider confirms the payment.</p></div>
    </fieldset>`
    : '';
  return `
    <div class="two">
      <div class="field"><label for="c-name">Client name</label><textarea class="grow" rows="1" id="c-name" name="client_name" required maxlength="120">${attr(d.client_name)}</textarea></div>
      <div class="field"><label for="c-phone">Client WhatsApp number</label><input id="c-phone" name="client_phone" inputmode="tel" value="${attr(d.client_phone)}" placeholder="e.g. 233201234567" /><p class="hint">Optional. With country code, so you can send them the link in one tap.</p></div>
    </div>
    <div class="field"><label for="c-title">Project title</label><textarea class="grow" rows="1" id="c-title" name="title" required maxlength="160" placeholder="e.g. Logo design for Hajia Samsia">${attr(d.title)}</textarea></div>
    <div class="field"><label for="c-message">Message to the client</label><textarea id="c-message" name="message" rows="4" placeholder="Hello! Here is the first draft of your logo. Let me know what you think.">${attr(d.message)}</textarea></div>
    <fieldset class="field"><legend>What is this link for?</legend>
      <label class="check"><input type="radio" name="kind" value="review"${d.kind !== 'delivery' ? ' checked' : ''} /> Review: the client approves the work or asks for changes</label>
      <label class="check"><input type="radio" name="kind" value="delivery"${d.kind === 'delivery' ? ' checked' : ''} /> Final delivery: the client downloads the files and leaves a review</label>
    </fieldset>
    ${payment}
    <label class="check"><input type="checkbox" name="allow_download"${d.allow_download !== false ? ' checked' : ''} /> Allow downloads</label>
    <p class="hint">When off, files are view only: shown clean, with no saving, printing or downloading. When the client switches away, opens a screenshot tool or presses the screenshot keys, a watermark with their name covers the files. No website can block screenshots completely, especially on phones, but this makes copies hard to take.</p>
    <div class="field"><label for="c-expires">Link stops working on</label><input id="c-expires" name="expires_at" type="date" value="${attr(d.expires_at ? d.expires_at.slice(0, 10) : '')}" /><p class="hint">Optional. Leave empty to keep the link working.</p></div>`;
}

/** Shows the payment choice only for final deliveries, and the amount only with a provider. */
function wireDelivery(form: HTMLFormElement) {
  const sync = () => {
    const data = new FormData(form);
    const pay = form.querySelector<HTMLElement>('[data-pay]');
    if (!pay) return;
    pay.hidden = data.get('kind') !== 'delivery';
    $('[data-pay-amount]', pay).hidden = !data.get('pay_provider');
  };
  form.addEventListener('change', sync);
  sync();
}

function readDelivery(form: HTMLFormElement) {
  const data = new FormData(form);
  const expires = String(data.get('expires_at') ?? '');
  const kind = String(data.get('kind')) === 'delivery' ? 'delivery' : 'review';
  // Payment is only for final deliveries. Without the payment fields (the
  // database isn't set up for payments yet) the columns are left alone.
  const provider = kind === 'delivery' ? String(data.get('pay_provider') ?? '') : '';
  const payment: { pay_provider?: string | null; pay_amount?: number | null } = form.querySelector('[data-pay]')
    ? { pay_provider: provider || null, pay_amount: provider ? Math.round(Number(data.get('pay_amount')) * 100) / 100 : null }
    : {};
  return {
    client_name: oneLine(data.get('client_name')),
    client_phone: String(data.get('client_phone')).replace(/\D/g, '') || null,
    title: oneLine(data.get('title')),
    message: String(data.get('message')).trim(),
    kind,
    // Paying is for downloading, so a paid delivery always allows downloads.
    allow_download: data.get('allow_download') === 'on' || Boolean(provider),
    expires_at: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
    ...payment,
  };
}

/** What's wrong with the details, or '' when they can be saved. */
function deliveryProblem(row: ReturnType<typeof readDelivery>) {
  if (!row.client_name || !row.title) return 'Add the client’s name and the project title.';
  if (row.pay_provider && !(Number(row.pay_amount) >= 1 && Number(row.pay_amount) <= 100000)) return 'Enter the amount the client pays: GHS 1 or more.';
  return '';
}

async function clientDetail(id: string) {
  const keys = await paymentKeys();
  if (id === 'new') {
    main().innerHTML = `
      <a class="crumb" href="#/clients">← Client work</a>
      <div class="head"><h1>New client link</h1></div>
      <form data-delivery novalidate><section class="card panel">${deliveryFields({ kind: 'review', allow_download: true }, keys)}</section>
        <p class="hint">Next you’ll add the files: upload them here, or add Google Drive download links for each format.</p>
        <p class="error" role="alert" data-error hidden></p>
        <div class="actions"><button class="btn btn-primary" type="submit">Create link and add files</button><a class="btn btn-ghost" href="#/clients">Cancel</a></div></form>`;
    const form = $<HTMLFormElement>('[data-delivery]');
    wireDelivery(form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const row = readDelivery(form);
      const error = $('[data-error]');
      const problem = deliveryProblem(row);
      if (problem) return Object.assign(error, { hidden: false, textContent: problem });
      const { data, error: err } = await sb.from('site_deliveries').insert(row).select('id').single();
      if (err) return Object.assign(error, { hidden: false, textContent: friendly(err) });
      location.hash = `#/clients/${data.id}`;
    });
    return;
  }

  const [{ data: d, error }, { data: files }, { data: links }, { data: reviews }, { data: payments }] = await Promise.all([
    sb.from('site_deliveries').select('*').eq('id', id).maybeSingle(),
    sb.from('site_delivery_files').select('*').eq('delivery_id', id).order('sort_order').order('created_at'),
    sb.from('site_delivery_links').select('*').eq('delivery_id', id).order('sort_order').order('created_at'),
    sb.from('site_delivery_reviews').select('*').eq('delivery_id', id).order('created_at', { ascending: false }),
    // Checkouts the client started (no rows, or no table yet, is fine).
    sb.from('site_delivery_payments').select('*').eq('delivery_id', id).order('created_at', { ascending: false }).limit(10),
  ]);
  if (error) throw error;
  if (!d) {
    main().innerHTML = '<p class="error">This client link no longer exists.</p><p><a href="#/clients">Back to client work</a></p>';
    return;
  }
  const link = clientLink(d.token);
  const invite = `Hello ${d.client_name}, ${d.kind === 'delivery' ? 'your files are ready' : 'your work is ready for review'}: “${d.title}”.\n\nOpen your private link: ${link}`;
  const wa = `https://wa.me/${d.client_phone ?? ''}?text=${encodeURIComponent(invite)}`;
  const label = (r: any) => (r.decision === 'approve' ? (d.kind === 'delivery' ? 'Received' : 'Approved') : r.decision === 'changes' ? 'Requested changes' : 'Feedback');

  main().innerHTML = `
    <a class="crumb" href="#/clients">← Client work</a>
    <div class="head"><div><h1>${esc(d.title)}</h1><p class="hint">${esc(d.client_name)} · created ${date(d.created_at)}${d.viewed_at ? ` · first opened ${date(d.viewed_at)}` : ' · not opened yet'}</p></div>
      <span class="pill ${d.status === 'changes_requested' ? 'warn' : d.status === 'awaiting_review' ? '' : 'good'}">${DELIVERY_STATUS[d.status]}</span></div>

    <section class="card panel"><h2>Private link</h2>
      ${d.active ? '' : '<p class="error">This link is switched off. The client can’t open it.</p>'}
      <div class="linkbox"><code data-link>${esc(link)}</code>
        <div class="actions"><button class="btn btn-primary btn-sm" type="button" data-copy>Copy link</button>
          <a class="btn btn-ghost btn-sm" href="${attr(wa)}" target="_blank" rel="noopener">Send on WhatsApp</a>
          <a class="btn btn-ghost btn-sm" href="${attr(link)}" target="_blank" rel="noopener">Open</a></div></div>
      <div class="actions">
        <button class="btn btn-ghost btn-sm" type="button" data-toggle>${d.active ? 'Switch link off' : 'Switch link on'}</button>
        <button class="btn btn-ghost btn-sm" type="button" data-rotate>Make a new link</button>
      </div>
      <p class="hint">“Make a new link” stops the old link working, for example if it was shared by mistake.</p>
    </section>

    <section class="card panel"><h2>Files</h2>
      <div class="list" data-files>${
        (files ?? []).length
          ? (files ?? [])
              .map(
                (f: any) => `<div class="file-row"><span class="ext">${esc(ext(f.name))}</span><div><strong>${esc(f.name)}</strong><small class="muted">${size(f.size)}</small></div>
                <button class="btn btn-ghost btn-sm" type="button" data-remove-file="${f.id}" data-path="${attr(f.path)}">Remove</button></div>`,
              )
              .join('')
          : '<p class="hint">No files yet.</p>'
      }</div>
      <div class="actions"><label class="upload">+ Add files<input type="file" multiple data-add-files /></label></div>
      <p class="hint">For previews and work to review. Any format: JPG, PNG, PDF, MP4, Affinity (.af), ZIP and more, up to 50 MB per file. For the finished design, use download links below.</p>
      <div class="progress" data-progress hidden><span data-progress-text></span><progress max="1" value="0"></progress></div>
    </section>

    <section class="card panel"><h2>Download links</h2>
      <p class="hint">For the finished design, one link per format. In Google Drive, upload the file, set sharing to “Anyone with the link”, copy the link and add it here. The client gets a Download button for each format.</p>
      ${d.allow_download ? '' : '<p class="note-warn">Downloads are off for this link, so the client won’t see these yet. Turn on “Allow downloads” in Details when the work is ready.</p>'}
      <div class="list" data-links>${
        (links ?? []).length
          ? (links ?? [])
              .map(
                (l: any) => `<div class="file-row"><span class="ext">${esc(l.format)}</span><div><strong>${esc(l.label || `${l.format} file`)}</strong><small class="muted"><a href="${attr(l.url)}" target="_blank" rel="noopener noreferrer">${esc(shortLink(l.url))}</a></small></div>
                <button class="btn btn-ghost btn-sm" type="button" data-remove-link="${l.id}">Remove</button></div>`,
              )
              .join('')
          : '<p class="hint">No download links yet.</p>'
      }</div>
      <form class="add-link" data-add-link novalidate>
        <div class="two">
          <div class="field"><label for="l-format">Format</label><select id="l-format" name="format">${LINK_FORMATS.map((f) => `<option>${f}</option>`).join('')}<option value="">Other…</option></select></div>
          <div class="field" data-other-format hidden><label for="l-other">Format name</label><input id="l-other" name="other" maxlength="24" placeholder="e.g. TIFF" /></div>
        </div>
        <div class="field"><label for="l-label">Name <span class="muted">(optional)</span></label><input id="l-label" name="label" maxlength="120" placeholder="e.g. Logo, transparent background" /></div>
        <div class="field"><label for="l-url">Google Drive link</label><textarea class="grow" rows="1" id="l-url" name="url" inputmode="url" placeholder="https://drive.google.com/file/d/…/view?usp=sharing"></textarea></div>
        <p class="error" role="alert" data-link-error hidden></p>
        <div class="actions"><button class="btn btn-primary btn-sm" type="submit">Add download link</button></div>
      </form>
    </section>

    ${
      keys && d.kind === 'delivery'
        ? `<section class="card panel" data-payment><h2>Payment</h2>
      ${
        !d.pay_provider
          ? '<p class="hint">No payment is asked for: the client downloads straight away. To charge for the download, choose Paystack or SeevPlus under Details.</p>'
          : d.paid_at
            ? `<p><span class="pill good">Paid</span> ${ghs(d.pay_amount)} · ${d.paid_reference === 'manual' ? 'marked as paid by you' : esc(PROVIDERS[d.pay_provider] ?? d.pay_provider)} · ${date(d.paid_at)}</p>
               <p class="hint">The client can download the files.${d.paid_reference && d.paid_reference !== 'manual' ? ` Reference: ${esc(d.paid_reference.split(':').pop() ?? '')}` : ''}</p>`
            : `<p><span class="pill warn">Waiting for payment</span> ${ghs(d.pay_amount)} through ${esc(PROVIDERS[d.pay_provider] ?? d.pay_provider)}</p>
               <p class="hint">The download buttons are locked for the client until ${esc(PROVIDERS[d.pay_provider] ?? d.pay_provider)} confirms the payment. It’s checked when the client comes back from paying and each time they open their link.</p>`
      }
      ${
        d.pay_provider
          ? `<div class="actions">${d.paid_at ? '' : '<button class="btn btn-primary btn-sm" type="button" data-pay-check>Check for payment</button><button class="btn btn-ghost btn-sm" type="button" data-pay-mark="paid">Mark as paid</button>'}${d.paid_at && d.paid_reference === 'manual' ? '<button class="btn btn-ghost btn-sm" type="button" data-pay-mark="unpaid">Mark as not paid</button>' : ''}</div>
             ${d.paid_at ? '' : '<p class="hint">“Mark as paid” is for a client who paid you another way, such as cash or Mobile Money.</p>'}`
          : ''
      }
      ${
        (payments ?? []).length
          ? `<ul class="pay-log">${(payments ?? [])
              .map(
                (pm: any) => `<li><strong>${pm.status === 'paid' ? 'Paid' : pm.status === 'failed' ? 'Failed' : 'Started, not finished'}</strong> · ${ghs(pm.amount)} · ${esc(PROVIDERS[pm.provider] ?? pm.provider)} · ${date(pm.created_at)}${pm.payer_email ? ` · ${esc(pm.payer_email)}` : ''}${pm.error ? `<br /><span class="muted">${esc(pm.error)}</span>` : ''}</li>`,
              )
              .join('')}</ul>`
          : ''
      }
    </section>`
        : ''
    }

    <section class="card panel"><h2>Reviews from the client</h2>
      ${
        (reviews ?? []).length
          ? `<ul class="reviews">${(reviews ?? [])
              .map(
                (r: any) => `<li class="${attr(r.decision)}"><p><strong>${esc(label(r))}</strong>${r.rating ? ` · ${'★'.repeat(r.rating)}` : ''} · ${esc(r.reviewer_name || d.client_name)} · ${date(r.created_at)}</p>${r.comment ? `<p>${esc(r.comment)}</p>` : ''}</li>`,
              )
              .join('')}</ul>`
          : '<p class="hint">No reviews yet. When the client sends one, it appears here and opens in their WhatsApp to send to you.</p>'
      }
      <div class="field"><label for="c-status">Status</label><select id="c-status" data-status>${Object.entries(DELIVERY_STATUS)
        .map(([k, v]) => `<option value="${k}"${k === d.status ? ' selected' : ''}>${v}</option>`)
        .join('')}</select><p class="hint">Changes by itself when the client responds; set it here after you update the work.</p></div>
    </section>

    <form class="card panel" data-delivery novalidate><h2>Details</h2>${deliveryFields(d, keys)}
      <p class="error" role="alert" data-error hidden></p>
      <div class="actions"><button class="btn btn-primary" type="submit">Save details</button><button class="btn btn-danger" type="button" data-delete>Delete link and files</button></div>
    </form>`;

  const progress = (text: string | null, fraction = 0) => {
    const box = $('[data-progress]');
    box.hidden = text === null;
    if (text !== null) {
      $('[data-progress-text]').textContent = text;
      $<HTMLProgressElement>('progress', box).value = fraction;
    }
  };

  $('[data-copy]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast('Link copied.');
    } catch {
      getSelection()?.selectAllChildren($('[data-link]'));
      toast('Select the link and copy it.');
    }
  });
  $('[data-toggle]').addEventListener('click', async () => {
    const { error } = await sb.from('site_deliveries').update({ active: !d.active }).eq('id', id);
    if (error) return toast(friendly(error), true);
    toast(d.active ? 'Link switched off.' : 'Link switched on.');
    route();
  });
  $('[data-rotate]').addEventListener('click', async () => {
    if (!confirm('Make a new link? The current link will stop working.')) return;
    const { error } = await sb.from('site_deliveries').update({ token: newToken() }).eq('id', id);
    if (error) return toast(friendly(error), true);
    toast('New link made. Send it to the client.');
    route();
  });
  $<HTMLSelectElement>('[data-status]').addEventListener('change', async (e) => {
    const { error } = await sb.from('site_deliveries').update({ status: (e.target as HTMLSelectElement).value }).eq('id', id);
    toast(error ? friendly(error) : 'Status updated.', Boolean(error));
  });
  $<HTMLInputElement>('[data-add-files]').addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const list = [...(input.files ?? [])];
    input.value = '';
    const tooBig = list.filter((f) => f.size > MAX_CLIENT_FILE);
    if (tooBig.length) toast(`${tooBig.map((f) => f.name).join(', ')} ${tooBig.length === 1 ? 'is' : 'are'} over 50 MB. Share a Google Drive link instead.`, true);
    const ok = list.filter((f) => f.size <= MAX_CLIENT_FILE);
    let order = (files ?? []).length;
    for (const [n, file] of ok.entries()) {
      const label = `Uploading ${ok.length > 1 ? `${n + 1} of ${ok.length}: ` : ''}${file.name} (${size(file.size)})`;
      try {
        progress(label);
        const path = `${id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, '_').slice(-80)}`;
        await upload(FILES, path, file, file.type || 'application/octet-stream', (f) => progress(label, f));
        const { error } = await sb.from('site_delivery_files').insert({
          delivery_id: id,
          path,
          name: file.name,
          size: file.size,
          mime: file.type || 'application/octet-stream',
          sort_order: order++,
        });
        if (error) {
          await sb.storage.from(FILES).remove([path]);
          throw error;
        }
      } catch (err) {
        toast(`${file.name}: ${friendly(err)}`, true);
      }
    }
    progress(null);
    if (ok.length) {
      toast('Files added. The client sees them on their link.');
      route();
    }
  });
  // Download links (Google Drive and the like), one per format.
  const linkForm = $<HTMLFormElement>('[data-add-link]');
  const formatSelect = $<HTMLSelectElement>('[name="format"]', linkForm);
  formatSelect.addEventListener('change', () => {
    $('[data-other-format]', linkForm).hidden = formatSelect.value !== '';
    if (!formatSelect.value) $<HTMLInputElement>('[name="other"]', linkForm).focus();
  });
  linkForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(linkForm);
    const format = (String(data.get('format')) || oneLine(data.get('other')).toUpperCase()).slice(0, 24);
    const url = oneLine(data.get('url'));
    const error = $('[data-link-error]', linkForm);
    const problem = !format
      ? 'Type the format name.'
      : !/^https:\/\/\S+$/.test(url)
        ? 'Paste the full link, starting with https://'
        : /drive\.google\.com\/drive\/folders\//.test(url)
          ? 'That’s a folder link. Open the file in Google Drive and copy the link to the file itself.'
          : '';
    if (problem) return Object.assign(error, { hidden: false, textContent: problem });
    const { error: err } = await sb
      .from('site_delivery_links')
      .insert({ delivery_id: id, format, label: oneLine(data.get('label')).slice(0, 120), url, sort_order: (links ?? []).length });
    if (err) return Object.assign(error, { hidden: false, textContent: friendly(err) });
    toast(`${format} download link added.`);
    route();
  });
  $('[data-links]').addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-remove-link]');
    if (!b || !confirm('Remove this download link? The client will no longer see it.')) return;
    const { error } = await sb.from('site_delivery_links').delete().eq('id', b.dataset.removeLink!);
    if (error) return toast(friendly(error), true);
    toast('Download link removed.');
    route();
  });
  $('[data-files]').addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-remove-file]');
    if (!b || !confirm('Remove this file? The client will no longer see it.')) return;
    const { error } = await sb.from('site_delivery_files').delete().eq('id', b.dataset.removeFile!);
    if (error) return toast(friendly(error), true);
    await sb.storage.from(FILES).remove([b.dataset.path!]);
    toast('File removed.');
    route();
  });
  // Payment: ask the provider again, or record a payment made another way.
  main().querySelector('[data-payment]')?.addEventListener('click', async (e) => {
    const el = e.target as HTMLElement;
    if (el.matches('[data-pay-check]')) {
      (el as HTMLButtonElement).disabled = true;
      try {
        const res = await fetch(CLIENT_PORTAL_URL, {
          method: 'POST',
          headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'verify', t: d.token }),
        });
        const out = await res.json();
        if (!res.ok) throw new Error('The payment could not be checked. Try again in a moment.');
        toast(out.paid ? 'Payment confirmed. The downloads are unlocked.' : 'No confirmed payment yet.', !out.paid);
        if (out.paid) return route();
      } catch (err) {
        toast(friendly(err), true);
      }
      (el as HTMLButtonElement).disabled = false;
    }
    const mark = el.dataset.payMark;
    if (!mark) return;
    const paid = mark === 'paid';
    if (!confirm(paid ? `Mark ${ghs(d.pay_amount)} as paid? The client will be able to download the files.` : 'Mark as not paid? The downloads will be locked again.')) return;
    const { error } = await sb
      .from('site_deliveries')
      .update(paid ? { paid_at: new Date().toISOString(), paid_reference: 'manual' } : { paid_at: null, paid_reference: null })
      .eq('id', id);
    if (error) return toast(friendly(error), true);
    toast(paid ? 'Marked as paid. The downloads are unlocked.' : 'Marked as not paid.');
    route();
  });
  const form = $<HTMLFormElement>('[data-delivery]');
  wireDelivery(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const row = readDelivery(form);
    const error = $('[data-error]', form);
    const problem = deliveryProblem(row);
    if (problem) return Object.assign(error, { hidden: false, textContent: problem });
    const { error: err } = await sb.from('site_deliveries').update(row).eq('id', id);
    if (err) return Object.assign(error, { hidden: false, textContent: friendly(err) });
    toast('Details saved.');
    route();
  });
  $('[data-delete]').addEventListener('click', async () => {
    if (!confirm(`Delete the link for “${d.title}” and all its files? This can’t be undone.`)) return;
    const paths = (files ?? []).map((f: any) => f.path);
    if (paths.length) await sb.storage.from(FILES).remove(paths);
    const { error } = await sb.from('site_deliveries').delete().eq('id', id);
    if (error) return toast(friendly(error), true);
    toast('Client link deleted.');
    location.hash = '#/clients';
  });
}

/* ---------- settings ---------- */

type Social = { label: string; handle: string; url: string; icon: string };

// Lets the About photo be moved and zoomed inside its rectangle, the shape of
// the About card on the home page. Returns the function that redraws it.
function placeAboutPhoto(s: Record<string, any>) {
  const box = $('[data-placer]');
  let pos: PhotoPos = photoPos(s.aboutPhotoPos);
  const apply = () => {
    $('[data-frame]', box).setAttribute('style', photoPosStyle(pos));
    $<HTMLInputElement>('[data-zoom]', box).value = String(pos.zoom);
    $<HTMLInputElement>('[data-x]', box).value = String(pos.x);
    $<HTMLInputElement>('[data-y]', box).value = String(pos.y);
  };
  const draw = () => {
    box.hidden = !s.aboutPhoto;
    if (!s.aboutPhoto) return;
    pos = photoPos(s.aboutPhotoPos);
    box.innerHTML = `<h3>Position</h3>
      <p class="hint">Drag the photo to move it inside the rectangle, and use Zoom to make it bigger. This is how it shows in the About section.</p>
      <div class="placer-row">
        <div class="placer-frame placed has-photo" data-frame><img src="${attr(s.aboutPhoto)}" alt="" draggable="false" /></div>
        <div class="placer-controls">
          <div class="field"><label for="pl-zoom">Zoom</label><input id="pl-zoom" type="range" min="1" max="3" step="0.01" data-zoom /></div>
          <div class="field"><label for="pl-x">Left – right</label><input id="pl-x" type="range" min="0" max="100" step="0.5" data-x /></div>
          <div class="field"><label for="pl-y">Up – down</label><input id="pl-y" type="range" min="0" max="100" step="0.5" data-y /></div>
          <div class="actions"><button class="btn btn-primary btn-sm" type="button" data-place-save>Save position</button>
            <button class="btn btn-ghost btn-sm" type="button" data-place-reset>Centre</button></div>
        </div>
      </div>`;
    apply();
  };
  box.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement;
    const k = el.dataset.zoom !== undefined ? 'zoom' : el.dataset.x !== undefined ? 'x' : el.dataset.y !== undefined ? 'y' : '';
    if (!k) return;
    pos = { ...pos, [k]: Number(el.value) };
    apply();
  });
  // Dragging moves the photo with the pointer.
  box.addEventListener('pointerdown', (e) => {
    const frame = (e.target as HTMLElement).closest<HTMLElement>('[data-frame]');
    if (!frame) return;
    e.preventDefault();
    frame.setPointerCapture(e.pointerId);
    let last = { x: e.clientX, y: e.clientY };
    const move = (ev: PointerEvent) => {
      const { width, height } = frame.getBoundingClientRect();
      const clampPct = (v: number) => Math.min(100, Math.max(0, Math.round(v * 2) / 2));
      pos = {
        ...pos,
        x: clampPct(pos.x - ((ev.clientX - last.x) / width) * 100),
        y: clampPct(pos.y - ((ev.clientY - last.y) / height) * 100),
      };
      last = { x: ev.clientX, y: ev.clientY };
      apply();
    };
    const end = () => {
      frame.removeEventListener('pointermove', move);
      frame.removeEventListener('pointerup', end);
      frame.removeEventListener('pointercancel', end);
    };
    frame.addEventListener('pointermove', move);
    frame.addEventListener('pointerup', end);
    frame.addEventListener('pointercancel', end);
  });
  box.addEventListener('click', async (e) => {
    const el = e.target as HTMLElement;
    if (el.matches('[data-place-reset]')) {
      pos = { ...CENTRED };
      apply();
    }
    if (!el.matches('[data-place-save]')) return;
    try {
      const { data: latest, error: readError } = await sb.from('site_settings').select('data').eq('id', 1).single();
      if (readError) throw readError;
      const { error: saveError } = await sb.from('site_settings').update({ data: { ...latest.data, aboutPhotoPos: pos } }).eq('id', 1);
      if (saveError) throw saveError;
      s.aboutPhotoPos = pos;
      toast('Photo position saved.');
    } catch (err) {
      toast(friendly(err), true);
    }
  });
  return draw;
}

async function settingsForm() {
  const [{ data, error }, keys] = await Promise.all([sb.from('site_settings').select('data').eq('id', 1).maybeSingle(), paymentKeys()]);
  if (error) throw error;
  const s: Record<string, any> = data?.data ?? {};
  let socials: Social[] = Array.isArray(s.socials) ? s.socials : [];
  main().innerHTML = `
    <div class="head"><div><h1>Settings</h1><p class="hint">Shown on the Contact page, the footer and the About page. Changes appear on the site within about 15 minutes.</p></div></div>
    <section class="card panel"><h2>Profile photo</h2>
      <p class="hint">Shown at the top of the home page. It changes on the site as soon as you upload it. For the look in the design, use a photo of you with the background removed (a PNG with a transparent background, for example from the Background Remover in Canva).</p>
      <div class="profile" data-photo="photo"></div>
      <div class="progress" data-progress hidden><span data-progress-text></span><progress max="1" value="0"></progress></div>
    </section>
    <section class="card panel"><h2>About photo</h2>
      <p class="hint">Shown in the About section of the home page and on the About page. Without one, those places show your profile photo.</p>
      <div class="profile" data-photo="aboutPhoto"></div>
      <div class="progress" data-progress hidden><span data-progress-text></span><progress max="1" value="0"></progress></div>
      <div class="placer" data-placer hidden></div>
    </section>
    <form data-settings novalidate>
      <section class="card panel"><h2>You</h2>
        <div class="two">
          <div class="field"><label for="s-owner">Your name</label><input id="s-owner" name="owner" value="${attr(s.owner)}" placeholder="Shown on the About page" /></div>
          <div class="field"><label for="s-location">Location</label><input id="s-location" name="location" value="${attr(s.location ?? 'Ghana')}" /></div>
        </div>
      </section>
      <section class="card panel"><h2>Contact</h2>
        <div class="two">
          <div class="field"><label for="s-email">Email</label><input id="s-email" name="email" type="email" value="${attr(s.email)}" /></div>
          <div class="field"><label for="s-phone">Phone</label><input id="s-phone" name="phone" inputmode="tel" value="${attr(s.phone)}" placeholder="+233 59 757 8538" /></div>
          <div class="field"><label for="s-wa">WhatsApp number</label><input id="s-wa" name="whatsapp" inputmode="tel" value="${attr(s.whatsapp)}" placeholder="233597578538" /><p class="hint">With country code. Client reviews and the contact form are sent here.</p></div>
          <div class="field"><label for="s-waname">WhatsApp name</label><input id="s-waname" name="whatsappName" value="${attr(s.whatsappName)}" /></div>
        </div>
      </section>
      <section class="card panel"><h2>Social links</h2><div class="socials" data-socials></div>
        <div class="actions"><button class="btn btn-ghost btn-sm" type="button" data-add-social>+ Add social link</button></div></section>
      <p class="error" role="alert" data-error hidden></p>
      <div class="actions sticky-actions"><button class="btn btn-primary" type="submit">Save settings</button></div>
    </form>
    <section class="card panel" data-paykeys><h2>Online payments</h2>
      <p class="hint">For final deliveries where the client pays before downloading (Client work → a link → Details). Paste each provider’s <strong>secret key</strong> here once. It’s stored on the server, used only there, and never shown again.</p>
      ${
        keys
          ? (['paystack', 'seevplus'] as const)
              .map((k) => {
                const info = keys[k];
                const state = info.set
                  ? `Saved${info.last4 ? ` · ends in ${esc(info.last4)}` : ''}${info.mode === 'live' ? ' · live key' : info.mode === 'test' ? ' · test key: no real money is taken' : ''}${info.updated_at ? ` · ${date(info.updated_at)}` : ''}`
                  : 'Not added yet';
                return `<form class="paykey" data-paykey="${k}" novalidate>
            <div class="field"><label for="pk-${k}">${PROVIDERS[k]} secret key</label>
              <input id="pk-${k}" name="key" type="password" autocomplete="off" spellcheck="false" placeholder="${k === 'paystack' ? 'sk_live_…' : 'Paste the secret key'}" />
              <p class="hint"><span class="pill ${info.set ? 'good' : 'muted'}">${state}</span> ${k === 'paystack' ? 'In Paystack: Settings → API Keys & Webhooks → Secret Key.' : 'In SeevPlus: Developer → API keys → the secret (server) key.'}</p></div>
            <p class="error" role="alert" data-key-error hidden></p>
            <div class="actions"><button class="btn btn-ghost btn-sm" type="submit">${info.set ? 'Replace key' : 'Save key'}</button></div>
          </form>`;
              })
              .join('')
          : '<p class="note-warn">Online payments aren’t switched on yet: the database update for payments hasn’t been run on Supabase.</p>'
      }
    </section>`;
  main().querySelectorAll<HTMLFormElement>('[data-paykey]').forEach((keyForm) =>
    keyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const provider = keyForm.dataset.paykey!;
      const input = $<HTMLInputElement>('[name="key"]', keyForm);
      const problem = $('[data-key-error]', keyForm);
      const secret = input.value.trim();
      if (!secret) return Object.assign(problem, { hidden: false, textContent: 'Paste the secret key first.' });
      if (/^pk_/.test(secret)) return Object.assign(problem, { hidden: false, textContent: 'That’s the public key. Paste the secret key (it starts with sk_).' });
      const { error: err } = await sb.rpc('site_set_payment_key', { p_provider: provider, p_secret: secret });
      input.value = '';
      if (err) return Object.assign(problem, { hidden: false, textContent: friendly(err) });
      toast(`${PROVIDERS[provider]} key saved.`);
      route();
    }),
  );
  // Each photo is saved on its own, straight after upload, so it never waits
  // for the rest of the form.
  const photoNames: Record<string, string> = { photo: 'Profile photo', aboutPhoto: 'About photo' };
  const drawPlacer = placeAboutPhoto(s);
  for (const key of Object.keys(photoNames)) {
    const name = photoNames[key];
    const box = $(`[data-photo="${key}"]`);
    const progress = box.nextElementSibling as HTMLElement;
    const drawPhoto = () => {
      box.innerHTML = `${s[key] ? `<img src="${attr(s[key])}" alt="Your ${name.toLowerCase()}" />` : '<span class="avatar-empty" aria-hidden="true">No photo</span>'}
        <div class="actions"><label class="upload">${s[key] ? 'Change photo' : '+ Upload photo'}<input type="file" accept="image/*" data-photo-input /></label>
        ${s[key] ? '<button class="btn btn-ghost btn-sm" type="button" data-photo-remove>Remove</button>' : ''}</div>`;
      if (key === 'aboutPhoto') drawPlacer();
    };
    const savePhoto = async (photo: string) => {
      const { data: latest, error: readError } = await sb.from('site_settings').select('data').eq('id', 1).single();
      if (readError) throw readError;
      // A new About photo starts centred.
      const extra = key === 'aboutPhoto' ? { aboutPhotoPos: { ...CENTRED } } : {};
      const { error: saveError } = await sb.from('site_settings').update({ data: { ...latest.data, [key]: photo, ...extra } }).eq('id', 1);
      if (saveError) throw saveError;
      const old = mediaPath(s[key]);
      Object.assign(s, { [key]: photo, ...extra });
      // Keep a file the other photo still uses.
      if (old && !Object.keys(photoNames).some((k) => mediaPath(s[k]) === old)) await sb.storage.from(MEDIA).remove([old]);
      drawPhoto();
    };
    drawPhoto();
    box.addEventListener('change', async (e) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      progress.hidden = false;
      $('[data-progress-text]', progress).textContent = `Uploading ${file.name}`;
      try {
        const url = await uploadImage(file, (f) => ($<HTMLProgressElement>('progress', progress).value = f), 'profile');
        try {
          await savePhoto(url);
        } catch (err) {
          await sb.storage.from(MEDIA).remove([mediaPath(url)!]);
          throw err;
        }
        toast(`${name} updated.`);
      } catch (err) {
        toast(friendly(err), true);
      } finally {
        progress.hidden = true;
      }
    });
    box.addEventListener('click', async (e) => {
      if (!(e.target as HTMLElement).matches('[data-photo-remove]') || !confirm(`Remove your ${name.toLowerCase()} from the website?`)) return;
      try {
        await savePhoto('');
        toast(`${name} removed.`);
      } catch (err) {
        toast(friendly(err), true);
      }
    });
  }

  const draw = () => {
    $('[data-socials]').innerHTML = socials.length
      ? socials
          .map(
            (x, i) => `<div class="social" data-i="${i}">
            <div class="field"><label for="so-${i}-label">Network</label><input id="so-${i}-label" data-k="label" value="${attr(x.label)}" placeholder="TikTok" /></div>
            <div class="field"><label for="so-${i}-handle">Handle</label><input id="so-${i}-handle" data-k="handle" value="${attr(x.handle)}" placeholder="@trutech.business1" /></div>
            <div class="field"><label for="so-${i}-url">Profile link</label><textarea id="so-${i}-url" class="grow" rows="1" data-k="url" inputmode="url" placeholder="https://…">${attr(x.url)}</textarea></div>
            <div class="field"><label for="so-${i}-icon">Icon</label><select id="so-${i}-icon" data-k="icon">${ICONS.map((ic) => `<option${ic === x.icon ? ' selected' : ''}>${ic}</option>`).join('')}</select></div>
            <button class="btn btn-ghost btn-sm" type="button" data-remove-social>Remove</button></div>`,
          )
          .join('')
      : '<p class="hint">No social links.</p>';
  };
  draw();
  const form = $<HTMLFormElement>('[data-settings]');
  form.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    const i = t.closest<HTMLElement>('[data-i]')?.dataset.i;
    if (i !== undefined && t.dataset.k) (socials[Number(i)] as Record<string, string>)[t.dataset.k] = t.value;
  });
  form.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.matches('[data-add-social]')) {
      socials.push({ label: '', handle: '', url: '', icon: 'tiktok' });
      draw();
    } else if (t.matches('[data-remove-social]')) {
      socials.splice(Number(t.closest<HTMLElement>('[data-i]')!.dataset.i), 1);
      draw();
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const error = $('[data-error]');
    const bad = socials.find((x) => x.url && !/^https?:\/\//i.test(x.url));
    if (bad) return Object.assign(error, { hidden: false, textContent: `The link for ${bad.label || 'a social network'} must start with https://` });
    const next = {
      ...s,
      owner: String(f.get('owner')).trim(),
      location: String(f.get('location')).trim() || 'Ghana',
      email: String(f.get('email')).trim(),
      phone: String(f.get('phone')).trim(),
      whatsapp: String(f.get('whatsapp')).replace(/\D/g, ''),
      whatsappName: String(f.get('whatsappName')).trim(),
      socials: socials.filter((x) => x.url.trim()).map((x) => ({ ...x, url: x.url.replace(/\s+/g, '') })),
    };
    const { error: err } = await sb.from('site_settings').update({ data: next }).eq('id', 1);
    if (err) return Object.assign(error, { hidden: false, textContent: friendly(err) });
    error.hidden = true;
    socials = next.socials;
    draw();
    toast('Settings saved. The site updates within about 15 minutes.');
  });
}

/* ---------- site text ---------- */

// Every piece of text on the website (defaults in src/lib/texts.ts). Only
// wording that differs from the default is saved, in site_settings.data.texts.
async function textsForm() {
  const { data, error } = await sb.from('site_settings').select('data').eq('id', 1).maybeSingle();
  if (error) throw error;
  const saved: Record<string, string> = data?.data?.texts ?? {};
  const valueOf = (f: Field) => (typeof saved[f.key] === 'string' && saved[f.key].trim() ? saved[f.key] : f.value);
  const HELP: Record<string, string> = {
    hl: 'Words between *stars* are shown in orange.',
    list: 'One per line.',
    paras: 'Leave an empty line between paragraphs.',
    md: 'Use ## for a heading, - for a list item, **bold** and [link text](https://…).',
  };
  const input = (f: Field) => {
    const id = `tx-${f.key.replace(/\W+/g, '-')}`;
    const v = valueOf(f);
    const box =
      f.kind === 'line' || f.kind === 'hl'
        ? `<textarea id="${id}" class="grow" rows="1" data-key="${attr(f.key)}">${attr(v)}</textarea>`
        : `<textarea id="${id}" class="autosize${f.kind === 'md' ? ' long' : ''}" rows="${f.kind === 'md' ? 14 : 3}" data-key="${attr(f.key)}">${attr(v)}</textarea>`;
    const hint = f.hint ?? HELP[f.kind] ?? '';
    return `<div class="field tx-field" data-field="${attr(f.key)}">
      <div class="tx-label"><label for="${id}">${esc(f.label)}</label>
        <button class="btn btn-ghost btn-sm" type="button" data-reset="${attr(f.key)}"${v === f.value ? ' hidden' : ''}>Use original</button></div>
      ${box}${hint ? `<p class="hint">${esc(hint)}</p>` : ''}</div>`;
  };
  main().innerHTML = `
    <div class="head"><div><h1>Site text</h1>
      <p class="hint">Every piece of text on the website, page by page. Change what you like and press Save: most text changes on the site straight away, and everything is updated within about 15 minutes. Press “Use original” to go back to the first wording.</p></div></div>
    <div class="field tx-search"><label for="tx-search">Find text</label>
      <input id="tx-search" type="search" placeholder="Type a word you see on the site, such as “Reality” or “WhatsApp”" data-search /></div>
    <p class="hint" data-search-none hidden>No text matches that search.</p>
    <form data-texts novalidate>
      ${GROUPS.map(
        (g, i) => `<details class="card panel tx-group" data-group${i === 0 ? ' open' : ''}>
          <summary><h2>${esc(g.title)}</h2><span class="hint">${g.fields.length} text${g.fields.length === 1 ? '' : 's'}</span></summary>
          ${g.fields.map(input).join('')}</details>`,
      ).join('')}
      <p class="error" role="alert" data-error hidden></p>
      <div class="actions sticky-actions"><button class="btn btn-primary" type="submit">Save text</button><span class="hint" data-unsaved></span></div>
    </form>`;

  const form = $<HTMLFormElement>('[data-texts]');
  const boxes = () => [...form.querySelectorAll<HTMLTextAreaElement>('[data-key]')];
  const changed = () => boxes().filter((b) => b.value !== valueOf({ key: b.dataset.key!, value: DEFAULTS[b.dataset.key!] } as Field)).length;
  const refresh = (b: HTMLTextAreaElement) => {
    form.querySelector<HTMLElement>(`[data-reset="${CSS.escape(b.dataset.key!)}"]`)!.hidden = b.value.trim() === DEFAULTS[b.dataset.key!].trim();
    const n = changed();
    $('[data-unsaved]').textContent = n ? `${n} unsaved change${n === 1 ? '' : 's'}` : '';
  };
  form.addEventListener('input', (e) => {
    if (e.target instanceof HTMLTextAreaElement && e.target.dataset.key) refresh(e.target);
  });
  form.addEventListener('click', (e) => {
    const key = (e.target as HTMLElement).closest<HTMLElement>('[data-reset]')?.dataset.reset;
    if (!key) return;
    const box = form.querySelector<HTMLTextAreaElement>(`[data-key="${CSS.escape(key)}"]`)!;
    box.value = DEFAULTS[key];
    box.dispatchEvent(new Event('input', { bubbles: true }));
    box.focus();
  });

  // Search opens the sections with matching text and hides the rest.
  $('[data-search]').addEventListener('input', (e) => {
    const q = (e.target as HTMLInputElement).value.trim().toLowerCase();
    let any = false;
    form.querySelectorAll<HTMLDetailsElement>('[data-group]').forEach((g, i) => {
      let hits = 0;
      g.querySelectorAll<HTMLElement>('[data-field]').forEach((field) => {
        const text = `${field.querySelector('label')!.textContent} ${field.querySelector('textarea')!.value} ${DEFAULTS[field.dataset.field!]}`.toLowerCase();
        const hit = !q || text.includes(q);
        field.hidden = !hit;
        if (hit) hits++;
      });
      g.hidden = hits === 0;
      g.open = q ? hits > 0 : i === 0;
      if (hits) any = true;
    });
    $('[data-search-none]').hidden = any;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = $('[data-error]');
    const texts: Record<string, string> = {};
    for (const b of boxes()) {
      const key = b.dataset.key!;
      const value = b.value.replace(/\s+$/, '');
      if (value.trim() && value.trim() !== DEFAULTS[key].trim()) texts[key] = value;
    }
    // Read the latest settings first, so nothing saved elsewhere is lost.
    const { data: latest, error: readError } = await sb.from('site_settings').select('data').eq('id', 1).single();
    if (readError) return Object.assign(error, { hidden: false, textContent: friendly(readError) });
    const { error: err } = await sb.from('site_settings').update({ data: { ...latest.data, texts } }).eq('id', 1);
    if (err) return Object.assign(error, { hidden: false, textContent: friendly(err) });
    error.hidden = true;
    for (const k of Object.keys(saved)) delete saved[k];
    Object.assign(saved, texts);
    boxes().forEach(refresh);
    toast('Text saved. The site shows it within about 15 minutes; most of it straight away.');
  });
}

/* ---------- account ---------- */

function accountView() {
  main().innerHTML = `
    <div class="head"><div><h1>Account</h1><p class="hint">Signed in as ${esc(session?.user.email ?? '')}</p></div></div>
    <form class="card panel" data-change-password novalidate><h2>Change password</h2>
      <div class="two">
        <div class="field"><label for="a-new">New password</label><input id="a-new" name="password" type="password" autocomplete="new-password" minlength="10" required /></div>
        <div class="field"><label for="a-confirm">Confirm password</label><input id="a-confirm" name="confirm" type="password" autocomplete="new-password" minlength="10" required /></div>
      </div>
      <p class="error" role="alert" data-error hidden></p>
      <div class="actions"><button class="btn btn-primary" type="submit">Change password</button></div>
    </form>
    <section class="card panel"><h2>Sign out</h2><p class="hint">Sign out on shared phones and computers.</p>
      <div class="actions"><button class="btn btn-ghost" type="button" data-signout>Sign out</button></div></section>
    <section class="card panel"><h2>Opening the admin</h2>
      <p class="hint">The admin isn’t linked on the website. To open it, long-press an empty part of any page on your phone, or double-click an empty part on a computer. You can also bookmark this page: ${esc(SITE)}admin/</p></section>`;
  const form = $<HTMLFormElement>('[data-change-password]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const password = String(data.get('password'));
    const error = $('[data-error]', form);
    if (password.length < 10) return Object.assign(error, { hidden: false, textContent: 'Use at least 10 characters.' });
    if (password !== data.get('confirm')) return Object.assign(error, { hidden: false, textContent: 'The passwords don’t match.' });
    const { error: err } = await sb.auth.updateUser({ password });
    if (err) return Object.assign(error, { hidden: false, textContent: friendly(err) });
    error.hidden = true;
    form.reset();
    toast('Password changed.');
  });
  $('[data-signout]').addEventListener('click', async () => {
    await sb.auth.signOut();
    session = null;
    // A fresh page: nothing from the session stays in memory or in Back history.
    location.replace(`${base}admin/`);
  });
}

/* ---------- start ---------- */

/** One-line text boxes that grow to show long titles, names and links. */
function setupGrowingFields() {
  const size = (t: HTMLTextAreaElement) => {
    t.style.height = 'auto';
    t.style.height = `${t.scrollHeight + 3}px`;
  };
  document.addEventListener('input', (e) => e.target instanceof HTMLTextAreaElement && e.target.matches('.grow, .autosize') && size(e.target));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target instanceof HTMLTextAreaElement && e.target.matches('.grow')) {
      e.preventDefault();
      e.target.form?.requestSubmit();
    }
  });
  const all = () => document.querySelectorAll<HTMLTextAreaElement>('textarea.grow, textarea.autosize').forEach(size);
  new MutationObserver(all).observe(main(), { childList: true, subtree: true });
  addEventListener('resize', all);
}

export function initAdmin() {
  const unlock = (e: Event) => {
    const t = e.target as HTMLInputElement;
    if (t.matches?.('[data-unlock]')) t.readOnly = false;
  };
  ['pointerdown', 'touchstart', 'focusin'].forEach((type) => document.addEventListener(type, unlock, { passive: true }));
  // Coming back with the Back button can restore an old page from memory.
  addEventListener('pageshow', (e) => {
    if (e.persisted && !session) show('login');
  });
  setupGate();
  setupGrowingFields();
  window.addEventListener('hashchange', route);
  sb.auth.onAuthStateChange((event, s) => {
    session = s;
    if (event === 'SIGNED_OUT') show('login');
  });
  enter().catch((e) => {
    show('login');
    const el = $('[data-login-error]');
    el.textContent = friendly(e);
    el.hidden = false;
  });
}
