package ai.cyberdavid.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.database.Cursor;
import android.provider.OpenableColumns;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import android.graphics.Color;
import android.graphics.Typeface;
import android.text.InputType;
import android.view.View;
import android.view.WindowManager;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;

/** Native Android views; no WebView, browser engine, or embedded website. */
public class MainActivity extends Activity {
    private static final int PURPLE = Color.rgb(118, 97, 223);
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private LinearLayout root, body, navigation;
    private TextView feedback;
    private String base = "", token = "", draft = "", skill = "build";
    private JSONObject project;
    private JSONArray projects = new JSONArray();
    private String screen = "projects";
    private static final int IMPORT_FILE = 101, EXPORT_FILE = 102;
    private String exportContent;
    private String selectedImportProject;
    private boolean busy;
    private boolean configured;
    private volatile boolean closed;
    private EditText composer;
    private volatile HttpURLConnection connection;
    interface Operation { Object run() throws Exception; }
    interface Result { void accept(Object result) throws Exception; }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        // Access codes stay in memory only; lock on process/activity recreation.
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        base = getPreferences(MODE_PRIVATE).getString("server", "");
        showLogin();
    }
    private int dp(int n) { return (int) (n * getResources().getDisplayMetrics().density); }
    private LinearLayout column() {
        LinearLayout view = new LinearLayout(this); view.setOrientation(LinearLayout.VERTICAL); return view;
    }
    private TextView text(String value, int size, int color) {
        TextView v = new TextView(this); v.setText(value); v.setTextSize(size); v.setTextColor(color);
        v.setPadding(0, dp(6), 0, dp(8)); v.setTextIsSelectable(true); return v;
    }
    private Button button(String title, Runnable action) {
        Button b = new Button(this); b.setText(title); b.setTextColor(PURPLE); b.setAllCaps(false);
        b.setOnClickListener(v -> { if (!busy) action.run(); }); return b;
    }
    private EditText input(String hint, boolean secret) {
        EditText v = new EditText(this); v.setHint(hint); v.setTextSize(15); v.setSingleLine(true);
        if (secret) {
            v.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
            v.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        }
        return v;
    }
    private void layout(String subtitle) {
        composer = null;
        root = column(); root.setPadding(dp(20), dp(12), dp(20), dp(12));
        root.setBackgroundColor(Color.rgb(249, 247, 253));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(dp(20) + insets.getSystemWindowInsetLeft(), dp(12) + insets.getSystemWindowInsetTop(),
                dp(20) + insets.getSystemWindowInsetRight(), dp(12) + insets.getSystemWindowInsetBottom());
            return insets;
        });
        TextView brand = text("cyber david.", 29, PURPLE); brand.setTypeface(null, Typeface.BOLD); root.addView(brand);
        root.addView(text(subtitle, 13, Color.DKGRAY));
        navigation = new LinearLayout(this); navigation.setOrientation(LinearLayout.HORIZONTAL); root.addView(navigation);
        feedback = text("", 13, Color.rgb(153, 87, 63)); root.addView(feedback);
        ScrollView scroll = new ScrollView(this); body = column(); scroll.setFillViewport(true); scroll.addView(body);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1)); setContentView(root);
    }
    private void showLogin() {
        layout("Native Android · Your ideas, in motion");
        body.addView(text("Connect your workspace", 24, Color.DKGRAY));
        body.addView(text("Cyber David runs as a native Android app. Connect a trusted HTTPS backend to use your AI workspace. Your model API key stays on that server.", 15, Color.GRAY));
        EditText url = input("https://your-server.example", false); url.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI); url.setText(base); body.addView(url);
        EditText access = input("Workspace access code (not API key)", true); body.addView(access);
        body.addView(button("Connect securely", () -> {
            try {
                URI uri = new URI(url.getText().toString().trim());
                if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null || !(uri.getPath().isEmpty() || uri.getPath().equals("/")))
                    throw new Exception("Enter an HTTPS server origin without a path, query, or credentials.");
                String code = access.getText().toString().trim();
                if (code.length() < 24 || code.contains("\n") || code.contains("\r")) throw new Exception("Enter a valid workspace access code.");
                base = uri.toString().replaceAll("/+$", ""); token = code;
                execute(() -> {
                    JSONObject status = request("GET", "/api/status", null);
                    JSONArray list = new JSONArray(rawRequest("GET", "/api/projects", null));
                    return new Object[] { status, list };
                }, value -> {
                    Object[] result = (Object[]) value; configured = ((JSONObject) result[0]).optBoolean("configured");
                    projects = (JSONArray) result[1];
                    getPreferences(MODE_PRIVATE).edit().putString("server", base).apply();
                    showProjects();
                });
            } catch (Exception e) { feedback.setText(e.getMessage()); }
        }));
        body.addView(text("Access code: find it in the backend startup output or data/access-token. Never enter your AI provider key here. Only connect to a server you trust: it receives this code and your conversations. Screenshots and backups are disabled. The access code is not saved on this device.", 13, Color.GRAY));
        body.addView(text("This app needs internet and a running backend; it does not run a model offline. AI outputs can be wrong. Review important claims and approve every proposed file change.", 13, Color.GRAY));
    }
    private void nav(String title, Runnable run) {
        navigation.addView(button(title, run), new LinearLayout.LayoutParams(0, -2, 1));
    }
    private void showProjects() {
        screen = "projects";
        layout("Personal workspace · " + (configured ? "Model key configured" : "AI key not configured"));
        nav("Refresh", () -> execute(() -> new JSONArray(rawRequest("GET", "/api/projects", null)), result -> { projects = (JSONArray) result; showProjects(); }));
        nav("Lock", () -> { token = ""; project = null; projects = new JSONArray(); draft = ""; showLogin(); });
        body.addView(text("Big ideas. Meet your right hand.", 25, Color.DKGRAY));
        body.addView(button("+ New project", this::newProject));
        if (projects.length() == 0) body.addView(text("A fresh start. Create a project to begin.", 15, Color.GRAY));
        for (int i = 0; i < projects.length(); i++) {
            JSONObject p = projects.optJSONObject(i); if (p == null) continue;
            body.addView(button(p.optString("name", "Untitled"), () -> execute(() -> request("GET", "/api/projects/" + p.optString("id"), null), value -> {
                project = (JSONObject) value; draft = ""; skill = project.optString("skill", "build"); screen = "chat"; showProject();
            })));
        }
        body.addView(text("Build and code · Analyze documents · Write clearly\n\nFiles are stored in a virtual workspace on your server. Code execution, deployment, computer control, and external app connections are not enabled.", 14, Color.GRAY));
    }
    private void newProject() {
        EditText name = input("Project name", false);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Start something new").setView(name)
            .setNegativeButton("Cancel", null).setPositiveButton("Create", null).create();
        dialog.setOnShowListener(v -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(w -> {
            String title = name.getText().toString().trim();
            if (title.isEmpty() || title.length() > 80) { name.setError("Use 1–80 characters."); return; }
            dialog.dismiss();
            execute(() -> request("POST", "/api/projects", new JSONObject().put("name", title)), value -> {
                project = (JSONObject) value; projects.put(project); draft = ""; screen = "chat"; showProject();
            });
        })); dialog.show();
    }
    private String route() { return "/api/projects/" + project.optString("id"); }
    private void showProject() {
        layout(project.optString("name"));
        LinearLayout actions = new LinearLayout(this);
        actions.addView(button("Refresh", () -> { capture(); refreshProject(); }), new LinearLayout.LayoutParams(0, -2, 1));
        actions.addView(button("Activity", () -> { capture(); screen = "activity"; showProject(); }), new LinearLayout.LayoutParams(0, -2, 1));
        actions.addView(button("Manage", () -> { capture(); manageProject(); }), new LinearLayout.LayoutParams(0, -2, 1));
        root.addView(actions, 3);
        nav("Projects", this::showProjects);
        nav("Chat", () -> { capture(); screen = "chat"; showProject(); });
        nav("Files", () -> { capture(); screen = "files"; showProject(); });
        nav("Review", () -> { capture(); screen = "review"; showProject(); });
        if (screen.equals("activity")) { showActivity(); return; }
        if (screen.equals("files")) { showFiles(); return; }
        if (screen.equals("review")) { showReview(); return; }
        JSONArray messages = project.optJSONArray("messages");
        if (messages == null || messages.length() == 0) {
            body.addView(text("What are we making happen today?", 24, Color.DKGRAY));
            body.addView(button("Build my next app", () -> setPrompt("Help me build a personal portfolio app. Ask me about the audience, content, and style, then create a plan and propose complete files.", "build")));
            body.addView(button("Review my code", () -> setPrompt("Read my workspace files and review them for bugs, security issues, and accessibility. Propose focused fixes for my review.", "review")));
            body.addView(button("Analyze a document", () -> setPrompt("Analyze the documents in my workspace. Summarize key findings, assumptions, contradictions, and unanswered questions. Do not invent citations.", "research")));
            body.addView(text("Describe an app, ask for a code review, or work through a document. David can inspect your files, plan the work, and propose changes for your approval.", 15, Color.GRAY));
        } else for (int i = 0; i < messages.length(); i++) {
            JSONObject m = messages.optJSONObject(i); if (m == null) continue;
            TextView name = text(m.optString("role").equals("assistant") ? "Cyber David" : "You", 14, PURPLE); name.setTypeface(null, Typeface.BOLD); body.addView(name);
            body.addView(text(m.optString("content"), 15, Color.DKGRAY));
        }
        JSONArray plan = project.optJSONArray("plan");
        if (plan != null && plan.length() > 0) {
            body.addView(text("Task plan", 18, PURPLE));
            for (int i = 0; i < plan.length(); i++) {
                JSONObject step = plan.optJSONObject(i); if (step != null) body.addView(text(step.optString("status") + " · " + step.optString("title"), 13, Color.GRAY));
            }
        }
        Spinner workflow = new Spinner(this);
        workflow.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, new String[]{"Build an app", "Review code", "Analyze a document"}));
        String[] ids = {"build", "review", "research"};
        workflow.setSelection(skill.equals("review") ? 1 : skill.equals("research") ? 2 : 0);
        workflow.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            public void onItemSelected(AdapterView<?> p, View v, int position, long id) { skill = ids[position]; }
            public void onNothingSelected(AdapterView<?> p) {}
        }); root.addView(workflow);
        composer = input("Message David…", false); composer.setSingleLine(false); composer.setMinLines(2); composer.setMaxLines(4);
        composer.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        composer.setText(draft); root.addView(composer);
        root.addView(button("Send", () -> {
            capture();
            if (!configured) { feedback.setText("Configure OPENAI_API_KEY on the server and restart it, then reconnect. Do not paste it in chat."); return; }
            if (draft.trim().isEmpty() || draft.length() > 60000) { feedback.setText("Enter a message of 1–60,000 characters."); return; }
            final String message = draft.trim(); final String mode = skill;
            execute(() -> request("POST", route() + "/chat", new JSONObject().put("text", message).put("skill", mode)), value -> {
                project = (JSONObject) value; draft = ""; showProject();
            });
        }));
        root.addView(text("David can make mistakes. Review important details.", 11, Color.GRAY));
    }
    private void capture() { if (composer != null) draft = composer.getText().toString(); }
    private void showFiles() {
        body.addView(text("Project files", 23, Color.DKGRAY));
        body.addView(text("Virtual files, not files on your phone or host repository. Tap a file to read its full text.", 13, Color.GRAY));
        body.addView(button("Import from phone", this::pickFile));
        body.addView(button("Add / update text file", this::importText));
        JSONObject files = project.optJSONObject("files");
        if (files == null || files.length() == 0) { body.addView(text("No files yet. Add a document or ask David to propose code.", 15, Color.GRAY)); return; }
        java.util.Iterator<String> keys = files.keys();
        while (keys.hasNext()) {
            String name = keys.next();
            LinearLayout row = new LinearLayout(this);
            row.addView(button(name, () -> showTextDialog(name, files.optString(name))), new LinearLayout.LayoutParams(0, -2, 1));
            row.addView(button("Save", () -> saveDocument(name.substring(name.lastIndexOf('/') + 1), files.optString(name), "text/plain")));
            body.addView(row);
        }
    }
    private void setPrompt(String prompt, String mode) {
        draft = prompt; skill = mode; screen = "chat"; showProject();
        if (composer != null) composer.requestFocus();
    }
    private void refreshProject() {
        execute(() -> request("GET", route(), null), value -> { project = (JSONObject) value; showProject(); });
    }
    private void manageProject() {
        new AlertDialog.Builder(this).setTitle(project.optString("name"))
            .setItems(new String[]{"Rename project", "Export project backup", "Delete project"}, (d, which) -> {
                if (which == 0) renameProject();
                else if (which == 1) execute(() -> request("GET", route() + "/export", null), value ->
                    saveDocument("cyber-david-" + project.optString("id") + ".json", ((JSONObject) value).toString(2), "application/json"));
                else deleteProject();
            }).show();
    }
    private void renameProject() {
        EditText name = input("Project name", false); name.setText(project.optString("name"));
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Rename project").setView(name)
            .setNegativeButton("Cancel", null).setPositiveButton("Rename", null).create();
        dialog.setOnShowListener(v -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(w -> {
            String title = name.getText().toString().trim();
            if (title.isEmpty() || title.length() > 80) { name.setError("Use 1–80 characters."); return; }
            dialog.dismiss();
            execute(() -> request("POST", route() + "/rename", new JSONObject().put("name", title)), value -> { project = (JSONObject) value; updateProjectList(); showProject(); });
        })); dialog.show();
    }
    private void updateProjectList() throws JSONException {
        for (int i = 0; i < projects.length(); i++) {
            if (projects.getJSONObject(i).optString("id").equals(project.optString("id"))) { projects.put(i, project); return; }
        }
    }
    private void deleteProject() {
        String name = project.optString("name");
        EditText confirm = input("Type the exact project name", false);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Delete " + name + "?")
            .setMessage("Permanently removes the conversations, files, plans, and proposals from this server. Export a backup first. Type the project name to confirm.")
            .setView(confirm).setNegativeButton("Cancel", null).setPositiveButton("Delete permanently", null).create();
        dialog.setOnShowListener(v -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(w -> {
            if (!confirm.getText().toString().equals(name)) { confirm.setError("Name must match exactly."); return; }
            dialog.dismiss(); final String id = project.optString("id");
            execute(() -> request("DELETE", route(), new JSONObject().put("confirmName", name)), value -> {
                for (int i = projects.length() - 1; i >= 0; i--) if (projects.getJSONObject(i).optString("id").equals(id)) projects.remove(i);
                project = null; draft = ""; showProjects();
            });
        })); dialog.show();
    }
    private void showActivity() {
        body.addView(text("A clear trail of what happened", 23, Color.DKGRAY));
        body.addView(text("Real tool actions, imports, approvals, and project updates from the server. Tap Refresh to load the latest activity.", 14, Color.GRAY));
        JSONArray events = project.optJSONArray("activity");
        if (events == null || events.length() == 0) { body.addView(text("No activity yet. Start a conversation or import a file.", 15, Color.GRAY)); return; }
        int end = Math.max(0, events.length() - 100);
        if (end > 0) body.addView(text("Showing the latest 100 events. Export the project for the full history.", 12, Color.GRAY));
        for (int i = events.length() - 1; i >= end; i--) {
            JSONObject event = events.optJSONObject(i); if (event == null) continue;
            body.addView(text(event.optString("text"), 16, PURPLE));
            body.addView(text(event.optString("time"), 12, Color.GRAY));
        }
    }
    private void pickFile() {
        selectedImportProject = project.optString("id");
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType("*/*");
        try { startActivityForResult(intent, IMPORT_FILE); }
        catch (android.content.ActivityNotFoundException e) { feedback.setText("No document picker is installed on this phone."); }
    }
    private void saveDocument(String name, String content, String mime) {
        exportContent = content;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType(mime); intent.putExtra(Intent.EXTRA_TITLE, name);
        try { startActivityForResult(intent, EXPORT_FILE); }
        catch (android.content.ActivityNotFoundException e) { exportContent = null; feedback.setText("No document provider is installed on this phone."); }
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null || data.getData() == null) { exportContent = null; selectedImportProject = null; return; }
        Uri uri = data.getData();
        if (requestCode == IMPORT_FILE) {
            if (project == null || !project.optString("id").equals(selectedImportProject)) { feedback.setText("Reopen the project and import again."); return; }
            execute(() -> {
                String filename = "imported.txt";
                try (Cursor cursor = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst()) filename = cursor.getString(0);
                }
                if (filename == null) filename = "imported.txt";
                byte[] bytes;
                try (InputStream in = getContentResolver().openInputStream(uri); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                    if (in == null) throw new IOException("Could not open this document.");
                    byte[] chunk = new byte[4096]; int n;
                    while ((n = in.read(chunk)) != -1) { if (out.size() + n > 60000) throw new IOException("Choose a UTF-8 text or code file smaller than 60 KB."); out.write(chunk, 0, n); }
                    bytes = out.toByteArray();
                }
                String content = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
                if (content.indexOf('\u0000') >= 0) throw new IOException("Binary files are not supported. Choose a text or code file.");
                return new String[]{filename, content};
            }, value -> {
                String[] file = (String[]) value;
                new AlertDialog.Builder(this).setTitle("Import " + file[0] + "?")
                    .setMessage("Adds this text to your server workspace, replacing any file with the same name. Your model can read it when you ask. Do not upload secrets.")
                    .setNegativeButton("Cancel", null).setPositiveButton("Import", (d, which) -> execute(() ->
                        request("POST", route() + "/files", new JSONObject().put("path", file[0]).put("content", file[1])), result -> { project = (JSONObject) result; screen = "files"; showProject(); })).show();
            });
        } else if (requestCode == EXPORT_FILE && exportContent != null) {
            final String content = exportContent; exportContent = null;
            execute(() -> {
                try (OutputStream out = getContentResolver().openOutputStream(uri, "wt")) {
                    if (out == null) throw new IOException("Could not write to this location.");
                    out.write(content.getBytes(StandardCharsets.UTF_8));
                }
                return true;
            }, value -> feedback.setText("Saved to your chosen location."));
        } else feedback.setText("Session changed. Please export again.");
    }
    private void showTextDialog(String title, String content) {
        ScrollView scroll = new ScrollView(this); TextView code = text(content, 12, Color.DKGRAY);
        code.setTypeface(Typeface.MONOSPACE); code.setPadding(dp(18), dp(10), dp(18), dp(10)); scroll.addView(code);
        new AlertDialog.Builder(this).setTitle(title).setView(scroll).setPositiveButton("Close", null).show();
    }
    private void importText() {
        LinearLayout box = column(); box.setPadding(dp(20), 0, dp(20), 0);
        EditText name = input("File path, e.g. brief.md", false); EditText content = input("Paste text or code (up to 60,000 characters)", false);
        content.setSingleLine(false); content.setMinLines(5); content.setMaxLines(8); content.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        box.addView(name); box.addView(content);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("Add or replace workspace file").setView(box)
            .setNegativeButton("Cancel", null).setPositiveButton("Review", null).create();
        dialog.setOnShowListener(v -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(w -> {
            String path = name.getText().toString().trim(), value = content.getText().toString();
            if (path.isEmpty() || path.length() > 160 || value.length() > 60000) { name.setError("Path: 1–160 characters. Content: at most 60,000."); return; }
            new AlertDialog.Builder(this).setTitle("Save " + path + "?")
                .setMessage("This writes the text you entered to the virtual workspace and replaces any existing file at that path. It will be available to your AI provider when read in a conversation.")
                .setNegativeButton("Cancel", null).setPositiveButton("Save file", (d, which) -> {
                    dialog.dismiss();
                    execute(() -> request("POST", route() + "/files", new JSONObject().put("path", path).put("content", value)), result -> { project = (JSONObject) result; showProject(); });
                }).show();
        })); dialog.show();
    }
    private void showReview() {
        body.addView(text("Your code. Your call.", 23, Color.DKGRAY));
        body.addView(text("Open each diff before approving. Changes apply only to the virtual workspace; no code runs on your phone.", 14, Color.GRAY));
        JSONArray proposals = project.optJSONArray("proposals");
        if (proposals == null || proposals.length() == 0) { body.addView(text("All clear. Proposed file changes appear here.", 15, Color.GRAY)); return; }
        for (int i = proposals.length() - 1; i >= 0; i--) {
            JSONObject p = proposals.optJSONObject(i); if (p == null) continue;
            body.addView(text(p.optString("summary") + " · " + p.optString("status"), 17, PURPLE));
            JSONArray files = p.optJSONArray("files");
            if (files != null) for (int j = 0; j < files.length(); j++) {
                JSONObject f = files.optJSONObject(j); if (f == null) continue;
                body.addView(button("View diff: " + f.optString("path"), () -> showTextDialog(f.optString("path"), f.optString("diff"))));
            }
            if (p.optString("status").equals("pending")) {
                body.addView(button("Approve changes", () -> new AlertDialog.Builder(this).setTitle("Apply these changes?")
                    .setMessage("Confirm you reviewed all file diffs for: " + p.optString("summary"))
                    .setNegativeButton("Cancel", null).setPositiveButton("Approve", (d, which) -> resolve(p, "approve")).show()));
                body.addView(button("Reject", () -> resolve(p, "reject")));
            }
        }
    }
    private void resolve(JSONObject proposal, String action) {
        execute(() -> request("POST", route() + "/proposals/" + proposal.optString("id"), new JSONObject().put("action", action).put("digest", proposal.optString("digest"))), value -> { project = (JSONObject) value; showProject(); });
    }
    private void controls(View v, boolean enabled) {
        if (v instanceof Button || v instanceof EditText || v instanceof Spinner) v.setEnabled(enabled);
        if (v instanceof android.view.ViewGroup) {
            android.view.ViewGroup group = (android.view.ViewGroup) v;
            for (int i = 0; i < group.getChildCount(); i++) controls(group.getChildAt(i), enabled);
        }
    }
    private void execute(Operation operation, Result result) {
        if (busy) return;
        busy = true; controls(root, false); feedback.setText("Working… Agent requests can take up to three minutes.");
        worker.execute(() -> {
            Object value = null; String error = null;
            try { value = operation.run(); }
            catch (SocketTimeoutException e) { error = "Connection timed out. Refresh the project before retrying; the server may have completed the request."; }
            catch (Exception e) { error = e.getMessage() == null ? "Unable to connect. Check the server URL and access code." : e.getMessage(); }
            final Object output = value; final String failure = error;
            runOnUiThread(() -> {
                if (closed || isFinishing() || isDestroyed()) return;
                busy = false; controls(root, true); feedback.setText("");
                if (failure != null) { feedback.setText(failure); return; }
                try { result.accept(output); } catch (Exception e) { feedback.setText("Could not read the server response. Refresh and try again."); }
            });
        });
    }
    private JSONObject request(String method, String path, JSONObject payload) throws Exception {
        return new JSONObject(rawRequest(method, path, payload));
    }
    private String rawRequest(String method, String path, JSONObject payload) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(base + path).openConnection(); connection = c;
        c.setInstanceFollowRedirects(false); c.setConnectTimeout(15000); c.setReadTimeout(200000);
        c.setRequestMethod(method); c.setRequestProperty("Authorization", "Bearer " + token);
        c.setRequestProperty("Accept", "application/json");
        try {
            if (payload != null) {
                c.setDoOutput(true); c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                try (OutputStream out = c.getOutputStream()) { out.write(payload.toString().getBytes(StandardCharsets.UTF_8)); }
            }
            int status = c.getResponseCode();
            if (status >= 300 && status < 400) throw new IOException("Server redirected the request. Enter its final HTTPS origin instead.");
            InputStream stream = status >= 400 ? c.getErrorStream() : c.getInputStream();
            if (stream == null) throw new IOException("Server returned HTTP " + status);
            String value;
            try (InputStream in = stream; ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
                byte[] bytes = new byte[8192]; int read;
                while ((read = in.read(bytes)) != -1) {
                    if (buffer.size() + read > 16000000) throw new IOException("Response too large for this device. Use a smaller workspace.");
                    buffer.write(bytes, 0, read);
                }
                value = buffer.toString(StandardCharsets.UTF_8.name());
            }
            if (status >= 400) {
                String message = "Server returned HTTP " + status;
                try { message = new JSONObject(value).optString("error", message); } catch (JSONException ignored) { }
                throw new IOException(message);
            }
            return value;
        } finally { c.disconnect(); if (connection == c) connection = null; }
    }
    @Override public void onBackPressed() {
        if (busy) { feedback.setText("Please wait for this operation to finish."); return; }
        if (!token.isEmpty() && !screen.equals("projects") && project != null) { capture(); showProjects(); }
        else super.onBackPressed();
    }
    @Override public void onDestroy() {
        closed = true; worker.shutdownNow();
        HttpURLConnection c = connection; if (c != null) new Thread(c::disconnect).start();
        token = ""; super.onDestroy();
    }
}
