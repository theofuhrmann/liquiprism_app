import type { InstrumentAPI, InstrumentContext } from "./types";

export class SineInstrument implements InstrumentAPI {
    constructor(private ctx: InstrumentContext) { }

    noteOn(facePosition: number, freq: number, opts?: { duration?: number }) {
        const { audio, pannerForFace, dry, convolver } = this.ctx;

        const osc = audio.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, audio.currentTime);

        const gain = audio.createGain();
        const now = audio.currentTime;
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (opts?.duration ?? 0.5));

        const panner = pannerForFace(facePosition);
        osc.connect(gain).connect(panner);
        panner.connect(dry);
        panner.connect(convolver);

        osc.start();
        osc.stop(now + (opts?.duration ?? 0.5));

        osc.onended = () => {
            try { gain.disconnect(); } catch { }
            try { panner.disconnect(); } catch { }
        };
    }
}
