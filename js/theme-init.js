// @ts-check
// tarn · Set the theme before first paint (classic script in <head>, not a module → no flash).
// Stored choice 'light' | 'dark'; without a choice the page follows the system.
// Migration (renamed from dashkit): the old 'dk-theme', 'dk-locale' and 'dk-sb' keys are copied to 'tn-*' once and removed.
try {
  ['theme', 'locale', 'sb'].forEach(function (k) {
    var old = localStorage.getItem('dk-' + k);
    if (old === null) return;
    if (localStorage.getItem('tn-' + k) === null) localStorage.setItem('tn-' + k, old);
    localStorage.removeItem('dk-' + k);
  });
  var t = localStorage.getItem('tn-theme');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  // density: stored choice 'comfortable'; a page that sets data-density itself (e.g. the starter page) keeps its own
  if (!document.documentElement.hasAttribute('data-density') && localStorage.getItem('tn-density') === 'comfortable') document.documentElement.setAttribute('data-density', 'comfortable');
} catch (e) { /* storage blocked: follow the system */ }
