import { naiveExtract } from '../domain/fields.js';
import { logger } from '../logger.js';
import { extractWithModel, hasOpenAI } from './openai.js';

function prefer(primary, fallback) {
  const merged = { ...fallback };
  for (const [key, value] of Object.entries(primary || {})) {
    if (value === null || value === undefined || value === '') continue;
    merged[key] = value;
  }
  return merged;
}

export async function extractFromUtterance(text) {
  const naive = naiveExtract(text);
  if (!hasOpenAI()) return naive;
  try {
    const ai = await extractWithModel(text);
    return prefer(ai, naive);
  } catch (error) {
    logger.warn('field extraction failed', error.message);
    return naive;
  }
}
