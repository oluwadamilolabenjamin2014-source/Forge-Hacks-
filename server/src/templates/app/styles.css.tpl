:root {
  --bg: #0b0f17;
  --panel: #121826;
  --panel-2: #172033;
  --line: #23304a;
  --text: #e8edf7;
  --muted: #93a1bd;
  --accent: {{ACCENT}};
  --danger: #f87171;
  --ok: #34d399;
  --radius: 14px;
  --shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  color-scheme: dark;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: radial-gradient(1200px 600px at 15% -10%, #16203a 0%, var(--bg) 55%) no-repeat, var(--bg);
  color: var(--text);
  font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  min-height: 100vh;
}

.sr-only, .sr-only:not(:focus) {
  position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap;
}

/* ------------------------------------------------------------------ topbar */

.topbar {
  display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: space-between;
  padding: 18px 24px; border-bottom: 1px solid var(--line);
  background: rgba(11, 15, 23, 0.72); backdrop-filter: blur(10px);
  position: sticky; top: 0; z-index: 20;
}
.brand { display: flex; gap: 14px; align-items: center; }
.mark {
  display: grid; place-items: center; width: 42px; height: 42px; border-radius: 12px;
  background: linear-gradient(140deg, var(--accent), #1d4ed8); color: #08101f; font-weight: 800; font-size: 15px;
}
.topbar h1 { margin: 0; font-size: 19px; letter-spacing: -0.01em; }
.sub { margin: 2px 0 0; color: var(--muted); font-size: 13px; }
.topbar-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }

.pill {
  padding: 5px 11px; border-radius: 999px; border: 1px solid var(--line);
  font-size: 12px; color: var(--muted); background: var(--panel);
}
.pill[data-state="ok"] { color: var(--ok); border-color: rgba(52, 211, 153, 0.35); }
.pill[data-state="down"] { color: var(--danger); border-color: rgba(248, 113, 113, 0.35); }

/* ------------------------------------------------------------------ layout */

main { padding: 22px 24px 64px; max-width: 1220px; margin: 0 auto; display: grid; gap: 18px; }

.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
.card {
  background: linear-gradient(160deg, var(--panel-2), var(--panel));
  border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px;
  display: grid; gap: 6px; box-shadow: var(--shadow);
}
.card.wide { grid-column: span 2; }
.card-label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; }
.card-value { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; }
.card-value.small { font-size: 15px; font-weight: 600; }
.card-foot { color: var(--muted); font-size: 12px; }

.panel {
  background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
  box-shadow: var(--shadow); overflow: hidden;
}

.toolbar {
  display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
  padding: 14px 16px; border-bottom: 1px solid var(--line); background: var(--panel-2);
}
.search input, .field-inline select, .form-field input, .form-field select {
  background: #0e1524; color: var(--text); border: 1px solid var(--line); border-radius: 9px;
  padding: 8px 10px; font: inherit; min-width: 130px;
}
.search input { min-width: 240px; }
.field-inline { display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: 12px; }
.count { margin-left: auto; color: var(--muted); font-size: 12px; }

.btn {
  background: var(--accent); color: #08101f; border: 0; border-radius: 9px;
  padding: 8px 14px; font: inherit; font-weight: 600; cursor: pointer;
}
.btn:hover { filter: brightness(1.08); }
.btn.ghost { background: transparent; color: var(--text); border: 1px solid var(--line); }
.btn.tiny { padding: 4px 9px; font-size: 12px; }
.btn.danger { background: transparent; border: 1px solid rgba(248, 113, 113, 0.4); color: var(--danger); }
.btn:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

/* ------------------------------------------------------------------- table */

.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 11px 16px; border-bottom: 1px solid var(--line); white-space: nowrap; }
th { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; background: #0f1626; }
tbody tr:hover { background: rgba(255, 255, 255, 0.03); }
.actions-col { text-align: right; }
td[data-badge]::before {
  content: attr(data-badge); display: inline-block; padding: 2px 9px; border-radius: 999px;
  background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.3); font-size: 12px;
}
.empty { padding: 40px 20px; text-align: center; color: var(--muted); }

/* ------------------------------------------------------------------ dialog */

dialog {
  border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel);
  color: var(--text); padding: 0; width: min(680px, 92vw); box-shadow: var(--shadow);
}
dialog::backdrop { background: rgba(4, 7, 13, 0.66); backdrop-filter: blur(2px); }
#form { padding: 20px; display: grid; gap: 16px; }
#form h2 { margin: 0; font-size: 17px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
.form-field { display: grid; gap: 6px; font-size: 13px; color: var(--muted); }
.form-field input, .form-field select { width: 100%; }
.form-field.check { display: flex; align-items: center; gap: 8px; }
.form-field.check input { width: auto; }
menu { display: flex; justify-content: flex-end; gap: 10px; margin: 0; padding: 0; }
.error { color: var(--danger); margin: 0; font-size: 13px; }

.toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  background: var(--panel-2); border: 1px solid var(--line); border-radius: 10px;
  padding: 10px 16px; box-shadow: var(--shadow); font-size: 14px;
}
.toast[data-kind="error"] { border-color: rgba(248, 113, 113, 0.5); color: var(--danger); }

@media (max-width: 640px) {
  .card.wide { grid-column: span 1; }
  .search input { min-width: 160px; }
  main { padding: 16px 14px 48px; }
}
