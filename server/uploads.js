import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';

export const uploadDirectory = fileURLToPath(new URL('./upload/', import.meta.url));
const uploadPrefix = '/api/uploads/';
const maxImageSize = 5 * 1024 * 1024;
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxImageSize, files: 1, fields: 4, fieldSize: 4096, parts: 5 },
}).single('image');

export function imageExtension(buffer) {
  if (buffer.subarray(0, 8).equals(pngSignature)) return 'png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (
    buffer.toString('latin1', 0, 4) === 'RIFF' &&
    buffer.toString('latin1', 8, 12) === 'WEBP' &&
    ['VP8 ', 'VP8L', 'VP8X'].includes(buffer.toString('latin1', 12, 16))
  ) {
    return 'webp';
  }
  return null;
}

export function isUploadFilename(filename) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/.test(filename);
}

export async function saveImage(buffer, extension) {
  await mkdir(uploadDirectory, { recursive: true });
  const filename = `${randomUUID()}.${extension}`;
  const url = uploadPrefix + filename;
  try {
    await writeFile(join(uploadDirectory, filename), buffer, { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') await removeImage(url);
    throw error;
  }
  return url;
}

export async function removeImage(url) {
  if (!url?.startsWith(uploadPrefix)) return;
  const filename = url.slice(uploadPrefix.length);
  if (!isUploadFilename(filename)) return;
  try {
    await unlink(join(uploadDirectory, filename));
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('이미지 파일 삭제 실패', error.code ?? error.name);
  }
}
