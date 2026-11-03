import dotenv from 'dotenv';

dotenv.config();

function text(name, fallback = '') {
  const value = process.env[name];
  return value == null ? fallback : String(value).trim();
}

export const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: text('NODE_ENV', 'development'),
  publicBaseUrl: text('PUBLIC_BASE_URL', `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),
  verifyToken: text('WHATSAPP_VERIFY_TOKEN'),
  whatsappToken: text('WHATSAPP_TOKEN'),
  whatsappPhoneNumberId: text('WHATSAPP_PHONE_NUMBER_ID'),
  whatsappBusinessAccountId: text('WHATSAPP_BUSINESS_ACCOUNT_ID'),
  whatsappDisplayNumber: text('WHATSAPP_DISPLAY_NUMBER'),
  metaAppSecret: text('META_APP_SECRET'),
  graphVersion: text('META_GRAPH_VERSION', 'v21.0'),
  openaiApiKey: text('OPENAI_API_KEY'),
  openaiModel: text('OPENAI_MODEL', 'gpt-4o-mini'),
  storageProvider: text('STORAGE_PROVIDER', 'local'),
  cloudinaryCloudName: text('CLOUDINARY_CLOUD_NAME'),
  cloudinaryApiKey: text('CLOUDINARY_API_KEY'),
  cloudinaryApiSecret: text('CLOUDINARY_API_SECRET'),
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
  brokerTemplateName: text('WHATSAPP_BROKER_TEMPLATE_NAME'),
  brokerTemplateLang: text('WHATSAPP_BROKER_TEMPLATE_LANG', 'he'),
  adminToken: text('ADMIN_TOKEN'),
  autoSeed: text('AUTO_SEED') === 'true',
  initialBrokerPhone: text('INITIAL_BROKER_PHONE'),
  initialBrokerName: text('INITIAL_BROKER_NAME'),
  initialBrokerBusiness: text('INITIAL_BROKER_BUSINESS'),
  initialFbGroupId: text('INITIAL_FB_GROUP_ID'),
  initialFbGroupName: text('INITIAL_FB_GROUP_NAME'),
  uploadsDir: text('UPLOADS_DIR'),
};

export function integrationStatus() {
  return {
    whatsapp: Boolean(config.whatsappToken && config.whatsappPhoneNumberId),
    openai: Boolean(config.openaiApiKey),
    storage: config.storageProvider || 'local',
    metaPage: Boolean(config.metaPageId && config.metaPageAccessToken),
    instagram: Boolean(config.metaIgUserId && config.metaPageAccessToken),
    tiktok: Boolean(config.tiktokAccessToken),
    publicBaseUrl: config.publicBaseUrl,
  };
}

export function integrationWarnings() {
  const warnings = [];
  if (!config.whatsappToken || !config.whatsappPhoneNumberId) {
    warnings.push('WhatsApp Cloud API is not configured. Messages will be stored but not delivered.');
  }
  if (!config.whatsappDisplayNumber) {
    warnings.push('WHATSAPP_DISPLAY_NUMBER is empty, so click-to-WhatsApp links cannot be built yet.');
  }
  if (!config.openaiApiKey) {
    warnings.push('OPENAI_API_KEY is empty. Lead chat and field extraction use the built-in fallback.');
  }
  if (config.storageProvider === 'local') {
    warnings.push('Storage is local. Facebook, Instagram and TikTok can only fetch public https media URLs.');
  }
  if (config.nodeEnv === 'production' && !config.metaAppSecret) {
    warnings.push('META_APP_SECRET is empty. Webhook posts are rejected in production until it is set.');
  }
  if (config.nodeEnv === 'production' && !config.adminToken) {
    warnings.push('ADMIN_TOKEN is empty. The admin console is closed in production.');
  }
  return warnings;
}
