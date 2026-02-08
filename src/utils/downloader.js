import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import settings from '../settings.js';

const mediaDir = path.join(settings.rootDir, 'downloads');
if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });

export const downloadResource = async (url, cookie) => {
  const filename = `${randomUUID()}.bin`;
  const filepath = path.join(mediaDir, filename);
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: cookie ? { Cookie: cookie } : undefined,
  });
  fs.writeFileSync(filepath, res.data);
  return filepath;
};

export const downloadStory = async (ig, storyId) => {
  const info = await ig.media.info(storyId);
  const media = info?.items?.[0];
  const resource = media?.video_versions?.[0]?.url || media?.image_versions2?.candidates?.[0]?.url;
  if (!resource) throw new Error('Story não encontrada');
  return downloadResource(resource);
};

export const downloadPost = async (ig, mediaId) => {
  const info = await ig.media.info(mediaId);
  const media = info?.items?.[0];
  const resource = media?.video_versions?.[0]?.url || media?.image_versions2?.candidates?.[0]?.url;
  if (!resource) throw new Error('Post não encontrado');
  return downloadResource(resource);
};

export default { downloadStory, downloadPost, downloadResource };
