/**
 * Ambient types for extension simFiles (isolated from target pxtsim.d.ts in the editor).
 * Runtime uses the real pxsim.AudioContextManager in the simulator iframe.
 */
declare namespace pxsim {
    namespace AudioContextManager {
        function setListenerPosition(x: number, y: number, z: number): void;
        function mute(mute: boolean): void;
        function isMuted(): boolean;
        function createSpatialAudioPlayer(): number;
        function disposeSpatialAudioPlayer(id: number): void;
        function tone(frequency: number, gain: number): void;
        function onStopAll(handler: () => void): void;
        function muteAllChannels(): void;

        class SpatialAudioPlayer {
            static getPlayerById(id: number): SpatialAudioPlayer | undefined;
            dispose(): void;
        }

        class AudioToneSource {
            static instance: any;
        }
    }
}

declare function setTimeout(handler: () => void, timeout: number): any;