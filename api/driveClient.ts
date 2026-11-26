import { google } from 'googleapis';

type DriveClient = ReturnType<typeof google.drive>;

let cachedDriveClient: DriveClient | null = null;
let cachedOAuth2Client: InstanceType<typeof google.auth.OAuth2> | null = null;
let cachedCredentialsKey = '';

function getOAuth2Client() {
  const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('[driveClient] ENV tidak lengkap: VITE_GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN');
  }

  const credentialsKey = `${clientId}:${refreshToken}`;
  if (cachedOAuth2Client && cachedCredentialsKey === credentialsKey) {
    return cachedOAuth2Client;
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'https://developers.google.com/oauthplayground'
  );

  oauth2Client.setCredentials({ refresh_token: refreshToken });
  cachedOAuth2Client = oauth2Client;
  cachedCredentialsKey = credentialsKey;
  cachedDriveClient = google.drive({ version: 'v3', auth: oauth2Client });
  return oauth2Client;
}

export function getDriveClient(): DriveClient {
  getOAuth2Client();
  return cachedDriveClient!;
}

export async function getDriveAccessToken(): Promise<string> {
  const oauth2Client = getOAuth2Client();
  const res = await oauth2Client.getAccessToken();
  const token = res?.token;
  if (!token) {
    throw new Error('[driveClient] Gagal memperoleh access token Google Drive.');
  }
  return token;
}