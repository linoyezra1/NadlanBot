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
