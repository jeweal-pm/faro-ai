# JW GIS backend pnpm setup on Ubuntu

- Request: make `pnpm install` and `pnpm run dev` work in `/home/joke/dev/jw-gis-backend`.
- Environment diagnosis: the Ubuntu shell had no `node` command on PATH. A pnpm 12.16.1 shim existed under `~/.local/share/pnpm/bin` but was also outside PATH.
- Runtime setup: install Node.js 24.22.2 under `~/.local/opt` after checking the official archive SHA-256; expose `node`, `npm`, and `pnpm` through `~/.local/bin` (already on PATH).
- Build policy: explicitly allow `bcrypt`, `canvas`, `puppeteer`, and `sharp`; explicitly deny `@parcel/watcher`, `core-js`, `protobufjs`, and `unrs-resolver`. The four approved dependency scripts completed successfully.
- pnpm 12 reads `nodeLinker` from `pnpm-workspace.yaml`, so preserve the existing hoisted linker choice there; leave `.npmrc` untouched.
- Validation: `pnpm install --frozen-lockfile` passed without lockfile changes. `pnpm run dev` started on port `3009` and connected to MongoDB. Startup emitted a non-blocking `MaxListenersExceededWarning`.

