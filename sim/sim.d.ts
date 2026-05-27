/** Ambient types for extension simFiles compile (isolated from pxtsim bundle). */
declare namespace pxsim {
    namespace AudioContextManager {
        function setListenerPosition(x: number, y: number, z: number): void;
        function mute(m: boolean): void;
        function isMuted(): boolean;
        function createSpatialAudioPlayer(): number;
        function tone(frequency: number, gain: number): void;
        function onStopAll(handler: () => void): void;
        function muteAllChannels(): void;
        const SpatialAudioPlayer: any;
        const AudioToneSource: any;
    }
}

declare function setTimeout(handler: () => void, timeout?: number): any;
