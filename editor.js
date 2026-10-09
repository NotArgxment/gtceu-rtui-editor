(() => {
  const PREVIEW_PADDING = 8;
  const SEL_COLOR = "#ff3d3d", SEL_WIDTH = 3;
  const editor = { selection: new Set(), drag: null, marquee: null, palette: new Map(), clipboard: [], undoStack: [], redoStack: [], knownRoot: null, pasteCount: 0 };
  const getChild = (c, k) => c.value.get(k);
  const getNumber = (c, k) => (c && getChild(c, k) ? Number(getChild(c, k).value) : 0);
  const ensureCompound = (c, k) => getChild(c, k) || (c.value.set(k, { kind: TAG.COMPOUND, value: new Map() }), getChild(c, k));
  const setIntChild = (c, k, n) => { 
    const t = getChild(c, k); 
    if (t) t.value = Math.round(n); 
    else c.value.set(k, { 
      kind: TAG.INT, value: Math.round(n) }); };

  function collectWidgets() {
    const out = [];
    const rec = (d, parent, wrap, ox, oy, depth) => {
      const sp = getChild(d, "selfPosition"), sz = getChild(d, "size");
      const x = ox + getNumber(sp, "x"), y = oy + getNumber(sp, "y");
      out.push({ data: d, parent, wrap, x, y, w: getNumber(sz, "width"), h: getNumber(sz, "height"), depth });
      const ch = getChild(d, "children");
      if (ch) ch.value.forEach((c) => getChild(c, "data") && rec(getChild(c, "data"), d, c, x, y, depth + 1));
    };
    const sp = getChild(state.root, "selfPosition");
    rec(state.root, null, null, PREVIEW_PADDING - getNumber(sp, "x"), PREVIEW_PADDING - getNumber(sp, "y"), 0);
    return out;
  }
  const selectedWidgets = () => collectWidgets().filter((n) => editor.selection.has(n.data));
  const selectedRoots = () => {
    const all = collectWidgets(), by = new Map(all.map((n) => [n.data, n]));
    const covered = (n) => { for (let p = n.parent; p; p = by.get(p).parent) if (editor.selection.has(p)) return true; return false; };
    return all.filter((n) => editor.selection.has(n.data) && !covered(n));
  };
  const findWidgetAt = (px, py) => collectWidgets().reverse().find((n) => px >= n.x && px < n.x + n.w && py >= n.y && py < n.y + n.h);
  const containerFor = (l) => { const n = l[0]; return !n ? state.root : l.length === 1 && getChild(n.data, "children") ? n.data : n.parent || state.root; };
  const refreshPanels = () => { renderTree(); renderInspector(); };

  const pushHistory = () => { editor.undoStack.push(structuredClone(state.root)); if (editor.undoStack.length > 100) editor.undoStack.shift(); editor.redoStack = []; };
  const restoreSnapshot = (from, to) => { const s = from.pop(); if (!s) return; to.push(structuredClone(state.root)); state.root = s; editor.selection.clear(); commit(); };
  const undoLast = () => restoreSnapshot(editor.undoStack, editor.redoStack);
  const redoLast = () => restoreSnapshot(editor.redoStack, editor.undoStack);

  function commit(light) {
    editor.knownRoot = state.root;
    if (!light) { state.texts.root = toSnbt(state.root); if (state.tab === "root") byId("ed").value = state.texts.root; }
    refreshEditor();
  }
  const baseRefresh = refreshEditor;
  refreshEditor = function () {
    baseRefresh();
    if (state.root !== editor.knownRoot) { editor.undoStack = []; editor.redoStack = []; editor.knownRoot = state.root; }
    const live = new Set(collectWidgets().map((n) => n.data));
    editor.selection.forEach((d) => live.has(d) || editor.selection.delete(d));
    refreshPanels();
  };

  function renderTree() {
    const t = byId("tree"); t.innerHTML = "";
    collectWidgets().forEach((n) => {
      const el = document.createElement("div");
      const type = n.wrap ? getChild(n.wrap, "type")?.value : "root", id = getChild(n.data, "id")?.value || "";
      el.textContent = "· ".repeat(n.depth) + type + (id ? "  #" + id : "");
      if (editor.selection.has(n.data)) el.className = "sel";
      el.onclick = (e) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey) editor.selection.has(n.data) ? editor.selection.delete(n.data) : editor.selection.add(n.data);
        else editor.selection = new Set([n.data]);
        refreshPanels();
      };
      t.appendChild(el);
    });
  }

  function addField(box, label, value, onset, kind = "text", list) {
    const l = document.createElement("label"), i = document.createElement("input");
    l.textContent = label;
    if (kind === "checkbox") { i.type = "checkbox"; i.checked = !!value; }
    else { i.type = kind; i.value = value; if (kind === "number") i.step = "any"; }
    if (list) i.setAttribute("list", list);
    i.onchange = () => { pushHistory(); onset(kind === "checkbox" ? i.checked : kind === "number" ? Number(i.value) : i.value); commit(); };
    l.appendChild(i); box.appendChild(l);
  }
  function findImageLocation(t) {
    const dd = getChild(t, "data"); if (!dd) return null;
    if (getChild(dd, "imageLocation")) return getChild(dd, "imageLocation");
    for (const c of dd.value.values()) if (c.kind === TAG.COMPOUND) { const r = findImageLocation(c); if (r) return r; }
    return null;
  }
  function addButtons(box, list) {
    const bar = document.createElement("div"); bar.className = "bar";
    list.forEach(([t, f]) => { const b = document.createElement("button"); b.textContent = t; b.onclick = f; bar.appendChild(b); });
    box.appendChild(bar);
  }
  function renderInspector() {
    const box = byId("insp"); box.innerHTML = "";
    const l = selectedWidgets();
    if (!l.length) { box.textContent = "Click a widget in the preview or the tree. Shift/Ctrl+click to multi-select, drag on empty space to box-select."; return; }
    if (l.length > 1) {
      box.textContent = l.length + " widgets selected";
      addButtons(box, [["Duplicate", duplicateSelection], ["Copy", copy], ["Cut", cut], ["Delete", deleteSelection]]);
      return;
    }
    const d = l[0].data;
    addField(box, "x", getNumber(getChild(d, "selfPosition"), "x"), (v) => setIntChild(ensureCompound(d, "selfPosition"), "x", v), "number");
    addField(box, "y", getNumber(getChild(d, "selfPosition"), "y"), (v) => setIntChild(ensureCompound(d, "selfPosition"), "y", v), "number");
    addField(box, "width", getNumber(getChild(d, "size"), "width"), (v) => setIntChild(ensureCompound(d, "size"), "width", v), "number");
    addField(box, "height", getNumber(getChild(d, "size"), "height"), (v) => setIntChild(ensureCompound(d, "size"), "height", v), "number");
    for (const [k, tag] of d.value) {
      if (["selfPosition", "size", "children"].includes(k)) continue;
      if (tag.kind === TAG.BYTE) addField(box, k, tag.value, (v) => (tag.value = v ? 1 : 0), "checkbox");
      else if ([TAG.SHORT, TAG.INT, TAG.LONG, TAG.FLOAT, TAG.DOUBLE].includes(tag.kind)) addField(box, k, tag.value, (v) => (tag.value = tag.kind === TAG.LONG ? BigInt(Math.round(v)) : [TAG.FLOAT, TAG.DOUBLE].includes(tag.kind) ? v : Math.round(v)), "number");
      else if (tag.kind === TAG.STRING) addField(box, k, tag.value, (v) => (tag.value = v));
      else if (tag.kind === TAG.COMPOUND && /texture/i.test(k)) {
        const loc = findImageLocation(tag);
        if (loc) addField(box, k, loc.value, (v) => (loc.value = v), "text", "texlist");
      }
    }
    addButtons(box, [["Duplicate", duplicateSelection], ["Delete", deleteSelection], ["↑", () => reorderSelection(-1)], ["↓", () => reorderSelection(1)]]);
  }

  function ensureUniqueId(w) {
    const idt = getChild(getChild(w, "data"), "id"); if (!idt || !idt.value) return;
    const used = new Set(collectWidgets().map((n) => getChild(n.data, "id")?.value).filter(Boolean));
    while (used.has(idt.value)) idt.value = /\d+$/.test(idt.value) ? idt.value.replace(/\d+$/, (m) => +m + 1) : idt.value + "_1";
  }
  function addWidget(w, host) {
    let ch = getChild(host, "children");
    if (!ch) host.value.set("children", (ch = { kind: TAG.LIST, value: [] }));
    ensureUniqueId(w); ch.value.push(w); editor.selection.add(getChild(w, "data"));
  }
  const offsetWidget = (w, o) => {
    const sp = ensureCompound(getChild(w, "data"), "selfPosition");
    setIntChild(sp, "x", getNumber(sp, "x") + o); setIntChild(sp, "y", getNumber(sp, "y") + o);
    return w;
  };
  function copy() {
    const l = selectedRoots().filter((n) => n.wrap);
    if (!l.length) return false;
    editor.clipboard = l.map((n) => structuredClone(n.wrap)); editor.pasteCount = 0;
    return true;
  }
  function paste() {
    if (!editor.clipboard.length) return;
    pushHistory();
    const host = containerFor(selectedRoots()); editor.pasteCount++;
    editor.selection.clear();
    editor.clipboard.forEach((w) => addWidget(offsetWidget(structuredClone(w), 4 * editor.pasteCount), host));
    commit();
  }
  function duplicateSelection() {
    const l = selectedRoots().filter((n) => n.wrap); if (!l.length) return;
    pushHistory(); editor.selection.clear();
    l.forEach((n) => addWidget(offsetWidget(structuredClone(n.wrap), 4), n.parent));
    commit();
  }
  function deleteSelection() {
    const l = selectedRoots().filter((n) => n.wrap); if (!l.length) return;
    pushHistory();
    l.forEach((n) => { const a = getChild(n.parent, "children").value; a.splice(a.indexOf(n.wrap), 1); });
    editor.selection.clear(); commit();
  }
  const selectAllWidgets = () => { editor.selection = new Set(collectWidgets().filter((n) => n.wrap).map((n) => n.data)); refreshPanels(); };
  const cut = () => { if (copy()) deleteSelection(); };
  function reorderSelection(dir) {
    const l = selectedRoots().filter((n) => n.wrap); if (l.length !== 1) return;
    const n = l[0], a = getChild(n.parent, "children").value, i = a.indexOf(n.wrap), j = i + dir;
    if (j < 0 || j >= a.length) return;
    pushHistory(); [a[i], a[j]] = [a[j], a[i]]; commit();
  }
  function nudge(dx, dy) {
    const l = selectedRoots(); if (!l.length) return;
    pushHistory();
    l.forEach((n) => { const sp = ensureCompound(n.data, "selfPosition"); setIntChild(sp, "x", getNumber(sp, "x") + dx); setIntChild(sp, "y", getNumber(sp, "y") + dy); });
    commit();
  }

  const fillPaletteOptions = () => (byId("proto").innerHTML = [...editor.palette.keys()].map((t) => `<option>${t}</option>`).join(""));
  async function loadPaletteFrom(u8) {
    if (u8[0] === 0x1f && u8[1] === 0x8b)
      u8 = new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
    const rec = (d) => (getChild(d, "children")?.value || []).forEach((w) => {
      const t = getChild(w, "type")?.value;
      if (t && !editor.palette.has(t)) {
        const c = structuredClone(w), ch = getChild(getChild(c, "data"), "children");
        if (ch) ch.value = [];
        editor.palette.set(t, c);
      }
      getChild(w, "data") && rec(getChild(w, "data"));
    });
    rec(getChild(readNbt(u8).tag, "root")); fillPaletteOptions();
  }
  byId("add").onclick = () => {
    const p = editor.palette.get(byId("proto").value); if (!p) return;
    pushHistory(); const host = containerFor(selectedRoots()); editor.selection.clear(); addWidget(structuredClone(p), host); commit();
  };
  byId("imp").onchange = async (e) => { for (const f of e.target.files) await loadPaletteFrom(new Uint8Array(await f.arrayBuffer())); e.target.value = ""; };
  loadPaletteFrom(Uint8Array.from(atob(TEMPLATE_B64), (c) => c.charCodeAt(0)));
  byId("texlist").innerHTML = TEXTURES.map((t) => `<option value="${t}">`).join("");

  const overlayCanvas = document.createElement("canvas");
  overlayCanvas.style.cssText = "position:absolute;left:10px;top:10px;outline:none;cursor:crosshair;touch-action:none;user-select:none;-webkit-user-select:none";
  previewCanvas.parentNode.style.position = "relative"; previewCanvas.parentNode.appendChild(overlayCanvas);
  const getZoom = () => +byId("zoom").value;
  const pointerPosition = (e) => { const r = overlayCanvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / getZoom(), y: (e.clientY - r.top) / getZoom() }; };

  const mediaMatches = (query) => typeof matchMedia === "function" && matchMedia(query).matches;
  const isCoarsePointer = mediaMatches("(pointer: coarse)"), HANDLE_SIZE = isCoarsePointer ? 16 : 8;
  overlayCanvas.onpointerdown = (e) => {
    if (editor.panMode || e.isPrimary === false) return;
    if (overlayCanvas.setPointerCapture) overlayCanvas.setPointerCapture(e.pointerId);
    const p = pointerPosition(e), mod = e.shiftKey || e.ctrlKey || e.metaKey || editor.multiSelect, tol = (isCoarsePointer ? 16 : 4) / getZoom();
    const one = editor.selection.size === 1 ? selectedWidgets()[0] : null;
    if (one && Math.abs(p.x - (one.x + one.w)) <= tol && Math.abs(p.y - (one.y + one.h)) <= tol) {
      pushHistory(); editor.drag = { mode: "size", p, w: one.w, h: one.h, data: one.data, moved: false };
      return;
    }
    const h = findWidgetAt(p.x, p.y);
    if (!h || !h.wrap) {
      editor.drag = { mode: "box", p, base: new Set(mod ? editor.selection : []) };
      if (!mod) editor.selection.clear();
      refreshPanels();
      return;
    }
    let collapse = null;
    if (mod) editor.selection.has(h.data) ? editor.selection.delete(h.data) : editor.selection.add(h.data);
    else if (!editor.selection.has(h.data)) editor.selection = new Set([h.data]);
    else if (editor.selection.size > 1) collapse = h.data;
    refreshPanels();
    if (!editor.selection.has(h.data)) return;
    pushHistory();
    editor.drag = { mode: "move", p, moved: false, collapse, items: selectedRoots().map((n) => ({ data: n.data, x: getNumber(getChild(n.data, "selfPosition"), "x"), y: getNumber(getChild(n.data, "selfPosition"), "y") })) };
  };
  window.addEventListener("pointermove", (e) => {
    const D = editor.drag; if (!D) return;
    const p = pointerPosition(e), dx = Math.round(p.x - D.p.x), dy = Math.round(p.y - D.p.y);
    if (D.mode === "box") {
      const r = { x1: Math.min(p.x, D.p.x), y1: Math.min(p.y, D.p.y), x2: Math.max(p.x, D.p.x), y2: Math.max(p.y, D.p.y) };
      editor.marquee = r;
      const s = new Set(D.base);
      collectWidgets().forEach((n) => n.wrap && !getChild(n.data, "children")?.value.length && n.x < r.x2 && n.x + n.w > r.x1 && n.y < r.y2 && n.y + n.h > r.y1 && s.add(n.data));
      editor.selection = s;
      return;
    }
    if (dx || dy) D.moved = true;
    if (D.mode === "move") D.items.forEach((i) => { setIntChild(ensureCompound(i.data, "selfPosition"), "x", i.x + dx); setIntChild(ensureCompound(i.data, "selfPosition"), "y", i.y + dy); });
    else { setIntChild(ensureCompound(D.data, "size"), "width", Math.max(1, D.w + dx)); setIntChild(ensureCompound(D.data, "size"), "height", Math.max(1, D.h + dy)); }
    commit(true);
  });
  const finishDrag = () => {
    const D = editor.drag; if (!D) return;
    editor.drag = null; editor.marquee = null;
    if (D.mode === "box") return refreshPanels();
    if (D.moved) return commit();
    editor.undoStack.pop();
    if (D.collapse) editor.selection = new Set([D.collapse]);
    refreshPanels();
  };
  window.addEventListener("pointerup", finishDrag);
  window.addEventListener("pointercancel", finishDrag);

  document.addEventListener("keydown", (e) => {
    if (byId("s2").hidden || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase(), m = e.ctrlKey || e.metaKey, st = e.shiftKey ? 8 : 1;
    const arrow = { arrowleft: [-st, 0], arrowright: [st, 0], arrowup: [0, -st], arrowdown: [0, st] }[k];
    if (m && k === "c") copy();
    else if (m && k === "x") cut();
    else if (m && k === "v") paste();
    else if (m && k === "d") duplicateSelection();
    else if (m && k === "a") selectAllWidgets();
    else if (m && k === "z") e.shiftKey ? redoLast() : undoLast();
    else if (m && k === "y") redoLast();
    else if (k === "delete" || k === "backspace") deleteSelection();
    else if (k === "escape") { editor.selection.clear(); refreshPanels(); }
    else if (arrow) nudge(...arrow);
    else return;
    e.preventDefault();
  });

  (function loop() {
    requestAnimationFrame(loop);
    if (byId("s2").hidden) return;
    if (overlayCanvas.width !== previewCanvas.width || overlayCanvas.height !== previewCanvas.height) { overlayCanvas.width = previewCanvas.width; overlayCanvas.height = previewCanvas.height; }
    const c = overlayCanvas.getContext("2d"), z = getZoom(), l = selectedWidgets();
    c.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    c.setLineDash([]);
    c.strokeStyle = c.fillStyle = SEL_COLOR; c.lineWidth = SEL_WIDTH;
    l.forEach((n) => c.strokeRect(n.x * z, n.y * z, n.w * z, n.h * z));
    if (l.length === 1) c.fillRect((l[0].x + l[0].w) * z - HANDLE_SIZE / 2, (l[0].y + l[0].h) * z - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
    if (editor.marquee) {
      const b = editor.marquee;
      c.fillStyle = "rgba(68,170,255,.15)";
      c.fillRect(b.x1 * z, b.y1 * z, (b.x2 - b.x1) * z, (b.y2 - b.y1) * z);
      c.setLineDash([4, 3]); c.strokeRect(b.x1 * z + 0.5, b.y1 * z + 0.5, (b.x2 - b.x1) * z, (b.y2 - b.y1) * z);
    }
  })();

  function verifyRoundTrip() {
    if (byId("perr").textContent) return "The SNBT text has an error: your latest text edits are NOT in the file.";
    try {
      const m = new Map();
      if (state.type) m.set("recipe_type", { kind: TAG.STRING, value: state.type });
      m.set("root", state.root); m.set("resources", state.resources);
      const a = writeNbt("", { kind: TAG.COMPOUND, value: m }), b = readNbt(a).tag, c = writeNbt("", b);
      if (a.length !== c.length || a.some((x, i) => x !== c[i])) return "NBT round trip does not produce identical bytes.";
      if (toSnbt(b) !== toSnbt({ kind: TAG.COMPOUND, value: m })) return "Re-read content differs from the editor content.";
    } catch (e) { return "Could not serialize: " + e.message; }
    return "";
  }
  const baseDl = byId("dl").onclick;
  byId("dl").onclick = () => { const r = verifyRoundTrip(); if (!r || confirm(r + "\n\nDownload anyway?")) baseDl(); };

  const sourcePane = document.querySelector(".split .left"), widgetsPane = document.querySelector(".vis"), topRow = document.querySelector(".top");
  const storage = (k, v) => { try { v === undefined ? (v = localStorage.getItem(k)) : localStorage.setItem(k, v); } catch (e) {} return v; };
  const setPaneWidth = (el, w) => { el.style.flex = "none"; el.style.width = Math.max(160, w) + "px"; };
  const setPaneHeight = (el, h) => { el.style.flex = "none"; el.style.height = Math.min(Math.max(80, h), el.parentElement.clientHeight - 160) + "px"; };
  const addGutter = (reference, placeAfter, className, storageKey, onDrag, readSize, applySize) => {
    const saved = storage(storageKey); if (saved) applySize(+saved);
    const gutter = document.createElement("div"); gutter.className = className;
    placeAfter ? reference.after(gutter) : reference.before(gutter);
    gutter.onpointerdown = (e) => {
      gutter.setPointerCapture(e.pointerId);
      const start = readSize(), x0 = e.clientX, y0 = e.clientY;
      gutter.onpointermove = (m) => applySize(onDrag(start, m.clientX - x0, m.clientY - y0));
      gutter.onpointerup = () => { gutter.onpointermove = null; storage(storageKey, Math.round(readSize())); };
    };
  };
  addGutter(widgetsPane, true, "gut", "widgetsWidth", (start, dx) => start + dx, () => widgetsPane.getBoundingClientRect().width, (w) => setPaneWidth(widgetsPane, w));
  addGutter(sourcePane, false, "gut row", "sourceHeight", (start, dx, dy) => start - dy, () => sourcePane.getBoundingClientRect().height, (h) => setPaneHeight(sourcePane, h));

  const actionBar = document.createElement("div");
  actionBar.className = "bar actions";
  const addAction = (label, handler) => {
    const button = document.createElement("button");
    button.textContent = label;
    button.onclick = () => handler(button);
    actionBar.appendChild(button);
  };
  addAction("↶ Undo", undoLast);
  addAction("↷ Redo", redoLast);
  addAction("Copy", copy);
  addAction("Cut", cut);
  addAction("Paste", paste);
  addAction("Duplicate", duplicateSelection);
  addAction("Delete", deleteSelection);
  addAction("Select all", selectAllWidgets);
  addAction("Multi-select", (button) => { editor.multiSelect = !editor.multiSelect; button.classList.toggle("on", editor.multiSelect); });
  addAction("Pan", (button) => { editor.panMode = !editor.panMode; button.classList.toggle("on", editor.panMode); });
  
  const rightBar = document.querySelector(".right .bar");
  rightBar.after(actionBar);
})();