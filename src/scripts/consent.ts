type Choice = 'granted' | 'denied';
type ConsentRecord = { analytics: Choice; expires: number; version: 1 };
const key = 'kuchitril-consent-v1';
const lifetime = 180 * 24 * 60 * 60 * 1000;
type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  [key: string]: unknown;
};

export function initConsent(): void {
  const panel = document.querySelector<HTMLElement>('#cookie-panel');
  if (!panel) return;
  const analyticsWindow = window as unknown as AnalyticsWindow;
  const container = panel.dataset.gtm ?? '';
  const measurement = panel.dataset.measurement ?? '';
  const close = document.querySelector<HTMLButtonElement>('#cookie-close');
  let choice: Choice = 'denied';
  let remembered = false;
  let loaded = false;
  analyticsWindow.dataLayer = analyticsWindow.dataLayer ?? [];
  function gtag(..._args: unknown[]): void {
    analyticsWindow.dataLayer?.push(arguments);
  }
  gtag('consent', 'default', {
    analytics_storage: 'denied', ad_storage: 'denied',
    ad_user_data: 'denied', ad_personalization: 'denied',
    personalization_storage: 'denied', functionality_storage: 'granted',
    security_storage: 'granted',
  });
  gtag('set', 'ads_data_redaction', true);
  gtag('set', 'allow_google_signals', false);
  gtag('set', 'allow_ad_personalization_signals', false);
  gtag('set', 'page_location', location.origin + location.pathname);
  try {
    const referrer = new URL(document.referrer);
    gtag('set', 'page_referrer', referrer.origin + referrer.pathname);
  } catch { gtag('set', 'page_referrer', ''); }

  try {
    const saved: ConsentRecord | null = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (saved?.version === 1 && saved.expires > Date.now()
      && (saved.analytics === 'granted' || saved.analytics === 'denied')) {
      choice = saved.analytics;
      remembered = true;
    }
  } catch { /* Storage is optional; denied remains the default. */ }

  function loadAnalytics(): void {
    if (loaded || !/^GTM-[A-Z0-9]+$/.test(container)) return;
    loaded = true;
    analyticsWindow.dataLayer?.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtm.js?id=' + container;
    document.head.appendChild(script);
  }
  function updateAnalytics(): void {
    if (measurement) analyticsWindow['ga-disable-' + measurement] = choice !== 'granted';
    gtag('consent', 'update', { analytics_storage: choice });
    if (choice === 'granted') loadAnalytics();
  }
  function clearAnalyticsCookies(): void {
    const domains = ['', location.hostname, '.' + location.hostname, '.kuchitril.cl'];
    document.cookie.split(';').forEach((cookie) => {
      const name = cookie.trim().split('=')[0];
      if (!/^_ga(?:_|$)|^_gid$|^_gat/.test(name)) return;
      domains.forEach((domain) => {
        document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax'
          + (domain ? '; domain=' + domain : '');
      });
    });
  }
  updateAnalytics();
  panel.hidden = remembered;
  if (close) close.hidden = !remembered;

  panel.querySelectorAll<HTMLButtonElement>('[data-consent]').forEach((button) => {
    button.addEventListener('click', () => {
      const wasLoaded = loaded;
      choice = button.dataset.consent === 'granted' ? 'granted' : 'denied';
      try {
        localStorage.setItem(key, JSON.stringify({ analytics: choice, expires: Date.now() + lifetime, version: 1 }));
      } catch { /* The current choice still applies until the page is closed. */ }
      remembered = true;
      updateAnalytics();
      panel.hidden = true;
      if (close) close.hidden = false;
      if (choice === 'denied') {
        clearAnalyticsCookies();
        if (wasLoaded) location.reload();
      }
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-cookie-settings]').forEach((button) => {
    button.addEventListener('click', () => {
      panel.hidden = false;
      if (close) close.hidden = !remembered;
      panel.querySelector<HTMLButtonElement>('[data-consent]')?.focus();
    });
  });
  close?.addEventListener('click', () => { panel.hidden = true; });
  document.querySelectorAll<HTMLAnchorElement>('[data-contact="whatsapp"]').forEach((link) => {
    link.addEventListener('click', () => {
      if (choice !== 'granted' || !loaded) return;
      analyticsWindow.dataLayer?.push({ event: 'contact_whatsapp', contact_method: 'whatsapp', page_path: location.pathname });
    });
  });
}

