/**
 * Photo/file attachments for field records.
 *
 * Files are copied into the app's private document directory
 * (FileSystem.documentDirectory/attachments/…) rather than referenced where
 * the picker found them: a content:// URI from the gallery is not guaranteed
 * to still resolve later, and the transfer package has to be able to read the
 * bytes at export time.
 */
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { newId } from '../db/client';
import { createAttachment, deleteAttachment, listAttachments, type AttachmentRow } from '../db/repository';

const ATTACHMENTS_DIR = `${FileSystem.documentDirectory}attachments/`;
const MAX_BYTES = 10 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

async function ensureDirectory(): Promise<void> {
  const info = await FileSystem.getInfoAsync(ATTACHMENTS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(ATTACHMENTS_DIR, { intermediates: true });
  }
}

/** Strips anything that could escape the attachments directory. */
function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
  return cleaned.slice(0, 100) || 'file';
}

export interface AttachOptions {
  entityType: string;
  entityId: string;
  useCamera: boolean;
}

export async function attachPhoto(options: AttachOptions): Promise<AttachmentRow[] | null> {
  const permission = options.useCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('لم يتم منح الإذن للوصول إلى الصور أو الكاميرا');
  }

  const result = options.useCamera
    ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
    : await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      });

  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];

  const info = await FileSystem.getInfoAsync(asset.uri);
  const size = info.exists && !info.isDirectory ? info.size ?? 0 : 0;
  if (size > MAX_BYTES) {
    throw new Error('حجم الصورة يتجاوز الحد المسموح (10 ميجابايت)');
  }

  await ensureDirectory();
  const id = newId();
  const originalName = safeFileName(asset.fileName ?? `photo_${id}.jpg`);
  const extension = originalName.split('.').pop()?.toLowerCase() ?? 'jpg';
  const localPath = `${ATTACHMENTS_DIR}${id}_${originalName}`;

  await FileSystem.copyAsync({ from: asset.uri, to: localPath });

  await createAttachment({
    id,
    entityType: options.entityType,
    entityId: options.entityId,
    fileName: originalName,
    localPath,
    mimeType: MIME_BY_EXTENSION[extension] ?? 'application/octet-stream',
    sizeBytes: size,
  });

  return listAttachments(options.entityType, options.entityId);
}

export async function removeAttachment(id: string, localPath: string): Promise<void> {
  await deleteAttachment(id);
  await FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => undefined);
}

export { listAttachments };
