(() => {
  const PREVIEW_PADDING = 8;
  const SEL_COLOR = "#ff3d3d",
    SEL_WIDTH = 3;
  const editor = {
    selection: new Set(),
    drag: null,
    marquee: null,
    palette: new Map(),
    clipboard: [],
    undoStack: [],
    redoStack: [],
    knownRoot: null,
    pasteCount: 0,
  };
  const getChild = (c, k) => c.value.get(k);
  const getNumber = (c, k) =>
    c && getChild(c, k) ? Number(getChild(c, k).value) : 0;
  const ensureCompound = (c, k) =>
    getChild(c, k) ||
    (c.value.set(k, { kind: TAG.COMPOUND, value: new Map() }), getChild(c, k));
  const setIntChild = (c, k, n) => {
    const t = getChild(c, k);
    if (t) t.value = Math.round(n);
    else
      c.value.set(k, {
        kind: TAG.INT,
        value: Math.round(n),
      });
  };

  function collectWidgets() {
    const out = [];
    const rec = (d, parent, wrap, ox, oy, depth) => {
      const sp = getChild(d, "selfPosition"),
        sz = getChild(d, "size");
      const x = ox + getNumber(sp, "x"),
        y = oy + getNumber(sp, "y");
      out.push({
        data: d,
        parent,
        wrap,
        x,
        y,
        w: getNumber(sz, "width"),
        h: getNumber(sz, "height"),
        depth,
      });
      const ch = getChild(d, "children");
      if (ch)
        ch.value.forEach(
          (c) =>
            getChild(c, "data") &&
            rec(getChild(c, "data"), d, c, x, y, depth + 1),
        );
    };
    const sp = getChild(state.root, "selfPosition");
    rec(
      state.root,
      null,
      null,
      PREVIEW_PADDING - getNumber(sp, "x"),
      PREVIEW_PADDING - getNumber(sp, "y"),
      0,
    );
    return out;
  }
  const selectedWidgets = () =>
    collectWidgets().filter((n) => editor.selection.has(n.data));
  const selectedRoots = () => {
    const all = collectWidgets(),
      by = new Map(all.map((n) => [n.data, n]));
    const covered = (n) => {
      for (let p = n.parent; p; p = by.get(p).parent)
        if (editor.selection.has(p)) return true;
      return false;
    };
    return all.filter((n) => editor.selection.has(n.data) && !covered(n));
  };
  const findWidgetAt = (px, py) =>
    collectWidgets()
      .reverse()
      .find((n) => px >= n.x && px < n.x + n.w && py >= n.y && py < n.y + n.h);
  const containerFor = (l) => {
    const n = l[0];
    return !n
      ? state.root
      : l.length === 1 && getChild(n.data, "children")
        ? n.data
        : n.parent || state.root;
  };
  const refreshPanels = () => {
    renderTree();
    renderInspector();
  };

  const pushHistory = () => {
    editor.undoStack.push(structuredClone(state.root));
    if (editor.undoStack.length > 100) editor.undoStack.shift();
    editor.redoStack = [];
  };
  const restoreSnapshot = (from, to) => {
    const s = from.pop();
    if (!s) return;
    to.push(structuredClone(state.root));
    state.root = s;
    editor.selection.clear();
    commit();
  };
  const undoLast = () => restoreSnapshot(editor.undoStack, editor.redoStack);
  const redoLast = () => restoreSnapshot(editor.redoStack, editor.undoStack);

  function commit(light) {
    editor.knownRoot = state.root;
    if (!light) {
      state.texts.root = toSnbt(state.root);
      if (state.tab === "root") byId("ed").value = state.texts.root;
    }
    refreshEditor();
  }
  const baseRefresh = refreshEditor;
  refreshEditor = function () {
    baseRefresh();
    if (state.root !== editor.knownRoot) {
      editor.undoStack = [];
      editor.redoStack = [];
      editor.knownRoot = state.root;
    }
    const live = new Set(collectWidgets().map((n) => n.data));
    editor.selection.forEach((d) => live.has(d) || editor.selection.delete(d));
    refreshPanels();
  };

  function renderTree() {
    const t = byId("tree");
    t.innerHTML = "";
    collectWidgets().forEach((n) => {
      const el = document.createElement("div");
      const type = n.wrap ? getChild(n.wrap, "type")?.value : "root",
        id = getChild(n.data, "id")?.value || "";
      el.textContent = "· ".repeat(n.depth) + type + (id ? "  #" + id : "");
      if (editor.selection.has(n.data)) el.className = "sel";
      el.onclick = (e) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey)
          editor.selection.has(n.data)
            ? editor.selection.delete(n.data)
            : editor.selection.add(n.data);
        else editor.selection = new Set([n.data]);
        refreshPanels();
      };
      t.appendChild(el);
    });
  }

  function addField(box, label, value, onset, kind = "text", list) {
    const l = document.createElement("label"),
      i = document.createElement("input");
    l.textContent = label;
    if (kind === "checkbox") {
      i.type = "checkbox";
      i.checked = !!value;
    } else {
      i.type = kind;
      i.value = value;
      if (kind === "number") i.step = "any";
    }
    if (list) i.setAttribute("list", list);
    i.onchange = () => {
      pushHistory();
      onset(
        kind === "checkbox"
          ? i.checked
          : kind === "number"
            ? Number(i.value)
            : i.value,
      );
      commit();
    };
    l.appendChild(i);
    box.appendChild(l);
  }
  function findImageLocation(t) {
    const dd = getChild(t, "data");
    if (!dd) return null;
    if (getChild(dd, "imageLocation")) return getChild(dd, "imageLocation");
    for (const c of dd.value.values())
      if (c.kind === TAG.COMPOUND) {
        const r = findImageLocation(c);
        if (r) return r;
      }
    return null;
  }
  function addButtons(box, list) {
    const bar = document.createElement("div");
    bar.className = "bar";
    list.forEach(([t, f]) => {
      const b = document.createElement("button");
      b.textContent = t;
      b.onclick = f;
      bar.appendChild(b);
    });
    box.appendChild(bar);
  }
  function renderInspector() {
    const box = byId("insp");
    box.innerHTML = "";
    const l = selectedWidgets();
    if (!l.length) {
      box.textContent =
        "Click a widget in the preview or the tree. Shift/Ctrl+click to multi-select, drag on empty space to box-select.";
      return;
    }
    if (l.length > 1) {
      box.textContent = l.length + " widgets selected";
      addButtons(box, [
        ["Duplicate", duplicateSelection],
        ["Copy", copy],
        ["Cut", cut],
        ["Delete", deleteSelection],
      ]);
      return;
    }
    const d = l[0].data;
    addField(
      box,
      "x",
      getNumber(getChild(d, "selfPosition"), "x"),
      (v) => setIntChild(ensureCompound(d, "selfPosition"), "x", v),
      "number",
    );
    addField(
      box,
      "y",
      getNumber(getChild(d, "selfPosition"), "y"),
      (v) => setIntChild(ensureCompound(d, "selfPosition"), "y", v),
      "number",
    );
    addField(
      box,
      "width",
      getNumber(getChild(d, "size"), "width"),
      (v) => setIntChild(ensureCompound(d, "size"), "width", v),
      "number",
    );
    addField(
      box,
      "height",
      getNumber(getChild(d, "size"), "height"),
      (v) => setIntChild(ensureCompound(d, "size"), "height", v),
      "number",
    );
    for (const [k, tag] of d.value) {
      if (["selfPosition", "size", "children"].includes(k)) continue;
      if (tag.kind === TAG.BYTE)
        addField(box, k, tag.value, (v) => (tag.value = v ? 1 : 0), "checkbox");
      else if (
        [TAG.SHORT, TAG.INT, TAG.LONG, TAG.FLOAT, TAG.DOUBLE].includes(tag.kind)
      )
        addField(
          box,
          k,
          tag.value,
          (v) =>
            (tag.value =
              tag.kind === TAG.LONG
                ? BigInt(Math.round(v))
                : [TAG.FLOAT, TAG.DOUBLE].includes(tag.kind)
                  ? v
                  : Math.round(v)),
          "number",
        );
      else if (tag.kind === TAG.STRING)
        addField(box, k, tag.value, (v) => (tag.value = v));
      else if (tag.kind === TAG.COMPOUND && /texture/i.test(k)) {
        const loc = findImageLocation(tag);
        if (loc)
          addField(
            box,
            k,
            loc.value,
            (v) => (loc.value = v),
            "text",
            "texlist",
          );
      }
    }
    addButtons(box, [
      ["Duplicate", duplicateSelection],
      ["Delete", deleteSelection],
      ["↑", () => reorderSelection(-1)],
      ["↓", () => reorderSelection(1)],
    ]);
  }

  function ensureUniqueId(w) {
    const idt = getChild(getChild(w, "data"), "id");
    if (!idt || !idt.value) return;
    const used = new Set(
      collectWidgets()
        .map((n) => getChild(n.data, "id")?.value)
        .filter(Boolean),
    );
    while (used.has(idt.value))
      idt.value = /\d+$/.test(idt.value)
        ? idt.value.replace(/\d+$/, (m) => +m + 1)
        : idt.value + "_1";
  }
  function addWidget(w, host) {
    let ch = getChild(host, "children");
    if (!ch) host.value.set("children", (ch = { kind: TAG.LIST, value: [] }));
    ensureUniqueId(w);
    ch.value.push(w);
    editor.selection.add(getChild(w, "data"));
  }
  const offsetWidget = (w, o) => {
    const sp = ensureCompound(getChild(w, "data"), "selfPosition");
    setIntChild(sp, "x", getNumber(sp, "x") + o);
    setIntChild(sp, "y", getNumber(sp, "y") + o);
    return w;
  };
  function copy() {
    const l = selectedRoots().filter((n) => n.wrap);
    if (!l.length) return false;
    editor.clipboard = l.map((n) => structuredClone(n.wrap));
    editor.pasteCount = 0;
    return true;
  }
  function paste() {
    if (!editor.clipboard.length) return;
    pushHistory();
    const host = containerFor(selectedRoots());
    editor.pasteCount++;
    editor.selection.clear();
    editor.clipboard.forEach((w) =>
      addWidget(offsetWidget(structuredClone(w), 4 * editor.pasteCount), host),
    );
    commit();
  }
  function duplicateSelection() {
    const l = selectedRoots().filter((n) => n.wrap);
    if (!l.length) return;
    pushHistory();
    editor.selection.clear();
    l.forEach((n) =>
      addWidget(offsetWidget(structuredClone(n.wrap), 4), n.parent),
    );
    commit();
  }
  function deleteSelection() {
    const l = selectedRoots().filter((n) => n.wrap);
    if (!l.length) return;
    pushHistory();
    l.forEach((n) => {
      const a = getChild(n.parent, "children").value;
      a.splice(a.indexOf(n.wrap), 1);
    });
    editor.selection.clear();
    commit();
  }
  const selectAllWidgets = () => {
    editor.selection = new Set(
      collectWidgets()
        .filter((n) => n.wrap)
        .map((n) => n.data),
    );
    refreshPanels();
  };
  const cut = () => {
    if (copy()) deleteSelection();
  };
  function reorderSelection(dir) {
    const l = selectedRoots().filter((n) => n.wrap);
    if (l.length !== 1) return;
    const n = l[0],
      a = getChild(n.parent, "children").value,
      i = a.indexOf(n.wrap),
      j = i + dir;
    if (j < 0 || j >= a.length) return;
    pushHistory();
    [a[i], a[j]] = [a[j], a[i]];
    commit();
  }
  function nudge(dx, dy) {
    const l = selectedRoots();
    if (!l.length) return;
    pushHistory();
    l.forEach((n) => {
      const sp = ensureCompound(n.data, "selfPosition");
      setIntChild(sp, "x", getNumber(sp, "x") + dx);
      setIntChild(sp, "y", getNumber(sp, "y") + dy);
    });
    commit();
  }

  const fillPaletteOptions = () =>
    (byId("proto").innerHTML = [...editor.palette.keys()]
      .map((t) => `<option>${t}</option>`)
      .join(""));
  async function loadPaletteFrom(u8) {
    if (u8[0] === 0x1f && u8[1] === 0x8b)
      u8 = new Uint8Array(
        await new Response(
          new Blob([u8]).stream().pipeThrough(new DecompressionStream("gzip")),
        ).arrayBuffer(),
      );
    const rec = (d) =>
      (getChild(d, "children")?.value || []).forEach((w) => {
        const t = getChild(w, "type")?.value;
        if (t && !editor.palette.has(t)) {
          const c = structuredClone(w),
            ch = getChild(getChild(c, "data"), "children");
          if (ch) ch.value = [];
          editor.palette.set(t, c);
        }
        getChild(w, "data") && rec(getChild(w, "data"));
      });
    rec(getChild(readNbt(u8).tag, "root"));
    fillPaletteOptions();
  }
  byId("add").onclick = () => {
    const p = editor.palette.get(byId("proto").value);
    if (!p) return;
    pushHistory();
    const host = containerFor(selectedRoots());
    editor.selection.clear();
    addWidget(structuredClone(p), host);
    commit();
  };
  // Slot icons are not baked into new slots: the "Assign icons" menu applies a chosen overlay on demand.
  const ICON_PREFIX = "gtceu:textures/gui/overlay/";
  const isOverlayEntry = (e) =>
    /\/overlay\//.test(
      getChild(getChild(getChild(e, "p"), "data"), "imageLocation")?.value ||
        "",
    );
  const makeIconEntry = (loc) =>
    fromSnbt(
      `{t: 11b, p: {type: "resource_texture", data: {offsetX: 0.0f, imageWidth: 1.0f, yOffset: 0.0f, xOffset: 0.0f, offsetY: 0.0f, color: -1, rotation: 0.0f, scale: 1.0f, imageHeight: 1.0f, imageLocation: "${loc}"}}}`,
    );
  const isSlotNode = (n) =>
    n.wrap && /(item|fluid)_slot$/.test(getChild(n.wrap, "type")?.value || "");
  // Slots the menu applies to: slots inside the current selection (a selected group counts), else every slot.
  function iconTargets() {
    const all = collectWidgets(),
      by = new Map(all.map((n) => [n.data, n])),
      slots = all.filter(isSlotNode);
    const sel = slots.filter((n) => {
      for (let d = n.data; d; d = by.get(d)?.parent)
        if (editor.selection.has(d)) return true;
      return false;
    });
    return { slots, targets: sel.length ? sel : slots, scoped: sel.length > 0 };
  }
  // loc === null removes the overlay; otherwise replaces any existing overlay (or adds one).
  function assignSlotIcon(loc) {
    const { targets } = iconTargets();
    if (!targets.length) return;
    pushHistory();
    targets.forEach((n) => {
      const bg = getChild(n.data, "backgroundTexture");
      const type = bg && getChild(bg, "type")?.value;
      let ts = null;
      if (type === "group_texture") {
        const d = getChild(bg, "data");
        ts = getChild(d, "textures");
        if (!ts) d.value.set("textures", (ts = { kind: TAG.LIST, value: [] }));
      } else {
        if (!loc) return;
        const group = fromSnbt(
          `{type: "group_texture", data: {yOffset: 0.0f, xOffset: 0.0f, textures: [], rotation: 0.0f, scale: 1.0f}}`,
        );
        ts = getChild(getChild(group, "data"), "textures");
        if (bg) {
          const entry = fromSnbt(`{t: 11b}`);
          entry.value.set("p", bg);
          ts.value.push(entry);
        }
        n.data.value.set("backgroundTexture", group);
      }
      ts.value = ts.value.filter((e) => !isOverlayEntry(e));
      if (loc) ts.value.push(makeIconEntry(loc));
    });
    commit();
  }

  const iconMenu = document.createElement("div");
  iconMenu.id = "iconMenu";
  iconMenu.hidden = true;
  iconMenu.innerHTML =
    '<div class="im-head"><input id="iconSearch" placeholder="Search icons…" autocomplete="off"><div id="iconScope" class="muted"></div></div><div id="iconGrid"></div>';
  document.body.appendChild(iconMenu);
  const iconGrid = iconMenu.querySelector("#iconGrid"),
    iconSearch = iconMenu.querySelector("#iconSearch");
  const iconNames = TEXTURES.filter((t) => t.startsWith(ICON_PREFIX));
  const iconTile = (loc, label, src) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "im-tile";
    b.title = label;
    b.dataset.name = label.toLowerCase();
    b.innerHTML = src
      ? `<span class="im-thumb"><img src="${src}" alt="" loading="lazy"></span><span class="im-name"></span>`
      : '<span class="im-thumb im-none">✕</span><span class="im-name"></span>';
    b.querySelector(".im-name").textContent = label;
    b.onclick = () => {
      closeIconMenu();
      assignSlotIcon(loc);
    };
    return b;
  };
  iconGrid.appendChild(iconTile(null, "None (remove)", null));
  iconNames.forEach((loc) => {
    const m = /^(\w+):textures\/(?:gui\/)?(.+)$/.exec(loc);
    iconGrid.appendChild(
      iconTile(
        loc,
        loc.slice(ICON_PREFIX.length).replace(/\.png$/, ""),
        `textures/${m[1]}/${m[2]}`,
      ),
    );
  });
  const filterIcons = () => {
    const q = iconSearch.value.trim().toLowerCase();
    iconGrid.querySelectorAll(".im-tile").forEach((t) => {
      t.hidden = !!q && !t.dataset.name.includes(q);
    });
  };
  iconSearch.oninput = filterIcons;
  function closeIconMenu() {
    iconMenu.hidden = true;
  }
  function openIconMenu() {
    const { slots, targets, scoped } = iconTargets();
    iconMenu.querySelector("#iconScope").textContent = !slots.length
      ? "No item/fluid slots found."
      : scoped
        ? `Applies to ${targets.length} selected slot(s)`
        : `Applies to all ${targets.length} slot(s) — select slots or a group to limit it`;
    iconMenu.hidden = false;
    const r = byId("icons").getBoundingClientRect(),
      w = iconMenu.offsetWidth;
    iconMenu.style.left =
      Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px";
    iconMenu.style.top = r.bottom + 6 + "px";
    iconMenu.style.maxHeight =
      Math.max(200, innerHeight - r.bottom - 20) + "px";
    iconSearch.value = "";
    filterIcons();
    iconSearch.focus();
  }
  byId("icons").onclick = (e) => {
    e.stopPropagation();
    iconMenu.hidden ? openIconMenu() : closeIconMenu();
  };
  document.addEventListener("pointerdown", (e) => {
    if (
      !iconMenu.hidden &&
      !iconMenu.contains(e.target) &&
      e.target !== byId("icons")
    )
      closeIconMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !iconMenu.hidden) closeIconMenu();
  });
  // ---- Shapes: generate a group of item/fluid slots laid out as a circle, polygon, line, grid or frame ----
  const SLOT = 18;
  const shapeCfg = {
    shape: "circle",
    fluid: false,
    out: true,
    count: 8,
    rx: 30,
    ry: 30,
    start: 0,
    sweep: 360,
    sides: 3,
    radius: 30,
    rotation: 0,
    vertical: false,
    cols: 3,
    rows: 3,
    gap: 0,
    grow: true,
  };
  // Angles are in degrees, 0 = top, clockwise. Returns slot centres (floats, origin = shape centre).
  function shapeCenters(c) {
    const n = Math.max(1, Math.round(c.count)),
      step = SLOT + c.gap,
      pts = [];
    const rad = (d) => (d * Math.PI) / 180;
    if (c.shape === "circle") {
      const full = c.sweep >= 360 || n === 1;
      for (let i = 0; i < n; i++) {
        const a = rad(
          c.start + (full ? (360 * i) / n : (c.sweep * i) / (n - 1)),
        );
        pts.push([c.rx * Math.sin(a), -c.ry * Math.cos(a)]);
      }
    } else if (c.shape === "polygon") {
      const s = Math.max(3, Math.round(c.sides)),
        v = Array.from({ length: s }, (_, k) => {
          const a = rad(c.rotation + (360 * k) / s);
          return [c.radius * Math.sin(a), -c.radius * Math.cos(a)];
        }),
        len = v.map((p, k) =>
          Math.hypot(v[(k + 1) % s][0] - p[0], v[(k + 1) % s][1] - p[1]),
        ),
        total = len.reduce((a, b) => a + b, 0);
      for (let i = 0; i < n; i++) {
        let d = (total * i) / n,
          k = 0;
        while (k < s - 1 && d > len[k]) ((d -= len[k]), k++);
        const t = len[k] ? d / len[k] : 0,
          a = v[k],
          b = v[(k + 1) % s];
        pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    } else if (c.shape === "line") {
      for (let i = 0; i < n; i++)
        pts.push(c.vertical ? [0, i * step] : [i * step, 0]);
    } else {
      const cols = Math.max(1, Math.round(c.cols)),
        rows = Math.max(1, Math.round(c.rows));
      for (let r = 0; r < rows; r++)
        for (let k = 0; k < cols; k++)
          if (
            c.shape === "grid" ||
            r === 0 ||
            r === rows - 1 ||
            k === 0 ||
            k === cols - 1
          )
            pts.push([k * step, r * step]);
      if (c.shape === "frame") {
        // clockwise from top-left
        const at = (k, r) =>
          pts.find((p) => p[0] === k * step && p[1] === r * step);
        const o = [];
        for (let k = 0; k < cols; k++) o.push(at(k, 0));
        for (let r = 1; r < rows; r++) o.push(at(cols - 1, r));
        for (let k = cols - 2; k >= 0 && rows > 1; k--) o.push(at(k, rows - 1));
        for (let r = rows - 2; r >= 1 && cols > 1; r--) o.push(at(0, r));
        return o;
      }
    }
    return pts;
  }
  // Integer top-left slot positions (origin = group top-left, 3px padding) and group size.
  function shapeLayout(c) {
    const ctr = shapeCenters(c);
    if (!ctr.length) return { slots: [], w: 0, h: 0, overlaps: 0 };
    const minX = Math.min(...ctr.map((p) => p[0])),
      minY = Math.min(...ctr.map((p) => p[1]));
    const slots = ctr.map((p) => [
      Math.round(p[0] - minX) + 3,
      Math.round(p[1] - minY) + 3,
    ]);
    const w = Math.max(...slots.map((s) => s[0])) + SLOT + 3,
      h = Math.max(...slots.map((s) => s[1])) + SLOT + 3;
    let overlaps = 0;
    for (let i = 0; i < slots.length; i++)
      for (let j = i + 1; j < slots.length; j++)
        if (
          Math.max(
            Math.abs(slots[i][0] - slots[j][0]),
            Math.abs(slots[i][1] - slots[j][1]),
          ) <
          SLOT + c.gap
        )
          overlaps++;
    return { slots, w, h, overlaps };
  }
  // Smallest radius (keeping the X:Y ratio for circles) with no overlapping slots.
  function autoRadius(c) {
    const t = { ...c };
    if (c.shape === "circle") {
      const ratio = c.rx > 0 ? c.ry / c.rx : 1;
      for (let r = 4; r < 600; r++) {
        t.rx = r;
        t.ry = r * ratio;
        if (!shapeLayout(t).overlaps)
          return { rx: r, ry: Math.round(r * ratio) };
      }
    } else if (c.shape === "polygon") {
      for (let r = 4; r < 600; r++) {
        t.radius = r;
        if (!shapeLayout(t).overlaps) return { radius: r };
      }
    }
    return null;
  }

  function createShape(c) {
    const kind = c.fluid ? "gtm_fluid_slot" : "gtm_item_slot",
      slotProto = editor.palette.get(kind),
      groupProto = editor.palette.get("group");
    if (!slotProto || !groupProto) {
      alert(
        `The palette has no "${!slotProto ? kind : "group"}" widget to copy.`,
      );
      return false;
    }
    const L = shapeLayout(c);
    if (!L.slots.length) return false;
    const prefix = `${c.fluid ? "fluid" : "item"}_${c.out ? "out" : "in"}_`,
      re = new RegExp("^" + prefix + "(\\d+)$");
    let next = 0;
    collectWidgets().forEach((n) => {
      const m = re.exec(getChild(n.data, "id")?.value || "");
      if (m) next = Math.max(next, +m[1] + 1);
    });
    pushHistory();
    const host = containerFor(selectedRoots()),
      hsz = ensureCompound(host, "size"),
      group = structuredClone(groupProto),
      gd = getChild(group, "data");
    const setPos = (d, x, y) => {
      const sp = ensureCompound(d, "selfPosition");
      setIntChild(sp, "x", x);
      setIntChild(sp, "y", y);
    };
    const setSize = (d, w, h) => {
      const sz = ensureCompound(d, "size");
      setIntChild(sz, "width", w);
      setIntChild(sz, "height", h);
    };
    const hw = getNumber(hsz, "width"),
      hh = getNumber(hsz, "height");
    const gx = c.grow ? Math.max(0, Math.round((hw - L.w) / 2)) : 0,
      gy = c.grow ? Math.max(0, Math.round((hh - L.h) / 2)) : 0;
    setPos(gd, gx, gy);
    setSize(gd, L.w, L.h);
    const ch =
      getChild(gd, "children") ||
      (gd.value.set("children", { kind: TAG.LIST, value: [] }),
      getChild(gd, "children"));
    ch.value = [];
    L.slots.forEach(([x, y], i) => {
      const s = structuredClone(slotProto),
        sd = getChild(s, "data");
      setPos(sd, x, y);
      setSize(sd, SLOT, SLOT);
      getChild(sd, "id").value = prefix + (next + i);
      ch.value.push(s);
    });
    if (c.grow) {
      // make the container big enough for the new group
      if (hw < gx + L.w) setIntChild(hsz, "width", gx + L.w);
      if (hh < gy + L.h) setIntChild(hsz, "height", gy + L.h);
    }
    let hostChildren = getChild(host, "children");
    if (!hostChildren)
      host.value.set(
        "children",
        (hostChildren = { kind: TAG.LIST, value: [] }),
      );
    hostChildren.value.push(group);
    editor.selection.clear();
    editor.selection.add(gd);
    commit();
    return true;
  }

  const shapeMenu = document.createElement("div");
  shapeMenu.id = "shapeMenu";
  shapeMenu.hidden = true;
  shapeMenu.innerHTML = `
    <div class="sm-body">
      <div class="sm-form">
        <label>Shape <select data-k="shape"><option value="circle">Circle / arc</option><option value="polygon">Polygon outline</option><option value="line">Line</option><option value="grid">Grid</option><option value="frame">Frame (hollow rectangle)</option></select></label>
        <label>Slot type <select data-k="fluid"><option value="0">Item slots</option><option value="1">Fluid slots</option></select></label>
        <label>Direction <select data-k="out"><option value="1">Output</option><option value="0">Input</option></select></label>
        <label data-for="circle polygon line">Count <input type="number" data-k="count" min="1" max="200"></label>
        <label data-for="circle">Radius X <input type="number" data-k="rx" min="0"></label>
        <label data-for="circle">Radius Y <input type="number" data-k="ry" min="0"></label>
        <label data-for="circle">Start angle° <input type="number" data-k="start"></label>
        <label data-for="circle">Sweep° <input type="number" data-k="sweep" min="1" max="360"></label>
        <label data-for="polygon">Sides <input type="number" data-k="sides" min="3" max="24"></label>
        <label data-for="polygon">Radius <input type="number" data-k="radius" min="0"></label>
        <label data-for="polygon">Rotation° <input type="number" data-k="rotation"></label>
        <label data-for="line">Orientation <select data-k="vertical"><option value="0">Horizontal</option><option value="1">Vertical</option></select></label>
        <label data-for="grid frame">Columns <input type="number" data-k="cols" min="1" max="30"></label>
        <label data-for="grid frame">Rows <input type="number" data-k="rows" min="1" max="30"></label>
        <label>Gap px <input type="number" data-k="gap" min="0"></label>
        <label class="sm-check"><input type="checkbox" data-k="grow"> Centre in / grow container</label>
      </div>
      <div class="sm-side"><canvas id="shapePrev" width="200" height="200"></canvas><div id="shapeInfo" class="muted"></div></div>
    </div>
    <div class="sm-foot"><button id="shapeAuto" type="button">Auto radius</button><span class="muted" id="shapeWhere"></span><button id="shapeGo" type="button" class="pri">Create</button></div>`;
  document.body.appendChild(shapeMenu);
  const smField = (k) => shapeMenu.querySelector(`[data-k="${k}"]`);
  function readShapeForm() {
    shapeMenu.querySelectorAll("[data-k]").forEach((el) => {
      const k = el.dataset.k;
      if (el.type === "checkbox") shapeCfg[k] = el.checked;
      else if (el.tagName === "SELECT")
        shapeCfg[k] = k === "shape" ? el.value : el.value === "1";
      else if (el.value !== "" && !isNaN(+el.value)) shapeCfg[k] = +el.value;
    });
  }
  function writeShapeForm() {
    shapeMenu.querySelectorAll("[data-k]").forEach((el) => {
      const v = shapeCfg[el.dataset.k];
      if (el.type === "checkbox") el.checked = !!v;
      else if (el.tagName === "SELECT")
        el.value = el.dataset.k === "shape" ? v : v ? "1" : "0";
      else el.value = v;
    });
  }
  function refreshShapeMenu() {
    shapeMenu.querySelectorAll("[data-for]").forEach((l) => {
      l.hidden = !l.dataset.for.split(" ").includes(shapeCfg.shape);
    });
    shapeMenu.querySelector("#shapeAuto").hidden = ![
      "circle",
      "polygon",
    ].includes(shapeCfg.shape);
    const L = shapeLayout(shapeCfg),
      cv = shapeMenu.querySelector("#shapePrev"),
      g = cv.getContext("2d");
    g.clearRect(0, 0, cv.width, cv.height);
    g.fillStyle = "#c6c6c6";
    g.fillRect(0, 0, cv.width, cv.height);
    if (L.slots.length) {
      const k = Math.min(1, (cv.width - 10) / L.w, (cv.height - 10) / L.h),
        ox = (cv.width - L.w * k) / 2,
        oy = (cv.height - L.h * k) / 2;
      g.strokeStyle = "#000";
      g.lineWidth = 1;
      g.strokeRect(ox + 0.5, oy + 0.5, L.w * k - 1, L.h * k - 1);
      g.font = Math.max(7, 9 * k) + "px monospace";
      g.textAlign = "center";
      g.textBaseline = "middle";
      L.slots.forEach(([x, y], i) => {
        g.fillStyle = shapeCfg.fluid ? "#3a3a3a" : "#8b8b8b";
        g.fillRect(ox + x * k, oy + y * k, SLOT * k, SLOT * k);
        g.strokeStyle = "#373737";
        g.strokeRect(
          ox + x * k + 0.5,
          oy + y * k + 0.5,
          SLOT * k - 1,
          SLOT * k - 1,
        );
        g.fillStyle = "#fff";
        g.fillText(String(i), ox + (x + SLOT / 2) * k, oy + (y + SLOT / 2) * k);
      });
    }
    shapeMenu.querySelector("#shapeInfo").textContent =
      `${L.slots.length} slot(s), group ${L.w}×${L.h}` +
      (L.overlaps ? ` — ${L.overlaps} overlapping pair(s)` : "");
    shapeMenu
      .querySelector("#shapeInfo")
      .classList.toggle("bad", L.overlaps > 0);
    const host = containerFor(selectedRoots()),
      t =
        host === state.root
          ? "root"
          : getChild(host, "id")?.value || "selected group";
    shapeMenu.querySelector("#shapeWhere").textContent = "Adds to: " + t;
  }
  shapeMenu.addEventListener(
    "input",
    () => (readShapeForm(), refreshShapeMenu()),
  );
  shapeMenu.querySelector("#shapeAuto").onclick = () => {
    const r = autoRadius(shapeCfg);
    if (r) Object.assign(shapeCfg, r);
    writeShapeForm();
    refreshShapeMenu();
  };
  shapeMenu.querySelector("#shapeGo").onclick = () => {
    readShapeForm();
    if (shapeCfg.shape === "grid" || shapeCfg.shape === "frame")
      shapeCfg.count = Math.max(1, shapeCfg.cols * shapeCfg.rows);
    if (createShape(shapeCfg)) closeShapeMenu();
  };
  function closeShapeMenu() {
    shapeMenu.hidden = true;
  }
  function openShapeMenu() {
    closeIconMenu();
    writeShapeForm();
    shapeMenu.hidden = false;
    const r = byId("shapes").getBoundingClientRect(),
      w = shapeMenu.offsetWidth;
    shapeMenu.style.left =
      Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px";
    shapeMenu.style.top = r.bottom + 6 + "px";
    shapeMenu.style.maxHeight =
      Math.max(240, innerHeight - r.bottom - 20) + "px";
    refreshShapeMenu();
  }
  byId("shapes").onclick = (e) => {
    e.stopPropagation();
    shapeMenu.hidden ? openShapeMenu() : closeShapeMenu();
  };
  document.addEventListener("pointerdown", (e) => {
    if (
      !shapeMenu.hidden &&
      !shapeMenu.contains(e.target) &&
      e.target !== byId("shapes")
    )
      closeShapeMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !shapeMenu.hidden) closeShapeMenu();
  });
  const baseIconsClick = byId("icons").onclick;
  byId("icons").onclick = (e) => (closeShapeMenu(), baseIconsClick(e));
  byId("imp").onchange = async (e) => {
    for (const f of e.target.files)
      await loadPaletteFrom(new Uint8Array(await f.arrayBuffer()));
    e.target.value = "";
  };
  loadPaletteFrom(Uint8Array.from(atob(TEMPLATE_B64), (c) => c.charCodeAt(0)));
  byId("texlist").innerHTML = TEXTURES.map((t) => `<option value="${t}">`).join(
    "",
  );

  const overlayCanvas = document.createElement("canvas");
  overlayCanvas.style.cssText =
    "position:absolute;left:10px;top:10px;outline:none;cursor:crosshair;touch-action:none;user-select:none;-webkit-user-select:none";
  previewCanvas.parentNode.style.position = "relative";
  previewCanvas.parentNode.appendChild(overlayCanvas);
  const getZoom = () => +byId("zoom").value;
  const pointerPosition = (e) => {
    const r = overlayCanvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / getZoom(),
      y: (e.clientY - r.top) / getZoom(),
    };
  };

  const mediaMatches = (query) =>
    typeof matchMedia === "function" && matchMedia(query).matches;
  const isCoarsePointer = mediaMatches("(pointer: coarse)"),
    HANDLE_SIZE = isCoarsePointer ? 16 : 8;
  overlayCanvas.onpointerdown = (e) => {
    if (editor.panMode || e.isPrimary === false) return;
    if (overlayCanvas.setPointerCapture)
      overlayCanvas.setPointerCapture(e.pointerId);
    const p = pointerPosition(e),
      mod = e.shiftKey || e.ctrlKey || e.metaKey || editor.multiSelect,
      tol = (isCoarsePointer ? 16 : 4) / getZoom();
    const one = editor.selection.size === 1 ? selectedWidgets()[0] : null;
    if (
      one &&
      Math.abs(p.x - (one.x + one.w)) <= tol &&
      Math.abs(p.y - (one.y + one.h)) <= tol
    ) {
      pushHistory();
      editor.drag = {
        mode: "size",
        p,
        w: one.w,
        h: one.h,
        data: one.data,
        moved: false,
      };
      return;
    }
    const h = findWidgetAt(p.x, p.y);
    if (!h || !h.wrap) {
      editor.drag = {
        mode: "box",
        p,
        base: new Set(mod ? editor.selection : []),
      };
      if (!mod) editor.selection.clear();
      refreshPanels();
      return;
    }
    let collapse = null;
    if (mod)
      editor.selection.has(h.data)
        ? editor.selection.delete(h.data)
        : editor.selection.add(h.data);
    else if (!editor.selection.has(h.data))
      editor.selection = new Set([h.data]);
    else if (editor.selection.size > 1) collapse = h.data;
    refreshPanels();
    if (!editor.selection.has(h.data)) return;
    pushHistory();
    editor.drag = {
      mode: "move",
      p,
      moved: false,
      collapse,
      items: selectedRoots().map((n) => ({
        data: n.data,
        x: getNumber(getChild(n.data, "selfPosition"), "x"),
        y: getNumber(getChild(n.data, "selfPosition"), "y"),
      })),
    };
  };
  window.addEventListener("pointermove", (e) => {
    const D = editor.drag;
    if (!D) return;
    const p = pointerPosition(e),
      dx = Math.round(p.x - D.p.x),
      dy = Math.round(p.y - D.p.y);
    if (D.mode === "box") {
      const r = {
        x1: Math.min(p.x, D.p.x),
        y1: Math.min(p.y, D.p.y),
        x2: Math.max(p.x, D.p.x),
        y2: Math.max(p.y, D.p.y),
      };
      editor.marquee = r;
      const s = new Set(D.base);
      collectWidgets().forEach(
        (n) =>
          n.wrap &&
          !getChild(n.data, "children")?.value.length &&
          n.x < r.x2 &&
          n.x + n.w > r.x1 &&
          n.y < r.y2 &&
          n.y + n.h > r.y1 &&
          s.add(n.data),
      );
      editor.selection = s;
      return;
    }
    if (dx || dy) D.moved = true;
    if (D.mode === "move")
      D.items.forEach((i) => {
        setIntChild(ensureCompound(i.data, "selfPosition"), "x", i.x + dx);
        setIntChild(ensureCompound(i.data, "selfPosition"), "y", i.y + dy);
      });
    else {
      setIntChild(
        ensureCompound(D.data, "size"),
        "width",
        Math.max(1, D.w + dx),
      );
      setIntChild(
        ensureCompound(D.data, "size"),
        "height",
        Math.max(1, D.h + dy),
      );
    }
    commit(true);
  });
  const finishDrag = () => {
    const D = editor.drag;
    if (!D) return;
    editor.drag = null;
    editor.marquee = null;
    if (D.mode === "box") return refreshPanels();
    if (D.moved) return commit();
    editor.undoStack.pop();
    if (D.collapse) editor.selection = new Set([D.collapse]);
    refreshPanels();
  };
  window.addEventListener("pointerup", finishDrag);
  window.addEventListener("pointercancel", finishDrag);

  document.addEventListener("keydown", (e) => {
    if (byId("s2").hidden || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
      return;
    const k = e.key.toLowerCase(),
      m = e.ctrlKey || e.metaKey,
      st = e.shiftKey ? 8 : 1;
    const arrow = {
      arrowleft: [-st, 0],
      arrowright: [st, 0],
      arrowup: [0, -st],
      arrowdown: [0, st],
    }[k];
    if (m && k === "c") copy();
    else if (m && k === "x") cut();
    else if (m && k === "v") paste();
    else if (m && k === "d") duplicateSelection();
    else if (m && k === "a") selectAllWidgets();
    else if (m && k === "z") e.shiftKey ? redoLast() : undoLast();
    else if (m && k === "y") redoLast();
    else if (k === "delete" || k === "backspace") deleteSelection();
    else if (k === "escape") {
      editor.selection.clear();
      refreshPanels();
    } else if (arrow) nudge(...arrow);
    else return;
    e.preventDefault();
  });

  function ioKindOf(d) {
    let inn = false,
      out = false;
    (function rec(x) {
      const m = /_(in|out)_\d+$/.exec(getChild(x, "id")?.value || "");
      if (m) m[1] === "in" ? (inn = true) : (out = true);
      (getChild(x, "children")?.value || []).forEach(
        (w) => getChild(w, "data") && rec(getChild(w, "data")),
      );
    })(d);
    return inn && out ? "IN/OUT" : inn ? "INPUT" : out ? "OUTPUT" : "";
  }
  function drawIoGroups(c, z) {
    c.save();
    c.setLineDash([]);
    c.lineWidth = 2;
    c.strokeStyle = "#000";
    c.font = "bold " + Math.round(3.5 * z) + "px monospace";
    collectWidgets().forEach((n) => {
      if (!n.wrap || getChild(n.wrap, "type")?.value !== "group") return;
      const kind = ioKindOf(n.data);
      if (!kind) return;
      c.strokeRect(n.x * z, n.y * z, n.w * z, n.h * z);
      const tw = c.measureText(kind).width + 4,
        th = Math.round(4.5 * z),
        ty = Math.max(0, n.y * z - th);
      c.fillStyle = "#000";
      c.fillRect(n.x * z, ty, tw, th);
      c.fillStyle = "#fff";
      c.textBaseline = "middle";
      c.fillText(kind, n.x * z + 2, ty + th / 2);
    });
    c.restore();
  }

  (function loop() {
    requestAnimationFrame(loop);
    if (byId("s2").hidden) return;
    if (
      overlayCanvas.width !== previewCanvas.width ||
      overlayCanvas.height !== previewCanvas.height
    ) {
      overlayCanvas.width = previewCanvas.width;
      overlayCanvas.height = previewCanvas.height;
    }
    const c = overlayCanvas.getContext("2d"),
      z = getZoom(),
      l = selectedWidgets();
    c.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    try {
      if (byId("grp")?.checked ?? true) drawIoGroups(c, z);
    } catch (err) {
      console.error("IO groups overlay:", err);
    }
    c.setLineDash([]);
    c.strokeStyle = c.fillStyle = SEL_COLOR;
    c.lineWidth = SEL_WIDTH;
    l.forEach((n) => c.strokeRect(n.x * z, n.y * z, n.w * z, n.h * z));
    if (l.length === 1)
      c.fillRect(
        (l[0].x + l[0].w) * z - HANDLE_SIZE / 2,
        (l[0].y + l[0].h) * z - HANDLE_SIZE / 2,
        HANDLE_SIZE,
        HANDLE_SIZE,
      );
    if (editor.marquee) {
      const b = editor.marquee;
      c.fillStyle = "rgba(68,170,255,.15)";
      c.fillRect(b.x1 * z, b.y1 * z, (b.x2 - b.x1) * z, (b.y2 - b.y1) * z);
      c.setLineDash([4, 3]);
      c.strokeRect(
        b.x1 * z + 0.5,
        b.y1 * z + 0.5,
        (b.x2 - b.x1) * z,
        (b.y2 - b.y1) * z,
      );
    }
  })();

  function verifyRoundTrip() {
    if (byId("perr").textContent)
      return "The SNBT text has an error: your latest text edits are NOT in the file.";
    try {
      const m = new Map();
      if (state.type)
        m.set("recipe_type", { kind: TAG.STRING, value: state.type });
      m.set("root", state.root);
      m.set("resources", state.resources);
      const a = writeNbt("", { kind: TAG.COMPOUND, value: m }),
        b = readNbt(a).tag,
        c = writeNbt("", b);
      if (a.length !== c.length || a.some((x, i) => x !== c[i]))
        return "NBT round trip does not produce identical bytes.";
      if (toSnbt(b) !== toSnbt({ kind: TAG.COMPOUND, value: m }))
        return "Re-read content differs from the editor content.";
    } catch (e) {
      return "Could not serialize: " + e.message;
    }
    return "";
  }
  const baseDl = byId("dl").onclick;
  byId("dl").onclick = () => {
    const r = verifyRoundTrip();
    if (!r || confirm(r + "\n\nDownload anyway?")) baseDl();
  };

  const sourcePane = document.querySelector(".split .left"),
    widgetsPane = document.querySelector(".vis"),
    topRow = document.querySelector(".top");
  const storage = (k, v) => {
    try {
      v === undefined
        ? (v = localStorage.getItem(k))
        : localStorage.setItem(k, v);
    } catch (e) {}
    return v;
  };
  const setPaneWidth = (el, w) => {
    el.style.flex = "none";
    el.style.width = Math.max(160, w) + "px";
  };
  const setPaneHeight = (el, h) => {
    el.style.flex = "none";
    el.style.height =
      Math.min(Math.max(80, h), el.parentElement.clientHeight - 110) + "px";
  };
  const addGutter = (
    reference,
    placeAfter,
    className,
    storageKey,
    onDrag,
    readSize,
    applySize,
  ) => {
    const saved = storage(storageKey);
    if (saved) applySize(+saved);
    const gutter = document.createElement("div");
    gutter.className = className;
    placeAfter ? reference.after(gutter) : reference.before(gutter);
    gutter.onpointerdown = (e) => {
      gutter.setPointerCapture(e.pointerId);
      const start = readSize(),
        x0 = e.clientX,
        y0 = e.clientY;
      gutter.onpointermove = (m) =>
        applySize(onDrag(start, m.clientX - x0, m.clientY - y0));
      gutter.onpointerup = () => {
        gutter.onpointermove = null;
        storage(storageKey, Math.round(readSize()));
      };
    };
  };
  addGutter(
    widgetsPane,
    true,
    "gut",
    "widgetsWidth",
    (start, dx) => start + dx,
    () => widgetsPane.getBoundingClientRect().width,
    (w) => setPaneWidth(widgetsPane, w),
  );
  addGutter(
    sourcePane,
    false,
    "gut row",
    "sourceHeight2",
    (start, dx, dy) => start - dy,
    () => sourcePane.getBoundingClientRect().height,
    (h) => setPaneHeight(sourcePane, h),
  );

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
  addAction("Multi-select", (button) => {
    editor.multiSelect = !editor.multiSelect;
    button.classList.toggle("on", editor.multiSelect);
  });
  addAction("Pan", (button) => {
    editor.panMode = !editor.panMode;
    button.classList.toggle("on", editor.panMode);
  });

  const rightBar = document.querySelector(".right .bar");
  rightBar.after(actionBar);
})();
