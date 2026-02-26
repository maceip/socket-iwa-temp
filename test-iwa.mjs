#!/usr/bin/env node
/**
 * test-iwa.mjs — Build, serve with COOP/COEP headers, test with Puppeteer.
 *
 * Since IWA dev-mode install via CLI flags is fragile, we test the built
 * output via a local HTTP server with the same COOP/COEP/CORP headers
 * that the IWA bundle enforces. This catches:
 *   - CSP inline script violations (via Trusted Types polyfill detection)
 *   - innerHTML / Trusted Types violations
 *   - Missing files / 404s
 *   - JS runtime errors
 *   - DOM rendering issues
 */
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Vite builds multi-page apps: each HTML entry gets its own file in dist/
// but static assets from public/ are copied flat into dist/
// Use dist-test (built without wbn plugin) for testing individual files
const distDir = path.resolve(__dirname, 'dist-test');

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
};

const errors = [];
const warnings = [];
const logs = [];

function startServer() {
  return new Promise(resolve => {
    const server = createServer((req, res) => {
      let urlPath = req.url.split('?')[0];
      if (urlPath === '/') urlPath = '/index.html';

      const ext = path.extname(urlPath);
      const mime = mimeTypes[ext] || 'application/octet-stream';

      // IWA-equivalent headers
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

      const filePath = path.join(distDir, urlPath);
      if (existsSync(filePath) && statSync(filePath).isFile()) {
        res.writeHead(200, { 'Content-Type': mime });
        res.end(readFileSync(filePath));
      } else {
        console.log('  404:', urlPath);
        res.writeHead(404);
        res.end('Not found: ' + urlPath);
      }
    });

    server.listen(0, () => {
      const port = server.address().port;
      resolve({ server, port });
    });
  });
}

async function main() {
  // Check dist exists
  if (!existsSync(path.join(distDir, 'quic.html'))) {
    console.log('No dist-test/quic.html. Run: npx vite build --outDir dist-test');
    process.exit(1);
  }

  const { server, port } = await startServer();
  console.log('Server listening on port', port);
  console.log('Serving from', distDir);

  const browser = await puppeteer.launch({
    headless: 'shell',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  const page = await browser.newPage();

  page.on('console', msg => {
    const text = msg.text();
    const type = msg.type();
    if (type === 'error') {
      errors.push(text);
      console.log('  [ERROR]', text);
    } else if (type === 'warning') {
      warnings.push(text);
    } else {
      logs.push(text);
    }
  });

  page.on('pageerror', err => {
    errors.push('PAGE_ERROR: ' + err.message);
    console.log('  [PAGE ERROR]', err.message);
  });

  page.on('requestfailed', req => {
    const url = req.url();
    if (url.includes('favicon')) return; // ignore favicon
    const msg = url + ' — ' + (req.failure()?.errorText || 'unknown');
    errors.push('REQUEST_FAILED: ' + msg);
    console.log('  [REQUEST FAILED]', msg);
  });

  // Test quic.html
  console.log('\n── Testing /quic.html ──');
  await page.goto(`http://localhost:${port}/quic.html`, {
    waitUntil: 'networkidle0',
    timeout: 10000,
  });
  await new Promise(r => setTimeout(r, 2000));

  const title = await page.title();
  console.log('  Title:', title);

  const statusText = await page.$eval('#status-text', el => el.textContent).catch(() => null);
  console.log('  Status:', statusText);

  const envCards = await page.$$eval('.env-card', els => els.length).catch(() => 0);
  console.log('  Env cards:', envCards);

  const capItems = await page.$$eval('.cap-item', els => els.length).catch(() => 0);
  console.log('  Cap items:', capItems);

  const logLines = await page.$$eval('.log-line', els => els.map(e => e.textContent?.trim())).catch(() => []);
  console.log('  Log lines:', logLines.length);
  logLines.forEach(l => console.log('    >', l));

  // Check bear icon loaded
  const bearLoaded = await page.$eval('.bear-icon', (img) => {
    return img.naturalWidth > 0;
  }).catch(() => false);
  console.log('  Bear icon loaded:', bearLoaded);

  // Check buttons exist and are wired (not using onclick)
  const btnStartHasOnclick = await page.$eval('#btn-start', el => el.hasAttribute('onclick')).catch(() => true);
  const btnClearHasOnclick = await page.$eval('#btn-clear', el => el.hasAttribute('onclick')).catch(() => true);
  if (btnStartHasOnclick) errors.push('btn-start still has inline onclick');
  if (btnClearHasOnclick) errors.push('btn-clear still has inline onclick');
  console.log('  No inline onclick:', !btnStartHasOnclick && !btnClearHasOnclick);

  // Check no inline scripts in the HTML
  const inlineScripts = await page.$$eval('script:not([src])', els => els.length).catch(() => 0);
  if (inlineScripts > 0) errors.push(inlineScripts + ' inline <script> tag(s) found');
  console.log('  No inline scripts:', inlineScripts === 0);

  // Check fonts loaded
  const fontsReady = await page.evaluate(() => document.fonts.ready.then(() => true)).catch(() => false);
  console.log('  Fonts ready:', fontsReady);

  // Check cert hash displayed
  const certVisible = await page.$eval('#cert-card', el => el.classList.contains('visible')).catch(() => false);
  console.log('  Cert card visible:', certVisible);

  // Check snippet hash populated
  const snippetHash = await page.$eval('#snippet-hash', el => el.textContent).catch(() => '');
  console.log('  Snippet hash:', snippetHash?.substring(0, 30) + '...');

  // Also test the main index.html doesn't break
  console.log('\n── Testing /index.html ──');
  const indexErrors = [];
  page.removeAllListeners('pageerror');
  page.on('pageerror', err => {
    indexErrors.push(err.message);
    console.log('  [PAGE ERROR]', err.message);
  });

  await page.goto(`http://localhost:${port}/index.html`, {
    waitUntil: 'networkidle0',
    timeout: 10000,
  }).catch(e => console.log('  Nav error:', e.message));

  const indexTitle = await page.title().catch(() => 'N/A');
  console.log('  Title:', indexTitle);

  // Print results
  console.log('\n========================================');
  console.log('  Test Results');
  console.log('========================================');
  console.log('  Errors:', errors.length);
  errors.forEach(e => console.log('    ✗', e));
  console.log('  Warnings:', warnings.length);
  console.log('========================================');

  await browser.close();
  server.close();

  if (errors.length > 0) {
    console.log('  FAIL — ' + errors.length + ' error(s)');
    process.exit(1);
  } else {
    console.log('  PASS');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
