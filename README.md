# Cyber David — Android app

Cyber David now includes a **native Android application** that builds into an installable **APK**. The Android interface uses native Android views, not a WebView or browser wrapper. The existing Node.js service is its AI backend; the earlier web interface remains as an optional companion.

## Android APK

- **App ID:** `ai.cyberdavid.app`
- **Android support:** Android 8.0 (API 26) and later
- **Native source:** `android/app/src/main/java/ai/cyberdavid/app/MainActivity.java`
- **Build workflow:** `.github/workflows/android-apk.yml`
- **APK artifact:** `Cyber-David-Android-APK`, containing `Cyber-David-0.1.0-debug.apk` and its SHA-256 checksum

### Download and install

The successful build commits the installable APK to **`releases/Cyber-David-0.1.0-debug.apk`** on `arena/72842692-forge-hacks`, with a checksum in **`releases/SHA256SUMS.txt`**. Open that APK file in GitHub and choose **Download raw file**. You can also download the build artifact:

1. Open this repository on GitHub and select **Actions → Build Cyber David APK**.
2. Open a successful run on `arena/72842692-forge-hacks`.
3. Download the **Cyber-David-Android-APK** artifact and extract its ZIP.
4. Transfer the APK to your Android phone, open it, and allow installation from that source if prompted. Only install builds you trust.
5. Open **Cyber David**, enter your backend's HTTPS origin and workspace access code, and connect.

Artifacts are retained for 30 days. You can trigger a fresh build using **Run workflow** on the session branch. The build commits the APK to `releases/` on the same session branch and also uploads it as a build artifact. The workflow requires repository contents-write permission for the APK commit; if that step is blocked, the build artifact is still available. This is a debug-signed test APK, not a Play Store release. CI debug signing keys can differ between runs; installing a newer build may require uninstalling the old one. A production release needs a privately managed signing key and release process; no signing secrets are included.

### What the native app does

- Connects securely to a user-configured HTTPS backend.
- Creates and opens projects, sends AI chat requests, and displays conversation history and task plans.
- Selects build, code review, or document analysis workflows.
- Adds or replaces text/code files with confirmation and reads workspace files.
- Displays exact file diffs and submits approval or rejection for agent proposals.
- Stores only the backend URL on the phone. Access codes are held in memory, backups and screenshots are disabled, and HTTP and redirects are rejected.

The model does **not** run offline on the phone. A backend and internet access are required. The APK does not contain an API key, execute generated code, deploy apps, control the desktop, or connect external services. File import currently means pasting text into the native editor; binary uploads and native file export are not included. Chat outputs are shown as selectable text, including code blocks. Activity recreation (such as rotation) locks the session and may discard an unsent draft. Reconnect and reopen the project to recover server-saved work.

### Build the APK locally

Install Android Studio and open the `android/` directory. Use JDK 17, Android SDK 35, and Gradle 8.11.1 (the CI workflow installs these automatically). Alternatively, with Gradle on your PATH and the SDK configured:

```sh
cd android
gradle assembleDebug lintDebug
# Output: app/build/outputs/apk/debug/app-debug.apk
```

The repository does not include a Gradle wrapper; CI uses a pinned Gradle distribution. Android SDK and build downloads require Google/Maven connectivity, which is unavailable in the Arena sandbox, so the APK build runs on GitHub Actions. Physical-device testing is still required before a production release.

## Backend and optional web companion

A working, single-user AI workspace for coding, writing, and document analysis. React + Vite frontend, Express backend, and an OpenAI-compatible tool-calling agent. No simulated AI responses.

## Backend application files

**`app.js` is the application entry point.** It starts the backend and serves the web interface. **`src/App.jsx` contains the React app.** This launcher runs the backend and optional browser UI, not the Android APK. The Android app calls this backend over HTTPS. The backend needs the supporting files and Node.js dependencies in this repository.

```text
app.js                 Application launcher (development or production)
index.html             Browser HTML entry
src/App.jsx            Cyber David interface and user workflows
src/main.jsx           React mounting entry
src/style.css          Responsive application styles
server/index.js        HTTP API, authentication, storage, and server
server/agent.js        AI provider integration and bounded tool loop
server/workspace.js    File validation, proposals, and approval safeguards
skills/*.md            Reusable agent workflow instructions
tests/*.test.js        Automated agent and workspace tests
.env.example           Configuration template (no credentials)
```

## Backend quick start

Requires Node.js 22+.

```sh
npm ci
cp .env.example .env
# Edit .env locally; never paste API keys into chat or commit them.
node app.js
# Or: npm run dev
```

Open port 3000. Enter the **workspace access code** printed at startup. Without `CYBER_DAVID_TOKEN`, a random code is generated and stored in ignored `data/access-token`. This access code is separate from your provider key. Configure `OPENAI_API_KEY` to enable real AI, optionally `OPENAI_MODEL` and `OPENAI_BASE_URL`, then restart the server. A provider configured indicator means a key is present, not that a live call has succeeded.

**Arena sandbox limitation:** outbound internet access is restricted to GitHub and package registries. OpenAI and most inference endpoints cannot be reached here. The UI and workspace operate here; real inference requires running locally or deploying in an environment with provider connectivity. Never put provider keys in browser code or chat.

```sh
npm test
npm run build
npm start
# Equivalent: node app.js --production
```

Run `node app.js --help` for launcher usage.

The server binds to `0.0.0.0`; frontend requests use same-origin relative API URLs. Production serves the built frontend from the same server. Put a TLS reverse proxy in front of production deployments and keep the service private. Do not use Vite development middleware for public hosting.

## Backend capabilities

- Persistent projects, conversation history, text-file imports, and per-file downloads.
- Real server-side model calls using Chat Completions with tool calling.
- Bounded agent loop: list/read virtual project files, maintain a task plan, and propose complete multi-file changes.
- Markdown workflows: build an app, review code, analyze documents. Edit `skills/*.md` and restart to customize.
- Exact unified diff review, approve/reject, stale-content and expiration checks, and an activity trail.
- Responsive workspace UI, access-code authentication, connection settings, provider errors, and honest capability boundaries.

## Approval and storage model

The agent never writes host repository files. Files live as text in a **virtual project** in ignored `data/workspace.json`. Imported documents and proposed files are capped at 60,000 characters each (browser imports also capped at 60 KB). Projects allow 100 files / approximately 1 MB; a proposal allows 12 files / 180 KB; at most 8 pending proposals. There are 30 projects maximum. Relative source paths are validated; hidden files, traversal, unsupported types, and case collisions are rejected.

Approval requires the exact proposal digest and unchanged base content; proposals expire after 24 hours. Changes commit atomically to the virtual workspace. Download approved files and run them yourself in an appropriate environment. Downloads are plain text, never rendered or executed by this service. Imported SVG/HTML and model responses are not inserted as raw HTML.

Workspace mutations are serialized, and JSON is saved with atomic rename. Failed model runs discard all partial messages, plans, and proposals. Agent runs have an eight-round tool limit, a three-minute overall deadline, and bounded context. A single running server process is supported; do not horizontally scale this JSON store. Back up `data/` privately; it contains plaintext conversations and source files. API requests require a bearer access code; browser storage is session-scoped. Locking the workspace clears that session's code.

## Important limits

This is an MVP, not a full autonomous computer operator. It does **not** execute code or shell commands, modify local repositories, browse the web, deploy software, make purchases, connect apps, or operate desktops. Code generation is supported; testing generated code is not. No million-token context or PhD-level accuracy is guaranteed. Context is bounded by this service and the chosen model. Documents read through tools and conversation content are sent to your configured provider. Do not upload secrets; model outputs and high-stakes analysis require human review.

For an expanded agent, the next milestones are isolated execution workers with CPU/time/network quotas, a git worktree adapter with approval-gated commits, deployment integrations, and scoped OAuth connections. Arbitrary execution must never be added directly to this web server.

## Verification

`npm test` covers tool rounds, pending proposals, schema enforcement, unknown tools, failed-run rollback, cancellation, bounded context, safe paths, exact approvals, stale proposals, expiration, case collisions, and workspace quotas. Live provider behavior requires a configured key and reachable endpoint; unit tests use a deterministic mock provider, not fabricated UI responses.
