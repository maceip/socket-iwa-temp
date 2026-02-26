const logEl = document.getElementById('log')!;
const statusEl = document.getElementById('status')!;
const statusTextEl = document.getElementById('status-text')!;
const btnStart = document.getElementById('btn-start') as HTMLButtonElement;
const btnClear = document.getElementById('btn-clear')!;
const logCountEl = document.getElementById('log-count')!;
const loadingOverlay = document.getElementById('loading-overlay')!;
const badgeDisplay = document.getElementById('badge-display')!;
const badgeCountEl = document.getElementById('badge-count')!;
let lineCount = 0;
let connectionCount = 0;

// ── Badging API ──
const badgingSupported = 'setAppBadge' in navigator;

async function updateBadge(count: number) {
  connectionCount = count;
  badgeCountEl.textContent = String(count);
  badgeDisplay.style.display = count > 0 ? 'inline-flex' : 'none';
  if (badgingSupported) {
    try {
      if (count > 0) {
        await (navigator as any).setAppBadge(count);
      } else {
        await (navigator as any).clearAppBadge();
      }
    } catch (_) {}
  }
}

function setStatus(text: string, cls: string) {
  statusTextEl.textContent = text;
  statusEl.className = 'status-pill ' + cls;
}

function log(msg: string, cls?: string) {
  if (!cls) {
    if (/FATAL:|error/i.test(msg))                                            cls = 'log-err';
    else if (/OK$|loaded|configured|completed|Listening|available/i.test(msg)) cls = 'log-ok';
    else if (/warn|requires|not available/i.test(msg))                        cls = 'log-warn';
    else                                                                      cls = 'log-info';
  }
  const ts = new Date().toISOString().split('T')[1].replace('Z', '');
  const line = document.createElement('div');
  line.className = 'log-line ' + cls;

  const tsSpan = document.createElement('span');
  tsSpan.className = 'log-ts';
  tsSpan.textContent = ts;
  line.appendChild(tsSpan);
  line.appendChild(document.createTextNode(msg));

  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
  lineCount++;
  logCountEl.textContent = lineCount + ' line' + (lineCount !== 1 ? 's' : '');
}

function clearLog() {
  while (logEl.firstChild) logEl.removeChild(logEl.firstChild);
  lineCount = 0;
  logCountEl.textContent = '0 lines';
}

// ── Show cert hash ──
(function showCertHash() {
  const meta = document.querySelector('meta[name="cert-hash-b64"]') as HTMLMetaElement | null;
  if (meta && meta.content && meta.content !== 'PLACEHOLDER') {
    const card = document.getElementById('cert-card')!;
    card.classList.add('visible');
    document.getElementById('cert-value')!.textContent = meta.content;
    document.getElementById('snippet-hash')!.textContent = "'" + meta.content + "'";
  }
})();

// ── Helper: create an env card using DOM API (no innerHTML) ──
function createEnvCard(iconName: string, label: string, value: string, cls: string): HTMLElement {
  const card = document.createElement('div');
  card.className = 'env-card';

  const icon = document.createElement('img');
  icon.src = '/icons/' + iconName + '.svg';
  icon.className = 'emoji-icon';
  icon.alt = '';
  card.appendChild(icon);

  const labelDiv = document.createElement('div');
  labelDiv.className = 'env-card-label';
  labelDiv.textContent = label;
  card.appendChild(labelDiv);

  const valueDiv = document.createElement('div');
  valueDiv.className = 'env-card-value ' + cls;
  valueDiv.textContent = value;
  card.appendChild(valueDiv);

  return card;
}

// ── Helper: create a capability item using DOM API ──
function createCapItem(name: string, ok: boolean): HTMLElement {
  const item = document.createElement('div');
  item.className = 'cap-item ' + (ok ? 'ok' : 'off');

  const dot = document.createElement('span');
  dot.className = 'cap-dot';
  item.appendChild(dot);
  item.appendChild(document.createTextNode(name));

  return item;
}

// ── Environment checks ──
(function checkEnvironment() {
  const grid = document.getElementById('env-grid')!;
  const envIcons: Record<string, string> = {
    'SharedArrayBuffer': 'high-voltage',
    'Cross-Origin Isolated': 'guard-1',
    'Direct Sockets': 'electric-plug',
    'Badging API': 'bell',
  };

  const g = globalThis as any;
  const checks = [
    {
      label: 'SharedArrayBuffer',
      value: typeof SharedArrayBuffer !== 'undefined' ? 'available' : 'missing',
      cls: typeof SharedArrayBuffer !== 'undefined' ? 'ok' : 'err',
    },
    {
      label: 'Cross-Origin Isolated',
      value: typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated ? 'yes' : 'no',
      cls: typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated ? 'ok' : 'warn',
    },
    {
      label: 'Direct Sockets',
      value: typeof g.TCPSocket !== 'undefined' || typeof g.UDPSocket !== 'undefined' ? 'available' : 'unavailable',
      cls: typeof g.TCPSocket !== 'undefined' || typeof g.UDPSocket !== 'undefined' ? 'ok' : 'warn',
    },
    {
      label: 'Badging API',
      value: badgingSupported ? 'available' : 'unavailable',
      cls: badgingSupported ? 'ok' : 'warn',
    },
  ];

  checks.forEach(c => {
    const icon = envIcons[c.label] || 'sparkles';
    grid.appendChild(createEnvCard(icon, c.label, c.value, c.cls));
    log(c.label + ': ' + c.value);
  });

  if (typeof SharedArrayBuffer === 'undefined') {
    log('Need COOP/COEP headers or IWA context for SharedArrayBuffer', 'log-err');
    setStatus('missing SharedArrayBuffer', 'status-error');
    btnStart.disabled = true;
    return;
  }

  log('Ready to start.', 'log-ok');
})();

// ── IWA Capabilities detection ──
(function detectCapabilities() {
  const capsGrid = document.getElementById('caps-grid')!;
  const g = globalThis as any;
  const caps = [
    { name: 'UDPSocket',        ok: typeof g.UDPSocket !== 'undefined' },
    { name: 'TCPSocket',        ok: typeof g.TCPSocket !== 'undefined' },
    { name: 'TCPServerSocket',  ok: typeof g.TCPServerSocket !== 'undefined' },
    { name: 'App Badge',        ok: 'setAppBadge' in navigator },
    { name: 'Wake Lock',        ok: 'wakeLock' in navigator },
    { name: 'Idle Detection',   ok: typeof g.IdleDetector !== 'undefined' },
    { name: 'File System',      ok: typeof g.showOpenFilePicker === 'function' },
    { name: 'Clipboard',        ok: !!(navigator.clipboard && (navigator.clipboard as any).write) },
    { name: 'EyeDropper',       ok: typeof g.EyeDropper !== 'undefined' },
    { name: 'Local Fonts',      ok: typeof g.queryLocalFonts === 'function' },
    { name: 'Web Bluetooth',    ok: !!(navigator as any).bluetooth },
    { name: 'Web USB',          ok: !!(navigator as any).usb },
    { name: 'Web HID',          ok: !!(navigator as any).hid },
    { name: 'Web Serial',       ok: !!(navigator as any).serial },
    { name: 'View Transitions', ok: !!(document as any).startViewTransition },
    { name: 'Popover',          ok: typeof HTMLElement.prototype.togglePopover === 'function' },
    { name: 'Navigation API',   ok: typeof g.navigation !== 'undefined' },
    { name: 'Screen Details',   ok: typeof g.getScreenDetails === 'function' },
    { name: 'Notifications',    ok: typeof g.Notification !== 'undefined' },
    { name: 'Web Share',        ok: !!(navigator as any).share },
  ];

  let okCount = 0;
  caps.forEach(c => {
    if (c.ok) okCount++;
    capsGrid.appendChild(createCapItem(c.name, c.ok));
  });

  log('IWA capabilities: ' + okCount + '/' + caps.length + ' APIs detected', 'log-ok');
})();

// ── Start server ──
async function startServer() {
  btnStart.disabled = true;
  setStatus('loading...', 'status-loading');
  loadingOverlay.classList.add('active');
  log('Loading QUIC echo server...');

  (window as any).Module = {
    print(text: string) {
      log(text);
    },
    printErr(text: string) {
      log(text);

      if (/new QUIC connection|handshake completed|connection established/i.test(text)) {
        updateBadge(connectionCount + 1);
        log('Connection #' + connectionCount + ' — badge updated', 'log-ok');

        // Open a new IWA tab for the connection (tabbed display mode)
        try {
          window.open('/quic.html?conn=' + connectionCount, '_blank');
        } catch (_) {}
      }

      if (/connection closed|connection timeout|draining/i.test(text)) {
        updateBadge(Math.max(0, connectionCount - 1));
      }

      if (/Listening|Waiting for QUIC/.test(text)) {
        setStatus('running — port 4433', 'status-running');
        loadingOverlay.classList.remove('active');
        document.querySelector('.log-container')!.classList.add('active-glow');
      }
      if (/^FATAL:/.test(text)) {
        setStatus('error', 'status-error');
        loadingOverlay.classList.remove('active');
      }
    },
    locateFile(path: string) {
      return path;
    },
    onAbort(what: string) {
      log('Module aborted: ' + what, 'log-err');
      setStatus('aborted', 'status-error');
      loadingOverlay.classList.remove('active');
    },
  };

  const script = document.createElement('script');
  script.src = 'quic_echo_server.js';
  script.onload = () => {
    log('Emscripten JS loaded, spawning worker...');
  };
  script.onerror = () => {
    log('Failed to load quic_echo_server.js', 'log-err');
    setStatus('load failed', 'status-error');
    loadingOverlay.classList.remove('active');
    btnStart.disabled = false;
  };
  document.body.appendChild(script);
}

// ── Wire up event listeners ──
btnStart.addEventListener('click', startServer);
btnClear.addEventListener('click', clearLog);

// ── Clear badge on page unload ──
window.addEventListener('beforeunload', () => {
  if (badgingSupported) {
    (navigator as any).clearAppBadge().catch(() => {});
  }
});
