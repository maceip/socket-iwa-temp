#!/usr/bin/env node
/**
 * test-iwa-real.mjs — Test the actual .swbn in Chrome with IWA dev mode.
 * Uses Puppeteer with IWA flags to install and navigate to the real IWA.
 */
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const swbnPath = path.resolve(__dirname, 'dist/iwa-sink.swbn');
const webBundleId = 'va5nmqd44umdnobnnp7xpxdbhjn6dlsrdgirrnsm6envbjndx2waaaic';
const iwaOrigin = `isolated-app://${webBundleId}`;

const errors = [];
const warnings = [];

async function main() {
  console.log('Bundle:', swbnPath);
  console.log('IWA origin:', iwaOrigin);
  console.log('');

  const browser = await puppeteer.launch({
    headless: 'shell',
    executablePath: '/home/devuser/.cache/puppeteer/chrome/linux-145.0.7632.77/chrome-linux64/chrome',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--enable-features=IsolatedWebApps,IsolatedWebAppDevMode',
      '--install-isolated-web-app-from-file=' + swbnPath,
    ],
    userDataDir: '/tmp/iwa-puppeteer-profile-' + Date.now(),
  });

  // Give Chrome time to install the IWA
  console.log('Waiting for IWA installation...');
  await new Promise(r => setTimeout(r, 3000));

  // Simulate user opening chrome://apps and clicking the app
  const appsPage = await browser.newPage();
  await appsPage.goto('chrome://apps', { waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1000));

  // Click the IWA app icon (it should be installed)
  // IWAs show up as installed apps — try to find and click it
  const clicked = await appsPage.evaluate(() => {
    // chrome://apps uses a shadow DOM; try to find the app link
    const appLinks = document.querySelectorAll('a[href*="isolated-app://"]');
    if (appLinks.length > 0) {
      appLinks[0].click();
      return true;
    }
    // Fallback: look inside shadow roots
    const appList = document.querySelector('#apps-page');
    if (appList) {
      const links = appList.querySelectorAll('a');
      for (const link of links) {
        if (link.href && link.href.includes('isolated-app')) {
          link.click();
          return true;
        }
      }
    }
    return false;
  }).catch(() => false);

  console.log('Clicked app from chrome://apps:', clicked);

  if (clicked) {
    // Wait for the new tab/window to open
    await new Promise(r => setTimeout(r, 3000));
    const pages = await browser.pages();
    const iwaPage = pages.find(p => p.url().includes('isolated-app://'));
    if (iwaPage) {
      console.log('IWA opened via chrome://apps at:', iwaPage.url());
      // Navigate to quic.html within the IWA
      if (!iwaPage.url().includes('quic.html')) {
        await iwaPage.goto(iwaOrigin + '/quic.html', { waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
      }
    }
  }

  // If clicking didn't work, fall back to direct navigation
  // (chrome://apps may not render fully in headless)
  const allPages = await browser.pages();
  let page = allPages.find(p => p.url().includes('isolated-app://')) || await browser.newPage();
  if (!page.url().includes('isolated-app://')) {
    console.log('Falling back to direct IWA navigation...');
    await page.goto(iwaOrigin + '/quic.html', { waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
  }

  page.on('console', msg => {
    const text = msg.text();
    const type = msg.type();
    if (type === 'error') {
      errors.push(text);
      console.log('  [ERROR]', text);
    } else if (type === 'warning') {
      warnings.push(text);
      console.log('  [WARN]', text);
    } else {
      console.log('  [LOG]', text);
    }
  });

  page.on('pageerror', err => {
    errors.push('PAGE_ERROR: ' + err.message);
    console.log('  [PAGE ERROR]', err.message);
  });

  page.on('requestfailed', req => {
    const url = req.url();
    if (url.includes('favicon')) return;
    errors.push('REQ_FAIL: ' + url + ' — ' + (req.failure()?.errorText || '?'));
    console.log('  [REQ FAIL]', url, req.failure()?.errorText);
  });

  // Navigate to the IWA
  console.log('\nNavigating to', iwaOrigin + '/quic.html');
  try {
    const resp = await page.goto(iwaOrigin + '/quic.html', {
      waitUntil: 'networkidle2',
      timeout: 15000,
    });
    console.log('  HTTP status:', resp?.status());
  } catch (err) {
    console.log('  Navigation error:', err.message);
    errors.push('NAV: ' + err.message);
  }

  await new Promise(r => setTimeout(r, 3000));

  // ══════════════════════════════════════════════════════
  //  DETAILED INSPECTION
  // ══════════════════════════════════════════════════════

  const url = page.url();

  console.log('');
  console.log('══════════════════════════════════════════════════════');
  console.log('  IWA Integration Test — Detailed Report');
  console.log('══════════════════════════════════════════════════════');
  console.log('');
  console.log('── Page ──');
  console.log('  URL:      ', url);
  const title = await page.title().catch(() => 'N/A');
  console.log('  Title:    ', title);
  const doctype = await page.evaluate(() => document.doctype ? '<!DOCTYPE ' + document.doctype.name + '>' : 'none').catch(() => 'N/A');
  console.log('  Doctype:  ', doctype);
  const charset = await page.evaluate(() => document.characterSet).catch(() => 'N/A');
  console.log('  Charset:  ', charset);

  console.log('');
  console.log('── Security Context ──');
  const coiValue = await page.evaluate(() => crossOriginIsolated).catch(() => false);
  console.log('  crossOriginIsolated:  ', coiValue);
  const sabAvail = await page.evaluate(() => typeof SharedArrayBuffer !== 'undefined').catch(() => false);
  console.log('  SharedArrayBuffer:    ', sabAvail);
  const isSecure = await page.evaluate(() => window.isSecureContext).catch(() => false);
  console.log('  isSecureContext:      ', isSecure);
  const origin = await page.evaluate(() => window.location.origin).catch(() => 'N/A');
  console.log('  origin:               ', origin);
  const protocol = await page.evaluate(() => window.location.protocol).catch(() => 'N/A');
  console.log('  protocol:             ', protocol);

  console.log('');
  console.log('── IWA-Exclusive APIs ──');
  const dsApis = await page.evaluate(() => ({
    UDPSocket:        typeof UDPSocket !== 'undefined',
    TCPSocket:        typeof TCPSocket !== 'undefined',
    TCPServerSocket:  typeof TCPServerSocket !== 'undefined',
  })).catch(() => ({}));
  for (const [k, v] of Object.entries(dsApis)) {
    console.log('  ' + k.padEnd(22), v ? '✓ available' : '✗ missing');
  }

  console.log('');
  console.log('── Standard APIs (secure context) ──');
  const stdApis = await page.evaluate(() => ({
    'App Badge':        'setAppBadge' in navigator,
    'Wake Lock':        'wakeLock' in navigator,
    'Idle Detection':   typeof IdleDetector !== 'undefined',
    'File System':      typeof showOpenFilePicker === 'function',
    'Clipboard':        !!(navigator.clipboard && navigator.clipboard.write),
    'EyeDropper':       typeof EyeDropper !== 'undefined',
    'Local Fonts':      typeof queryLocalFonts === 'function',
    'Web Bluetooth':    !!navigator.bluetooth,
    'Web USB':          !!navigator.usb,
    'Web HID':          !!navigator.hid,
    'Web Serial':       !!navigator.serial,
    'View Transitions': !!document.startViewTransition,
    'Popover':          typeof HTMLElement.prototype.togglePopover === 'function',
    'Navigation API':   typeof navigation !== 'undefined',
    'Screen Details':   typeof getScreenDetails === 'function',
    'Notifications':    typeof Notification !== 'undefined',
    'Web Share':        !!navigator.share,
  })).catch(() => ({}));
  let apiOk = 0, apiTotal = 0;
  for (const [k, v] of Object.entries(stdApis)) {
    apiTotal++;
    if (v) apiOk++;
    console.log('  ' + k.padEnd(22), v ? '✓' : '·');
  }
  console.log('  ────────────────────────────');
  console.log('  Total: ' + apiOk + '/' + apiTotal + ' available');

  console.log('');
  console.log('── DOM Structure ──');
  const statusText = await page.$eval('#status-text', el => el.textContent).catch(() => 'N/A');
  console.log('  #status-text:         ', JSON.stringify(statusText));
  const envCards = await page.$$eval('.env-card', els => els.map(el => {
    const label = el.querySelector('.env-card-label')?.textContent || '';
    const value = el.querySelector('.env-card-value')?.textContent || '';
    const cls = el.querySelector('.env-card-value')?.className || '';
    return { label, value, cls };
  })).catch(() => []);
  console.log('  Env cards:             ' + envCards.length);
  envCards.forEach(c => {
    const status = c.cls.includes('ok') ? '✓' : c.cls.includes('err') ? '✗' : '⚠';
    console.log('    ' + status + ' ' + c.label.padEnd(24) + c.value);
  });

  const capItems = await page.$$eval('.cap-item', els => els.map(el => ({
    name: el.textContent?.trim() || '',
    ok: el.classList.contains('ok'),
  }))).catch(() => []);
  console.log('  Capability items:      ' + capItems.length);
  const capOk = capItems.filter(c => c.ok);
  const capOff = capItems.filter(c => !c.ok);
  console.log('    ✓ ' + capOk.map(c => c.name).join(', '));
  console.log('    · ' + capOff.map(c => c.name).join(', '));

  console.log('');
  console.log('── Log Output ──');
  const logLines = await page.$$eval('.log-line', els => els.map(e => {
    const ts = e.querySelector('.log-ts')?.textContent || '';
    const cls = e.className.replace('log-line ', '');
    const text = e.textContent?.replace(ts, '').trim() || '';
    return { ts, cls, text };
  })).catch(() => []);
  console.log('  Lines: ' + logLines.length);
  logLines.forEach(l => {
    const icon = l.cls.includes('ok') ? '✓' : l.cls.includes('err') ? '✗' : l.cls.includes('warn') ? '⚠' : '·';
    console.log('    ' + icon + ' [' + l.ts.trim() + '] ' + l.text);
  });

  console.log('');
  console.log('── Certificate ──');
  const certVisible = await page.$eval('#cert-card', el => el.classList.contains('visible')).catch(() => false);
  console.log('  Card visible:         ', certVisible);
  const certHash = await page.$eval('#cert-value', el => el.textContent).catch(() => 'N/A');
  console.log('  SHA-256 (base64):      ' + certHash);
  const snippetHash = await page.$eval('#snippet-hash', el => el.textContent).catch(() => 'N/A');
  console.log('  Snippet hash:          ' + snippetHash);

  console.log('');
  console.log('── Assets ──');
  const bearLoaded = await page.$eval('.bear-icon', img => img.complete && img.naturalWidth > 0).catch(() => false);
  console.log('  Bear icon:            ', bearLoaded ? '✓ loaded' : '✗ failed');

  const emojiIcons = await page.$$eval('img.emoji-icon', imgs => {
    const loaded = imgs.filter(i => i.complete && i.naturalWidth > 0).length;
    const failed = imgs.filter(i => i.complete && i.naturalWidth === 0).map(i => i.src.split('/').pop());
    return { total: imgs.length, loaded, failed };
  }).catch(() => ({ total: 0, loaded: 0, failed: [] }));
  console.log('  Emoji icons:           ' + emojiIcons.loaded + '/' + emojiIcons.total + ' loaded');
  if (emojiIcons.failed.length > 0) {
    console.log('    Failed:', emojiIcons.failed.join(', '));
  }

  const fontsReady = await page.evaluate(() => document.fonts.ready.then(() => true)).catch(() => false);
  console.log('  Fonts ready:          ', fontsReady ? '✓' : '✗');
  const fontList = await page.evaluate(() => {
    const fonts = [];
    document.fonts.forEach(f => { if (f.status === 'loaded') fonts.push(f.family + ' ' + f.weight); });
    return fonts;
  }).catch(() => []);
  console.log('  Loaded fonts:          ' + (fontList.length > 0 ? fontList.join(', ') : 'none'));

  console.log('');
  console.log('── CSP / Trusted Types Compliance ──');
  const inlineScripts = await page.$$eval('script:not([src])', els => els.length).catch(() => 0);
  console.log('  Inline <script>:      ', inlineScripts === 0 ? '✓ none' : '✗ ' + inlineScripts + ' found');
  const onclickAttrs = await page.$$eval('[onclick]', els => els.map(e => e.tagName + '#' + e.id)).catch(() => []);
  console.log('  onclick= attributes:  ', onclickAttrs.length === 0 ? '✓ none' : '✗ ' + onclickAttrs.join(', '));
  const innerHTMLUsed = errors.some(e => /innerHTML|TrustedHTML/i.test(e));
  console.log('  TrustedHTML errors:   ', innerHTMLUsed ? '✗ found' : '✓ none');

  console.log('');
  console.log('── Buttons ──');
  const btnStartDisabled = await page.$eval('#btn-start', el => el.disabled).catch(() => null);
  console.log('  #btn-start disabled:  ', btnStartDisabled);
  const btnClearExists = await page.$('#btn-clear') !== null;
  console.log('  #btn-clear exists:    ', btnClearExists);

  console.log('');
  console.log('── Manifest ──');
  const manifestUrl = await page.evaluate(() => {
    const link = document.querySelector('link[rel="manifest"]');
    return link ? link.href : 'N/A (IWA uses .well-known/manifest.webmanifest)';
  }).catch(() => 'N/A');
  console.log('  Manifest link:         ' + manifestUrl);
  // Try fetching the manifest from within the IWA
  const manifest = await page.evaluate(async () => {
    try {
      const r = await fetch('/.well-known/manifest.webmanifest');
      return await r.json();
    } catch { return null; }
  }).catch(() => null);
  if (manifest) {
    console.log('  name:                  ' + manifest.name);
    console.log('  version:               ' + manifest.version);
    console.log('  display:               ' + manifest.display);
    console.log('  display_override:      ' + JSON.stringify(manifest.display_override));
    console.log('  icons:                 ' + manifest.icons?.length + ' entries');
    console.log('  shortcuts:             ' + manifest.shortcuts?.length + ' entries');
    console.log('  tab_strip:             ' + JSON.stringify(manifest.tab_strip || 'N/A'));
    console.log('  permissions_policy:');
    for (const [k, v] of Object.entries(manifest.permissions_policy || {})) {
      console.log('    ' + k + ': ' + JSON.stringify(v));
    }
  } else {
    console.log('  (could not fetch manifest)');
  }

  // Take screenshot
  await page.screenshot({ path: path.join(__dirname, 'test-screenshot.png'), fullPage: true }).catch(() => {});
  console.log('');
  console.log('  Screenshot: test-screenshot.png');

  // ══════════════════════════════════════════════════════
  //  RESULTS
  // ══════════════════════════════════════════════════════
  console.log('');
  console.log('══════════════════════════════════════════════════════');
  if (errors.length === 0) {
    console.log('  ✓ PASS — 0 errors, ' + warnings.length + ' warnings');
  } else {
    console.log('  ✗ FAIL — ' + errors.length + ' error(s)');
    errors.forEach(e => console.log('    ✗ ' + e));
  }
  if (warnings.length > 0) {
    warnings.forEach(w => console.log('    ⚠ ' + w));
  }
  console.log('══════════════════════════════════════════════════════');

  await browser.close();
  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
