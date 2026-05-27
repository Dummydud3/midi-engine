# MIDI Engine (MakeCode Arcade extension)

Play **Standard MIDI Files** in the **Arcade simulator** with polyphonic Web Audio synthesis. Blocks and TypeScript APIs are provided; hardware builds compile but playback is a **no-op** on device (documented sim-only feature).

## Features

- Parse embedded SMF (type 0/1): tempo meta, note on/off, velocity, MIDI notes 0–127
- Polyphonic playback (many simultaneous notes; not limited to 8 channels)
- Blocks: play until done / in background, stop, volume 0–100
- Built-in **Twinkle, Twinkle, Little Star** test song

## Add to a project

### From GitHub (recommended)

1. Open [MakeCode Arcade](https://arcade.makecode.com/) and create or open a project.
2. Open **Extensions** (puzzle piece) → **+** / gear → **Import extension from URL**.
3. Paste:

```text
https://github.com/Dummydud3/makecode-arcade-midi-engine
```

4. Confirm the **midi-engine** package, then use blocks under **MIDI**.


### Local development (this repo)

1. Copy or symlink `midi-engine` into your Arcade target libs, e.g.  
   `pxt-arcade/libs/midi-engine` → `../../midi-engine`
2. In the **project** `pxt.json`, add a dependency:

```json
"midi-engine": "file:../libs/midi-engine"
```

3. From `pxt-arcade`, run `pxt serve`, open a project, add the **midi-engine** package under Extensions, and use blocks under **MIDI**.

### `pxt link` (optional)

From `midi-engine`:

```bash
pxt link
```

Then in the target: `pxt link midi-engine`.

## Blocks (category **MIDI**)

| Block | Description |
|--------|-------------|
| play song **until done** | Blocks until the song finishes (simulator) |
| play song **in background** | Returns immediately |
| stop song | Stops playback and releases voices |
| set song volume to **0–100** | Master volume |
| Twinkle song | Built-in test SMF buffer |
| play test song | Plays Twinkle until done |

## Code example

```typescript
midi.playSongUntilDone(midi.twinkleSong())

// Or custom SMF bytes:
const mySong = hex`4d546864...`
midi.playSongInBackground(mySong)
pause(2000)
midi.stopSong()
```

```typescript
midi.setVolume(60)
midi.createSongFromHex("4d546864...")  // hex string without spaces
```

## Test

**SMF parser (Node):**

```bash
node midi-engine/scripts/test-smf.mjs
```

**Simulator:** create a new Arcade project, add this extension, and run:

```blocks
midi.testSong()
```

or use the **play test song** block in the simulator (click speaker / allow audio if prompted).

## Files

| File | Role |
|------|------|
| `midi.ts` | Blocks + public API, shim declarations |
| `smf.ts` | SMF parser (also included in sim via `simFiles`) |
| `sim/midi.ts` | `pxsim.midi` Web Audio scheduler |
| `midi.cpp` | Hardware stubs |

## Limitations

- **Simulator only** for real MIDI audio; device download does not play SMF.
- SMF subset: no running-status optimization required; SysEx ignored; one tempo per track merge.
- Uses a separate `AudioContext` in sim (game mixer volume may differ).
- No built-in MIDI file picker; embed `.mid` as `hex\`...\`` or use `createSongFromHex`.

## License

MIT
