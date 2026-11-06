(function (root) {
  'use strict';
  const key = 'seismic-observatory:appearance:v1';
  const themes = ['green', 'blue', 'maroon'], modes = ['system', 'light', 'dark'];
  const defaults = {theme: 'green', mode: 'system'}, listeners = new Set();
  function parse(raw) {
    try {const data = JSON.parse(raw);return {theme: themes.includes(data?.theme) ? data.theme : defaults.theme,
      mode: modes.includes(data?.mode) ? data.mode : defaults.mode};} catch (_) {return {...defaults};}
  }
  let settings;
  try {settings = parse(root.localStorage.getItem(key));} catch (_) {settings = {...defaults};}
  let media;
  try {media = root.matchMedia?.('(prefers-color-scheme: dark)');} catch (_) {media = null;}
  const effectiveMode = () => settings.mode === 'system' ? media?.matches ? 'dark' : 'light' : settings.mode;
  function get() {return {...settings, effectiveMode: effectiveMode()};}
  function apply(notify = true) {
    root.document.documentElement.setAttribute('data-theme', settings.theme);
    root.document.documentElement.setAttribute('data-mode', effectiveMode());
    if (notify) for (const listener of listeners) listener(get());
  }
  function set(next) {
    settings = {theme: themes.includes(next.theme) ? next.theme : settings.theme,
      mode: modes.includes(next.mode) ? next.mode : settings.mode};
    try {root.localStorage.setItem(key, JSON.stringify(settings));} catch (_) { /* Preferences still work without storage. */ }
    apply();
  }
  const systemChanged = () => {if (settings.mode === 'system') apply();};
  if (media?.addEventListener) media.addEventListener('change', systemChanged);
  else if (media?.addListener) media.addListener(systemChanged);
  root.addEventListener?.('storage', event => {if (event.key === key) {settings = parse(event.newValue);apply();}});
  apply(false); // This local script runs in <head>, before the style sheet and first paint.
  root.SeismicPreferences = {key, themes, modes, get, set,
    subscribe(listener) {listeners.add(listener);return () => listeners.delete(listener);}};
})(window);
