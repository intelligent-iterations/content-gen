import crypto from 'crypto';

const CLIENT_KEY = 'sbaw1df2noix3z5n54';
const REDIRECT_URI = 'https://tiktok-callback-tau.vercel.app/api/callback';

export default function handler(req, res) {
  // Generate PKCE
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  // TikTok Content Posting API scopes - both upload and publish
  const scopes = 'user.info.basic,video.upload,video.publish';
  const state = crypto.randomBytes(16).toString('hex');

  // Store verifier in a cookie (will be read by callback)
  const params = new URLSearchParams({
    client_key: CLIENT_KEY,
    scope: scopes,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });

  const authUrl = `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;

  res.setHeader('Set-Cookie', `code_verifier=${codeVerifier}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`);

  res.send(`
    <html>
      <head>
        <title>TikTok OAuth</title>
        <style>
          body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
          a { display: inline-block; background: #fe2c55; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-size: 18px; }
          a:hover { background: #d42a4c; }
          pre { background: #f5f5f5; padding: 10px; border-radius: 5px; text-align: left; font-size: 12px; overflow-x: auto; }
        </style>
      </head>
      <body>
        <h1>TikTok OAuth for pom</h1>
        <p>Click below to authorize:</p>
        <p><a href="${authUrl}">Authorize with TikTok</a></p>
        <hr>
        <p><small>Redirect URI: ${REDIRECT_URI}</small></p>
      </body>
    </html>
  `);
}
