# Run the backend for the Android app

The APK is the native frontend. The Node.js service is the backend. They do not run inside one Android process. The phone needs access to a publicly reachable or private-network HTTPS backend and that server needs access to your configured model provider.

## Option A: Node.js 22+

```sh
npm ci
cp .env.example .env
# Edit .env: OPENAI_API_KEY, CYBER_DAVID_TOKEN (random, 24+ characters), API_ONLY=true
node app.js --production
```

`API_ONLY=true` skips Vite and web UI serving, so no web build is needed. Configure a TLS reverse proxy or your hosting platform's HTTPS ingress to forward requests to port 3000. Use a request timeout above 200 seconds. In Android enter the **HTTPS origin** (no trailing API path) and workspace code. Do not use `localhost` on the phone to refer to a server on your computer. Do not disable certificate validation or cleartext protection.

## Option B: Container

```sh
docker build -t cyber-david-backend .
docker volume create cyber-david-data
docker run -d --name cyber-david-backend \
  --env-file .env \
  -e API_ONLY=true -e DATA_DIR=/app/data \
  -p 127.0.0.1:3000:3000 \
  -v cyber-david-data:/app/data \
  cyber-david-backend
```

The example binds to host loopback intentionally for a reverse proxy on the same host. A managed host may require a different port binding. The container itself listens on `0.0.0.0:3000`, runs as the non-root `node` user, and includes a `/healthz` probe. If using a bind mount instead of a named volume, ensure the `node` user (UID 1000) can write it. Never bake `.env` or keys into the image. Use the hosting platform's secrets feature where available.

## Operational limits

- **One user / one replica.** Shared access code and JSON storage are not tenant isolation.
- **Persistent storage.** Preserve `DATA_DIR`; back it up privately before upgrades. It contains plaintext messages and source files.
- **Provider costs.** Real calls may incur model fees. Restrict access and set provider budget limits.
- **No provider in this sandbox.** Arena restricts AI provider endpoints, so live AI verification needs a different runtime.
- **No arbitrary execution.** Proposed code is text, not executed or deployed by the service.
- **Private deployment.** Use TLS, access controls, request-size and rate limits at the proxy. Do not expose the development Vite server publicly.
- **APK signing.** These are CI-generated debug builds. They can have different signing keys. Android may require uninstalling the older test app before installing the new one. Server-saved projects remain intact; local URL/session state may be lost. Use a privately managed stable release key before production distribution.

## Smoke check

1. `/healthz` responds with `status: ok`.
2. `/api/status` without a code returns 401.
3. Connect from Android, create a project, and import a UTF-8 text file.
4. Ask David to review it; a configured, reachable model is required.
5. Review a proposed diff, approve it, and save the resulting file to the phone.
6. Check Activity, export the project JSON, rename the project, and verify data survives a server restart.

Container and Android CI checks are automated. Device interaction and a live model call still need testing on your chosen deployment and phone.
