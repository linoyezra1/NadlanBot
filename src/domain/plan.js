import { isPublicHttpUrl } from './channels.js';

function skipped(platform, targetName, error) {
  return {
    platform,
    action: 'skip',
    status: 'skipped',
    targetName,
    error,
    urls: [],
  };
}

function ready(platform, action, extra = {}) {
  return {
    platform,
    action,
    status: 'ready',
    error: null,
    urls: [],
    ...extra,
  };
}

export function planPosts({ channels, groups = [], media = [], connected = {} }) {
  const selected = new Set(channels || []);
  const images = media.filter((item) => item.mediaType === 'image');
  const videos = media.filter((item) => item.mediaType === 'video');
  const publicImages = images.filter((item) => isPublicHttpUrl(item.cloudUrl));
  const publicVideos = videos.filter((item) => isPublicHttpUrl(item.cloudUrl));
  const posts = [];

  if (selected.has('facebook')) {
    if (!connected.facebook) {
      posts.push(skipped('facebook', 'עמוד פייסבוק', 'חשבון הפייסבוק עדיין לא מחובר.'));
    } else if (publicImages.length) {
      posts.push(ready('facebook', 'page_photos', { urls: publicImages.slice(0, 10).map((item) => item.cloudUrl), targetName: 'עמוד פייסבוק' }));
    } else if (publicVideos.length) {
      posts.push(ready('facebook', 'page_video', { urls: [publicVideos[0].cloudUrl], targetName: 'עמוד פייסבוק' }));
    } else if (images.length || videos.length) {
      posts.push(skipped('facebook', 'עמוד פייסבוק', 'המדיה שמורה מקומית. לפייסבוק צריך כתובת https ציבורית.'));
    } else {
      posts.push(skipped('facebook', 'עמוד פייסבוק', 'אין תמונה או סרטון לפרסום.'));
    }

    if (connected.facebook) {
      for (const group of groups) {
        posts.push(ready('facebook_group', 'group_feed', {
          targetId: group.groupId,
          targetName: group.name,
        }));
      }
    }
  }

  if (selected.has('instagram')) {
    if (!connected.instagram) {
      posts.push(skipped('instagram', 'אינסטגרם', 'חשבון האינסטגרם עדיין לא מחובר.'));
    } else if (publicImages.length > 1) {
      posts.push(ready('instagram', 'carousel', { urls: publicImages.slice(0, 10).map((item) => item.cloudUrl), targetName: 'אינסטגרם' }));
    } else if (publicImages.length === 1) {
      posts.push(ready('instagram', 'image', { urls: [publicImages[0].cloudUrl], targetName: 'אינסטגרם' }));
    } else if (publicVideos.length) {
      posts.push(ready('instagram', 'reel', { urls: [publicVideos[0].cloudUrl], targetName: 'אינסטגרם' }));
    } else if (images.length || videos.length) {
      posts.push(skipped('instagram', 'אינסטגרם', 'המדיה שמורה מקומית. לאינסטגרם צריך כתובת https ציבורית.'));
    } else {
      posts.push(skipped('instagram', 'אינסטגרם', 'אין תמונה או סרטון לפרסום.'));
    }
  }

  if (selected.has('tiktok')) {
    if (!connected.tiktok) {
      posts.push(skipped('tiktok', 'טיקטוק', 'חשבון הטיקטוק עדיין לא מחובר.'));
    } else if (!videos.length) {
      posts.push(skipped('tiktok', 'טיקטוק', 'לטיקטוק נדרש סרטון. הערוץ דולג.'));
    } else if (!publicVideos.length) {
      posts.push(skipped('tiktok', 'טיקטוק', 'הסרטון לא זמין בכתובת https ציבורית.'));
    } else {
      posts.push(ready('tiktok', 'video', { urls: [publicVideos[0].cloudUrl], targetName: 'טיקטוק' }));
    }
  }

  return posts;
}
