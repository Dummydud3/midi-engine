/// <reference path="./sim.d.ts" />
/// <reference path="../smf.ts" />

namespace pxsim.midi {
    type VoiceMap = { [key: string]: ActiveVoice[] };

    interface ActiveVoice {
        osc: any;
        gain: any;
    }

    /** Minimal thenable for //% promise shims (no Promise lib in extension sim). */
    function simPromise(completer: (done: () => void) => void): any {
        const p: any = {};
        p.then = function (onFulfilled: () => void) {
            completer(onFulfilled);
            return p;
        };
        return p;
    }

    function resolvedPromise(): any {
        return simPromise((done) => done());
    }

    let sharedCtx: any;

    /** Lazy-init shared AudioContext via simulator AudioContextManager (no private AC). */
    function initSharedContext(): any {
        const acm = AudioContextManager;
        if (sharedCtx) return sharedCtx;
        if (acm.setListenerPosition) {
            acm.setListenerPosition(0, 0, 0);
        } else if (acm.mute) {
            acm.mute(!!(acm.isMuted && acm.isMuted()));
        }
        if (acm.createSpatialAudioPlayer) {
            const id = acm.createSpatialAudioPlayer();
            const players = acm["SpatialAudioPlayer"];
            const player = players && players["getPlayerById"] && players["getPlayerById"](id);
            if (player) {
                sharedCtx = player["context"];
                if (player.dispose) player.dispose();
            }
        }
        if (!sharedCtx) {
            const toneCls = acm["AudioToneSource"];
            if (toneCls && acm.tone) {
                if (!toneCls["instance"]) {
                    try {
                        acm.tone(1, 0);
                    } catch (e) { }
                }
                const inst = toneCls["instance"];
                const vca = inst && inst["vca"];
                if (vca && vca["context"]) sharedCtx = vca["context"];
            }
        }
        return sharedCtx;
    }

    class MidiSynth {
        protected voices: VoiceMap;
        protected masterGain: any;
        protected ctx: any;
        protected destination: any;
        protected cancelled: boolean;
        protected volume = 1;

        constructor() {
            this.voices = {};
            this.cancelled = false;
        }

        setVolume(v: number) {
            this.volume = Math.max(0, Math.min(1, v / 100));
            if (this.masterGain && this.ctx) {
                this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
            }
        }

        stop() {
            this.cancelled = true;
            for (const key of Object.keys(this.voices)) {
                this.releaseKey(key);
            }
            this.voices = {};
        }

        protected ensureContext() {
            if (this.ctx) return;
            this.ctx = initSharedContext();
            if (!this.ctx) return;
            this.destination = this.ctx["destination"];
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = this.volume;
            this.masterGain.connect(this.destination);
            if (this.ctx.state === "suspended" && this.ctx.resume) {
                this.ctx.resume();
            }
        }

        protected voiceKey(channel: number, note: number) {
            return channel + ":" + note;
        }

        protected noteOn(channel: number, note: number, velocity: number, when: number) {
            this.ensureContext();
            if (!this.ctx) return;
            const key = this.voiceKey(channel, note);
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = "triangle";
            osc.frequency.value = 440 * Math.pow(2, (note - 69) / 12);
            const vel = Math.max(0, Math.min(1, velocity / 127)) * this.volume;
            gain.gain.setValueAtTime(0, when);
            gain.gain.linearRampToValueAtTime(vel * 0.35, when + 0.01);
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(when);
            if (!this.voices[key]) this.voices[key] = [];
            this.voices[key].push({ osc, gain });
        }

        protected noteOff(channel: number, note: number, when: number) {
            const key = this.voiceKey(channel, note);
            const list = this.voices[key];
            if (!list || !list.length) return;
            const voice = list.pop();
            if (!voice) return;
            voice.gain.gain.cancelScheduledValues(when);
            voice.gain.gain.setValueAtTime(voice.gain.gain.value, when);
            voice.gain.gain.linearRampToValueAtTime(0, when + 0.05);
            const stopAt = when + 0.06;
            voice.osc.stop(stopAt);
            setTimeout(() => {
                try {
                    voice.osc.disconnect();
                    voice.gain.disconnect();
                } catch (e) { }
            }, 80);
            if (!list.length) delete this.voices[key];
        }

        protected releaseKey(key: string) {
            const parts = key.split(":");
            const ch = parseInt(parts[0], 10);
            const note = parseInt(parts[1], 10);
            const when = this.ctx ? this.ctx.currentTime : 0;
            while (this.voices[key] && this.voices[key].length) {
                this.noteOff(ch, note, when);
            }
        }

        playAsync(song: any): any {
            this.stop();
            this.cancelled = false;
            this.ensureContext();
            if (!this.ctx) return resolvedPromise();

            const parsed = parseSmf(song);
            if (!parsed.events.length) {
                return resolvedPromise();
            }

            if (this.ctx.state === "suspended" && this.ctx.resume) {
                const resumed = this.ctx.resume();
                if (resumed && typeof resumed.then === "function") {
                    return resumed.then(() => this.schedule(parsed));
                }
            }
            return this.schedule(parsed);
        }

        protected schedule(parsed: ParsedSong): any {
            const start = this.ctx.currentTime + 0.05;
            const endMs = parsed.durationMs;

            for (const ev of parsed.events) {
                if (this.cancelled) break;
                const when = start + ev.timeMs / 1000;
                if (ev.type === "noteOn") {
                    this.noteOn(ev.channel, ev.note, ev.velocity, when);
                } else {
                    this.noteOff(ev.channel, ev.note, when);
                }
            }

            const waitMs = endMs + 100;
            return simPromise((done) => {
                setTimeout(() => {
                    if (!this.cancelled) {
                        this.stop();
                        this.cancelled = false;
                    }
                    done();
                }, waitMs);
            });
        }
    }

    let synth: MidiSynth;
    let onStopAllSetup = false;

    function getSynth(): MidiSynth {
        if (!synth) synth = new MidiSynth();
        return synth;
    }

    function setupOnStopAll() {
        if (onStopAllSetup) return;
        onStopAllSetup = true;
        const acm = AudioContextManager;
        if (acm.onStopAll) {
            acm.onStopAll(() => {
                if (synth) synth.stop();
            });
        }
    }

    export function _playSongAsync(song: any): any {
        setupOnStopAll();
        if (!song || !song.data || !song.data.length) return resolvedPromise();
        return getSynth().playAsync(song);
    }

    export function _stopSong() {
        if (synth) synth.stop();
        const acm = AudioContextManager;
        if (acm.muteAllChannels) acm.muteAllChannels();
    }

    export function _setVolume(volume: number) {
        getSynth().setVolume(volume);
    }
}
