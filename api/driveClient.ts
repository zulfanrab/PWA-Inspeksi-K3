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
    throw new Error('[driveClient] GOOGLE_SERVICE_ACCOUNT_KEY tidak ada di env');
  }

  let key: unknown;
  try {
    key = JSON.parse(keyJson);
  } catch {
    throw new Error(
      '[driveClient] GOOGLE_SERVICE_ACCOUNT_KEY bukan JSON valid. ' +
      'Pastikan tidak ada newline atau karakter aneh saat paste ke Vercel env.'
    );
  }

  if (!validateServiceAccountKey(key)) {
    throw new Error(
      '[driveClient] Service account key tidak lengkap. ' +
      'Field wajib: type, private_key, client_email, token_uri.'
    );
  }

  // Paling umum penyebab 400/500: private_key dari env kehilangan newline
  // karena Vercel meng-escape \n menjadi \\n literal.
  const credentials = {
    ...key,
    private_key: key.private_key.replace(/\\n/g, '\n'),
  };

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  return google.drive({ version: 'v3', auth });
}