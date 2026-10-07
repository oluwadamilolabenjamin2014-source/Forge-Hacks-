package ai.cyberdavid.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
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
    private boolean busy;
    private boolean configured;
    private boolean closed;
    private EditText composer;
    private HttpURLConnection connection;
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
        nav("Projects", this::showProjects);
        nav("Chat", () -> { capture(); screen = "chat"; showProject(); });
        nav("Files", () -> { capture(); screen = "files"; showProject(); });
        nav("Review", () -> { capture(); screen = "review"; showProject(); });
        if (screen.equals("files")) { showFiles(); return; }
        if (screen.equals("review")) { showReview(); return; }
        JSONArray messages = project.optJSONArray("messages");
        if (messages == null || messages.length() == 0) {
            body.addView(text("What are we making happen today?", 24, Color.DKGRAY));
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
        body.addView(button("Add / update text file", this::importText));
        JSONObject files = project.optJSONObject("files");
        if (files == null || files.length() == 0) { body.addView(text("No files yet. Add a document or ask David to propose code.", 15, Color.GRAY)); return; }
        java.util.Iterator<String> keys = files.keys();
        while (keys.hasNext()) {
            String name = keys.next();
            body.addView(button(name, () -> showTextDialog(name, files.optString(name))));
        }
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
        HttpURLConnection c = connection; if (c != null) c.disconnect();
        token = ""; super.onDestroy();
    }
}
