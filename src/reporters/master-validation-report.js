const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const CONFIG_PATH = path.join(ROOT, 'config', 'master-validation-report.json');
const FAVICON_PATH = path.join(ROOT, 'favicon.svg');
const { GOOGLE_SANS_FONT_LINKS, GOOGLE_SANS_FONT_FAMILY } = require('./google-sans');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeInlineJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function missingReportHtml(project, absolutePath) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${GOOGLE_SANS_FONT_LINKS}
  <style>
    body { margin: 0; padding: 48px; background: #0f1419; color: #e6eaf0; font: 14px ${GOOGLE_SANS_FONT_FAMILY}; }
    .card { max-width: 720px; margin: 10vh auto; padding: 28px; background: #1c2430; border: 1px solid #3d4a5c; border-radius: 20px; }
    h1 { margin-top: 0; font-size: 22px; }
    code { color: #7dd3fc; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(project.name)} report is unavailable</h1>
    <p>Generate the project report, then rebuild the master report.</p>
    <code>${escapeHtml(absolutePath)}</code>
  </div>
</body>
</html>`;
}

function loadProjects(config) {
  const seenIds = new Set();
  return config.projects.map((project) => {
    if (!project.id || !project.name || !project.reportPath) {
      throw new Error('Every master report project requires id, name, and reportPath.');
    }
    if (seenIds.has(project.id)) {
      throw new Error(`Duplicate master report project id: ${project.id}`);
    }
    seenIds.add(project.id);

    const absolutePath = path.resolve(ROOT, project.reportPath);
    return {
      id: project.id,
      name: project.name,
      reportPath: project.reportPath,
      available: fs.existsSync(absolutePath),
      html: fs.existsSync(absolutePath)
        ? fs.readFileSync(absolutePath, 'utf8')
        : missingReportHtml(project, absolutePath),
    };
  });
}

function buildMasterHtml(config, projects) {
  const title = config.title || 'Data Validation Master Report';
  const projectData = Object.fromEntries(projects.map((project) => [project.id, {
    name: project.name,
    html: project.html,
  }]));
  const options = projects.map((project) =>
    `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}${project.available ? '' : ' (report unavailable)'}</option>`,
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/svg+xml" href="favicon.svg">
  ${GOOGLE_SANS_FONT_LINKS}
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: dark;
      --background: #0f1419;
      --surface: #1c2430;
      --surface-high: #232c3a;
      --text: #e6eaf0;
      --muted: #a8b3c4;
      --outline: #3d4a5c;
      --primary: #7dd3fc;
    }
    * { box-sizing: border-box; }
    button, input, select, textarea { font-family: inherit; }
    html, body { height: 100%; }
    body {
      margin: 0;
      overflow: hidden;
      background: var(--background);
      color: var(--text);
      font-family: ${GOOGLE_SANS_FONT_FAMILY};
    }
    .master-shell {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      height: 100%;
    }
    .master-header {
      position: relative;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      min-height: 82px;
      padding: 14px 28px;
      background: rgba(15, 20, 25, 0.96);
      border-bottom: 1px solid var(--outline);
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
    }
    .title-block { min-width: 0; }
    .eyebrow {
      margin-bottom: 3px;
      color: var(--primary);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      overflow: hidden;
      font-size: clamp(18px, 2.2vw, 26px);
      font-weight: 650;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .project-picker {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 0 0 auto;
    }
    .project-picker label {
      color: var(--muted);
      font-size: 12px;
      font-weight: 650;
    }
    select {
      min-width: 210px;
      padding: 10px 38px 10px 14px;
      border: 1px solid var(--outline);
      border-radius: 12px;
      outline: none;
      background: var(--surface-high);
      color: var(--text);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    select:focus { border-color: var(--primary); }
    .report-frame {
      width: 100%;
      height: 100%;
      border: 0;
      background: var(--background);
    }
    @media (max-width: 680px) {
      .master-header {
        align-items: stretch;
        flex-direction: column;
        gap: 10px;
        padding: 12px 16px;
      }
      .project-picker { justify-content: space-between; }
      .project-picker select { flex: 1; min-width: 0; }
    }
  </style>
</head>
<body>
  <main class="master-shell">
    <header class="master-header">
      <div class="title-block">
        <div class="eyebrow">Project reports</div>
        <h1>${escapeHtml(title)}</h1>
      </div>
      <div class="project-picker">
        <label for="projectSelect">Project</label>
        <select id="projectSelect" aria-label="Select project">${options}</select>
      </div>
    </header>
    <iframe id="reportFrame" class="report-frame" title="Project validation report"></iframe>
  </main>
  <script>
    const projects = ${safeInlineJson(projectData)};
    const projectIds = Object.keys(projects);
    const select = document.getElementById('projectSelect');
    const frame = document.getElementById('reportFrame');

    function showProject(id, updateHistory = true) {
      const selectedId = projects[id] ? id : projectIds[0];
      if (!selectedId) return;
      select.value = selectedId;
      frame.title = projects[selectedId].name + ' validation report';
      frame.srcdoc = projects[selectedId].html;
      document.title = projects[selectedId].name + ' · ${escapeHtml(title)}';
      if (updateHistory) history.replaceState(null, '', '#' + encodeURIComponent(selectedId));
    }

    select.addEventListener('change', () => showProject(select.value));
    window.addEventListener('hashchange', () => showProject(decodeURIComponent(location.hash.slice(1)), false));
    showProject(decodeURIComponent(location.hash.slice(1)), false);
  </script>
</body>
</html>`;
}

function main() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const projects = loadProjects(config);
  if (!projects.length) throw new Error('At least one project must be configured.');

  const outputPath = path.resolve(ROOT, config.outputPath || 'artifacts/reports/html/master-data-validation-report.html');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buildMasterHtml(config, projects), 'utf8');
  fs.copyFileSync(FAVICON_PATH, path.join(path.dirname(outputPath), 'favicon.svg'));

  const available = projects.filter((project) => project.available).length;
  console.log(`Master validation report written to ${outputPath}`);
  console.log(`Embedded ${available}/${projects.length} configured project reports.`);
}

if (require.main === module) main();

module.exports = { buildMasterHtml, loadProjects };
