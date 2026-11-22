import { app, safeStorage, shell } from 'electron';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import * as url from 'url';
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

export interface GoogleDriveTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  scope?: string;
  token_type?: string | null;
  expiry_date?: number | null;
}

export interface GoogleDriveStatus {
  isConnected: boolean;
  connectedEmail?: string;
  driveFolderName: string;
  driveFolderId?: string;
  hasCustomCredentials: boolean;
}

const BACKUP_FOLDER_NAME = 'POS_Backups';
const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
];

export class GoogleDriveService {
  private tokensFilePath: string | null = null;
  private configFilePath: string | null = null;
  private cachedTokens: GoogleDriveTokens | null = null;
  private cachedEmail: string | null = null;
  private cachedFolderId: string | null = null;
  private activeAuthServer: http.Server | null = null;

  private getTokensFilePath(): string {
    if (!this.tokensFilePath) {
      this.tokensFilePath = path.join(app.getPath('userData'), 'google_drive_tokens.enc');
    }
    return this.tokensFilePath;
  }

  private getConfigFilePath(): string {
    if (!this.configFilePath) {
      this.configFilePath = path.join(app.getPath('userData'), 'google_drive_config.json');
    }
    return this.configFilePath;
  }

  /**
   * Retrieves OAuth Client ID & Secret (custom if configured, otherwise defaults).
   */
  public getOAuthCredentials(): { clientId: string; clientSecret: string; hasCustom: boolean } {
    try {
      const configPath = this.getConfigFilePath();
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.clientId && parsed.clientSecret) {
          return {
            clientId: parsed.clientId.trim(),
            clientSecret: parsed.clientSecret.trim(),
            hasCustom: true,
          };
        }
      }
    } catch {
      // Ignore config parse errors
    }

    const envClientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
    const envClientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
    if (envClientId && envClientSecret) {
      return {
        clientId: envClientId,
        clientSecret: envClientSecret,
        hasCustom: true,
      };
    }

    return {
      clientId: '',
      clientSecret: '',
      hasCustom: false,
    };
  }

  /**
   * Saves custom OAuth Client ID & Secret configured by the Super Admin.
   */
  public saveOAuthCredentials(clientId?: string, clientSecret?: string): void {
    const configPath = this.getConfigFilePath();
    let currentConfig: any = {};
    if (fs.existsSync(configPath)) {
      try {
        currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch {}
    }

    if (clientId !== undefined) currentConfig.clientId = clientId.trim();
    if (clientSecret !== undefined) currentConfig.clientSecret = clientSecret.trim();

    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf8');
  }

  /**
   * Creates an authorized OAuth2 client using saved tokens with automatic refresh support.
   */
  public getOAuth2Client(redirectUri?: string): OAuth2Client {
    const { clientId, clientSecret } = this.getOAuthCredentials();
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    const tokens = this.loadTokens();
    if (tokens) {
      oauth2Client.setCredentials(tokens);

      // Listen for automatic token refreshes from google-auth-library
      oauth2Client.on('tokens', (newTokens) => {
        this.saveTokens({
          ...this.loadTokens(),
          ...newTokens,
        });
      });
    }

    return oauth2Client;
  }

  /**
   * Securely loads stored OAuth tokens from Electron userData.
   */
  public loadTokens(): GoogleDriveTokens | null {
    if (this.cachedTokens) {
      return this.cachedTokens;
    }

    const tokensPath = this.getTokensFilePath();
    if (!fs.existsSync(tokensPath)) {
      return null;
    }

    try {
      const fileBuffer = fs.readFileSync(tokensPath);
      let jsonString = '';

      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        try {
          jsonString = safeStorage.decryptString(fileBuffer);
        } catch {
          jsonString = fileBuffer.toString('utf8');
        }
      } else {
        jsonString = fileBuffer.toString('utf8');
      }

      const parsed = JSON.parse(jsonString);
      this.cachedTokens = parsed.tokens || null;
      this.cachedEmail = parsed.email || null;
      this.cachedFolderId = parsed.folderId || null;
      return this.cachedTokens;
    } catch (err) {
      console.warn('[GOOGLE_DRIVE] Error loading saved tokens:', err);
      return null;
    }
  }

  /**
   * Securely persists OAuth tokens in Electron userData using safeStorage.
   */
  public saveTokens(tokens: GoogleDriveTokens, email?: string, folderId?: string): void {
    this.cachedTokens = tokens;
    if (email) this.cachedEmail = email;
    if (folderId) this.cachedFolderId = folderId;

    const payload = JSON.stringify({
      tokens,
      email: this.cachedEmail,
      folderId: this.cachedFolderId,
      updatedAt: new Date().toISOString(),
    });

    const tokensPath = this.getTokensFilePath();
    const dir = path.dirname(tokensPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      try {
        const encrypted = safeStorage.encryptString(payload);
        fs.writeFileSync(tokensPath, encrypted);
        return;
      } catch (err) {
        console.warn('[GOOGLE_DRIVE] safeStorage encryption failed, falling back to local file:', err);
      }
    }

    fs.writeFileSync(tokensPath, payload, 'utf8');
  }

  /**
   * Returns current Google Drive connection status.
   */
  public getStatus(): GoogleDriveStatus {
    const tokens = this.loadTokens();
    const isConnected = Boolean(tokens && (tokens.access_token || tokens.refresh_token));
    const { hasCustom } = this.getOAuthCredentials();

    return {
      isConnected,
      connectedEmail: this.cachedEmail || undefined,
      driveFolderName: BACKUP_FOLDER_NAME,
      driveFolderId: this.cachedFolderId || undefined,
      hasCustomCredentials: hasCustom,
    };
  }

  /**
   * Starts local HTTP loopback server and launches Google OAuth2 consent screen
   * in the user's default browser (RFC 8252 compliant desktop flow).
   */
  public async startOAuthFlow(): Promise<{ authUrl: string; waitingForAuth: boolean }> {
    const { clientId, clientSecret, hasCustom } = this.getOAuthCredentials();
    if (!hasCustom || !clientId || !clientSecret) {
      throw new Error(
        'Google Cloud OAuth credentials are required. Please configure your Google Cloud Client ID & Secret in Google Drive settings first.'
      );
    }

    // Stop any existing loopback server
    if (this.activeAuthServer) {
      try {
        this.activeAuthServer.close();
      } catch {}
      this.activeAuthServer = null;
    }

    return new Promise<{ authUrl: string; waitingForAuth: boolean }>((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        try {
          const reqUrl = url.parse(req.url || '', true);
          if (reqUrl.pathname === '/oauth2callback') {
            const code = reqUrl.query.code as string;
            const error = reqUrl.query.error as string;

            if (error) {
              res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`
                <html>
                  <body style="font-family: system-ui, sans-serif; text-align: center; padding: 50px; background: #fff5f5; color: #991b1b;">
                    <h2>Authentication Denied or Cancelled</h2>
                    <p>${error}</p>
                    <p>You can close this tab and return to Retail POS.</p>
                  </body>
                </html>
              `);
              server.close();
              this.activeAuthServer = null;
              return;
            }

            if (!code) {
              res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end('<h3>Missing authorization code.</h3>');
              return;
            }

            // Exchange authorization code for tokens
            const port = (server.address() as any).port;
            const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
            const oauth2Client = this.getOAuth2Client(redirectUri);

            const { tokens } = await oauth2Client.getToken(code);
            oauth2Client.setCredentials(tokens);

            // Verify that Google Drive access scope was actually granted by user
            const grantedScope = tokens.scope || '';
            const hasDriveScope = grantedScope.includes('drive');
            if (!hasDriveScope) {
              res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(`
                <!DOCTYPE html>
                <html>
                  <head>
                    <meta charset="utf-8">
                    <title>Google Drive Permission Required</title>
                    <style>
                      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fffbf0; color: #1c1917; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                      .card { background: white; border: 1px solid #fed7aa; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.06); text-align: center; max-width: 440px; }
                      .icon { width: 56px; height: 56px; background: #fef3c7; color: #d97706; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 28px; }
                      h2 { margin: 0 0 8px; font-size: 20px; color: #92400e; }
                      p { margin: 0 0 16px; color: #78716c; font-size: 14px; line-height: 1.5; }
                    </style>
                  </head>
                  <body>
                    <div class="card">
                      <div class="icon">⚠️</div>
                      <h2>Google Drive Checkbox Not Selected</h2>
                      <p>You signed in, but you did not check the box giving Retail POS permission to access Google Drive.</p>
                      <p style="font-size: 13px; color: #44403c;">Please return to the POS application, click <b>Connect Google Drive</b>, and make sure to <b>tick the checkbox next to Google Drive access</b>.</p>
                    </div>
                  </body>
                </html>
              `);

              setTimeout(() => {
                try {
                  server.close();
                } catch {}
                this.activeAuthServer = null;
              }, 1000);
              return;
            }

            // Fetch user's email address
            let connectedEmail = '';
            try {
              const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
              const userInfo = await oauth2.userinfo.get();
              connectedEmail = userInfo.data.email || '';
            } catch (err) {
              console.warn('[GOOGLE_DRIVE] Failed to fetch userinfo email:', err);
            }

            this.saveTokens(tokens, connectedEmail);

            // Respond with friendly success HTML page
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
              <!DOCTYPE html>
              <html>
                <head>
                  <meta charset="utf-8">
                  <title>Google Drive Connected</title>
                  <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fdfbf7; color: #1c1917; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                    .card { background: white; border: 1px solid #eae0d0; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.06); text-align: center; max-width: 420px; }
                    .icon { width: 56px; height: 56px; background: #ecfdf5; color: #059669; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 28px; }
                    h2 { margin: 0 0 8px; font-size: 20px; color: #1c1917; }
                    p { margin: 0 0 16px; color: #78716c; font-size: 14px; line-height: 1.5; }
                    .email { font-weight: bold; color: #047857; background: #f0fdf4; padding: 4px 12px; border-radius: 9999px; display: inline-block; font-size: 13px; }
                  </style>
                </head>
                <body>
                  <div class="card">
                    <div class="icon">✓</div>
                    <h2>Google Drive Connected!</h2>
                    <p>Your POS application is now authenticated with Google Drive.<br><span class="email">${connectedEmail || 'Account Authorized'}</span></p>
                    <p style="font-size: 12px; color: #a8a29e;">You can safely close this browser window and return to Retail POS.</p>
                  </div>
                </body>
              </html>
            `);

            setTimeout(() => {
              try {
                server.close();
              } catch {}
              this.activeAuthServer = null;
            }, 1000);
          }
        } catch (err: any) {
          console.error('[GOOGLE_DRIVE] Error during OAuth callback:', err);
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<h3>Error: ${err.message || 'Authentication failed'}</h3>`);
        }
      });

      // Bind to an ephemeral port on loopback 127.0.0.1
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to bind local loopback server for Google OAuth.'));
          return;
        }

        const port = address.port;
        const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
        const oauth2Client = this.getOAuth2Client(redirectUri);

        const authUrl = oauth2Client.generateAuthUrl({
          access_type: 'offline',
          prompt: 'consent', // Forces refresh token return
          scope: OAUTH_SCOPES,
        });

        this.activeAuthServer = server;

        // Open in user's default browser
        void shell.openExternal(authUrl);

        resolve({
          authUrl,
          waitingForAuth: true,
        });
      });

      server.on('error', (err) => {
        this.activeAuthServer = null;
        reject(err);
      });
    });
  }

  /**
   * Disconnects Google Drive, revokes tokens, and clears local token cache.
   */
  public async disconnect(): Promise<void> {
    const tokens = this.loadTokens();
    if (tokens && tokens.access_token) {
      try {
        const oauth2Client = this.getOAuth2Client();
        await oauth2Client.revokeToken(tokens.access_token);
      } catch (err) {
        console.warn('[GOOGLE_DRIVE] Token revocation notice:', err);
      }
    }

    const tokensPath = this.getTokensFilePath();
    if (fs.existsSync(tokensPath)) {
      try {
        fs.unlinkSync(tokensPath);
      } catch {}
    }

    this.cachedTokens = null;
    this.cachedEmail = null;
    this.cachedFolderId = null;
  }

  /**
   * Finds or creates the dedicated 'POS_Backups' folder in the user's Google Drive.
   */
  public async ensureBackupFolder(): Promise<string> {
    if (this.cachedFolderId) {
      return this.cachedFolderId;
    }

    const oauth2Client = this.getOAuth2Client();
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Search for existing non-trashed folder
    try {
      const listRes = await drive.files.list({
        q: `name = '${BACKUP_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
      });

      if (listRes.data.files && listRes.data.files.length > 0) {
        const folderId = listRes.data.files[0].id!;
        this.cachedFolderId = folderId;
        this.saveTokens(this.loadTokens() || {}, this.cachedEmail || undefined, folderId);
        return folderId;
      }
    } catch (listErr: any) {
      console.warn('[GOOGLE_DRIVE] Could not query existing folder, proceeding to create:', listErr?.message || listErr);
    }

    // Create the folder
    const createRes = await drive.files.create({
      requestBody: {
        name: BACKUP_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        description: 'Automated encrypted database backups from Retail POS Desktop Application.',
      },
      fields: 'id',
    });

    const newFolderId = createRes.data.id!;
    this.cachedFolderId = newFolderId;
    this.saveTokens(this.loadTokens() || {}, this.cachedEmail || undefined, newFolderId);
    return newFolderId;
  }

  /**
   * Uploads an encrypted backup file to the POS_Backups folder in Google Drive.
   * Returns Google Drive file ID, name, and size.
   */
  public async uploadBackupFile(
    localFilePath: string,
    filename: string
  ): Promise<{ fileId: string; filename: string; sizeBytes: number }> {
    const oauth2Client = this.getOAuth2Client();
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const folderId = await this.ensureBackupFolder();

    const fileStream = fs.createReadStream(localFilePath);
    const stat = fs.statSync(localFilePath);

    const res = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [folderId],
        description: `Retail POS Encrypted Backup - ${new Date().toISOString()}`,
      },
      media: {
        mimeType: 'application/octet-stream',
        body: fileStream,
      },
      fields: 'id, name, size',
    });

    const fileId = res.data.id;
    if (!fileId) {
      throw new Error('Google Drive upload failed: No file ID returned from Google API.');
    }

    return {
      fileId,
      filename: res.data.name || filename,
      sizeBytes: parseInt(res.data.size || String(stat.size), 10),
    };
  }

  /**
   * Downloads an encrypted backup file from Google Drive to a local destination path.
   */
  public async downloadBackupFile(fileId: string, destinationPath: string): Promise<string> {
    const oauth2Client = this.getOAuth2Client();
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const destDir = path.dirname(destinationPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const destStream = fs.createWriteStream(destinationPath);

    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    await new Promise<void>((resolve, reject) => {
      res.data
        .on('end', () => resolve())
        .on('error', (err: any) => reject(err))
        .pipe(destStream);
    });

    return destinationPath;
  }

  /**
   * Lists backup files currently in the Google Drive POS_Backups folder.
   */
  public async listDriveBackups(): Promise<Array<{ id: string; name: string; size: number; createdTime: string }>> {
    const oauth2Client = this.getOAuth2Client();
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const folderId = await this.ensureBackupFolder();

    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, size, createdTime)',
      orderBy: 'createdTime desc',
      pageSize: 100,
    });

    return (res.data.files || []).map((f) => ({
      id: f.id || '',
      name: f.name || '',
      size: parseInt(f.size || '0', 10),
      createdTime: f.createdTime || '',
    }));
  }

  /**
   * Deletes a backup file from Google Drive (used for retention management).
   */
  public async deleteDriveFile(fileId: string): Promise<void> {
    const oauth2Client = this.getOAuth2Client();
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    await drive.files.delete({ fileId });
  }
}

export const googleDriveService = new GoogleDriveService();
