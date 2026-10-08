const $ = (id) => document.getElementById(id);
const TYPES =
    "steam_boiler electric_furnace alloy_smelter arc_furnace assembler autoclave bender brewery macerator canner centrifuge chemical_bath chemical_reactor compressor cutter distillery electrolyzer electromagnetic_separator extractor extruder fermenter fluid_heater fluid_solidifier forge_hammer forming_press lathe mixer ore_washer packer polarizer laser_engraver sifter thermal_centrifuge wiremill circuit_assembler gas_collector air_scrubber research_station rock_breaker scanner combustion_generator gas_turbine steam_turbine plasma_generator large_boiler coke_oven primitive_blast_furnace electric_blast_furnace distillation_tower pyrolyse_oven cracker implosion_compressor vacuum_freezer assembly_line large_chemical_reactor fusion_reactor".split(
        " ",
    );
$("types").innerHTML = TYPES.map((t) => `<option value="gtceu:${t}">`).join("");
const S = {
    name: "",
    type: "",
    root: null,
    res: null,
    tab: "root",
    view: null,
    txt: {},
};
const emptyC = () => ({ t: 10, v: new Map() });
const pathOf = (t) => (t.includes(":") ? t.split(":")[1] : t),
    nsOf = (t) => (t.includes(":") ? t.split(":")[0] : "<namespace>");

// ---------- loading ----------
async function loadBytes(u8, name) {
    if (u8[0] === 0x1f && u8[1] === 0x8b)
        u8 = new Uint8Array(
            await new Response(
                new Blob([u8])
                    .stream()
                    .pipeThrough(new DecompressionStream("gzip")),
            ).arrayBuffer(),
        );
    const { tag } = readNbt(u8);
    if (tag.t !== 10 || !tag.v.has("root"))
        throw new Error('Not an .rtui file (no "root" compound)');
    S.name = name;
    S.type = tag.v.has("recipe_type") ? tag.v.get("recipe_type").v : "";
    S.root = tag.v.get("root");
    S.res = tag.v.get("resources") || emptyC();
    openEditor();
}
async function loadFile(f) {
    try {
        await loadBytes(
            new Uint8Array(await f.arrayBuffer()),
            f.name.replace(/\.[^.]+$/, ""),
        );
    } catch (e) {
        $("err1").textContent = e.message;
    }
}
$("file").onchange = (e) => e.target.files[0] && loadFile(e.target.files[0]);
const dz = $("drop");
dz.ondragover = (e) => {
    e.preventDefault();
    dz.classList.add("over");
};
dz.ondragleave = () => dz.classList.remove("over");
dz.ondrop = (e) => {
    e.preventDefault();
    dz.classList.remove("over");
    e.dataTransfer.files[0] && loadFile(e.dataTransfer.files[0]);
};
$("n1").onclick = () => {
    if (!$("nName").value.trim()) return;
    $("step2").hidden = false;
    $("nType").focus();
};
$("nName").onkeydown = (e) => e.key === "Enter" && $("n1").click();
$("nType").oninput = () => {
    const t = $("nType").value.trim();
    $("nHint").textContent =
        t && pathOf(t) !== $("nName").value.trim()
            ? `GTM looks for ${pathOf(t)}.rtui — the file name should match the recipe type path.`
            : "";
};
$("n2").onclick = async () => {
    const t = $("nType").value.trim();
    if (!t) return;
    const b = Uint8Array.from(atob(TEMPLATE_B64), (c) => c.charCodeAt(0));
    await loadBytes(b, $("nName").value.trim());
    S.type = t;
    $("type").value = t;
    update();
};
$("back").onclick = () => {
    $("s2").hidden = true;
    $("s1").hidden = false;
};

// ---------- editor ----------
function openEditor() {
    $("s1").hidden = true;
    $("s2").hidden = false;
    $("name").value = S.name;
    $("type").value = S.type;
    S.txt = { root: fmt(S.root), res: fmt(S.res) };
    S.tab = "root";
    $("ed").value = S.txt.root;
    tabs();
    update();
}
function tabs() {
    $("tRoot").classList.toggle("on", S.tab === "root");
    $("tRes").classList.toggle("on", S.tab === "res");
}
function setTab(t) {
    S.txt[S.tab] = $("ed").value;
    S.tab = t;
    $("ed").value = S.txt[t];
    $("perr").textContent = "";
    tabs();
}
$("tRoot").onclick = () => setTab("root");
$("tRes").onclick = () => setTab("res");
let deb;
$("ed").oninput = () => {
    clearTimeout(deb);
    deb = setTimeout(() => {
        try {
            const g = parse($("ed").value);
            if (g.t !== 10) throw new Error("Top level must be { }");
            S[S.tab] = g;
            S.txt[S.tab] = $("ed").value;
            $("perr").textContent = "";
            update();
        } catch (e) {
            $("perr").textContent =
                "⚠ " + e.message + " — last valid version is kept";
        }
    }, 250);
};
$("ed").onkeydown = (e) => {
    if (e.key === "Tab") {
        e.preventDefault();
        document.execCommand("insertText", false, "  ");
    }
};
$("name").oninput = () => {
    S.name = $("name").value.trim();
    update();
};
$("type").oninput = () => {
    S.type = $("type").value.trim();
    update();
};
$("fix").onclick = () => {
    const re =
        /\btype: "(phantom_fluid_slot|phantom_item_slot|item_slot|fluid_slot|container)"/g;
    $("ed").value = $("ed").value.replace(re, 'type: "gtm_$1"');
    $("ed").oninput();
};
$("dl").onclick = () => {
    S.txt[S.tab] = $("ed").value;
    const m = new Map();
    if (S.type) m.set("recipe_type", { t: 8, v: S.type });
    m.set("root", S.root);
    m.set("resources", S.res);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([writeNbt("", { t: 10, v: m })]));
    a.download = (S.name || "ui") + ".rtui";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 999);
};

function update() {
    S.view = toJS(S.root);
    S.resView = toJS(S.res);
    $("path").textContent = S.type
        ? `Place at: assets/${nsOf(S.type)}/ui/recipe_type/${pathOf(S.type)}.rtui`
        : "Set a recipe type to see the target path";
    const P = [],
        W = [];
    (function w(d) {
        W.push(d);
        (d.children || []).forEach((c) => c.data && w(c.data));
    })(S.view);
    const add = (c, m) => P.push(`<li class="${c}">${m}</li>`);
    if (!S.type)
        add(
            "w",
            "recipe_type is empty (GTM identifies the file by its name only).",
        );
    else if (S.name && S.name !== pathOf(S.type))
        add(
            "e",
            `File name "${S.name}" ≠ recipe type path "${pathOf(S.type)}" — GTM will not load it.`,
        );
    const ids = {};
    W.forEach((d) => {
        if (d.id) (ids[d.id] = ids[d.id] || []).push(d);
    });
    if (!ids.progress)
        add("w", 'No widget with id "progress" — nothing will animate.');
    for (const [id, l] of Object.entries(ids))
        if (l.length > 1 && /^(item|fluid)_(in|out)_\d+$/.test(id))
            add("e", `Duplicate id "${id}" ×${l.length}`);
    const seen = {};
    W.forEach((d) => {
        const m = /^(item|fluid)_(in|out)_(\d+)$/.exec(d.id || "");
        if (m)
            (seen[m[1] + "_" + m[2]] =
                seen[m[1] + "_" + m[2]] || new Set()).add(+m[3]);
    });
    for (const [k, s] of Object.entries(seen))
        for (let i = 0; i <= Math.max(...s); i++)
            if (!s.has(i)) {
                add("w", `${k}_${i} missing (ids should be sequential from 0)`);
                break;
            }
    const ty = JSON.stringify(S.view).match(
        /"type":"(phantom_fluid_slot|phantom_item_slot|item_slot|fluid_slot|container)"/g,
    );
    if (ty)
        add(
            "w",
            `${ty.length} pre-7.0.0 widget type(s) — click "Fix legacy names" (needs gtm_ prefix).`,
        );
    (function w(d) {
        (d.children || []).forEach((c) => {
            if (c.data && c.data.id) {
                const m = /^(item|fluid)_(in|out)_/.exec(c.data.id);
                if (
                    m &&
                    c.type !== "gtm_" + m[1] + "_slot" &&
                    !/^(phantom_)?(item|fluid)_slot$/.test(c.type)
                )
                    add(
                        "w",
                        `"${c.data.id}" is type "${c.type}" (expected gtm_${m[1]}_slot)`,
                    );
            }
            w(c.data);
        });
    })(S.view);
    $("probs").innerHTML = P.length
        ? P.join("")
        : '<li class="ok">✓ No problems found</li>';
}

// ---------- preview ----------
const cv = $("cv"),
    cx = cv.getContext("2d"),
    IC = new Map();
function img(l) {
    if (!IC.has(l)) {
        const m = /^(\w+):textures\/(?:gui\/)?(.+)$/.exec(l),
            i = new Image();
        i.src = m ? `textures/${m[1]}/${m[2]}` : "missing.png";
        IC.set(l, i);
    }
    return IC.get(l);
}
const ok = (i) => i.complete && i.naturalWidth > 0;
let prog = 0.5;
function tex(t, x, y, w, h, dep = 0) {
    if (t.type === "ui_resource") {
        const r = (S.resView || {})["ldlib.gui.editor.group.textures"]?.[t.key];
        return r && dep < 8
            ? tex(r, x, y, w, h, dep + 1)
            : t.key === "empty"
              ? 0
              : box(x, y, w, h, "#f55");
    }
    if (t.type === "empty") return;
    const D = t.data;
    switch (t.type) {
        case "resource_texture": {
            const im = img(D.imageLocation);
            if (!ok(im)) return box(x, y, w, h, "#f55");
            const iw = im.naturalWidth,
                ih = im.naturalHeight;
            cx.drawImage(
                im,
                (D.offsetX || 0) * iw,
                (D.offsetY || 0) * ih,
                (D.imageWidth ?? 1) * iw,
                (D.imageHeight ?? 1) * ih,
                x,
                y,
                w,
                h,
            );
            break;
        }
        case "border_texture": {
            const im = img(D.imageLocation);
            if (!ok(im)) return box(x, y, w, h, "#f55");
            const bs = D.boderSize || { width: 1, height: 1 },
                iw = D.imageSize?.width || im.naturalWidth,
                ih = D.imageSize?.height || im.naturalHeight,
                sw = im.naturalWidth / iw,
                sh = im.naturalHeight / ih,
                bw = Math.min(bs.width, w / 2),
                bh = Math.min(bs.height, h / 2),
                X = [0, bs.width, iw - bs.width, iw],
                Y = [0, bs.height, ih - bs.height, ih],
                dx = [0, bw, w - bw, w],
                dy = [0, bh, h - bh, h];
            for (let r = 0; r < 3; r++)
                for (let c = 0; c < 3; c++) {
                    const sW = X[c + 1] - X[c],
                        sH = Y[r + 1] - Y[r],
                        dW = dx[c + 1] - dx[c],
                        dH = dy[r + 1] - dy[r];
                    if (sW > 0 && sH > 0 && dW > 0 && dH > 0)
                        cx.drawImage(
                            im,
                            X[c] * sw,
                            Y[r] * sh,
                            sW * sw,
                            sH * sh,
                            x + dx[c],
                            y + dy[r],
                            dW,
                            dH,
                        );
                }
            break;
        }
        case "group_texture":
            (D.textures || []).forEach(
                (e) => e.p && tex(e.p, x, y, w, h, dep + 1),
            );
            break;
        case "progress_texture": {
            if (D.emptyBarArea) tex(D.emptyBarArea, x, y, w, h, dep + 1);
            if (!D.filledBarArea) break;
            const f = prog;
            cx.save();
            cx.beginPath();
            const r = {
                LEFT_TO_RIGHT: [x, y, w * f, h],
                RIGHT_TO_LEFT: [x + w * (1 - f), y, w * f, h],
                UP_TO_DOWN: [x, y, w, h * f],
                DOWN_TO_UP: [x, y + h * (1 - f), w, h * f],
            }[D.fillDirection] || [x, y, w, h];
            cx.rect(...r);
            cx.clip();
            tex(D.filledBarArea, x, y, w, h, dep + 1);
            cx.restore();
            break;
        }
        case "color_rect_texture": {
            const c = D.color >>> 0;
            cx.fillStyle = `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${(c >>> 24) / 255})`;
            cx.fillRect(x, y, w, h);
            break;
        }
        default:
            box(x, y, w, h, "#fa0", t.type);
    }
}
function box(x, y, w, h, c) {
    cx.save();
    cx.strokeStyle = c;
    cx.lineWidth = 0.5;
    cx.setLineDash([2, 2]);
    cx.strokeRect(x + 0.25, y + 0.25, w - 0.5, h - 0.5);
    cx.restore();
}
function draw(d, ox, oy, showIds) {
    const x = ox + (d.selfPosition?.x || 0),
        y = oy + (d.selfPosition?.y || 0),
        w = d.size?.width || 0,
        h = d.size?.height || 0;
    for (const k in d) {
        const v = d[k];
        if (
            v &&
            typeof v === "object" &&
            v.type &&
            (v.data || v.type === "ui_resource" || v.type === "empty") &&
            /texture/i.test(k)
        )
            tex(v, x, y, w, h);
    }
    (d.children || []).forEach((c) => c.data && draw(c.data, x, y, showIds));
    if (showIds && d.id) {
        cx.save();
        cx.font = "5px monospace";
        cx.fillStyle = "#fff";
        cx.strokeStyle = "#000";
        cx.lineWidth = 1.2;
        cx.strokeText(d.id, x, y + 5);
        cx.fillText(d.id, x, y + 5);
        cx.restore();
    }
}
function frame() {
    requestAnimationFrame(frame);
    if ($("s2").hidden || !S.view) return;
    const z = +$("zoom").value,
        r = S.view,
        pad = 8,
        W = (r.size?.width || 50) + pad * 2,
        H = (r.size?.height || 50) + pad * 2;
    if (cv.width !== W * z || cv.height !== H * z) {
        cv.width = W * z;
        cv.height = H * z;
    }
    prog = $("anim").checked ? (performance.now() % 2000) / 2000 : 0.5;
    cx.setTransform(z, 0, 0, z, 0, 0);
    cx.imageSmoothingEnabled = false;
    cx.clearRect(0, 0, W, H);
    cx.save();
    cx.strokeStyle = "rgba(0,0,0,.25)";
    cx.lineWidth = 0.5;
    cx.setLineDash([2, 2]);
    cx.strokeRect(pad, pad, W - pad * 2, H - pad * 2);
    cx.restore();
    draw(
        r,
        pad - (r.selfPosition?.x || 0),
        pad - (r.selfPosition?.y || 0),
        $("ids").checked,
    );
}
frame();
