(() => {
  const PAD = 8;
  const E = { sel: null, drag: null, proto: new Map() };
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
  const cur = () => E.sel && scan().find((n) => n.d === E.sel);
  const hit = (px, py) =>
    scan()
      .reverse()
      .find((n) => px >= n.x && px < n.x + n.w && py >= n.y && py < n.y + n.h);

  function commit(light) {
    if (!light) {
      S.txt.root = fmt(S.root);
      if (S.tab === "root") $("ed").value = S.txt.root;
    }
    update();
  }
  const baseUpdate = update;
  update = function () {
    baseUpdate();
    renderTree();
    renderInsp();
  };

  function renderTree() {
    const t = $("tree");
    t.innerHTML = "";
    scan().forEach((n) => {
      const el = document.createElement("div");
      const type = n.wrap ? g(n.wrap, "type")?.v : "root",
        id = g(n.d, "id")?.v || "";
      el.textContent = "· ".repeat(n.depth) + type + (id ? "  #" + id : "");
      if (n.d === E.sel) el.className = "sel";
      el.onclick = () => {
        E.sel = n.d;
        renderTree();
        renderInsp();
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

  function renderInsp() {
    const box = $("insp");
    box.innerHTML = "";
    const n = cur();
    if (!n) {
      box.textContent =
        "Click on the preview or tree to select a widget";
      return;
    }
    const d = n.d;
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

    const bar = document.createElement("div");
    bar.className = "bar";
    [
      ["Duplicate", dup],
      ["Delete", del],
      ["↑", () => move(-1)],
      ["↓", () => move(1)],
    ].forEach(([t, f]) => {
      const b = document.createElement("button");
      b.textContent = t;
      b.onclick = f;
      bar.appendChild(b);
    });
    box.appendChild(bar);
  }

  const wrapIds = () =>
    scan()
      .map((n) => g(n.d, "id")?.v)
      .filter(Boolean);
  function uniqId(w) {
    const idt = g(g(w, "data"), "id");
    if (!idt || !idt.v) return;
    const used = new Set(wrapIds());
    while (used.has(idt.v))
      idt.v = /\d+$/.test(idt.v)
        ? idt.v.replace(/\d+$/, (m) => +m + 1)
        : idt.v + "_1";
  }
  function insert(w) {
    const n = cur();
    const host =
      n && g(n.d, "children") ? n.d : n && n.parent ? n.parent : S.root;
    let ch = g(host, "children");
    if (!ch) host.v.set("children", (ch = { t: 9, v: [] }));
    const d = g(w, "data");
    uniqId(w);
    ch.v.push(w);
    E.sel = d;
    commit();
  }
  function dup() {
    const n = cur();
    if (!n || !n.wrap) return;
    const w = structuredClone(n.wrap),
      sp = sub(g(w, "data"), "selfPosition");
    setInt(sp, "x", num(sp, "x") + 4);
    setInt(sp, "y", num(sp, "y") + 4);
    insert(w);
  }
  function del() {
    const n = cur();
    if (!n || !n.wrap) return;
    const l = g(n.parent, "children").v;
    l.splice(l.indexOf(n.wrap), 1);
    E.sel = n.parent;
    commit();
  }
  function move(dir) {
    const n = cur();
    if (!n || !n.wrap) return;
    const l = g(n.parent, "children").v,
      i = l.indexOf(n.wrap),
      j = i + dir;
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
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
    p && insert(structuredClone(p));
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
  ov.tabIndex = 0;
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
    ov.focus();
    const p = ptr(e),
      s = cur(),
      tol = 4 / zoom();
    if (
      s &&
      Math.abs(p.x - (s.x + s.w)) <= tol &&
      Math.abs(p.y - (s.y + s.h)) <= tol
    )
      E.drag = { mode: "size", p, w: s.w, h: s.h, d: s.d };
    else {
      const h = hit(p.x, p.y);
      E.sel = h ? h.d : null;
      if (h)
        E.drag = {
          mode: "move",
          p,
          x: num(g(h.d, "selfPosition"), "x"),
          y: num(g(h.d, "selfPosition"), "y"),
          d: h.d,
        };
      renderTree();
      renderInsp();
    }
  };
  window.addEventListener("mousemove", (e) => {
    const D = E.drag;
    if (!D) return;
    const p = ptr(e),
      dx = Math.round(p.x - D.p.x),
      dy = Math.round(p.y - D.p.y);
    if (D.mode === "move") {
      setInt(sub(D.d, "selfPosition"), "x", D.x + dx);
      setInt(sub(D.d, "selfPosition"), "y", D.y + dy);
    } else {
      setInt(sub(D.d, "size"), "width", Math.max(1, D.w + dx));
      setInt(sub(D.d, "size"), "height", Math.max(1, D.h + dy));
    }
    commit(true);
  });
  window.addEventListener("mouseup", () => {
    if (E.drag) {
      E.drag = null;
      commit();
    }
  });
  ov.onkeydown = (e) => {
    const n = cur();
    if (!n) return;
    const st = e.shiftKey ? 8 : 1,
      a = {
        ArrowLeft: [-st, 0],
        ArrowRight: [st, 0],
        ArrowUp: [0, -st],
        ArrowDown: [0, st],
      }[e.key];
    if (a) {
      const sp = sub(n.d, "selfPosition");
      setInt(sp, "x", num(sp, "x") + a[0]);
      setInt(sp, "y", num(sp, "y") + a[1]);
      commit();
    } else if (e.key === "Delete") del();
    else if (e.key === "d" && e.ctrlKey) dup();
    else return;
    e.preventDefault();
  };
  (function loop() {
    requestAnimationFrame(loop);
    if ($("s2").hidden) return;
    if (ov.width !== cv.width || ov.height !== cv.height) {
      ov.width = cv.width;
      ov.height = cv.height;
    }
    const c = ov.getContext("2d"),
      z = zoom(),
      n = cur();
    c.clearRect(0, 0, ov.width, ov.height);
    if (!n) return;
    c.strokeStyle = c.fillStyle = "#4af";
    c.lineWidth = 1;
    c.strokeRect(n.x * z + 0.5, n.y * z + 0.5, n.w * z, n.h * z);
    c.fillRect((n.x + n.w) * z - 3, (n.y + n.h) * z - 3, 6, 6);
  })();

  function verify() {
    if ($("perr").textContent)
      return "The SNBT text has an error: last text changes are NOT in the file";
    try {
      const m = new Map();
      if (S.type) m.set("recipe_type", { t: 8, v: S.type });
      m.set("root", S.root);
      m.set("resources", S.res);
      const a = writeNbt("", { t: 10, v: m }),
        b = readNbt(a).tag,
        c = writeNbt("", b);
      if (a.length !== c.length || a.some((x, i) => x !== c[i]))
        return "La ida y vuelta NBT no da los mismos bytes.";
      if (fmt(b) !== fmt({ t: 10, v: m }))
        return "El contenido releído difiere del que hay en el editor.";
    } catch (e) {
      return "No se pudo serializar: " + e.message;
    }
    return "";
  }
  const baseDl = $("dl").onclick;
  $("dl").onclick = () => {
    const r = verify();
    if (!r || confirm(r + "\n\nDownload anyways?")) baseDl();
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
