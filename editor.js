(() => {
  const PAD = 8;
  const SEL_COLOR = "#e21717", SEL_WIDTH = 3.5;
  const E = {
    sel: new Set(),
    drag: null,
    box: null,
    proto: new Map(),
    clip: [],
    hist: [],
    redo: [],
    root: null,
    pastes: 0,
  };
  const g = (c, k) => c.v.get(k);
  const num = (c, k) => (c && g(c, k) ? Number(g(c, k).v) : 0);
  const sub = (c, k) =>
    g(c, k) || (c.v.set(k, { t: 10, v: new Map() }), g(c, k));
  const setInt = (c, k, n) => {
    const t = g(c, k);
    if (t) t.v = Math.round(n);
    else c.v.set(k, { t: 3, v: Math.round(n) });
  };

  function scan() {
    const out = [];
    const rec = (d, parent, wrap, ox, oy, depth) => {
      const sp = g(d, "selfPosition"),
        sz = g(d, "size");
      const x = ox + num(sp, "x"),
        y = oy + num(sp, "y");
      out.push({
        d,
        parent,
        wrap,
        x,
        y,
        w: num(sz, "width"),
        h: num(sz, "height"),
        depth,
      });
      const ch = g(d, "children");
      if (ch)
        ch.v.forEach(
          (c) => g(c, "data") && rec(g(c, "data"), d, c, x, y, depth + 1),
        );
    };
    const sp = g(S.root, "selfPosition");
    rec(S.root, null, null, PAD - num(sp, "x"), PAD - num(sp, "y"), 0);
    return out;
  }
  const nodes = () => scan().filter((n) => E.sel.has(n.d));
  const tops = () => {
    const all = scan(),
      by = new Map(all.map((n) => [n.d, n]));
    const covered = (n) => {
      for (let p = n.parent; p; p = by.get(p).parent)
        if (E.sel.has(p)) return true;
      return false;
    };
    return all.filter((n) => E.sel.has(n.d) && !covered(n));
  };
  const hit = (px, py) =>
    scan()
      .reverse()
      .find((n) => px >= n.x && px < n.x + n.w && py >= n.y && py < n.y + n.h);
  const hostFor = (l) => {
    const n = l[0];
    return !n
      ? S.root
      : l.length === 1 && g(n.d, "children")
        ? n.d
        : n.parent || S.root;
  };
  const refresh = () => {
    renderTree();
    renderInsp();
  };

  const push = () => {
    E.hist.push(structuredClone(S.root));
    if (E.hist.length > 100) E.hist.shift();
    E.redo = [];
  };
  const restore = (from, to) => {
    const s = from.pop();
    if (!s) return;
    to.push(structuredClone(S.root));
    S.root = s;
    E.sel.clear();
    commit();
  };
  const undo = () => restore(E.hist, E.redo);
  const redo = () => restore(E.redo, E.hist);

  function commit(light) {
    E.root = S.root;
    if (!light) {
      S.txt.root = fmt(S.root);
      if (S.tab === "root") $("ed").value = S.txt.root;
    }
    update();
  }
  const baseUpdate = update;
  update = function () {
    baseUpdate();
    if (S.root !== E.root) {
      E.hist = [];
      E.redo = [];
      E.root = S.root;
    }
    const live = new Set(scan().map((n) => n.d));
    E.sel.forEach((d) => live.has(d) || E.sel.delete(d));
    refresh();
  };

  function renderTree() {
    const t = $("tree");
    t.innerHTML = "";
    scan().forEach((n) => {
      const el = document.createElement("div");
      const type = n.wrap ? g(n.wrap, "type")?.v : "root",
        id = g(n.d, "id")?.v || "";
      el.textContent = "· ".repeat(n.depth) + type + (id ? "  #" + id : "");
      if (E.sel.has(n.d)) el.className = "sel";
      el.onclick = (e) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey)
          E.sel.has(n.d) ? E.sel.delete(n.d) : E.sel.add(n.d);
        else E.sel = new Set([n.d]);
        refresh();
      };
      t.appendChild(el);
    });
  }

  function field(box, label, value, onset, kind = "text", list) {
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
      push();
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
  function firstLoc(t) {
    const dd = g(t, "data");
    if (!dd) return null;
    if (g(dd, "imageLocation")) return g(dd, "imageLocation");
    for (const c of dd.v.values())
      if (c.t === 10) {
        const r = firstLoc(c);
        if (r) return r;
      }
    return null;
  }
  function buttons(box, list) {
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
  function renderInsp() {
    const box = $("insp");
    box.innerHTML = "";
    const l = nodes();
    if (!l.length) {
      box.textContent =
        "Click a widget in the preview or the tree. Shift/Ctrl+click to multi-select, drag on empty space to box-select.";
      return;
    }
    if (l.length > 1) {
      box.textContent = l.length + " widgets selected";
      buttons(box, [
        ["Duplicate", dup],
        ["Copy", copy],
        ["Cut", cut],
        ["Delete", del],
      ]);
      return;
    }
    const d = l[0].d;
    field(
      box,
      "x",
      num(g(d, "selfPosition"), "x"),
      (v) => setInt(sub(d, "selfPosition"), "x", v),
      "number",
    );
    field(
      box,
      "y",
      num(g(d, "selfPosition"), "y"),
      (v) => setInt(sub(d, "selfPosition"), "y", v),
      "number",
    );
    field(
      box,
      "width",
      num(g(d, "size"), "width"),
      (v) => setInt(sub(d, "size"), "width", v),
      "number",
    );
    field(
      box,
      "height",
      num(g(d, "size"), "height"),
      (v) => setInt(sub(d, "size"), "height", v),
      "number",
    );
    for (const [k, tag] of d.v) {
      if (["selfPosition", "size", "children"].includes(k)) continue;
      if (tag.t === 1)
        field(box, k, tag.v, (v) => (tag.v = v ? 1 : 0), "checkbox");
      else if ([2, 3, 4, 5, 6].includes(tag.t))
        field(
          box,
          k,
          tag.v,
          (v) =>
            (tag.v =
              tag.t === 4
                ? BigInt(Math.round(v))
                : [5, 6].includes(tag.t)
                  ? v
                  : Math.round(v)),
          "number",
        );
      else if (tag.t === 8) field(box, k, tag.v, (v) => (tag.v = v));
      else if (tag.t === 10 && /texture/i.test(k)) {
        const loc = firstLoc(tag);
        if (loc) field(box, k, loc.v, (v) => (loc.v = v), "text", "texlist");
      }
    }
    buttons(box, [
      ["Duplicate", dup],
      ["Delete", del],
      ["↑", () => order(-1)],
      ["↓", () => order(1)],
    ]);
  }

  function uniqId(w) {
    const idt = g(g(w, "data"), "id");
    if (!idt || !idt.v) return;
    const used = new Set(
      scan()
        .map((n) => g(n.d, "id")?.v)
        .filter(Boolean),
    );
    while (used.has(idt.v))
      idt.v = /\d+$/.test(idt.v)
        ? idt.v.replace(/\d+$/, (m) => +m + 1)
        : idt.v + "_1";
  }
  function add(w, host) {
    let ch = g(host, "children");
    if (!ch) host.v.set("children", (ch = { t: 9, v: [] }));
    uniqId(w);
    ch.v.push(w);
    E.sel.add(g(w, "data"));
  }
  const shift = (w, o) => {
    const sp = sub(g(w, "data"), "selfPosition");
    setInt(sp, "x", num(sp, "x") + o);
    setInt(sp, "y", num(sp, "y") + o);
    return w;
  };
  function copy() {
    const l = tops().filter((n) => n.wrap);
    if (!l.length) return false;
    E.clip = l.map((n) => structuredClone(n.wrap));
    E.pastes = 0;
    return true;
  }
  function paste() {
    if (!E.clip.length) return;
    push();
    const host = hostFor(tops());
    E.pastes++;
    E.sel.clear();
    E.clip.forEach((w) => add(shift(structuredClone(w), 4 * E.pastes), host));
    commit();
  }
  function dup() {
    const l = tops().filter((n) => n.wrap);
    if (!l.length) return;
    push();
    E.sel.clear();
    l.forEach((n) => add(shift(structuredClone(n.wrap), 4), n.parent));
    commit();
  }
  function del() {
    const l = tops().filter((n) => n.wrap);
    if (!l.length) return;
    push();
    l.forEach((n) => {
      const a = g(n.parent, "children").v;
      a.splice(a.indexOf(n.wrap), 1);
    });
    E.sel.clear();
    commit();
  }
  const cut = () => {
    if (copy()) del();
  };
  function order(dir) {
    const l = tops().filter((n) => n.wrap);
    if (l.length !== 1) return;
    const n = l[0],
      a = g(n.parent, "children").v,
      i = a.indexOf(n.wrap),
      j = i + dir;
    if (j < 0 || j >= a.length) return;
    push();
    [a[i], a[j]] = [a[j], a[i]];
    commit();
  }
  function nudge(dx, dy) {
    const l = tops();
    if (!l.length) return;
    push();
    l.forEach((n) => {
      const sp = sub(n.d, "selfPosition");
      setInt(sp, "x", num(sp, "x") + dx);
      setInt(sp, "y", num(sp, "y") + dy);
    });
    commit();
  }

  const fillProto = () =>
    ($("proto").innerHTML = [...E.proto.keys()]
      .map((t) => `<option>${t}</option>`)
      .join(""));
  async function protoFrom(u8) {
    if (u8[0] === 0x1f && u8[1] === 0x8b)
      u8 = new Uint8Array(
        await new Response(
          new Blob([u8]).stream().pipeThrough(new DecompressionStream("gzip")),
        ).arrayBuffer(),
      );
    const rec = (d) =>
      (g(d, "children")?.v || []).forEach((w) => {
        const t = g(w, "type")?.v;
        if (t && !E.proto.has(t)) {
          const c = structuredClone(w),
            ch = g(g(c, "data"), "children");
          if (ch) ch.v = [];
          E.proto.set(t, c);
        }
        g(w, "data") && rec(g(w, "data"));
      });
    rec(g(readNbt(u8).tag, "root"));
    fillProto();
  }
  $("add").onclick = () => {
    const p = E.proto.get($("proto").value);
    if (!p) return;
    push();
    const host = hostFor(tops());
    E.sel.clear();
    add(structuredClone(p), host);
    commit();
  };
  $("imp").onchange = async (e) => {
    for (const f of e.target.files)
      await protoFrom(new Uint8Array(await f.arrayBuffer()));
    e.target.value = "";
  };
  protoFrom(Uint8Array.from(atob(TEMPLATE_B64), (c) => c.charCodeAt(0)));
  $("texlist").innerHTML = TEXTURES.map((t) => `<option value="${t}">`).join(
    "",
  );

  const ov = document.createElement("canvas");
  ov.style.cssText =
    "position:absolute;left:10px;top:10px;outline:none;cursor:crosshair";
  cv.parentNode.style.position = "relative";
  cv.parentNode.appendChild(ov);
  const zoom = () => +$("zoom").value;
  const ptr = (e) => {
    const r = ov.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / zoom(),
      y: (e.clientY - r.top) / zoom(),
    };
  };

  ov.onmousedown = (e) => {
    const p = ptr(e),
      mod = e.shiftKey || e.ctrlKey || e.metaKey,
      tol = 4 / zoom();
    const one = E.sel.size === 1 ? nodes()[0] : null;
    if (
      one &&
      Math.abs(p.x - (one.x + one.w)) <= tol &&
      Math.abs(p.y - (one.y + one.h)) <= tol
    ) {
      push();
      E.drag = { mode: "size", p, w: one.w, h: one.h, d: one.d, moved: false };
      return;
    }
    const h = hit(p.x, p.y);
    if (!h || !h.wrap) {
      E.drag = { mode: "box", p, base: new Set(mod ? E.sel : []) };
      if (!mod) E.sel.clear();
      refresh();
      return;
    }
    let collapse = null;
    if (mod) E.sel.has(h.d) ? E.sel.delete(h.d) : E.sel.add(h.d);
    else if (!E.sel.has(h.d)) E.sel = new Set([h.d]);
    else if (E.sel.size > 1) collapse = h.d;
    refresh();
    if (!E.sel.has(h.d)) return;
    push();
    E.drag = {
      mode: "move",
      p,
      moved: false,
      collapse,
      items: tops().map((n) => ({
        d: n.d,
        x: num(g(n.d, "selfPosition"), "x"),
        y: num(g(n.d, "selfPosition"), "y"),
      })),
    };
  };
  window.addEventListener("mousemove", (e) => {
    const D = E.drag;
    if (!D) return;
    const p = ptr(e),
      dx = Math.round(p.x - D.p.x),
      dy = Math.round(p.y - D.p.y);
    if (D.mode === "box") {
      const r = {
        x1: Math.min(p.x, D.p.x),
        y1: Math.min(p.y, D.p.y),
        x2: Math.max(p.x, D.p.x),
        y2: Math.max(p.y, D.p.y),
      };
      E.box = r;
      const s = new Set(D.base);
      scan().forEach(
        (n) =>
          n.wrap &&
          !g(n.d, "children")?.v.length &&
          n.x < r.x2 &&
          n.x + n.w > r.x1 &&
          n.y < r.y2 &&
          n.y + n.h > r.y1 &&
          s.add(n.d),
      );
      E.sel = s;
      return;
    }
    if (dx || dy) D.moved = true;
    if (D.mode === "move")
      D.items.forEach((i) => {
        setInt(sub(i.d, "selfPosition"), "x", i.x + dx);
        setInt(sub(i.d, "selfPosition"), "y", i.y + dy);
      });
    else {
      setInt(sub(D.d, "size"), "width", Math.max(1, D.w + dx));
      setInt(sub(D.d, "size"), "height", Math.max(1, D.h + dy));
    }
    commit(true);
  });
  window.addEventListener("mouseup", () => {
    const D = E.drag;
    if (!D) return;
    E.drag = null;
    E.box = null;
    if (D.mode === "box") return refresh();
    if (D.moved) return commit();
    E.hist.pop();
    if (D.collapse) E.sel = new Set([D.collapse]);
    refresh();
  });

  document.addEventListener("keydown", (e) => {
    if ($("s2").hidden || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
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
    else if (m && k === "d") dup();
    else if (m && k === "a") {
      E.sel = new Set(
        scan()
          .filter((n) => n.wrap)
          .map((n) => n.d),
      );
      refresh();
    } else if (m && k === "z") e.shiftKey ? redo() : undo();
    else if (m && k === "y") redo();
    else if (k === "delete" || k === "backspace") del();
    else if (k === "escape") {
      E.sel.clear();
      refresh();
    } else if (arrow) nudge(...arrow);
    else return;
    e.preventDefault();
  });

  (function loop() {
    requestAnimationFrame(loop);
    if ($("s2").hidden) return;
    if (ov.width !== cv.width || ov.height !== cv.height) {
      ov.width = cv.width;
      ov.height = cv.height;
    }
    const c = ov.getContext("2d"),
      z = zoom(),
      l = nodes();
    c.clearRect(0, 0, ov.width, ov.height);
    c.strokeStyle = c.fillStyle = "#4af";
    c.lineWidth = 1;
    l.forEach((n) =>
      c.strokeRect(n.x * z + 0.5, n.y * z + 0.5, n.w * z, n.h * z),
    );
    if (l.length === 1)
      c.fillRect((l[0].x + l[0].w) * z - 3, (l[0].y + l[0].h) * z - 3, 6, 6);
    if (E.box) {
      const b = E.box;
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

  function verify() {
    if ($("perr").textContent)
      return "The SNBT text has an error: your latest text edits are NOT in the file.";
    try {
      const m = new Map();
      if (S.type) m.set("recipe_type", { t: 8, v: S.type });
      m.set("root", S.root);
      m.set("resources", S.res);
      const a = writeNbt("", { t: 10, v: m }),
        b = readNbt(a).tag,
        c = writeNbt("", b);
      if (a.length !== c.length || a.some((x, i) => x !== c[i]))
        return "NBT round trip does not produce identical bytes.";
      if (fmt(b) !== fmt({ t: 10, v: m }))
        return "Re-read content differs from the editor content.";
    } catch (e) {
      return "Could not serialize: " + e.message;
    }
    return "";
  }
  const baseDl = $("dl").onclick;
  $("dl").onclick = () => {
    const r = verify();
    if (!r || confirm(r + "\n\nDownload anyway?")) baseDl();
  };

  const [pl, pv] = [
    document.querySelector(".split .left"),
    document.querySelector(".vis"),
  ];
  const store = (k, v) => {
    try {
      v === undefined
        ? (v = localStorage.getItem(k))
        : localStorage.setItem(k, v);
    } catch (e) {}
    return v;
  };
  const setW = (el, w) => {
    el.style.flex = "none";
    el.style.width = Math.max(120, w) + "px";
  };
  [
    [pl, "wLeft"],
    [pv, "wVis"],
  ].forEach(([el, key]) => {
    const w = store(key);
    if (w) setW(el, +w);
    const gut = document.createElement("div");
    gut.className = "gut";
    el.after(gut);
    gut.onpointerdown = (e) => {
      gut.setPointerCapture(e.pointerId);
      const x0 = e.clientX,
        w0 = el.getBoundingClientRect().width;
      gut.onpointermove = (m) => setW(el, w0 + m.clientX - x0);
      gut.onpointerup = () => {
        gut.onpointermove = null;
        store(key, parseInt(el.style.width));
      };
    };
  });
})();
