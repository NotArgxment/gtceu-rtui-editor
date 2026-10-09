function mutf8Enc(s) {
    const o = [];
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c >= 1 && c <= 0x7f) o.push(c);
        else if (c <= 0x7ff) o.push(0xc0 | (c >> 6), 0x80 | (c & 63));
        else o.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    if (o.length > 65535) throw new Error("String too long for NBT (>65535 bytes)");
    return Uint8Array.from(o);
}

function mutf8Dec(b) {
    let s = "";
    for (let i = 0; i < b.length; ) {
        const c = b[i++];
        if (c < 0x80) s += String.fromCharCode(c);
        else if ((c & 0xe0) === 0xc0) s += String.fromCharCode(((c & 31) << 6) | (b[i++] & 63));
        else s += String.fromCharCode(((c & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63));
    }
    return s;
}

function readNbt(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength),
        td = new TextDecoder();
    let p = 0;
    const str = () => {
        const n = dv.getUint16(p);
        p += 2;
        const s = mutf8Dec(u8.subarray(p, p + n));
        p += n;
        return s;
    };

    const val = (t) => {
        switch (t) {
            case 1:
                return dv.getInt8(p++);
            case 2:
                p += 2;
                return dv.getInt16(p - 2);
            case 3:
                p += 4;
                return dv.getInt32(p - 4);
            case 4:
                p += 8;
                return dv.getBigInt64(p - 8);
            case 5:
                p += 4;
                return dv.getFloat32(p - 4);
            case 6:
                p += 8;
                return dv.getFloat64(p - 8);
            case 7:
            case 11:
            case 12: {
                const n = dv.getInt32(p);
                p += 4;
                const a = [];
                for (let i = 0; i < n; i++) {
                    if (t == 7) a.push(dv.getInt8(p++));
                    else if (t == 11) {
                        a.push(dv.getInt32(p));
                        p += 4;
                    } else {
                        a.push(dv.getBigInt64(p));
                        p += 8;
                    }
                }
                return a;
            }
            case 8:
                return str();
            case 9: {
                const et = dv.getInt8(p++),
                    n = dv.getInt32(p);
                p += 4;
                const a = [];
                for (let i = 0; i < n; i++) a.push({ t: et, v: val(et) });
                return a;
            }
            case 10: {
                const m = new Map();
                for (;;) {
                    const ct = dv.getInt8(p++);
                    if (!ct) return m;
                    const k = str();
                    m.set(k, { t: ct, v: val(ct) });
                }
            }
            default:
                throw new Error("Bad NBT tag " + t);
        }
    };
    const t = u8[p++];
    const name = str();
    return { name, tag: { t, v: val(t) } };
}

function writeNbt(name, tag) {
    let buf = new Uint8Array(1024),
        dv = new DataView(buf.buffer),
        p = 0;
    const te = new TextEncoder();
    const need = (n) => {
        if (p + n > buf.length) {
            const nb = new Uint8Array(Math.max(buf.length * 2, p + n));
            nb.set(buf);
            buf = nb;
            dv = new DataView(buf.buffer);
        }
    };
    const str = (s) => {
        const b = mutf8Enc(s);
        need(2 + b.length);
        dv.setUint16(p, b.length);
        p += 2;
        buf.set(b, p);
        p += b.length;
    };
    const val = (t, v) => {
        switch (t) {
            case 1:
                need(1);
                dv.setInt8(p++, v);
                break;
            case 2:
                need(2);
                dv.setInt16(p, v);
                p += 2;
                break;
            case 3:
                need(4);
                dv.setInt32(p, v);
                p += 4;
                break;
            case 4:
                need(8);
                dv.setBigInt64(p, BigInt(v));
                p += 8;
                break;
            case 5:
                need(4);
                dv.setFloat32(p, v);
                p += 4;
                break;
            case 6:
                need(8);
                dv.setFloat64(p, v);
                p += 8;
                break;
            case 7:
            case 11:
            case 12:
                need(4 + v.length * 8);
                dv.setInt32(p, v.length);
                p += 4;
                for (const x of v) {
                    if (t == 7) dv.setInt8(p++, x);
                    else if (t == 11) {
                        dv.setInt32(p, x);
                        p += 4;
                    } else {
                        dv.setBigInt64(p, BigInt(x));
                        p += 8;
                    }
                }
                break;
            case 8:
                str(v);
                break;
            case 9: {
                need(5);
                const et = v.length ? v[0].t : 0;
                dv.setInt8(p++, et);
                dv.setInt32(p, v.length);
                p += 4;
                for (const e of v) val(et, e.v);
                break;
            }
            case 10:
                for (const [k, c] of v) {
                    need(1);
                    dv.setInt8(p++, c.t);
                    str(k);
                    val(c.t, c.v);
                }
                need(1);
                dv.setInt8(p++, 0);
                break;
        }
    };
    need(1);
    buf[p++] = tag.t;
    str(name);
    val(tag.t, tag.v);
    return buf.slice(0, p);
}

const fd = (v) => {
    const s = String(v);
    return /[.eE]/.test(s) ? s : s + ".0";
};

const ff = (v) => {
    for (let p = 1; p <= 9; p++) {
        const s = parseFloat(v.toPrecision(p));
        if (Math.fround(s) === v) {
            v = s;
            break;
        }
    }
    return fd(v);
};

function fmt(g, ind = "") {
    const { t, v } = g,
        n = ind + "  ";
    switch (t) {
        case 1:
            return v + "b";
        case 2:
            return v + "s";
        case 3:
            return "" + v;
        case 4:
            return v + "L";
        case 5:
            return ff(v) + "f";
        case 6:
            return fd(v) + "d";
        case 8:
            return JSON.stringify(v);
        case 7:
            return "[B; " + v.map((x) => x + "b").join(", ") + "]";
        case 11:
            return "[I; " + v.join(", ") + "]";
        case 12:
            return "[L; " + v.map((x) => x + "L").join(", ") + "]";
        case 9:
            return v.length
                ? "[\n" +
                      v.map((e) => n + fmt(e, n)).join(",\n") +
                      "\n" +
                      ind +
                      "]"
                : "[]";
        case 10:
            return v.size
                ? "{\n" +
                      [...v]
                          .map(
                              ([k, c]) =>
                                  n +
                                  (/^[\w.+-]+$/.test(k)
                                      ? k
                                      : JSON.stringify(k)) +
                                  ": " +
                                  fmt(c, n),
                          )
                          .join(",\n") +
                      "\n" +
                      ind +
                      "}"
                : "{}";
    }
}

function parse(s) {
    let i = 0;
    const err = (m) => {
        throw new Error(m + " (line " + s.slice(0, i).split("\n").length + ")");
    };
    const ws = () => {
        while (i < s.length && /\s/.test(s[i])) i++;
    };
    const bare = () => {
        const m = /^[^\s,:\[\]{}"]+/.exec(s.slice(i));
        if (!m) err("Unexpected " + (s[i] || "end of text"));
        i += m[0].length;
        return m[0];
    };
    const strq = () => {
        let j = i + 1;
        while (j < s.length && s[j] !== '"') {
            if (s[j] === "\\") j++;
            j++;
        }
        let r;
        try {
            r = JSON.parse(s.slice(i, j + 1));
        } catch (e) {
            err("Bad string");
        }
        i = j + 1;
        return r;
    };
    const key = () => {
        ws();
        return s[i] === '"' ? strq() : bare();
    };
    const val = () => {
        ws();
        const c = s[i];
        if (c === "{") {
            i++;
            const m = new Map();
            for (;;) {
                ws();
                if (s[i] === "}") {
                    i++;
                    break;
                }
                const k = key();
                ws();
                if (s[i] !== ":") err("Expected ':' after " + k);
                i++;
                m.set(k, val());
                ws();
                if (s[i] === ",") i++;
            }
            return { t: 10, v: m };
        }
        if (c === "[") {
            i++;
            ws();
            const m = /^([BIL]);/.exec(s.slice(i, i + 2));
            if (m) {
                i += 2;
                const a = [];
                for (;;) {
                    ws();
                    if (s[i] === "]") {
                        i++;
                        break;
                    }
                    const e = val();
                    a.push(e.v);
                    ws();
                    if (s[i] === ",") i++;
                }
                return { t: { B: 7, I: 11, L: 12 }[m[1]], v: a };
            }
            const a = [];
            for (;;) {
                ws();
                if (i >= s.length) err("Unclosed [");
                if (s[i] === "]") {
                    i++;
                    break;
                }
                a.push(val());
                ws();
                if (s[i] === ",") i++;
            }
            if (a.some((e) => e.t !== a[0].t)) err("List mixes types");
            return { t: 9, v: a };
        }
        if (c === '"') return { t: 8, v: strq() };
        if (i >= s.length) err("Unexpected end");
        const w = bare(),
            m = /^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)([bslfdBSLFD]?)$/.exec(w);
        if (w === "true") return { t: 1, v: 1 };
        if (w === "false") return { t: 1, v: 0 };
        if (!m) return { t: 8, v: w };
        const f = m[2].toLowerCase(),
            n = +m[1];
        if (f === "b") return { t: 1, v: n };
        if (f === "s") return { t: 2, v: n };
        if (f === "l") return { t: 4, v: BigInt(m[1].split(/[.eE]/)[0]) };
        if (f === "f") return { t: 5, v: Math.fround(n) };
        if (f === "d") return { t: 6, v: n };
        return /[.eE]/.test(m[1]) ? { t: 6, v: n } : { t: 3, v: n };
    };
    const r = val();
    ws();
    if (i < s.length) err("Trailing text");
    return r;
}

const toJS = (g) =>
    g.t === 10
        ? Object.fromEntries([...g.v].map(([k, c]) => [k, toJS(c)]))
        : g.t === 9
          ? g.v.map(toJS)
          : g.v;
if (typeof module !== "undefined")
    module.exports = { readNbt, writeNbt, fmt, parse, toJS };
