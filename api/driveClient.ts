import { google } from 'googleapis';

interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}

function validateServiceAccountKey(key: unknown): key is ServiceAccountKey {
  if (!key || typeof key !== 'object') return false;
  const k = key as Record<string, unknown>;
  const required = ['type', 'private_key', 'client_email', 'token_uri'];
  return required.every((field) => typeof k[field] === 'string' && k[field]);
}

export function getDriveClient() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  
  if (!keyJson) {
    throw new Error('[driveClient] GOOGLE_SERVICE_ACCOUNT_KEY tidak ada di env Vercel');
  }

  let key: unknown;
  try {
    key = JSON.parse(keyJson);
  } catch {
    throw new Error('[driveClient] GOOGLE_SERVICE_ACCOUNT_KEY bukan JSON valid. Pastikan format di Vercel tidak rusak.');
  }

  if (!validateServiceAccountKey(key)) {
    throw new Error('[driveClient] Service account key tidak lengkap field-nya.');
  }

  // =========================================================================
  // FIX MUTLAK VERCEL: Mengubah literal "\\n" atau "\n" nyasar jadi baris baru beneran
  // =========================================================================
  let realPrivateKey = key.private_key;
  if (typeof realPrivateKey === 'string') {
    realPrivateKey = realPrivateKey.split('\\n').join('\n').replace(/\\n/g, '\n');
  }

  const credentials = {
    ...key,
    private_key: realPrivateKey,
  };

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  return google.drive({ version: 'v3', auth });
}