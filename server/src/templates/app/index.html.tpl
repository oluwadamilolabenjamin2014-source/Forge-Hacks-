<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{{NAME}}</title>
    <meta name="description" content="{{DESCRIPTION}}" />
    <link rel="stylesheet" href="styles.css" />
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%230b0f17'/%3E%3Cpath d='M8 24 L15 8 L17 8 L24 24 L20 24 L16 13 L12 24 Z' fill='{{ACCENT}}'/%3E%3C/svg%3E" />
  </head>
  <body>
    <header class="topbar">
      <div class="brand">
        <span class="mark" aria-hidden="true">{{INITIALS}}</span>
        <div>
          <h1>{{NAME}}</h1>
          <p class="sub">{{DESCRIPTION}}</p>
        </div>
      </div>
      <div class="topbar-actions">
        <span class="pill" id="health" data-state="unknown">connecting…</span>
        <button class="btn ghost" id="export-btn" type="button">Export CSV</button>
        <button class="btn" id="new-btn" type="button">New {{SINGULAR_LABEL}}</button>
      </div>
    </header>

    <main>
      <section class="stats" id="stats" aria-label="Summary">
        <!-- filled by app.js -->
      </section>

      <section class="panel">
        <div class="toolbar">
          <label class="search">
            <span class="sr-only">Search</span>
            <input type="search" id="search" placeholder="Search {{COLLECTION}}…" autocomplete="off" />
          </label>
          <label class="field-inline">
            <span>Filter</span>
            <select id="filter-field"></select>
          </label>
          <label class="field-inline">
            <span>is</span>
            <select id="filter-value"><option value="">any</option></select>
          </label>
          <label class="field-inline">
            <span>Sort</span>
            <select id="sort-field"></select>
          </label>
          <button class="btn ghost" id="sort-dir" type="button" aria-label="Toggle sort direction">↑ Asc</button>
          <span class="count" id="count"></span>
        </div>

        <div class="table-wrap">
          <table id="table">
            <thead><tr id="head-row"></tr></thead>
            <tbody id="body"></tbody>
          </table>
          <p class="empty" id="empty" hidden>Nothing here yet. Add your first {{SINGULAR_LABEL}} to get started.</p>
        </div>
      </section>
    </main>

    <dialog id="dialog">
      <form method="dialog" id="form">
        <h2 id="dialog-title">New {{SINGULAR_LABEL}}</h2>
        <div class="grid" id="form-fields"></div>
        <p class="error" id="form-error" hidden></p>
        <menu>
          <button class="btn ghost" value="cancel" type="submit">Cancel</button>
          <button class="btn" id="save-btn" value="save" type="submit">Save</button>
        </menu>
      </form>
    </dialog>

    <div class="toast" id="toast" hidden role="status" aria-live="polite"></div>
    <script type="module" src="app.js"></script>
  </body>
</html>
