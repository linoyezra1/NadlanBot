import { isPublicHttpUrl } from './channels.js';

const VIDEO_FILE = /\.(mp4|mov)(?:$|[?#])/i;

export const TIKTOK_CRM_NOTICE = 'פרסום לטיקטוק נכשל: חובה להעלות סרטון וידאו (MP4/MOV) לנכס כדי לפרסם בטיקטוק';
export const TIKTOK_WA_LINE = '❌ טיקטוק: לא פורסם — נדרש סרטון וידאו לנכס (לא ניתן לפרסם תמונות סטטיות בטיקטוק)';

export function tiktokVideoUrl(media) {
  for (const item of media || []) {
    const url = String(item?.cloudUrl || item?.url || '');
    if (!VIDEO_FILE.test(url) || !isPublicHttpUrl(url)) continue;
    return url;
  }
  return '';
}

export function tiktokVideoSkip() {
  return {
    platform: 'tiktok',
    action: 'skip',
    status: 'skipped',
    code: 'NO_VIDEO',
    targetName: 'טיקטוק',
    error: TIKTOK_WA_LINE,
    urls: [],
  };
}
