import { google } from 'googleapis';

type DriveClient = ReturnType<typeof google.drive>;

let cachedDriveClient: DriveClient | null = null;
let cachedCredentialsKey = '';

export function getDriveClient(): DriveClient {
  const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('[driveClient] ENV tidak lengkap: VITE_GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN');
  }

  const credentialsKey = `${clientId}:${refreshToken}`;
  if (cachedDriveClient && cachedCredentialsKey === credentialsKey) {
    return cachedDriveClient;
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'https://developers.google.com/oauthplayground'
  );

  oauth2Client.setCredentials({ refresh_token: refreshToken });

  cachedDriveClient = google.drive({ version: 'v3', auth: oauth2Client });
  cachedCredentialsKey = credentialsKey;
  return cachedDriveClient;
}