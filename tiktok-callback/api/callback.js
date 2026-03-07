const CLIENT_KEY = 'sbaw1df2noix3z5n54';
const CLIENT_SECRET = 'dvBW4NXrOfelxEtgD7ZPbIHZAs1ktSYS';
const REDIRECT_URI = 'https://tiktok-callback-tau.vercel.app/api/callback';

export default async function handler(req, res) {
  const { code, error, error_description } = req.query;

  if (error) {
    return res.send(`
      <html>
        <head><title>OAuth Error</title>
        <style>body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; }
        .error { background: #f8d7da; padding: 20px; border-radius: 8px; }</style>
        </head>
        <body>
          <div class="error">
            <h1>Error</h1>
            <p><strong>${error}</strong>: ${error_description || 'Unknown error'}</p>
          </div>
          <p><a href="/api">Try again</a></p>
        </body>
      </html>
    `);
  }

  if (!code) {
    return res.send(`
      <html><body>
        <h1>No authorization code received</h1>
        <p><a href="/api">Try again</a></p>
      </body></html>
    `);
  }

  // Get code verifier from cookie
  const cookies = req.headers.cookie || '';
  const codeVerifier = cookies.split(';')
    .find(c => c.trim().startsWith('code_verifier='))
    ?.split('=')[1];

  if (!codeVerifier) {
    return res.send(`
      <html><body>
        <h1>Session expired</h1>
        <p>Code verifier not found. <a href="/api">Start over</a></p>
      </body></html>
    `);
  }

  try {
    // Exchange code for token
    const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
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

    const tokenData = await tokenResponse.json();

    if (tokenData.error || !tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || 'Failed to get token');
    }

    const { access_token, refresh_token, expires_in, open_id } = tokenData;

    // Clear the cookie
    res.setHeader('Set-Cookie', 'code_verifier=; Path=/; Max-Age=0');

    res.send(`
      <html>
        <head>
          <title>TikTok OAuth Success!</title>
          <style>
            body { font-family: system-ui; max-width: 700px; margin: 50px auto; padding: 20px; }
            pre { background: #f5f5f5; padding: 15px; border-radius: 8px; word-break: break-all; white-space: pre-wrap; }
            .success { background: #d4edda; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            button { background: #fe2c55; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-left: 10px; }
            h3 { margin-top: 25px; }
          </style>
          <script>
            function copy(id) {
              const text = document.getElementById(id).innerText;
              navigator.clipboard.writeText(text);
              event.target.innerText = 'Copied!';
              setTimeout(() => event.target.innerText = 'Copy', 2000);
            }
          </script>
        </head>
        <body>
          <div class="success">
            <h1>Success! You're authorized!</h1>
            <p>Copy these values to your <code>.env</code> file:</p>
          </div>

          <h3>Access Token: <button onclick="copy('token')">Copy</button></h3>
          <pre id="token">${access_token}</pre>

          <h3>Refresh Token: <button onclick="copy('refresh')">Copy</button></h3>
          <pre id="refresh">${refresh_token || 'N/A'}</pre>

          <h3>Open ID:</h3>
          <pre>${open_id}</pre>

          <h3>Expires In:</h3>
          <p>${expires_in} seconds (~${Math.round(expires_in / 3600)} hours)</p>

          <hr>
          <h3>Add to .env:</h3>
          <pre>TIKTOK_ACCESS_TOKEN=${access_token}
TIKTOK_REFRESH_TOKEN=${refresh_token || ''}</pre>
        </body>
      </html>
    `);

  } catch (err) {
    res.send(`
      <html>
        <head><title>Token Exchange Error</title>
        <style>body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; }
        .error { background: #f8d7da; padding: 20px; border-radius: 8px; }
        pre { background: #f5f5f5; padding: 10px; border-radius: 5px; }</style>
        </head>
        <body>
          <div class="error">
            <h1>Token Exchange Failed</h1>
            <p>${err.message}</p>
          </div>
          <p><a href="/api">Try again</a></p>
        </body>
      </html>
    `);
  }
}
