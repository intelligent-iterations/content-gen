/**
 * TikTok OAuth Helper with PKCE support
 * Run this once to get your access token
 *
 * Usage:
 *   1. Run: npm run oauth
 *   2. Open the URL in your browser
 *   3. Log in and authorize the app
 *   4. You'll be redirected to localhost with a code
 *   5. The server will exchange the code for tokens
 *   6. Copy the access_token to your .env file
 */

import crypto from 'crypto';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
const REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI || 'http://localhost:3000/callback';

const app = express();

// Store PKCE values (in production, use sessions)
let codeVerifier = null;

/**
 * Generate PKCE code verifier and challenge
 */
function generatePKCE() {
  // Generate a random code verifier (43-128 characters)
  codeVerifier = crypto.randomBytes(32).toString('base64url');

  // Generate code challenge using SHA256
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  return { codeVerifier, codeChallenge };
}

/**
 * Generate the authorization URL with PKCE
 */
function getAuthUrl() {
  const { codeChallenge } = generatePKCE();

  // TikTok OAuth scopes for photo posting
  const scopes = [
    'user.info.basic',
    'video.publish'
  ].join(',');

  const state = 'state_' + crypto.randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    client_key: CLIENT_KEY,
    scope: scopes,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });

  return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
}

/**
 * Exchange authorization code for access token (with PKCE)
 */
async function exchangeCodeForToken(code) {
  if (!codeVerifier) {
    throw new Error('Code verifier not found. Please restart the OAuth flow.');
  }

  const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_key: CLIENT_KEY,
      client_secret: CLIENT_SECRET,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier
    })
  });

  const data = await response.json();
  return data;
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(refreshToken) {
  const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_key: CLIENT_KEY,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });

  const data = await response.json();
  return data;
}

// Home page - shows auth URL
app.get('/', (req, res) => {
  const authUrl = getAuthUrl();
  res.send(`
    <html>
      <head>
        <title>TikTok OAuth Setup</title>
        <style>
          body { font-family: system-ui; max-width: 800px; margin: 50px auto; padding: 20px; }
          a { color: #fe2c55; font-weight: bold; }
          pre { background: #f5f5f5; padding: 15px; border-radius: 8px; overflow-x: auto; word-break: break-all; }
          .success { background: #d4edda; border: 1px solid #c3e6cb; padding: 20px; border-radius: 8px; }
          .warning { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 8px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <h1>TikTok OAuth Setup</h1>
        <div class="warning">
          <strong>Important:</strong> Make sure your TikTok Developer App has:
          <ul>
            <li>Redirect URI set to: <code>${REDIRECT_URI}</code></li>
            <li>Content Posting API enabled</li>
          </ul>
        </div>
        <p>Click the link below to authorize your TikTok account:</p>
        <p><a href="${authUrl}" target="_blank">Authorize with TikTok</a></p>
        <p>After authorizing, you'll be redirected back here with your access token.</p>
        <hr>
        <h3>Manual URL (if link doesn't work):</h3>
        <pre>${authUrl}</pre>
      </body>
    </html>
  `);
});

// OAuth callback - exchanges code for token
app.get('/callback', async (req, res) => {
  const { code, error, error_description, state } = req.query;

  if (error) {
    res.send(`
      <html>
        <head>
          <title>OAuth Error</title>
          <style>
            body { font-family: system-ui; max-width: 800px; margin: 50px auto; padding: 20px; }
            .error { background: #f8d7da; border: 1px solid #f5c6cb; padding: 20px; border-radius: 8px; }
          </style>
        </head>
        <body>
          <div class="error">
            <h1>OAuth Error</h1>
            <p><strong>Error:</strong> ${error}</p>
            <p><strong>Description:</strong> ${error_description || 'No description provided'}</p>
          </div>
          <p><a href="/">Try again</a></p>
        </body>
      </html>
    `);
    return;
  }

  if (!code) {
    res.send(`
      <html>
        <head><title>Missing Code</title></head>
        <body>
          <h1>Missing Authorization Code</h1>
          <p>No authorization code received. <a href="/">Try again</a></p>
        </body>
      </html>
    `);
    return;
  }

  try {
    console.log('Exchanging code for token...');
    console.log('Code:', code.substring(0, 20) + '...');
    console.log('Code Verifier:', codeVerifier ? codeVerifier.substring(0, 20) + '...' : 'MISSING');

    const tokenData = await exchangeCodeForToken(code);

    console.log('Token response:', JSON.stringify(tokenData, null, 2));

    if (tokenData.error) {
      throw new Error(`${tokenData.error}: ${tokenData.error_description || 'Unknown error'}`);
    }

    const { access_token, refresh_token, expires_in, open_id } = tokenData;

    if (!access_token) {
      throw new Error('No access token in response: ' + JSON.stringify(tokenData));
    }

    console.log('\n=== SUCCESS! ===');
    console.log('Access Token:', access_token.substring(0, 30) + '...');
    console.log('Refresh Token:', refresh_token ? refresh_token.substring(0, 30) + '...' : 'N/A');
    console.log('Expires In:', expires_in, 'seconds');
    console.log('Open ID:', open_id);
    console.log('\nAdd these to your .env file!');

    res.send(`
      <html>
        <head>
          <title>OAuth Success!</title>
          <style>
            body { font-family: system-ui; max-width: 800px; margin: 50px auto; padding: 20px; }
            pre { background: #f5f5f5; padding: 15px; border-radius: 8px; overflow-x: auto; word-break: break-all; }
            .success { background: #d4edda; border: 1px solid #c3e6cb; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; }
            .copy-btn { background: #fe2c55; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-left: 10px; }
          </style>
          <script>
            function copyToClipboard(text, btn) {
              navigator.clipboard.writeText(text);
              btn.textContent = 'Copied!';
              setTimeout(() => btn.textContent = 'Copy', 2000);
            }
          </script>
        </head>
        <body>
          <div class="success">
            <h1>Success! You're Authorized</h1>
            <p>Copy these values to your <code>.env</code> file:</p>
          </div>

          <h3>Access Token: <button class="copy-btn" onclick="copyToClipboard('${access_token}', this)">Copy</button></h3>
          <pre>${access_token}</pre>

          <h3>Refresh Token: <button class="copy-btn" onclick="copyToClipboard('${refresh_token || ''}', this)">Copy</button></h3>
          <pre>${refresh_token || 'N/A'}</pre>

          <h3>Open ID:</h3>
          <pre>${open_id}</pre>

          <h3>Expires In:</h3>
          <p>${expires_in} seconds (${Math.round(expires_in / 3600)} hours)</p>

          <hr>
          <h3>Add to .env:</h3>
          <pre>TIKTOK_ACCESS_TOKEN=${access_token}
TIKTOK_REFRESH_TOKEN=${refresh_token || ''}</pre>

          <p><strong>Note:</strong> Access tokens expire after ${Math.round(expires_in / 3600)} hours. Use the refresh token to get new access tokens when needed.</p>
        </body>
      </html>
    `);

  } catch (err) {
    console.error('Token exchange error:', err);
    res.send(`
      <html>
        <head>
          <title>Token Exchange Error</title>
          <style>
            body { font-family: system-ui; max-width: 800px; margin: 50px auto; padding: 20px; }
            .error { background: #f8d7da; border: 1px solid #f5c6cb; padding: 20px; border-radius: 8px; }
            pre { background: #f5f5f5; padding: 15px; border-radius: 8px; overflow-x: auto; }
          </style>
        </head>
        <body>
          <div class="error">
            <h1>Token Exchange Error</h1>
            <p>${err.message}</p>
          </div>
          <h3>Debug Info:</h3>
          <pre>Code Verifier present: ${!!codeVerifier}
Client Key: ${CLIENT_KEY}
Redirect URI: ${REDIRECT_URI}</pre>
          <p><a href="/">Try again</a> (this will generate a new PKCE challenge)</p>
        </body>
      </html>
    `);
  }
});

// Start server only when run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const PORT = 3000;
  app.listen(PORT, () => {
    console.log('\n=== TikTok OAuth Setup (with PKCE) ===\n');
    console.log(`Server running at: http://localhost:${PORT}`);
    console.log(`\nOpen this URL in your browser to start the OAuth flow.\n`);
    console.log('Client Key:', CLIENT_KEY);
    console.log('Redirect URI:', REDIRECT_URI);
    console.log('\n');
  });
}
