import { config } from '../config.js';
import { oauthRedirectParam } from '../domain/whatsappOAuth.js';
import { logger } from '../logger.js';
import { prisma } from '../db.js';

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function graph(path, { method = 'GET', token, body } = {}) {
  const url = path.startsWith('http')
    ? path
    : `https://graph.facebook.com/${config.graphVersion}/${String(path).replace(/^\//, '')}`;
  const response = await fetch(url, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = json.error?.message || `Meta HTTP ${response.status}`;
    logger.error('meta graph failed', method, String(path).split('?')[0], json.error?.code || response.status, message);
    throw fail(message, response.status >= 500 ? 502 : 400);
  }
  return json;
}

export function idsFromDebug(debug) {
  const data = debug?.data || {};
  const scopes = data.granular_scopes || [];
  const management = scopes.find((item) => item.scope === 'whatsapp_business_management') || scopes[0];
  return { wabaId: management?.target_ids?.[0] || null };
}

export async function exchangeEmbeddedCode(code, redirectUri = '') {
  if (!config.metaAppId || !config.metaAppSecret) throw fail('חיבור Meta עדיין לא מוגדר בשרת', 503);
  const allowedOrigin = config.publicBaseUrl ? new URL(config.publicBaseUrl).origin : '';
  const redirect = oauthRedirectParam(redirectUri, allowedOrigin);
  if (redirect == null) throw fail('כתובת החזרה לא תקינה');
  const params = new URLSearchParams({
    client_id: config.metaAppId,
    client_secret: config.metaAppSecret,
    code: String(code),
  });
  params.set('redirect_uri', redirect);
  logger.info('whatsapp token exchange', redirect ? 'redirect' : 'sdk');
  return graph(`oauth/access_token?${params.toString()}`);
}

export async function resolveWhatsAppAccount({ token, wabaId, phoneNumberId }) {
  let waba = String(wabaId || '').trim();
  let phone = String(phoneNumberId || '').trim();
  if (!waba) {
    const debug = await graph(`debug_token?input_token=${encodeURIComponent(token)}`, {
      token: `${config.metaAppId}|${config.metaAppSecret}`,
    });
    waba = idsFromDebug(debug).wabaId || '';
  }
  if (!waba) throw fail('לא הצלחתי לזהות את חשבון הוואטסאפ העסקי');
  if (!phone) {
    const listed = await graph(`${waba}/phone_numbers?fields=id,display_phone_number`, { token });
    phone = listed.data?.[0]?.id || '';
  }
  if (!phone) throw fail('לא הצלחתי לזהות את מספר הוואטסאפ');
  return { wabaId: waba, phoneNumberId: phone };
}

export async function connectBrokerWhatsApp({ code, brokerId, wabaId, phoneNumberId, redirectUri }) {
  if (!code || !brokerId) throw fail('חסרים פרטי החיבור');
  const broker = await prisma.broker.findUnique({ where: { id: String(brokerId) } });
  if (!broker) throw fail('המתווך לא נמצא', 404);
  const exchanged = await exchangeEmbeddedCode(code, redirectUri);
  const token = exchanged.access_token;
  if (!token) throw fail('Meta לא החזיר טוקן');
  const ids = await resolveWhatsAppAccount({ token, wabaId, phoneNumberId });
  await graph(`${ids.wabaId}/subscribed_apps`, { method: 'POST', token });
  try {
    return await prisma.broker.update({
      where: { id: broker.id },
      data: {
        whatsappMode: 'DIRECT_COEXISTENCE',
        isWhatsAppConnected: true,
        wabaId: ids.wabaId,
        whatsappNumberId: ids.phoneNumberId,
        whatsappAccessToken: token,
      },
    });
  } catch (error) {
    if (error.code === 'P2002') throw fail('המספר הזה כבר מחובר למתווך אחר');
    throw error;
  }
}
