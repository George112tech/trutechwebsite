// Home page motion (Framer Motion's DOM API; the site has no React).
//
// Elements marked data-intro start hidden from CSS (global.css, only when
// motion is allowed) and are brought in here. If this script never runs, a
// CSS fallback shows them after a moment. With reduced motion nothing is
// hidden and nothing here runs.
import { animate, inView, scroll, stagger } from 'framer-motion/dom';

const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = [0.22, 1, 0.36, 1] as const;
const all = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];
const done = (els: Element[]) => els.forEach((el) => el.classList.add('intro-done'));

/** Label, title, text and buttons rise in one after another; the card and
 * numbers on the right slide in, then the giant word comes up. */
function heroIntro() {
  const lines = all('.hero [data-intro="line"]');
  const right = all('.hero [data-intro="right"]');
  const word = all('.hero [data-intro="word"]');
  done([...lines, ...right, ...word]);
  if (lines.length) animate(lines, { opacity: [0, 1], y: [22, 0] }, { duration: 0.6, ease, delay: stagger(0.09) });
  if (right.length) animate(right, { opacity: [0, 1], x: [28, 0] }, { duration: 0.7, ease, delay: 0.35 });
  if (word.length) animate(word, { opacity: [0, 1], y: [40, 0] }, { duration: 0.9, ease, delay: 0.2 });
}

/** The glow behind the photo, and the photo's drift on scroll. (The photo's
 * own entrance is CSS in index.astro, so it never waits for this script.) */
export function heroPhoto() {
  const glow = document.querySelector<HTMLElement>('.stage .glow');
  const lift = document.querySelector<HTMLElement>('.stage .lift');
  if (calm || !glow || !lift) return;
  done([glow]);
  animate(glow, { opacity: [0, 1] }, { duration: 1.2, ease }).then(() => {
    // The glow breathes gently, only while the hero is on screen.
    const breathe = animate(glow, { opacity: [1, 0.7, 1] }, { duration: 5, ease: 'easeInOut', repeat: Infinity });
    breathe.pause();
    inView(glow, () => {
      breathe.play();
      return () => breathe.pause();
    });
  });
  // While the hero scrolls away, the photo drifts slower than the page.
  const hero = document.querySelector<HTMLElement>('.hero')!;
  scroll(animate(lift, { y: [0, 160] }, { ease: 'linear' }), { target: hero, offset: ['start start', 'end start'] });
}

/** Stat numbers count up when they come into view. */
function countUp() {
  // Measure all first, then change: mixing the two makes the browser lay the
  // page out again for every number.
  const below = all('.stat-v [data-t]').filter((el) => el.getBoundingClientRect().top >= innerHeight);
  below.forEach((el) => {
    const start = el.textContent?.trim() ?? '';
    if (!/^\d+$/.test(start)) return;
    el.textContent = '0';
    inView(
      el,
      () => {
        // Newer wording from the admin (texts.ts) may have arrived meanwhile.
        const now = el.textContent?.trim();
        const target = Number(now && now !== '0' ? now : start);
        if (!Number.isInteger(target) || target <= 0) return;
        animate(0, target, { duration: 1.1, ease, onUpdate: (v) => (el.textContent = String(Math.round(v))) });
      },
      { amount: 0.8 },
    );
  });
}

/** The chips on the About card pop in, keeping their tilt. */
function chips() {
  const list = all('.about-card .float-chip');
  if (!list.length) return;
  done(list);
  inView(
    '.about-card',
    () => {
      list.forEach((chip, i) => {
        const tilt = chip.classList.contains('two') ? -8 : 8;
        animate(chip, { opacity: [0, 1], scale: [0.4, 1], rotate: [tilt * -2, tilt] }, { type: 'spring', stiffness: 260, damping: 14, delay: 0.3 + i * 0.15 });
      });
    },
    { amount: 0.4 },
  );
}

export function homeMotion() {
  if (calm) return;
  countUp(); // reads the layout, so before anything changes it
  heroIntro();
  chips();
}
