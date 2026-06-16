/**
 * Minimal Telegram Bot API client used to push the daily refill report to a
 * control group/chat. Credentials come from build-time env vars:
 *
 *   EXPO_PUBLIC_TELEGRAM_BOT_TOKEN  — the bot token from @BotFather
 *   EXPO_PUBLIC_TELEGRAM_CHAT_ID    — the target chat / group / channel id
 *
 * When either is missing the feature is treated as disabled and callers can
 * skip sending without erroring.
 */
import { File, Paths, UploadType } from 'expo-file-system';

const BOT_TOKEN = (process.env.EXPO_PUBLIC_TELEGRAM_BOT_TOKEN ?? '').trim();
const CHAT_ID = (process.env.EXPO_PUBLIC_TELEGRAM_CHAT_ID ?? '').trim();

/** True only when both the bot token and chat id are configured. */
export function isTelegramConfigured() {
  return BOT_TOKEN.length > 0 && CHAT_ID.length > 0;
}

/**
 * Upload a local file (e.g. a generated PDF) to the configured chat via
 * `sendDocument`. Uses expo-file-system's native multipart upload rather than
 * `fetch` + FormData — Expo's fetch can't stream a file part from a `uri`.
 */
export async function sendTelegramDocument({
  uri,
  filename,
  mimeType = 'application/pdf',
  caption,
}: {
  uri: string;
  filename: string;
  mimeType?: string;
  caption?: string;
}) {
  if (!isTelegramConfigured()) {
    throw new Error('Telegram is not configured.');
  }

  // Copy the generated file to a friendly name so Telegram shows it on the
  // document. The print output has an opaque temp name otherwise.
  const source = new File(uri);
  let upload = source;
  let renamed: File | null = null;
  try {
    const dest = new File(Paths.cache, filename);
    if (dest.exists) dest.delete();
    source.copySync(dest);
    renamed = dest;
    upload = dest;
  } catch {
    // Fall back to the original file if the rename fails for any reason.
  }

  try {
    const result = await upload.upload(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`,
      {
        httpMethod: 'POST',
        uploadType: UploadType.MULTIPART,
        fieldName: 'document',
        mimeType,
        parameters: caption ? { chat_id: CHAT_ID, caption } : { chat_id: CHAT_ID },
      },
    );

    const json = (() => {
      try {
        return JSON.parse(result.body || '{}') as { ok?: boolean; description?: string };
      } catch {
        return null;
      }
    })();

    if (result.status < 200 || result.status >= 300 || !json?.ok) {
      throw new Error(json?.description ?? `Telegram upload failed (HTTP ${result.status}).`);
    }
    return json;
  } finally {
    if (renamed?.exists) {
      try {
        renamed.delete();
      } catch {
        // Best-effort cleanup of the temp copy.
      }
    }
  }
}
