const TAG = Object.freeze({
    END: 0,
    BYTE: 1,
    SHORT: 2,
    INT: 3,
    LONG: 4,
    FLOAT: 5,
    DOUBLE: 6,
    BYTE_ARRAY: 7,
    STRING: 8,
    LIST: 9,
    COMPOUND: 10,
    INT_ARRAY: 11,
    LONG_ARRAY: 12,
});

const MAX_STRING_BYTES = 65535;
const ARRAY_PREFIX_TO_KIND = { B: TAG.BYTE_ARRAY, I: TAG.INT_ARRAY, L: TAG.LONG_ARRAY };
const BARE_KEY_PATTERN = /^[\w.+-]+$/;
const NUMBER_PATTERN = /^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)([bslfdBSLFD]?)$/;
const INDENT_UNIT = "  ";

function encodeModifiedUtf8(text) {
    const encoded = [];
    for (let i = 0; i < text.length; i++) {
        const unit = text.charCodeAt(i);
        if (unit >= 0x01 && unit <= 0x7f) encoded.push(unit);
        else if (unit <= 0x7ff) encoded.push(0xc0 | (unit >> 6), 0x80 | (unit & 0x3f));
        else encoded.push(0xe0 | (unit >> 12), 0x80 | ((unit >> 6) & 0x3f), 0x80 | (unit & 0x3f));
    }
    if (encoded.length > MAX_STRING_BYTES) throw new Error("String too long for NBT (>65535 bytes)");
    return Uint8Array.from(encoded);
}

function decodeModifiedUtf8(bytes) {
    let text = "";
    for (let i = 0; i < bytes.length; ) {
        const first = bytes[i++];
        if (first < 0x80) text += String.fromCharCode(first);
        else if ((first & 0xe0) === 0xc0) text += String.fromCharCode(((first & 0x1f) << 6) | (bytes[i++] & 0x3f));
        else text += String.fromCharCode(((first & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
    }
    return text;
}

function readNbt(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 0;

    const readString = () => {
        const length = view.getUint16(offset);
        offset += 2;
        const text = decodeModifiedUtf8(bytes.subarray(offset, offset + length));
        offset += length;
        return text;
    };

    const readNumberArray = (kind) => {
        const count = view.getInt32(offset);
        offset += 4;
        const items = [];
        for (let i = 0; i < count; i++) {
            if (kind === TAG.BYTE_ARRAY) items.push(view.getInt8(offset++));
            else if (kind === TAG.INT_ARRAY) {
                items.push(view.getInt32(offset));
                offset += 4;
            } else {
                items.push(view.getBigInt64(offset));
                offset += 8;
            }
        }
        return items;
    };

    const readPayload = (kind) => {
        switch (kind) {
            case TAG.BYTE:
                return view.getInt8(offset++);
            case TAG.SHORT:
                offset += 2;
                return view.getInt16(offset - 2);
            case TAG.INT:
                offset += 4;
                return view.getInt32(offset - 4);
            case TAG.LONG:
                offset += 8;
                return view.getBigInt64(offset - 8);
            case TAG.FLOAT:
                offset += 4;
                return view.getFloat32(offset - 4);
            case TAG.DOUBLE:
                offset += 8;
                return view.getFloat64(offset - 8);
            case TAG.BYTE_ARRAY:
            case TAG.INT_ARRAY:
            case TAG.LONG_ARRAY:
                return readNumberArray(kind);
            case TAG.STRING:
                return readString();
            case TAG.LIST: {
                const elementKind = view.getInt8(offset++);
                const count = view.getInt32(offset);
                offset += 4;
                const items = [];
                for (let i = 0; i < count; i++) items.push({ kind: elementKind, value: readPayload(elementKind) });
                return items;
            }
            case TAG.COMPOUND: {
                const children = new Map();
                for (;;) {
                    const childKind = view.getInt8(offset++);
                    if (childKind === TAG.END) return children;
                    const name = readString();
                    children.set(name, { kind: childKind, value: readPayload(childKind) });
                }
            }
            default:
                throw new Error("Bad NBT tag " + kind);
        }
    };

    const kind = bytes[offset++];
    const name = readString();
    return { name, tag: { kind, value: readPayload(kind) } };
}

function writeNbt(name, tag) {
    let buffer = new Uint8Array(1024);
    let view = new DataView(buffer.buffer);
    let offset = 0;

    const ensureCapacity = (extraBytes) => {
        if (offset + extraBytes <= buffer.length) return;
        const grown = new Uint8Array(Math.max(buffer.length * 2, offset + extraBytes));
        grown.set(buffer);
        buffer = grown;
        view = new DataView(buffer.buffer);
    };

    const writeString = (text) => {
        const encoded = encodeModifiedUtf8(text);
        ensureCapacity(2 + encoded.length);
        view.setUint16(offset, encoded.length);
        offset += 2;
        buffer.set(encoded, offset);
        offset += encoded.length;
    };

    const writeNumberArray = (kind, items) => {
        ensureCapacity(4 + items.length * 8);
        view.setInt32(offset, items.length);
        offset += 4;
        for (const item of items) {
            if (kind === TAG.BYTE_ARRAY) view.setInt8(offset++, item);
            else if (kind === TAG.INT_ARRAY) {
                view.setInt32(offset, item);
                offset += 4;
            } else {
                view.setBigInt64(offset, BigInt(item));
                offset += 8;
            }
        }
    };

    const writePayload = (kind, value) => {
        switch (kind) {
            case TAG.BYTE:
                ensureCapacity(1);
                view.setInt8(offset++, value);
                break;

            case TAG.SHORT:
                ensureCapacity(2);
                view.setInt16(offset, value);
                offset += 2;
                break;

            case TAG.INT:
                ensureCapacity(4);
                view.setInt32(offset, value);
                offset += 4;
                break;

            case TAG.LONG:
                ensureCapacity(8);
                view.setBigInt64(offset, BigInt(value));
                offset += 8;
                break;

            case TAG.FLOAT:
                ensureCapacity(4);
                view.setFloat32(offset, value);
                offset += 4;
                break;

            case TAG.DOUBLE:
                ensureCapacity(8);
                view.setFloat64(offset, value);
                offset += 8;
                break;

            case TAG.BYTE_ARRAY:
            case TAG.INT_ARRAY:
            case TAG.LONG_ARRAY:
                writeNumberArray(kind, value);
                break;

            case TAG.STRING:
                writeString(value);
                break;

            case TAG.LIST: {
                ensureCapacity(5);
                const elementKind = value.length ? value[0].kind : TAG.END;
                view.setInt8(offset++, elementKind);
                view.setInt32(offset, value.length);
                offset += 4;
                for (const element of value) writePayload(elementKind, element.value);
                break;

            }
            case TAG.COMPOUND:
                for (const [childName, child] of value) {
                    ensureCapacity(1);
                    view.setInt8(offset++, child.kind);
                    writeString(childName);
                    writePayload(child.kind, child.value);
                }
                ensureCapacity(1);
                view.setInt8(offset++, TAG.END);
                break;

        }
    };

    ensureCapacity(1);
    buffer[offset++] = tag.kind;
    writeString(name);
    writePayload(tag.kind, tag.value);
    return buffer.slice(0, offset);
}

const formatDouble = (number) => {
    const text = String(number);
    return /[.eE]/.test(text) ? text : text + ".0";
};

const formatFloat = (number) => {
    for (let precision = 1; precision <= 9; precision++) {
        const candidate = parseFloat(number.toPrecision(precision));
        if (Math.fround(candidate) === number) {
            number = candidate;
            break;

        }
    }
    return formatDouble(number);
};

function toSnbt(tag, indent = "") {
    const { kind, value } = tag;
    const childIndent = indent + INDENT_UNIT;
    switch (kind) {
        case TAG.BYTE:
            return value + "b";

        case TAG.SHORT:
            return value + "s";

        case TAG.INT:
            return "" + value;

        case TAG.LONG:
            return value + "L";

        case TAG.FLOAT:
            return formatFloat(value) + "f";

        case TAG.DOUBLE:
            return formatDouble(value) + "d";

        case TAG.STRING:
            return JSON.stringify(value);

        case TAG.BYTE_ARRAY:
            return "[B; " + value.map((item) => item + "b").join(", ") + "]";

        case TAG.INT_ARRAY:
            return "[I; " + value.join(", ") + "]";

        case TAG.LONG_ARRAY:
            return "[L; " + value.map((item) => item + "L").join(", ") + "]";

        case TAG.LIST:
            if (!value.length) return "[]";
            return "[\n" + value.map((element) => childIndent + toSnbt(element, childIndent)).join(",\n") + "\n" + indent + "]";
        
        case TAG.COMPOUND:
            if (!value.size) return "{}";
            return (
                "{\n" +
                [...value]
                    .map(([name, child]) => {
                        const key = BARE_KEY_PATTERN.test(name) ? name : JSON.stringify(name);
                        return childIndent + key + ": " + toSnbt(child, childIndent);
                    })
                    .join(",\n") +
                "\n" +
                indent +
                "}"
            );
    }
}

function fromSnbt(text) {
    let pos = 0;

    const fail = (message) => {
        throw new Error(message + " (line " + text.slice(0, pos).split("\n").length + ")");
    };
    const skipWhitespace = () => {
        while (pos < text.length && /\s/.test(text[pos])) pos++;
    };
    const skipComma = () => {
        skipWhitespace();
        if (text[pos] === ",") pos++;
    };
    const readBareToken = () => {
        const match = /^[^\s,:\[\]{}"]+/.exec(text.slice(pos));
        if (!match) fail("Unexpected " + (text[pos] || "end of text"));
        pos += match[0].length;
        return match[0];
    };
    const readQuotedString = () => {
        let end = pos + 1;
        while (end < text.length && text[end] !== '"') {
            if (text[end] === "\\") end++;
            end++;
        }
        let result;
        try {
            result = JSON.parse(text.slice(pos, end + 1));
        } catch (error) {
            fail("Bad string");
        }
        pos = end + 1;
        return result;
    };
    const readKey = () => {
        skipWhitespace();
        return text[pos] === '"' ? readQuotedString() : readBareToken();
    };

    const readCompound = () => {
        pos++;
        const children = new Map();
        for (;;) {
            skipWhitespace();
            if (text[pos] === "}") {
                pos++;
                break;
            }
            const key = readKey();
            skipWhitespace();
            if (text[pos] !== ":") fail("Expected ':' after " + key);
            pos++;
            children.set(key, readValue());
            skipComma();
        }
        return { kind: TAG.COMPOUND, value: children };
    };

    const readTypedArray = (prefix) => {
        pos += 2;
        const items = [];
        for (;;) {
            skipWhitespace();
            if (text[pos] === "]") {
                pos++;
                break;

            }
            items.push(readValue().value);
            skipComma();
        }
        return { kind: ARRAY_PREFIX_TO_KIND[prefix], value: items };
    };

    const readList = () => {
        pos++;
        skipWhitespace();
        const arrayMatch = /^([BIL]);/.exec(text.slice(pos, pos + 2));
        if (arrayMatch) return readTypedArray(arrayMatch[1]);
        const items = [];
        for (;;) {
            skipWhitespace();
            if (pos >= text.length) fail("Unclosed [");
            if (text[pos] === "]") {
                pos++;
                break;

            }
            items.push(readValue());
            skipComma();
        }
        if (items.some((item) => item.kind !== items[0].kind)) fail("List mixes types");
        return { kind: TAG.LIST, value: items };
    };

    const readScalar = () => {
        if (pos >= text.length) fail("Unexpected end");
        const token = readBareToken();
        if (token === "true") return { kind: TAG.BYTE, value: 1 };
        if (token === "false") return { kind: TAG.BYTE, value: 0 };
        const match = NUMBER_PATTERN.exec(token);
        if (!match) return { kind: TAG.STRING, value: token };
        const suffix = match[2].toLowerCase();
        const number = +match[1];
        if (suffix === "b") return { kind: TAG.BYTE, value: number };
        if (suffix === "s") return { kind: TAG.SHORT, value: number };
        if (suffix === "l") return { kind: TAG.LONG, value: BigInt(match[1].split(/[.eE]/)[0]) };
        if (suffix === "f") return { kind: TAG.FLOAT, value: Math.fround(number) };
        if (suffix === "d") return { kind: TAG.DOUBLE, value: number };
        return /[.eE]/.test(match[1]) ? { kind: TAG.DOUBLE, value: number } : { kind: TAG.INT, value: number };
    };

    const readValue = () => {
        skipWhitespace();
        const first = text[pos];
        if (first === "{") return readCompound();
        if (first === "[") return readList();
        if (first === '"') return { kind: TAG.STRING, value: readQuotedString() };
        return readScalar();
    };

    const result = readValue();
    skipWhitespace();
    if (pos < text.length) fail("Trailing text");
    return result;
}

const toPlainObject = (tag) =>
    tag.kind === TAG.COMPOUND
        ? Object.fromEntries([...tag.value].map(([name, child]) => [name, toPlainObject(child)]))
        : tag.kind === TAG.LIST
          ? tag.value.map(toPlainObject)
          : tag.value;

if (typeof module !== "undefined") module.exports = { TAG, readNbt, writeNbt, toSnbt, fromSnbt, toPlainObject };