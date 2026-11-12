// @ts-check
// dashkit · Set the theme before first paint (classic script in <head>, not a module → no flash).
// Stored choice 'light' | 'dark'; without a choice the page follows the system.
try {
  var t = localStorage.getItem('dk-theme');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
} catch (e) { /* storage blocked: follow the system */ }
