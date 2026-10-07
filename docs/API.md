# Cyber David backend API v0.2

Native Android and the optional web companion share this Express API. No real model, credentials, or network access is needed for `npm test`; HTTP integration tests inject a deterministic provider into `createApi()`.

## Connect

Deploy behind HTTPS. All `/api/*` routes require:

```
Authorization: Bearer <workspace-access-code>
Content-Type: application/json
```

Do not use the AI provider key as the workspace code. The code is a single-user shared credential, not multi-user authentication. `/healthz` is public and returns only service health. API responses are marked `no-store`. No cookies or cross-origin browser access are enabled.

## Routes

| Method | Path | Body / behavior |
| --- | --- | --- |
| GET | `/healthz` | Minimal process health; does not test AI provider availability |
| GET | `/api/status` | Model, key-present flag, version, capabilities, skills, busy state |
| GET | `/api/projects` | Project summaries |
| POST | `/api/projects` | `{ "name": "My app" }` |
| GET | `/api/projects/:id` | Full project including messages, files, plan, activity, reviewable proposals |
| POST | `/api/projects/:id/rename` | `{ "name": "New name" }` |
| DELETE | `/api/projects/:id` | `{ "confirmName": "Exact current name" }`; permanently deletes project |
| GET | `/api/projects/:id/activity?offset=0&limit=50` | Newest-first activity; limit 1–100, offset 0–1,000,000 |
| GET | `/api/projects/:id/export` | JSON attachment, versioned format, visible project content; excludes provider tool history and secrets |
| POST | `/api/projects/:id/files` | `{ "path": "src/app.js", "content": "..." }`; explicit user file import/update |
| POST | `/api/projects/:id/chat` | `{ "text": "Build a page", "skill": "build" }`; skill is `build`, `review`, or `research` |
| POST | `/api/projects/:id/proposals/:proposalId` | `{ "action": "approve", "digest": "reviewed-proposal-digest" }`; action is `approve` or `reject` |

Chat is a synchronous, bounded agent run, not a streaming endpoint. Only declared workspace tools are available. A run may take up to three minutes; the Android read timeout allows for that. Failed runs do not save partial state. If the client loses connectivity after the server commits, refresh before retrying to avoid duplicate requests. There are no idempotency keys yet.

## Errors and concurrency

Errors use `{ "error": "Human-readable message" }`. Typical statuses:

- `400`: invalid request, proposal conflict, or failed agent/provider operation.
- `401`: missing/incorrect access code.
- `404`: unknown route or project.
- `409`: another mutation is running, or delete confirmation no longer matches.
- `413`: request exceeds the 300 KB JSON limit.
- `503`: no model key configured.

All mutations serialize within one server process. The JSON store uses temporary-file + atomic-rename persistence. Use one replica with a persistent disk; it is not a distributed database. Export files contain private workspace content—store them securely. Export is portable JSON, not a supported one-click restore format; restore or migrations require a separate implementation. Deploy privately with TLS and proxy-level rate limits; this is not a public multi-tenant service.
