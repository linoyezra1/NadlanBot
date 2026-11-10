import dotenv from 'dotenv';

dotenv.config();

function text(name, fallback = '') {
  const value = process.env[name];
  return value == null ? fallback : String(value).trim();
}

export function zernioApiRoot(value) {
  const base = String(value || 'https://api.zernio.com').trim().replace(/\/$/, '');
  if (/\/v1$/i.test(base)) return base;
  if (/\/api$/i.test(base)) return `${base}/v1`;
  return `${base}/v1`;
}

export const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: text('NODE_ENV', 'development'),
  publicBaseUrl: text('PUBLIC_BASE_URL', `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),
  twilioAccountSid: text('TWILIO_ACCOUNT_SID'),
  twilioAuthToken: text('TWILIO_AUTH_TOKEN'),
  twilioWhatsappNumber: text('TWILIO_WHATSAPP_NUMBER'),
  twilioMessagingServiceSid: text('TWILIO_MESSAGING_SERVICE_SID'),
  twilioContentSid: text('TWILIO_CONTENT_SID'),
  whatsappDisplayNumber: text('WHATSAPP_DISPLAY_NUMBER') || text('TWILIO_WHATSAPP_NUMBER').replace(/\D/g, ''),
  graphVersion: text('META_GRAPH_VERSION', 'v21.0'),
  metaAppId: text('META_APP_ID'),
  metaAppSecret: text('META_APP_SECRET'),
  metaWebhookVerifyToken: text('META_WEBHOOK_VERIFY_TOKEN'),
  metaEmbeddedConfigId: text('META_EMBEDDED_CONFIG_ID'),
  openaiApiKey: text('OPENAI_API_KEY'),
  openaiModel: text('OPENAI_MODEL', 'gpt-4o-mini'),
  storageProvider: text('STORAGE_PROVIDER', 'local'),
  cloudinaryCloudName: text('CLOUDINARY_CLOUD_NAME'),
  cloudinaryApiKey: text('CLOUDINARY_API_KEY'),
  cloudinaryApiSecret: text('CLOUDINARY_API_SECRET'),
  cloudinaryFolder: text('CLOUDINARY_FOLDER', 'nadlanbot').replace(/^\/+|\/+$/g, '') || 'nadlanbot',
  cloudinaryFolderMode: text('CLOUDINARY_FOLDER_MODE', 'auto').toLowerCase(),
  s3Bucket: text('S3_BUCKET'),
  s3Region: text('S3_REGION'),
  s3AccessKeyId: text('S3_ACCESS_KEY_ID'),
  s3SecretAccessKey: text('S3_SECRET_ACCESS_KEY'),
  s3PublicBaseUrl: text('S3_PUBLIC_BASE_URL'),
  s3Acl: text('S3_ACL'),
  metaPageId: text('META_PAGE_ID'),
  metaPageAccessToken: text('META_PAGE_ACCESS_TOKEN'),
  metaIgUserId: text('META_IG_USER_ID'),
  tiktokAccessToken: text('TIKTOK_ACCESS_TOKEN'),
  tiktokPrivacyLevel: text('TIKTOK_PRIVACY_LEVEL', 'SELF_ONLY'),
  socialGatewayApiKey: text('ZERNIO_API_KEY') || text('SOCIAL_GATEWAY_API_KEY'),
  socialGatewayBaseUrl: zernioApiRoot(text('ZERNIO_BASE_URL') || text('SOCIAL_GATEWAY_BASE_URL', 'https://api.zernio.com')),
  socialGatewayWebhookSecret: text('ZERNIO_WEBHOOK_SECRET') || text('SOCIAL_GATEWAY_WEBHOOK_SECRET'),
  brokerTemplateName: text('WHATSAPP_BROKER_TEMPLATE_NAME'),
  brokerTemplateLang: text('WHATSAPP_BROKER_TEMPLATE_LANG', 'he'),
  autoSeed: text('AUTO_SEED') === 'true',
  initialBrokerPhone: text('INITIAL_BROKER_PHONE'),
  initialBrokerName: text('INITIAL_BROKER_NAME'),
  initialBrokerBusiness: text('INITIAL_BROKER_BUSINESS'),
  initialFbGroupId: text('INITIAL_FB_GROUP_ID'),
  initialFbGroupName: text('INITIAL_FB_GROUP_NAME'),
  uploadsDir: text('UPLOADS_DIR'),
};

export function cloudinaryConfigured() {
  return Boolean(config.cloudinaryCloudName && config.cloudinaryApiKey && config.cloudinaryApiSecret);
}

export function activeStorage() {
  if (config.storageProvider === 's3') return 's3';
  if (cloudinaryConfigured()) return 'cloudinary';
  return config.storageProvider === 'cloudinary' ? 'cloudinary' : 'local';
}

export function integrationStatus() {
  return {
    whatsapp: Boolean(config.twilioAccountSid && config.twilioAuthToken && (config.twilioWhatsappNumber || config.twilioMessagingServiceSid)),
    openai: Boolean(config.openaiApiKey),
    storage: activeStorage(),
    metaPage: Boolean(config.metaPageId && config.metaPageAccessToken),
    instagram: Boolean(config.metaIgUserId && config.metaPageAccessToken),
    tiktok: Boolean(config.tiktokAccessToken),
    socialGateway: Boolean(config.socialGatewayApiKey),
    publicBaseUrl: config.publicBaseUrl,
  };
}

export function integrationWarnings() {
  const warnings = [];
  const twilioReady = config.twilioAccountSid && config.twilioAuthToken && (config.twilioWhatsappNumber || config.twilioMessagingServiceSid);
  if (!twilioReady) {
    warnings.push('Twilio WhatsApp is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_NUMBER or TWILIO_MESSAGING_SERVICE_SID. Messages will be stored but not delivered.');
  } else if (!config.whatsappDisplayNumber) {
    warnings.push('TWILIO_WHATSAPP_NUMBER is empty, so click-to-WhatsApp links cannot be built yet.');
  }
  if (!config.openaiApiKey) {
    warnings.push('OPENAI_API_KEY is empty. Lead chat and field extraction use the built-in fallback.');
  }
  if (!config.socialGatewayApiKey) {
    warnings.push('ZERNIO_API_KEY is empty. Social posts stay on the direct channel tokens until Zernio is set.');
  }
  if (activeStorage() === 'cloudinary' && !cloudinaryConfigured()) {
    warnings.push('Cloudinary is selected but CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY or CLOUDINARY_API_SECRET is empty.');
  } else if (activeStorage() === 'local') {
    warnings.push('Storage is local. Facebook, Instagram and TikTok can only fetch public https media URLs.');
  }
  if (config.nodeEnv === 'production' && !config.twilioAuthToken) {
    warnings.push('TWILIO_AUTH_TOKEN is empty. Webhook posts are rejected in production until it is set.');
  }
  if (config.nodeEnv === 'production' && /localhost|127\.0\.0\.1/.test(config.publicBaseUrl)) {
    warnings.push('PUBLIC_BASE_URL still points at localhost. Twilio signature checks need the public https URL.');
  }
  return warnings;
}
