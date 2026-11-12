// tarn · verify targets: pages, sizes, schemes. Views are read from the navigation.
export const PAGES = [
  // details: additionally checked states with an open detail (hash without #/)
  // ?lang= pins the language (the host browser's language must not decide); `only` limits sizes/themes of extra language runs
  { id: 'gallery', path: '/gallery/?lang=en', details: ['table?open=offsite-sync'] },
  { id: 'board', path: '/example/?lang=en', details: ['jobs?open=offsite-sync', 'hosts?open=nas-b', 'deploy?run=ok', 'deploy?run=bad'] },
  // sample board in German and French: long words, other number/date formats (geometry and snapshots)
  { id: 'board-de', path: '/example/?lang=de', details: ['jobs?open=offsite-sync', 'deploy?run=bad'], sizes: ['phone', 'phone-s', 'desktop'], themes: ['dark'] },
  { id: 'board-fr', path: '/example/?lang=fr', details: ['jobs?open=offsite-sync', 'deploy?run=ok'], sizes: ['phone', 'phone-s', 'desktop'], themes: ['dark'] },
  // starter page: a plain website from the core only (no shell, no navigation): `views` replaces the navigation, #/errors shows the validation state
  // density: 'compact' | 'comfortable' – set on <html> after loading (a page may choose its own default; the baseline pages name theirs)
  { id: 'starter', path: '/starter/?lang=en', views: ['page'], details: ['errors'], density: 'compact' },
  { id: 'starter-de', path: '/starter/?lang=de', views: ['page'], details: ['errors'], sizes: ['phone', 'phone-s', 'desktop'], themes: ['dark'], density: 'compact' },
  // comfortable density: the core views of the gallery and the starter page, phone + desktop, dark + light; every interactive element ≥ 48 px
  // (rule touch48, no exceptions: tools/verify/exceptions.json is not consulted for it). Compact pages above stay as they are.
  { id: 'gallery-comfortable', path: '/gallery/?lang=en', views: ['foundations', 'themes', 'buttons', 'controls', 'inputs', 'forms'], density: 'comfortable', sizes: ['phone', 'desktop'] },
  { id: 'starter-comfortable', path: '/starter/?lang=en', views: ['page'], details: ['errors'], density: 'comfortable', sizes: ['phone', 'phone-s', 'desktop'] },
  { id: 'starter-de-comfortable', path: '/starter/?lang=de', views: ['page'], details: ['errors'], density: 'comfortable', sizes: ['phone', 'phone-s'], themes: ['dark'] },
];

// mobile = touch emulation (pointer: coarse) + touch target check
export const SIZES = {
  phone: { w: 390, h: 844, dpr: 3, mobile: true },
  desktop: { w: 1440, h: 900, dpr: 1, mobile: false },
  // narrow containers in which the banner fault occurred (cards about 300–340 px wide)
  'phone-s': { w: 340, h: 740, dpr: 3, mobile: true },
  'tablet-s': { w: 700, h: 900, dpr: 2, mobile: true },
  'desktop-s': { w: 1000, h: 800, dpr: 1, mobile: false },
};
export const DEFAULT_SIZES = ['phone', 'desktop', 'phone-s', 'tablet-s', 'desktop-s'];
export const QUICK_SIZES = ['phone', 'desktop'];
export const THEMES = ['dark', 'light'];

export function parseSize(s) {
  if (SIZES[s]) return { name: s, ...SIZES[s] };
  const m = /^(\d+)x(\d+)(?:@(\d+(?:\.\d+)?))?(t)?$/.exec(s);
  if (!m) return null;
  return { name: s, w: +m[1], h: +m[2], dpr: m[3] ? +m[3] : 1, mobile: !!m[4] };
}
