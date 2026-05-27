const hex = "4d546864000000060000000101e04d54726b0000008900ff510307a12000903c508360803c0000903c508360803c0000904350836080430000904350836080430000904550836080450000904550836080450000904350874080430000904150836080410000904150836080410000904050836080400000904050836080400000903e508360803e0000903e508360803e0000903c508740803c0000ff2f00";

function readU32BE(data, offset) {
    return ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
}
function readU16BE(data, offset) {
    return (data[offset] << 8) | data[offset + 1];
}
function readVarLen(data, offset) {
    let value = 0;
    let i = offset;
    while (i < data.length) {
        const b = data[i++];
        value = (value << 7) | (b & 0x7f);
        if ((b & 0x80) === 0) break;
    }
    return { value, next: i };
}
function readChunk(data, offset) {
    const type = String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
    const length = readU32BE(data, offset + 4);
    return { type, length, dataStart: offset + 8, next: offset + 8 + length };
}
function ticksToMs(ticks, division, tempoUs) {
    return (ticks * tempoUs) / (division * 1000);
}
function parseTrack(data, start, end, division, tempoUs, out) {
    let pos = start;
    let tick = 0;
    while (pos < end) {
        const delta = readVarLen(data, pos);
        pos = delta.next;
        tick += delta.value;
        if (pos >= end) break;
        const status = data[pos];
        if (status === 0xff) {
            pos++;
            const metaType = data[pos++];
            const len = readVarLen(data, pos);
            pos = len.next;
            if (metaType === 0x51 && len.value === 3) {
                tempoUs = (data[pos] << 16) | (data[pos + 1] << 8) | data[pos + 2];
            }
            pos += len.value;
            continue;
        }
        if (status < 0x80) continue;
        const cmd = status & 0xf0;
        pos++;
        const timeMs = ticksToMs(tick, division, tempoUs);
        if (cmd === 0x90) {
            const note = data[pos++];
            const velocity = data[pos++];
            if (velocity >  0) out.push({ timeMs, type: "noteOn", note, velocity });
        } else if (cmd === 0x80) {
            pos += 2;
        } else if (cmd === 0xa0 || cmd === 0xb0 || cmd === 0xe0) {
            pos += 2;
        } else if (cmd === 0xc0 || cmd === 0xd0) {
            pos += 1;
        } else break;
    }
}
function parseSmf(bytes) {
    const events = [];
    const header = readChunk(bytes, 0);
    const numTracks = readU16BE(bytes, header.dataStart + 2);
    const division = readU16BE(bytes, header.dataStart + 4);
    let offset = header.next;
    for (let t = 0; t < numTracks; t++) {
        const track = readChunk(bytes, offset);
        parseTrack(bytes, track.dataStart, track.dataStart + track.length, division, 500000, events);
        offset = track.next;
    }
    events.sort((a, b) => a.timeMs - b.timeMs);
    return events;
}

const bytes = Buffer.from(hex, "hex");
const events = parseSmf(bytes);
const noteOns = events.filter((e) => e.type === "noteOn");
console.log("SMF parse OK:", noteOns.length, "note-ons");
if (noteOns.length < 14) process.exit(1);