export default function handler(request: any, response: any): void {
  const protocol = request.headers['x-forwarded-proto'] || 'https';
  const host = request.headers['host'] || 'localhost';
  const manifestUrl = `${protocol}://${host}/manifest.json`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Telegram Bridge Stremio Addon</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Outfit', sans-serif;
      background: #090d16;
      color: #f1f5f9;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      background-image: 
        radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.15) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(168, 85, 247, 0.15) 0px, transparent 50%);
    }
    .card {
      background: rgba(30, 41, 59, 0.7);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 24px;
      padding: 2.5rem;
      max-width: 540px;
      width: 100%;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
    .header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 1.5rem;
    }
    .icon {
      width: 52px;
      height: 52px;
      background: linear-gradient(135deg, #6366f1, #a855f7);
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 26px;
      box-shadow: 0 8px 16px rgba(99, 102, 241, 0.3);
    }
    h1 {
      font-size: 1.6rem;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(34, 197, 94, 0.12);
      border: 1px solid rgba(34, 197, 94, 0.3);
      color: #4ade80;
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 0.875rem;
      font-weight: 600;
      margin-bottom: 1.5rem;
    }
    .dot {
      width: 8px;
      height: 8px;
      background: #22c55e;
      border-radius: 50%;
      box-shadow: 0 0 10px #22c55e;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.85); }
    }
    p {
      color: #94a3b8;
      font-size: 0.95rem;
      line-height: 1.6;
      margin-bottom: 1.5rem;
    }
    .input-box {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 14px;
      padding: 10px 14px;
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 1.5rem;
    }
    .input-box input {
      background: transparent;
      border: none;
      color: #38bdf8;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85rem;
      width: 100%;
      outline: none;
    }
    .btn {
      background: linear-gradient(135deg, #6366f1, #a855f7);
      color: white;
      border: none;
      padding: 10px 18px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.2s;
    }
    .btn:hover { opacity: 0.9; transform: translateY(-1px); }
    .steps {
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding-top: 1.5rem;
    }
    .steps h3 {
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #cbd5e1;
      margin-bottom: 1rem;
    }
    .step-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 0.8rem;
      font-size: 0.9rem;
      color: #94a3b8;
    }
    .step-num {
      background: rgba(255, 255, 255, 0.08);
      color: #f1f5f9;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 700;
      flex-shrink: 0;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="icon">🍿</div>
      <div>
        <h1>Telegram Bridge</h1>
        <div style="font-size: 0.85rem; color: #64748b;">Stremio Addon v0.1.0</div>
      </div>
    </div>

    <div class="status-badge">
      <div class="dot"></div>
      <span>Addon Server Online & Active</span>
    </div>

    <p>Private indexed Telegram media stream addon for Stremio. Fast playback, multi-bot link generation, and zero media storage.</p>

    <div class="input-box">
      <input type="text" readonly value="${manifestUrl}" id="manifest-url">
      <button class="btn" onclick="copyManifest()">Copy URL</button>
    </div>

    <div class="steps">
      <h3>Quick Install Guide</h3>
      <div class="step-item">
        <div class="step-num">1</div>
        <div>Click <strong>Copy URL</strong> above to copy the manifest link.</div>
      </div>
      <div class="step-item">
        <div class="step-num">2</div>
        <div>Open <strong>Stremio</strong> and go to the <strong>Addons</strong> section.</div>
      </div>
      <div class="step-item">
        <div class="step-num">3</div>
        <div>Paste the copied URL into the search bar and click <strong>Install</strong>.</div>
      </div>
    </div>
  </div>

  <script>
    function copyManifest() {
      const input = document.getElementById('manifest-url');
      input.select();
      navigator.clipboard.writeText(input.value);
      const btn = event.target;
      btn.innerText = 'Copied! ✅';
      setTimeout(() => btn.innerText = 'Copy URL', 2000);
    }
  </script>
</body>
</html>`;

  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.status(200).send(html);
}
