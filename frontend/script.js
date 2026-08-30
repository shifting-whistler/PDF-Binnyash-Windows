const $ = (s) => document.querySelector(s);

/* =====================================================================
   EDITABLE LINKS — the only place these need to change.
   ===================================================================== */
// "Give a Star on GitHub" button in the Support popup. Point this at
const GITHUB_STAR_URL = "https://github.com/shifting-whistler/PDF-Binnyash";
// Contact page links (Telegram, Email, GitHub).
const CONTACT_LINKS = {
  telegram: { url: "https://t.me/shifting_whistler", label: "@shifting_whistler", note: "Fastest way to get a quick response." },
  email: { url: "mailto:shiftingwhistler@gmail.com", label: "shiftingwhistler@gmail.com", note: "Best for detailed bug reports or feedback." },
  github: { url: "https://github.com/shifting-whistler", label: "GitHub", note: "See the source, star it, or file an issue." },
};

const state = {
  pdf: null,
  files: [],
  originalOrder: [],
  page: 0,
  sheet: 0,
  color: { invert: false, grayscale: false, contrast: 0, sharpen: 0, threshold: 0 },
  layout: { size: "A4", orientation: "Portrait", cols: 2, rows: 4 },
  colorPreviewToken: 0,
  layoutPreviewToken: 0,
  currentPage: "home",
  pageHistory: [],
  sortMode: 0,
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
  }[c]));
}

function toast(text, error = false) {
  const el = $("#toast");
  el.textContent = text;
  el.className = `toast ${error ? "error-toast" : ""}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.textContent = ""; }, 3500);
}

window.__pdfProgress = function (payload) {
  if (!payload) return;
  setProgress(payload.percent, payload.message);
};

let busy = 0;
function setProgress(percent, message) {
  const el = $("#loading");
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  if (message) el.querySelector(".loading-text").textContent = message;
  const bar = $("#progress-bar");
  const label = $("#progress-percent");
  if (bar) bar.style.width = `${value}%`;
  if (label) label.textContent = `${Math.round(value)}%`;
}
function showLoading(message = "Processing PDF…") {
  busy += 1;
  const el = $("#loading");
  el.querySelector(".loading-text").textContent = message;
  setProgress(0);
  el.classList.add("show");
}
function hideLoading() {
  busy = Math.max(0, busy - 1);
  if (!busy) {
    setProgress(100);
    setTimeout(() => $("#loading").classList.remove("show"), 120);
  }
}
async function withLoading(message, fn) {
  showLoading(message);
  await new Promise(requestAnimationFrame);
  try {
    return await fn();
  } catch (e) {
    toast(e?.message || String(e), true);
    throw e;
  } finally {
    hideLoading();
  }
}

function home() {
  return `<section class="hero">
    <h1>PDF <i>Binnyash</i></h1>
    <div class="squig"></div>
    <p>An <strong>all-in-one PDF workspace</strong> to effortlessly arrange, transform, and optimize your <strong>slides and documents</strong> for printing—keeping your workflow simple and clutter-free.</p>
    <div class="actions center"><button class="btn primary" onclick="go('merge')">Start with a PDF</button></div>

    <section class="tools-overview">
      <div class="overview-heading">
        <h2>What PDF Binnyash can do</h2>
        <p>Three focused tools for taking a document from scattered files to a clean, printable PDF.</p>
      </div>
      <div class="tool-cards">
        <article class="tool-card">
          <div class="tool-visual merge-visual" aria-hidden="true">
            <span class="sheet sheet-a"></span><span class="sheet sheet-b"></span><span class="merge-arrow">→</span><span class="sheet sheet-result"></span>
          </div>
          <h3>Merge PDF</h3>
          <p>Bring multiple PDFs together, arrange their order, and create one continuous document.</p>
        </article>
        <article class="tool-card">
          <div class="tool-visual color-visual" aria-hidden="true">
            <span class="color-page"></span><span class="color-slider"></span><span class="color-dot"></span>
          </div>
          <h3>Color Modification</h3>
          <p>Adjust inversion, grayscale, contrast, sharpening, and threshold across the document.</p>
        </article>
        <article class="tool-card">
          <div class="tool-visual layout-visual" aria-hidden="true">
            <span></span><span></span><span></span><span></span><span></span><span></span>
          </div>
          <h3>Print Layout</h3>
          <p>Place multiple source pages onto a physical sheet with precise rows, columns, and paper sizes.</p>
        </article>
      </div>
    </section>
  </section>`;
}
function page(title, sub, body) {
  return `<section class="page"><h1>${title}</h1><p class="sub">${sub}</p>${body}</section>`;
}
function setApp(html) {
  $("#app").innerHTML = html;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ---------------- MERGE ----------------
async function merge() {
  setApp(renderMergeHtml());
  bindMerge();
}

function renderMergeHtml() {
  const cards = state.files.map((f, i) => `
    <div class="file" draggable="true" data-index="${i}" title="Drag to rearrange">
      <div class="drag-handle">⋮⋮</div>
      <img draggable="false" src="${f.pages?.[0]?.image || ""}" alt="${escapeHtml(f.name)} preview">
      <div class="meta">
        <span><b>${i + 1}.</b> ${escapeHtml(f.name)}</span>
        <div class="card-actions"><button class="icon-btn move-btn" data-move="up" data-index="${i}" title="Move up">↑</button><button class="icon-btn move-btn" data-move="down" data-index="${i}" title="Move down">↓</button><button class="icon-btn" data-remove="${i}" title="Remove">×</button></div>
      </div>
      ${f.error ? `<p class="error">${escapeHtml(f.error)}</p>` : `<small>${f.page_count} page${f.page_count === 1 ? "" : "s"}</small>`}
    </div>`).join("");

  return page("Merge PDF", "Drop PDFs, arrange them in the exact order you want, then download or proceed.", `<div class="panel">
    <div class="dropzone" id="dz">
      <b>Drop PDF files here</b><br><span>or</span><br>
      <button class="btn primary" id="browse">Browse Files</button>
      <input id="drop-input" type="file" accept="application/pdf,.pdf" multiple hidden>
    </div>
    <div class="actions sort-actions">
      <span class="sort-label">Sort:</span>
      <button class="btn" id="sort-cycle">${["Normal", "A–Z", "Z–A"][state.sortMode]}</button>
    </div>
    <div class="files" id="files">${cards || '<div class="empty">No PDFs selected yet.</div>'}</div>
    <div class="actions">
      <button class="btn primary" id="merge-download" ${state.files.length ? "" : "disabled"}>Download merged PDF</button>
      <button class="btn" id="merge-next" ${state.files.length ? "" : "disabled"}>Proceed to Color Modification →</button>
    </div>
    <p class="hint">Drag a card to change the order. Download merges and saves immediately. Proceed merges without opening a Save dialog.</p>
  </div>`);
}

function bindMerge() {
  $("#browse").onclick = () => $("#drop-input").click();
  $("#drop-input").onchange = e => addLocalFiles([...e.target.files]);

  const dz = $("#dz");
  ["dragenter", "dragover"].forEach(ev => dz.addEventListener(ev, e => {
    e.preventDefault(); e.stopPropagation(); dz.classList.add("drag");
  }));
  ["dragleave", "drop"].forEach(ev => dz.addEventListener(ev, e => {
    e.preventDefault(); e.stopPropagation(); dz.classList.remove("drag");
  }));
  dz.addEventListener("drop", e => addLocalFiles([...e.dataTransfer.files]));

  $("#sort-cycle").onclick = cycleSort;
  document.querySelectorAll("[data-remove]").forEach(btn => {
    btn.onclick = () => removeFile(Number(btn.dataset.remove));
  });
  document.querySelectorAll("[data-move]").forEach(btn => {
    btn.onclick = () => moveFile(Number(btn.dataset.index), btn.dataset.move === "up" ? -1 : 1);
  });

  document.querySelectorAll(".file").forEach(card => {
    card.addEventListener("dragstart", e => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", card.dataset.index);
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
    card.addEventListener("dragover", e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      card.classList.add("drag-target");
    });
    card.addEventListener("dragleave", () => card.classList.remove("drag-target"));
    card.addEventListener("drop", e => {
      e.preventDefault();
      e.stopPropagation();
      card.classList.remove("drag-target");
      const from = Number(e.dataTransfer.getData("text/plain"));
      const to = Number(card.dataset.index);
      if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) return;
      const [moved] = state.files.splice(from, 1);
      state.files.splice(to, 0, moved);
      renderMergeOnly();
    });
  });

  $("#merge-download").onclick = downloadMerged;
  $("#merge-next").onclick = proceedFromMerge;
}

function renderMergeOnly() {
  setApp(renderMergeHtml());
  bindMerge();
}

async function addLocalFiles(files) {
  const pdfs = files.filter(f => f.name.toLowerCase().endsWith(".pdf"));
  if (!pdfs.length) return toast("Please select PDF files only.", true);

  showLoading("Reading PDF files…");
  try {
    for (const file of pdfs) {
      const data = await file.arrayBuffer();
      const bytes = new Uint8Array(data);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const info = await pywebview.api.add_dropped_pdf(
        file.name,
        "data:application/pdf;base64," + btoa(binary)
      );
      info._originalOrder = state.originalOrder.length;
      state.originalOrder.push(info.path);
      state.files.push(info);
    }
    applySortMode();
    renderMergeOnly();
  } catch (e) {
    toast(`Could not read PDF: ${e?.message || e}`, true);
  } finally {
    hideLoading();
  }
}

function removeFile(index) {
  state.files.splice(index, 1);
  renderMergeOnly();
}
function moveFile(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= state.files.length) return;
  const tmp = state.files[index];
  state.files[index] = state.files[target];
  state.files[target] = tmp;
  state.sortMode = 0;
  renderMergeOnly();
}
function naturalParts(name) {
  return name.toLowerCase().match(/\d+|\D+/g)?.map(x => /^\d+$/.test(x) ? Number(x) : x) || [name.toLowerCase()];
}
function naturalCompare(a, b) {
  const A = naturalParts(a.name), B = naturalParts(b.name);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    if (A[i] === undefined) return -1;
    if (B[i] === undefined) return 1;
    if (A[i] === B[i]) continue;
    if (typeof A[i] === "number" && typeof B[i] === "number") return A[i] - B[i];
    return String(A[i]).localeCompare(String(B[i]), undefined, { numeric: true, sensitivity: "base" });
  }
  return 0;
}
function applySortMode() {
  if (state.sortMode === 0) state.files.sort((a, b) => a._originalOrder - b._originalOrder);
  else if (state.sortMode === 1) state.files.sort(naturalCompare);
  else state.files.sort((a, b) => naturalCompare(b, a));
}
function cycleSort() {
  state.sortMode = (state.sortMode + 1) % 3;
  applySortMode();
  renderMergeOnly();
}

async function downloadMerged() {
  if (!state.files.length) return toast("Select at least one PDF.", true);
  if (state.files.some(f => f.error)) return toast("Remove invalid PDFs before merging.", true);
  try {
    const result = await withLoading("Merging PDFs…", () => pywebview.api.download_merged(
      state.files.map(f => f.path), "merged.pdf"
    ));
    if (result?.save?.saved) {
      state.pdf = result.pdf;
      state.page = 0;
      toast(`Merged PDF saved to ${result.save.path}`);
    } else {
      toast("Save cancelled.");
    }
    renderMergeOnly();
  } catch (_) { }
}

async function proceedFromMerge() {
  if (!state.files.length) return toast("Select at least one PDF.", true);
  if (state.files.some(f => f.error)) return toast("Remove invalid PDFs before proceeding.", true);
  try {
    const info = await withLoading("Merging PDFs and opening Color Modification…", () =>
      pywebview.api.merge(state.files.map(f => f.path))
    );
    state.pdf = info;
    state.page = 0;
    if (state.currentPage !== "color") state.pageHistory.push(state.currentPage);
    state.currentPage = "color";
    await color();
  } catch (_) { }
}

// ---------------- SHARED PDF ----------------
async function ensurePDF() {
  if (state.pdf) return true;
  const p = await withLoading("Opening PDF…", () => pywebview.api.open_pdf());
  if (!p) return false;
  state.pdf = p;
  state.page = 0;
  return true;
}

// ---------------- COLOR ----------------
async function color() {
  if (!(await ensurePDF())) {
    setApp(page("Color Modification", "Open a PDF to begin.", `<div class="panel empty-panel">
      <button class="btn primary" id="open-color">Open PDF</button>
    </div>`));
    $("#open-color").onclick = color;
    return;
  }
  renderColor();
  await refreshColorPreview();
}

function renderColor() {
  const total = state.pdf.page_count;
  setApp(page("Color Modification", "Tune the current PDF page. Changes are previewed immediately and can be applied to every page when you proceed or download.", `<div class="panel">
    <div class="preview color-preview">
      <img id="cp" alt="Processed PDF page preview">
      <div class="preview-loading" id="cp-loading"><div class="mini-spinner"></div><span>Updating preview…</span></div>
    </div>
    <div class="pager">
      <button class="btn" id="prev-page">←</button>
      <span>Page ${state.page + 1} / ${total}</span>
      <button class="btn" id="next-page">→</button>
    </div>
    <div class="controls">
      <div class="control"><label>Invert</label><button class="btn toggle ${state.color.invert ? "active" : ""}" id="invert">${state.color.invert ? "On" : "Off"}</button></div>
      <div class="control"><label>Grayscale</label><button class="btn toggle ${state.color.grayscale ? "active" : ""}" id="gray">${state.color.grayscale ? "On" : "Off"}</button></div>
      <div class="control"><label>Contrast <span id="contrast-value">${state.color.contrast}</span></label><input id="contrast" type="range" min="-100" max="100" value="${state.color.contrast}"></div>
      <div class="control"><label>Sharpening <span id="sharp-value">${state.color.sharpen}</span></label><input id="sharp" type="range" min="0" max="100" value="${state.color.sharpen}"></div>
      <div class="control"><label>Threshold <span id="threshold-value">${state.color.threshold}</span> <small>(0 = off)</small></label><input id="threshold" type="range" min="0" max="255" value="${state.color.threshold}"></div>
    </div>
    <div class="actions">
      <button class="btn primary" id="color-download">Download PDF</button>
      <button class="btn" id="color-next">Proceed to Print Layout →</button>
    </div>
  </div>`));

  $("#prev-page").onclick = () => cpage(-1);
  $("#next-page").onclick = () => cpage(1);
  $("#prev-page").disabled = state.page <= 0;
  $("#next-page").disabled = state.page >= total - 1;

  $("#invert").onclick = () => {
    state.color.invert = !state.color.invert;
    updateColorToggle("#invert", state.color.invert);
    refreshColorPreview();
  };
  $("#gray").onclick = () => {
    state.color.grayscale = !state.color.grayscale;
    updateColorToggle("#gray", state.color.grayscale);
    refreshColorPreview();
  };

  [["contrast", "contrast-value", "contrast"], ["sharp", "sharp-value", "sharpen"], ["threshold", "threshold-value", "threshold"]].forEach(([id, val, key]) => {
    $("#" + id).oninput = () => {
      state.color[key] = Number($("#" + id).value);
      $("#" + val).textContent = state.color[key];
      scheduleColorPreview();
    };
  });

  $("#color-download").onclick = downloadColor;
  $("#color-next").onclick = proceedFromColor;
}

function updateColorToggle(selector, active) {
  const el = $(selector);
  el.classList.toggle("active", active);
  el.textContent = active ? "On" : "Off";
}

function cpage(delta) {
  const total = state.pdf.page_count;
  state.page = Math.max(0, Math.min(total - 1, state.page + delta));
  renderColor();
  refreshColorPreview();
}

let colorPreviewTimer;
function scheduleColorPreview() {
  clearTimeout(colorPreviewTimer);
  colorPreviewTimer = setTimeout(refreshColorPreview, 80);
}

async function refreshColorPreview() {
  if (!state.pdf || !$("#cp")) return;
  const token = ++state.colorPreviewToken;
  const img = $("#cp");
  const loading = $("#cp-loading");
  loading?.classList.add("show");
  try {
    const data = await pywebview.api.preview_color(state.pdf.path, state.page, state.color);
    if (token !== state.colorPreviewToken) return;
    img.src = data;
  } catch (e) {
    if (token === state.colorPreviewToken) toast(`Preview failed: ${e?.message || e}`, true);
  } finally {
    if (token === state.colorPreviewToken) loading?.classList.remove("show");
  }
}

async function downloadColor() {
  if (!state.pdf) return toast("Open a PDF first.", true);
  try {
    const result = await withLoading("Applying color settings to every page…", () =>
      pywebview.api.download_color(state.pdf.path, state.color, "modified.pdf")
    );
    if (result?.saved) toast(`Modified PDF saved to ${result.path}`);
    else toast("Save cancelled.");
  } catch (_) { }
}

async function proceedFromColor() {
  if (!state.pdf) return toast("Open a PDF first.", true);
  try {
    const info = await withLoading("Applying color settings and opening Print Layout…", () =>
      pywebview.api.process_color(state.pdf.path, state.color)
    );
    state.pdf = info;
    state.page = 0;
    if (state.currentPage !== "print") state.pageHistory.push(state.currentPage);
    state.currentPage = "print";
    await print();
  } catch (_) { }
}

// ---------------- PRINT LAYOUT ----------------
async function print() {
  if (!(await ensurePDF())) {
    setApp(page("Print Layout", "Open a PDF to begin.", `<div class="panel empty-panel">
      <button class="btn primary" id="open-print">Open PDF</button>
    </div>`));
    $("#open-print").onclick = print;
    return;
  }
  renderPrint();
  await refreshLayoutPreview();
}

function renderPrint() {
  setApp(page("Print Layout", "Place every page of the current color-modified PDF onto a physical sheet. Columns always mean vertical divisions; rows always mean horizontal divisions.", `<div class="panel">
    <div class="preview layout-holder">
      <div id="layout-paper" class="layout-paper"><img id="lp" alt="Actual PDF print layout preview"></div>
      <div class="preview-loading" id="lp-loading"><div class="mini-spinner"></div><span>Rendering layout…</span></div>
    </div>
    <div class="pager">
      <button class="btn" id="prev-sheet">←</button>
      <span id="sheet-label">Sheet 1 / 1</span>
      <button class="btn" id="next-sheet">→</button>
    </div>
    <div class="controls layout-controls">
      <div class="control"><label>Page size</label><select id="ps">
        <option>A0</option><option>A1</option><option>A2</option><option>A3</option><option selected>A4</option><option>A5</option><option>A6</option>
        <option>B4</option><option>B5</option><option>Letter</option><option>Legal</option><option>Tabloid</option><option>Executive</option><option>Statement</option>
      </select></div>
      <div class="control"><label>Orientation</label><select id="ori"><option>Portrait</option><option>Landscape</option></select></div>
      <div class="control"><label>Columns <small>(vertical)</small></label><input id="cols" type="number" min="1" max="20" value="2"></div>
      <div class="control"><label>Rows <small>(horizontal)</small></label><input id="rows" type="number" min="1" max="20" value="4"></div>
    </div>
    <div class="orientation-note" id="orientation-note"></div><div class="sheet-size-readout" id="sheet-size-readout"></div>
    <div class="actions"><button class="btn primary" id="layout-download">Download print-layout.pdf</button></div>
    <p class="hint">Numbering is column-major. Changing orientation changes only the physical sheet dimensions; Columns and Rows keep their literal meanings.</p>
  </div>`));

  $("#ps").value = state.layout.size;
  $("#ori").value = state.layout.orientation;
  $("#cols").value = state.layout.cols;
  $("#rows").value = state.layout.rows;
  updateOrientationNote();

  ["ps", "ori", "cols", "rows"].forEach(id => {
    $("#" + id).oninput = () => {
      state.layout.size = $("#ps").value;
      state.layout.orientation = $("#ori").value;
      state.layout.cols = Math.max(1, Math.min(20, Number($("#cols").value) || 1));
      state.layout.rows = Math.max(1, Math.min(20, Number($("#rows").value) || 1));
      $("#cols").value = state.layout.cols;
      $("#rows").value = state.layout.rows;
      state.sheet = 0;
      updateOrientationNote();
      scheduleLayoutPreview();
    };
  });

  $("#prev-sheet").onclick = () => {
    state.sheet = Math.max(0, state.sheet - 1);
    refreshLayoutPreview();
  };
  $("#next-sheet").onclick = () => {
    state.sheet += 1;
    refreshLayoutPreview();
  };
  $("#layout-download").onclick = downloadLayout;
}

const PAPER_DIMENSIONS_MM = {
  A0: [841, 1189], A1: [594, 841], A2: [420, 594], A3: [297, 420], A4: [210, 297], A5: [148, 210], A6: [105, 148],
  B4: [250, 353], B5: [176, 250], Letter: [216, 279], Legal: [216, 356], Tabloid: [279, 432], Executive: [184, 267], Statement: [140, 216]
};
function updateOrientationNote() {
  const note = $("#orientation-note");
  if (!note) return;
  note.textContent = `${state.layout.orientation} · ${state.layout.cols} columns × ${state.layout.rows} rows · ${state.layout.cols * state.layout.rows} source pages per sheet`;
  const readout = $("#sheet-size-readout");
  if (readout) {
    let [w, h] = PAPER_DIMENSIONS_MM[state.layout.size] || PAPER_DIMENSIONS_MM.A4;
    if (state.layout.orientation === "Landscape") [w, h] = [h, w];
    readout.textContent = `${state.layout.size} · ${w} × ${h} mm · ${w} / ${h}`;
  }
}

let layoutPreviewTimer;
function scheduleLayoutPreview() {
  clearTimeout(layoutPreviewTimer);
  layoutPreviewTimer = setTimeout(refreshLayoutPreview, 100);
}

async function refreshLayoutPreview() {
  if (!state.pdf || !$("#lp")) return;
  const token = ++state.layoutPreviewToken;
  const img = $("#lp");
  const loading = $("#lp-loading");
  loading?.classList.add("show");
  try {
    const result = await pywebview.api.render_layout_preview(
      state.pdf.path,
      state.layout.size,
      state.layout.orientation,
      state.layout.cols,
      state.layout.rows,
      state.sheet
    );
    if (token !== state.layoutPreviewToken) return;
    state.sheet = result.sheet - 1;
    img.src = result.image;
    $("#sheet-label").textContent = `Sheet ${result.sheet} / ${result.sheets}`;
    $("#prev-sheet").disabled = result.sheet <= 1;
    $("#next-sheet").disabled = result.sheet >= result.sheets;
    updateOrientationNote();
    const paper = $("#layout-paper");
    const holder = $(".layout-holder");
    if (paper && holder && result.width && result.height) {
      // Size the on-screen sheet from the real physical page dimensions.
      // The wrapper is deliberately calculated from both available width and height
      // so changing A4/A3/A5/etc. visibly changes the sheet aspect ratio without distortion.
      const maxW = Math.max(240, holder.clientWidth - 48);
      const maxH = Math.max(300, Math.min(720, window.innerHeight - 270));
      const scale = Math.min(maxW / result.width, maxH / result.height);
      paper.style.width = `${Math.round(result.width * scale)}px`;
      paper.style.height = `${Math.round(result.height * scale)}px`;
      paper.style.aspectRatio = `${result.width} / ${result.height}`;
      paper.dataset.widthMm = result.width_mm;
      paper.dataset.heightMm = result.height_mm;
    }
  } catch (e) {
    if (token === state.layoutPreviewToken) toast(`Layout preview failed: ${e?.message || e}`, true);
  } finally {
    if (token === state.layoutPreviewToken) loading?.classList.remove("show");
  }
}

async function downloadLayout() {
  if (!state.pdf) return toast("Open a PDF first.", true);
  try {
    const result = await withLoading("Creating the final printable PDF…", () =>
      pywebview.api.download_layout(
        state.pdf.path,
        state.layout.size,
        state.layout.orientation,
        state.layout.cols,
        state.layout.rows,
        "print-layout.pdf"
      )
    );
    if (result?.saved) toast(`Print layout saved to ${result.path}`);
    else toast("Save cancelled.");
  } catch (_) { }
}

// ---------------- STATIC PAGES / NAV ----------------
function about() {
  setApp(page("About Us", "Streamlining your documents. Built for students, professionals, and everyone who prints.", `<div class="panel prose about-panel">
   
    <p class="section-subtitle"></p>
    <p><strong>PDF Binnyash</strong> was created with a laser focus on batch PDF modification and efficient printing. All of it started from a frustrating, real-world need: trying to <strong>cleanly format and print bloated class slides and lecture notes</strong>.</p>
    <p>This clean and organized workspace offers a distraction-free environment that strips away the bloat of traditional PDF editors. By prioritizing speed, batch processing, and privacy, PDF Binnyash transforms chaotic document formatting into a seamless, one-click experience — running entirely on your PC, with nothing ever uploaded to a server.</p>

    <div class="faq-section">
      <h2>FAQ</h2>
      <!-- FAQ ADD-QUESTION TEMPLATE: copy one .faq-item block below and edit the question/answer. -->
      <details class="faq-item">
        <summary>Who made it?</summary>
        <div class="faq-answer">PDF Binnyash was developed by <strong>Tanvir Mahtab</strong><em> (aka Shifting Whistler)</em></div>
      </details>
      <details class="faq-item">
        <summary>Is it completely free?</summary>
        <div class="faq-answer">Yes. It is <strong>100% free</strong> to use with no hidden paywalls, premium tiers, or annoying feature limits.</div>
      </details>
      <details class="faq-item">
        <summary>Will it steal my data?</summary>
        <div class="faq-answer">Hell nah, man. PDF Binnyash <strong>runs entirely locally</strong> on your PC. Your PDFs are never uploaded anywhere.</div>
      </details>
      <details class="faq-item">
        <summary>Is there an APK version or webapp of PDF Binnyash?</summary>
        <div class="faq-answer">You're using the Windows executable right now. A <strong>webapp version is also live</strong> — same tools, nothing to install, works right in your browser. There is no dedicated APK version, as webapp is more than enough. <br>
        The web app link: <a href="https://pdfbinnyash.pages.dev/" target="_blank"> https://pdfbinnyash.pages.dev/ </a></div>
      </details>
    </div>
  </div>`));
}
// EDIT-HERE: all contact/social links live in CONTACT_LINKS near the
// top of this file — change them there, not in this markup.
function contact() {
  const telegramIcon = `<svg class="contact-logo" viewBox="0 0 24 24" aria-hidden="true"><path d="M21.5 4.3 18.4 19c-.24 1.04-.85 1.3-1.72.81l-4.75-3.5-2.29 2.2c-.25.25-.46.46-.94.46l.34-4.84 8.8-7.95c.38-.34-.08-.53-.59-.19L6.37 12.9 1.7 11.43c-1.02-.32-1.04-1.02.21-1.51L20.15 2.8c.86-.32 1.61.2 1.35 1.5Z" fill="currentColor"/></svg>`;
  const emailIcon = `<svg class="contact-logo" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 5h17A2.5 2.5 0 0 1 23 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-17A2.5 2.5 0 0 1 1 16.5v-9A2.5 2.5 0 0 1 3.5 5Zm0 2a.5.5 0 0 0-.31.89l8.5 6.61a.5.5 0 0 0 .62 0l8.5-6.61A.5.5 0 0 0 20.5 7h-17ZM3 16.01V17h18v-.99l-8.07-6.27-1.43 1.11-1.43-1.11L3 16.01Z" fill="currentColor"/></svg>`;
  const githubIcon = `<svg class="contact-logo" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .5C5.73.5.98 5.24.98 11.52c0 5.02 3.26 9.28 7.77 10.78.57.1.78-.25.78-.55v-2.02c-3.16.69-3.83-1.34-3.83-1.34-.52-1.31-1.26-1.66-1.26-1.66-1.03-.7.08-.69.08-.69 1.14.08 1.74 1.17 1.74 1.17 1.01 1.73 2.65 1.23 3.3.94.1-.73.4-1.23.72-1.51-2.52-.29-5.17-1.26-5.17-5.6 0-1.24.44-2.25 1.17-3.05-.12-.29-.51-1.45.11-3.02 0 0 .96-.31 3.14 1.16a10.9 10.9 0 0 1 5.72 0c2.18-1.47 3.13-1.16 3.13-1.16.62 1.57.23 2.73.11 3.02.73.8 1.17 1.81 1.17 3.05 0 4.35-2.66 5.31-5.19 5.59.41.36.77 1.06.77 2.14v3.17c0 .3.21.66.79.55 4.5-1.51 7.76-5.76 7.76-10.78C23.02 5.24 18.27.5 12 .5Z" fill="currentColor"/></svg>`;

  const link = (key, icon, ariaLabel) => {
    const c = CONTACT_LINKS[key];
    return `<a class="contact-link" href="${c.url}" target="_blank" rel="noopener noreferrer" aria-label="${ariaLabel}">
        ${icon}
        <span>${escapeHtml(c.label)}</span>
        <small>${escapeHtml(c.note)}</small>
      </a>`;
  };

  setApp(page("Contact", "Got feedback, bugs, or ideas? Let’s make PDF Binnyash better together.", `<div class="panel prose contact-panel">
    <p>If you run into any issues, spot a bug, or have a feature suggestion to make your printing workflow even easier, don't hesitate to reach out. I am always open to feedback and looking to improve the tool!</p>
    <p>You can drop me a message directly via Telegram, shoot over an email, or find me on GitHub.</p>
    <h2>Connect With Me</h2>
    <div class="contact-links">
      ${link("telegram", telegramIcon, "Telegram")}
      ${link("email", emailIcon, "Email")}
      ${link("github", githubIcon, "GitHub")}
    </div>
  </div>`));
}
async function go(p, { push = true } = {}) {
  if (push && state.currentPage !== p) state.pageHistory.push(state.currentPage);
  state.currentPage = p;
  if (p === "home") { setApp(home()); return; }
  if (p === "merge") return merge();
  if (p === "color") return color();
  if (p === "print") return print();
  if (p === "about") return about();
  if (p === "contact") return contact();
}

async function goBack() {
  const previous = state.pageHistory.pop();
  if (!previous) return toast("There is no previous page.");
  return go(previous, { push: false });
}

function resetApp() {
  state.pdf = null;
  state.files = [];
  state.originalOrder = [];
  state.page = 0;
  state.sheet = 0;
  state.color = { invert: false, grayscale: false, contrast: 0, sharpen: 0, threshold: 0 };
  state.layout = { size: "A4", orientation: "Portrait", cols: 2, rows: 4 };
  state.pageHistory = [];
  state.currentPage = "home";
  state.sortMode = 0;
  go("home", { push: false });
}

document.addEventListener("click", e => {
  const p = e.target.dataset.page;
  if (p) {
    go(p);
    $("#navlinks").classList.remove("open");
  }
});
$("#back").onclick = goBack;
$("#reload").onclick = resetApp;
$("#theme").onclick = () => {
  document.body.classList.toggle("dark");
  localStorage.theme = document.body.classList.contains("dark") ? "dark" : "light";
};
$("#hamb").onclick = () => $("#navlinks").classList.toggle("open");
$("#support").onclick = () => $("#modal").style.display = "flex";
$("#support-star").href = GITHUB_STAR_URL;
$("#support-dismiss").onclick = () => $("#modal").style.display = "none";
$("#modal").addEventListener("click", e => { if (e.target.id === "modal") $("#modal").style.display = "none"; });
if (localStorage.theme === "dark") document.body.classList.add("dark");
go("home");

window.addEventListener("resize", () => {
  if (state.currentPage === "print" && $("#layout-paper")) refreshLayoutPreview();
});
