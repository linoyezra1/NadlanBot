export function oauthRedirectParam(value, allowedOrigin = '') {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
  if (parsed.pathname !== '/connect' && parsed.pathname !== '/connect/') return null;
  if (allowedOrigin && parsed.origin !== allowedOrigin) return null;
  return `${parsed.origin}${parsed.pathname}`;
}

export function mobileOAuthUrl({ appId, version, configId, redirectUri, brokerId }) {
  const url = new URL('https://www.facebook.com/' + version + '/dialog/oauth');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('config_id', configId);
  url.searchParams.set('override_default_response_type', 'true');
  url.searchParams.set('display', 'touch');
  url.searchParams.set('state', brokerId);
  url.searchParams.set('extras', JSON.stringify({
    setup: {},
    featureType: 'whatsapp_business_app_onboarding',
  }));
  return url.toString();
}
