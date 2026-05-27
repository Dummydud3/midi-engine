/**
 * Minimal Standard MIDI File (SMF type 0/1) parser.
 * Converts delta ticks to milliseconds using tempo meta events (default 120 BPM).
 *
 * MakeCode note: avoid Uint8Array in user-side TypeScript; use number[] / Buffer.
 * PXT: top-level functions only here; ParsedSong/NoteEvent types live in sim/midi.ts namespace.
 */
function readU32BE(data: number[], offset: number): number {
    return ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
}

function readU16BE(data: number[], offset: number): number {
    return (data[offset] << 8) | data[offset + 1];
}

function readVarLen(data: number[], offset: number): { value: number; next: number } {
    let value = 0;
    let i = offset;
    while (i < data.length) {
        const b = data[i++];
        value = (value << 7) | (b & 0x7f);
        if ((b & 0x80) === 0) break;
    }
    return { value: value, next: i };
}

/** MakeCode: String.fromCharCode accepts only one argument. */
function readFourCC(data: number[], offset: number): string {
    let s = "";
    for (let i = 0; i < 4; i++) {
        s += String.fromCharCode(data[offset + i]);
    }
    return s;
}

function readChunk(data: number[], offset: number): { type: string; length: number; dataStart: number; next: number } | undefined {
    if (offset + 8 > data.length) return undefined;
    const type = readFourCC(data, offset);
    const length = readU32BE(data, offset + 4);
    const dataStart = offset + 8;
    return { type: type, length: length, dataStart: dataStart, next: dataStart + length };
}

function ticksToMs(ticks: number, division: number, tempoUs: number): number {
    if (division <= 0) return 0;
    return (ticks * tempoUs) / (division * 1000);
}

function parseTrack(
    data: number[],
    start: number,
    end: number,
    division: number,
    initialTempoUs: number,
    out: { timeMs: number; type: "noteOn" | "noteOff"; channel: number; note: number; velocity: number }[]
): number {
    let pos = start;
    let tick = 0;
    let tempoUs = initialTempoUs;
    let maxEndMs = 0;

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

        if (status === 0xf0 || status === 0xf7) {
            const len = readVarLen(data, pos + 1);
            pos = len.next + len.value;
            continue;
        }

        let cmd = status;
        let channel = 0;
        if (status < 0x80) {
            // Running status intentionally not supported in this minimal parser.
            continue;
        }
        if (status >= 0x80 && status < 0xf0) {
            cmd = status & 0xf0;
            channel = status & 0x0f;
            pos++;
        }

        const timeMs = ticksToMs(tick, division, tempoUs);
        if (cmd === 0x90) {
            const note = data[pos++];
            const velocity = data[pos++];
            if (velocity > 0) {
                out.push({ timeMs: timeMs, type: "noteOn", channel: channel, note: note, velocity: velocity });
                maxEndMs = Math.max(maxEndMs, timeMs);
            } else {
                out.push({ timeMs: timeMs, type: "noteOff", channel: channel, note: note, velocity: 0 });
            }
        } else if (cmd === 0x80) {
            const note = data[pos++];
            pos++; // release velocity
            out.push({ timeMs: timeMs, type: "noteOff", channel: channel, note: note, velocity: 0 });
        } else if (cmd === 0xa0 || cmd === 0xb0 || cmd === 0xe0) {
            pos += 2;
        } else if (cmd === 0xc0 || cmd === 0xd0) {
            pos += 1;
        } else {
            break;
        }
    }

    return maxEndMs;
}

function bufferToBytes(buffer: any): number[] | undefined {
    if (!buffer) return undefined;
    if (buffer.data && buffer.data.length) {
        return buffer.data as number[];
    }
    const len = buffer.length;
    if (len === undefined || len <= 0) return undefined;
    const out: number[] = [];
    for (let i = 0; i < len; i++) {
        out.push(buffer[i]);
    }
    return out;
}

function parseSmf(buffer: any): { events: { timeMs: number; type: "noteOn" | "noteOff"; channel: number; note: number; velocity: number }[]; durationMs: number } {
    const data = bufferToBytes(buffer);
    if (!data || !data.length) {
        return { events: [], durationMs: 0 };
    }

    const events: { timeMs: number; type: "noteOn" | "noteOff"; channel: number; note: number; velocity: number }[] = [];

    const header = readChunk(data, 0);
    if (!header || header.type !== "MThd" || header.length < 6) {
        return { events: [], durationMs: 0 };
    }

    const format = readU16BE(data, header.dataStart);
    const numTracks = readU16BE(data, header.dataStart + 2);
    const division = readU16BE(data, header.dataStart + 4);
    const ticksPerQuarter = (division & 0x8000) === 0 ? division : 480;
    const defaultTempoUs = 500000; // 120 BPM

    let offset = header.next;
    let maxDuration = 0;

    for (let t = 0; t < numTracks && offset < data.length; t++) {
        const track = readChunk(data, offset);
        if (!track || track.type !== "MTrk") break;
        const trackEnd = track.dataStart + track.length;
        maxDuration = Math.max(
            maxDuration,
            parseTrack(data, track.dataStart, trackEnd, ticksPerQuarter, defaultTempoUs, events)
        );
        offset = track.next;
    }

    if (format === 0 && numTracks > 1) {
        // Keep behavior permissive for malformed headers.
    }

    events.sort((a, b) => a.timeMs - b.timeMs);

    for (const e of events) {
        if (e.type === "noteOff") {
            maxDuration = Math.max(maxDuration, e.timeMs);
        }
    }

    let durationMs = maxDuration + 200;
    if (events.length) {
        const last = events[events.length - 1];
        durationMs = Math.max(durationMs, last.timeMs + 300);
    }

    return { events: events, durationMs: durationMs };
}
