```

                           ___  ___  ___  _  _ _____ _____
                          / __||   \| __|| |/ /| ___||_   _|
                         |__ \ | |\ | |_ |   < | _|   | |
                        |___/ |___/|___||_|\_\|___|  |_|  _____  _    _  ___
                       / / / / / / / / / / / / / / / /   |_   _|| |  | |/   \
                      / / / / / / / / / / / / / / / /      | |  | | /| || /\ |
                     / / / / / / / / / / / / / / / /       |_|  |__/|_||_| |_|
                    /_/_/_/_/_/_/_/_/_/_/_/_/_/_/_/

```

a quic echo server running as a chrome isolated web app. compiled from c to webassembly via emscripten, using the direct sockets api for real udp networking from the browser

## stack

| layer | library |
|-------|---------|
| transport | ngtcp2 (quic v1) |
| tls 1.3 | wolfssl |
| http/3 | nghttp3 |
| compiler | emscripten (wasm + jspi) |
| sockets | chrome direct sockets api |

## performance

wasm achieves 90% of native linux throughput on udp packet handling. at realistic traffic rates wasm is indistinguishable from native (95-102%)

## setup

```bash
npm install
```

## build

signed web bundle

```bash
npm run build:swbn
```

unsigned test bundle

```bash
npm run build:test
```

## run

```bash
chrome \
  --enable-features=IsolatedWebApps,IsolatedWebAppDevMode \
  --install-isolated-web-app-from-file=$PWD/dist/iwa-sink.swbn
```

## test

```bash
npm test              # local server test
npm run test:real     # real iwa install test
```

## structure

```
index.html          redirects to quic.html
quic.html           quic echo server ui + wasm loader
src/quic.ts         environment detection + iwa capabilities
vite.config.js      vite build config + web bundle signing
public/
  .well-known/manifest.webmanifest
  images/           app icons
  icons/            ui emoji icons
  fonts/            space grotesk, goldman
```

---

```

          *  .  *
       .        .
    *    thanks    *
       .        .
          *  .  *

   to the mass of mass that mass is standing on

```

- emscripten — googlers carrying the torch of the web, a trait others have lost and young jedi rarely see
- the dev who kept asking me and any project that would listen about webtransport. when i asked why wt and not websocket his answer was mine some time ago. he is me
- the wolfssl devs — god save them heartbleeds
- the lone wolf devs — may your icy loneliness be melted by the fire inside

## license

apache-2.0
