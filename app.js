const byId = (id) => document.getElementById(id);
const RECIPE_TYPES =
    "steam_boiler electric_furnace alloy_smelter arc_furnace assembler autoclave bender brewery macerator canner centrifuge chemical_bath chemical_reactor compressor cutter distillery electrolyzer electromagnetic_separator extractor extruder fermenter fluid_heater fluid_solidifier forge_hammer forming_press lathe mixer ore_washer packer polarizer laser_engraver sifter thermal_centrifuge wiremill circuit_assembler gas_collector air_scrubber research_station rock_breaker scanner combustion_generator gas_turbine steam_turbine plasma_generator large_boiler coke_oven primitive_blast_furnace electric_blast_furnace distillation_tower pyrolyse_oven cracker implosion_compressor vacuum_freezer assembly_line large_chemical_reactor fusion_reactor".split(
        " ",
    );
byId("types").innerHTML = RECIPE_TYPES.map(
    (t) => `<option value="gtceu:${t}">`,
).join("");
const state = {
    name: "",
    type: "",
    root: null,
    res: null,
    tab: "root",
    view: null,
    txt: {},
};
const createEmptyCompound = () => ({ kind: TAG.COMPOUND, value: new Map() });
const recipePath = (t) => (t.includes(":") ? t.split(":")[1] : t),
    recipeNamespace = (t) =>
        t.includes(":") ? t.split(":")[0] : "<namespace>";

async function loadRtuiBytes(u8, name) {
    if (u8[0] === 0x1f && u8[1] === 0x8b)
        u8 = new Uint8Array(
            await new Response(
                new Blob([u8])
                    .stream()
                    .pipeThrough(new DecompressionStream("gzip")),
            ).arrayBuffer(),
        );
    let tag;
    try {
        tag = readNbt(u8).tag;
    } catch (e) {
        let n = 0;
        for (let i = 0; i + 2 < u8.length; i++)
            if (u8[i] === 0xef && u8[i + 1] === 0xbf && u8[i + 2] === 0xbd) n++;
        throw new Error(
            n
                ? `Bad NBT: this file was damaged by a text-encoding conversion (${n} replacement characters found, null bytes stripped). It was probably opened/saved/copied as text. Use the original, untouched file (zip it before sending or copying).`
                : "Bad NBT: " + e.message,
        );
    }
    if (tag.kind !== TAG.COMPOUND || !tag.value.has("root"))
        throw new Error('Not an .rtui file (no "root" compound)');
    state.name = name;
    state.type = tag.value.has("recipe_type")
        ? tag.value.get("recipe_type").value
        : "";
    state.root = tag.value.get("root");
    state.resources = tag.value.get("resources") || createEmptyCompound();
    openEditor();
}

async function loadRtuiFile(f) {
    try {
        await loadRtuiBytes(
            new Uint8Array(await f.arrayBuffer()),
            f.name.replace(/\.[^.]+$/, ""),
        );
    } catch (e) {
        byId("err1").textContent = e.message;
    }
}

byId("file").onchange = (e) =>
    e.target.files[0] && loadRtuiFile(e.target.files[0]);
const dropZone = byId("drop");
dropZone.ondragover = (e) => {
    e.preventDefault();
    dropZone.classList.add("over");
};

dropZone.ondragleave = () => dropZone.classList.remove("over");
dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.classList.remove("over");
    e.dataTransfer.files[0] && loadRtuiFile(e.dataTransfer.files[0]);
};

byId("n1").onclick = () => {
    if (!byId("nName").value.trim()) return;
    byId("step2").hidden = false;
    byId("nType").focus();
};

byId("nName").onkeydown = (e) => {
    if (e.key === "Enter") byId("n1").click();
};

byId("nType").oninput = () => {
    const t = byId("nType").value.trim();
    byId("nHint").textContent =
        t && recipePath(t) !== byId("nName").value.trim()
            ? `GTM looks for ${recipePath(t)}.rtui — the file name should match the recipe type path.`
            : "";
};

byId("n2").onclick = async () => {
    const t = byId("nType").value.trim();
    if (!t) return;
    const b = Uint8Array.from(atob(TEMPLATE_B64), (c) => c.charCodeAt(0));
    await loadRtuiBytes(b, byId("nName").value.trim());
    state.type = t;
    byId("type").value = t;
    refreshEditor();
};

byId("back").onclick = () => {
    byId("s2").hidden = true;
    byId("s1").hidden = false;
};

function openEditor() {
    byId("s1").hidden = true;
    byId("s2").hidden = false;
    byId("name").value = state.name;
    byId("type").value = state.type;
    state.texts = { root: toSnbt(state.root), res: toSnbt(state.resources) };
    state.tab = "root";
    byId("ed").value = state.texts.root;
    syncTabButtons();
    refreshEditor();
}

function syncTabButtons() {
    byId("tRoot").classList.toggle("on", state.tab === "root");
    byId("tRes").classList.toggle("on", state.tab === "res");
}

function switchTab(t) {
    state.texts[state.tab] = byId("ed").value;
    state.tab = t;
    byId("ed").value = state.texts[t];
    byId("perr").textContent = "";
    syncTabButtons();
}

byId("tRoot").onclick = () => switchTab("root");
byId("tRes").onclick = () => switchTab("res");
let textEditTimer;
byId("ed").oninput = () => {
    clearTimeout(textEditTimer);
    textEditTimer = setTimeout(() => {
        try {
            const g = fromSnbt(byId("ed").value);
            if (g.kind !== TAG.COMPOUND)
                throw new Error("Top level must be { }");
            state[state.tab === "res" ? "resources" : "root"] = g;
            state.texts[state.tab] = byId("ed").value;
            byId("perr").textContent = "";
            refreshEditor();
        } catch (e) {
            byId("perr").textContent =
                "⚠ " + e.message + " — last valid version is kept";
        }
    }, 250);
};

byId("ed").onkeydown = (e) => {
    if (e.key === "Tab") {
        e.preventDefault();
        document.execCommand("insertText", false, "  ");
    }
};

byId("name").oninput = () => {
    state.name = byId("name").value.trim();
    refreshEditor();
};

byId("type").oninput = () => {
    state.type = byId("type").value.trim();
    refreshEditor();
};

byId("fix").onclick = () => {
    const re =
        /\btype: "(phantom_fluid_slot|phantom_item_slot|item_slot|fluid_slot|container)"/g;
    byId("ed").value = byId("ed").value.replace(re, 'type: "gtm_$1"');
    byId("ed").oninput();
};

byId("dl").onclick = () => {
    state.texts[state.tab] = byId("ed").value;
    const m = new Map();
    if (state.type)
        m.set("recipe_type", { kind: TAG.STRING, value: state.type });
    m.set("root", state.root);
    m.set("resources", state.resources);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
        new Blob([writeNbt("", { kind: TAG.COMPOUND, value: m })]),
    );
    a.download = (state.name || "ui") + ".rtui";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 999);
};

function refreshEditor() {
    state.rootView = toPlainObject(state.root);
    state.resourcesView = toPlainObject(state.resources);
    byId("path").textContent = state.type
        ? `Place at: assets/${recipeNamespace(state.type)}/ui/recipe_type/${recipePath(state.type)}.rtui`
        : "Set a recipe type to see the target path";
    const problems = [],
        widgets = [];
    (function w(d) {
        widgets.push(d);
        (d.children || []).forEach((c) => c.data && w(c.data));
    })(state.rootView);
    const addProblem = (c, m) => problems.push(`<li class="${c}">${m}</li>`);
    if (!state.type)
        addProblem(
            "w",
            "recipe_type is empty (GTM identifies the file by its name only).",
        );
    else if (state.name && state.name !== recipePath(state.type))
        addProblem(
            "e",
            `File name "${state.name}" ≠ recipe type path "${recipePath(state.type)}" — GTM will not load it.`,
        );

    const ids = {};
    widgets.forEach((d) => {
        if (d.id) (ids[d.id] = ids[d.id] || []).push(d);
    });

    if (!ids.progress)
        addProblem("w", 'No widget with id "progress" — nothing will animate.');
    for (const [id, l] of Object.entries(ids))
        if (l.length > 1 && /^(item|fluid)_(in|out)_\d+$/.test(id))
            addProblem("e", `Duplicate id "${id}" ×${l.length}`);
    const seen = {};
    widgets.forEach((d) => {
        const m = /^(item|fluid)_(in|out)_(\d+)$/.exec(d.id || "");
        if (m)
            (seen[m[1] + "_" + m[2]] =
                seen[m[1] + "_" + m[2]] || new Set()).add(+m[3]);
    });

    for (const [k, s] of Object.entries(seen))
        for (let i = 0; i <= Math.max(...s); i++)
            if (!s.has(i)) {
                addProblem(
                    "w",
                    `${k}_${i} missing (ids should be sequential from 0)`,
                );
                break;
            }
    const legacyTypeMatches = JSON.stringify(state.rootView).match(
        /"type":"(phantom_fluid_slot|phantom_item_slot|item_slot|fluid_slot|container)"/g,
    );

    if (legacyTypeMatches)
        addProblem(
            "w",
            `${legacyTypeMatches.length} pre-7.0.0 widget type(s) — click "Fix legacy names" (needs gtm_ prefix).`,
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
                    addProblem(
                        "w",
                        `"${c.data.id}" is type "${c.type}" (expected gtm_${m[1]}_slot)`,
                    );
            }
            w(c.data);
        });
    })(state.rootView);
    byId("probs").innerHTML = problems.length
        ? problems.join("")
        : '<li class="ok">✓ No problems found</li>';
}

const previewCanvas = byId("cv"),
    previewCtx = previewCanvas.getContext("2d"),
    imageCache = new Map();

function loadTextureImage(l) {
    if (!imageCache.has(l)) {
        const m = /^(\w+):textures\/(?:gui\/)?(.+)$/.exec(l),
            i = new Image();
        i.src = m ? `textures/${m[1]}/${m[2]}` : "missing.png";
        imageCache.set(l, i);
    }
    return imageCache.get(l);
}

const isImageReady = (i) => i.complete && i.naturalWidth > 0;
let progressFraction = 0.5;
function drawTexture(t, x, y, w, h, dep = 0) {
    if (t.type === "ui_resource") {
        const r = (state.resourcesView || {})[
            "ldlib.gui.editor.group.textures"
        ]?.[t.key];
        return r && dep < 8
            ? drawTexture(r, x, y, w, h, dep + 1)
            : t.key === "empty"
              ? 0
              : drawMissingMarker(x, y, w, h, "#f55");
    }
    if (t.type === "empty") return;
    const D = t.data;
    switch (t.type) {
        case "resource_texture": {
            const im = loadTextureImage(D.imageLocation);
            if (!isImageReady(im)) return drawMissingMarker(x, y, w, h, "#f55");
            const iw = im.naturalWidth,
                ih = im.naturalHeight;
            previewCtx.drawImage(
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
            const im = loadTextureImage(D.imageLocation);
            if (!isImageReady(im)) return drawMissingMarker(x, y, w, h, "#f55");
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
                        previewCtx.drawImage(
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
                (e) => e.p && drawTexture(e.p, x, y, w, h, dep + 1),
            );
            break;
        case "progress_texture": {
            if (D.emptyBarArea)
                drawTexture(D.emptyBarArea, x, y, w, h, dep + 1);
            if (!D.filledBarArea) break;
            const f = progressFraction;
            previewCtx.save();
            previewCtx.beginPath();
            const r = {
                LEFT_TO_RIGHT: [x, y, w * f, h],
                RIGHT_TO_LEFT: [x + w * (1 - f), y, w * f, h],
                UP_TO_DOWN: [x, y, w, h * f],
                DOWN_TO_UP: [x, y + h * (1 - f), w, h * f],
            }[D.fillDirection] || [x, y, w, h];
            previewCtx.rect(...r);
            previewCtx.clip();
            drawTexture(D.filledBarArea, x, y, w, h, dep + 1);
            previewCtx.restore();
            break;
        }
        case "color_rect_texture": {
            const c = D.color >>> 0;
            previewCtx.fillStyle = `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${(c >>> 24) / 255})`;
            previewCtx.fillRect(x, y, w, h);
            break;
        }
        default:
            drawMissingMarker(x, y, w, h, "#fa0", t.type);
    }
}

function drawMissingMarker(x, y, w, h, c) {
    previewCtx.save();
    previewCtx.strokeStyle = c;
    previewCtx.lineWidth = 0.5;
    previewCtx.setLineDash([2, 2]);
    previewCtx.strokeRect(x + 0.25, y + 0.25, w - 0.5, h - 0.5);
    previewCtx.restore();
}

function drawWidget(d, ox, oy, showIds) {
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
            drawTexture(v, x, y, w, h);
    }
    (d.children || []).forEach(
        (c) => c.data && drawWidget(c.data, x, y, showIds),
    );
    if (showIds && d.id) {
        previewCtx.save();
        let fs = 5;
        previewCtx.font = fs + "px monospace";
        const tw = previewCtx.measureText(d.id).width;
        if (w > 2 && tw > w - 1) fs = Math.max(2, (fs * (w - 1)) / tw);
        previewCtx.font = fs + "px monospace";
        previewCtx.textBaseline = "top";
        previewCtx.fillStyle = "#fff";
        previewCtx.strokeStyle = "#000";
        previewCtx.lineWidth = fs * 0.25;
        previewCtx.lineJoin = "round";
        previewCtx.strokeText(d.id, x + 0.5, y + 0.5);
        previewCtx.fillText(d.id, x + 0.5, y + 0.5);
        previewCtx.restore();
    }
}

function renderFrame() {
    requestAnimationFrame(renderFrame);
    if (byId("s2").hidden || !state.rootView) return;
    const z = +byId("zoom").value,
        r = state.rootView,
        pad = 8,
        widgets = (r.size?.width || 50) + pad * 2,
        H = (r.size?.height || 50) + pad * 2;
    if (previewCanvas.width !== widgets * z || previewCanvas.height !== H * z) {
        previewCanvas.width = widgets * z;
        previewCanvas.height = H * z;
    }
    progressFraction = byId("anim").checked
        ? (performance.now() % 2000) / 2000
        : 0.5;
    previewCtx.setTransform(z, 0, 0, z, 0, 0);
    previewCtx.imageSmoothingEnabled = false;
    previewCtx.clearRect(0, 0, widgets, H);
    previewCtx.save();
    previewCtx.strokeStyle = "rgba(0,0,0,.25)";
    previewCtx.lineWidth = 0.5;
    previewCtx.setLineDash([2, 2]);
    previewCtx.strokeRect(pad, pad, widgets - pad * 2, H - pad * 2);
    previewCtx.restore();
    drawWidget(
        r,
        pad - (r.selfPosition?.x || 0),
        pad - (r.selfPosition?.y || 0),
        byId("ids").checked,
    );
}
renderFrame();
