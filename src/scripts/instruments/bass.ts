import type { InstrumentAPI, InstrumentContext } from "./types";

export class BassInstrument implements InstrumentAPI {
    constructor(private ctx: InstrumentContext) { }

    private voices = new Map<number, {
        osc: OscillatorNode,
        filter: BiquadFilterNode,
        gain: GainNode,
        panner: PannerNode,
        active: boolean,
        stopTimer?: number,
    }>();

    private ensureVoice(facePosition: number) {
        let v = this.voices.get(facePosition);
        if (v) return v;
        const { audio, pannerForFace, dry, convolver } = this.ctx;

        const osc = audio.createOscillator();
        osc.type = "sawtooth";

        const filter = audio.createBiquadFilter();
        filter.type = "lowpass";
        filter.Q.value = 0.8;
        filter.frequency.setValueAtTime(600, audio.currentTime);

        const gain = audio.createGain();
        gain.gain.setValueAtTime(0.0001, audio.currentTime);

        const panner = pannerForFace(facePosition);

        osc.connect(filter).connect(gain).connect(panner);
        panner.connect(dry);
        panner.connect(convolver);

        v = { osc, filter, gain, panner, active: false };
        this.voices.set(facePosition, v);
        return v;
    }

    noteOn(facePosition: number, freq: number) {
        const v = this.ensureVoice(facePosition);
        const now = this.ctx.audio.currentTime;

        if (v.stopTimer !== undefined) {
            try { clearTimeout(v.stopTimer); } catch { }
            v.stopTimer = undefined;
        }

        if (!v.active) {
            v.osc.frequency.setValueAtTime(Math.max(1, freq), now);
            v.osc.start();
            v.active = true;
        } else {
            const current = Math.max(1, v.osc.frequency.value || freq);
            v.osc.frequency.cancelScheduledValues(now);
            v.osc.frequency.setValueAtTime(current, now);
            v.osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq), now + 0.12);
        }

        // Amp env
        const A = 0.005, D = 0.08, S = 0.35;
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setValueAtTime(0.0001, now);
        v.gain.gain.linearRampToValueAtTime(0.9, now + A);
        v.gain.gain.linearRampToValueAtTime(S, now + A + D);

        // Filter env
        const baseCutoff = 500;
        const envAmt = 1200;
        v.filter.frequency.cancelScheduledValues(now);
        v.filter.frequency.setValueAtTime(baseCutoff, now);
        v.filter.frequency.linearRampToValueAtTime(baseCutoff + envAmt, now + 0.01);
        v.filter.frequency.linearRampToValueAtTime(baseCutoff, now + 0.25);
    }

    noteOff(facePosition: number, immediate: boolean = false) {
        const v = this.voices.get(facePosition);
        if (!v || !v.active) return;
        const now = this.ctx.audio.currentTime;
        if (immediate) {
            try { v.gain.gain.cancelScheduledValues(now); } catch { }
            try { v.gain.gain.setValueAtTime(0.0001, now); } catch { }
            try { v.osc.stop(); } catch { }
            try { v.osc.disconnect(); } catch { }
            try { v.filter.disconnect(); } catch { }
            try { v.gain.disconnect(); } catch { }
            try { v.panner.disconnect(); } catch { }
            this.voices.delete(facePosition);
            v.active = false;
            return;
        }

        const R = 0.15;
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setTargetAtTime(0.0001, now, R / 3);

        const stopDelay = 0.3;
        v.stopTimer = window.setTimeout(() => {
            try { v.osc.stop(); } catch { }
            try { v.osc.disconnect(); } catch { }
            try { v.filter.disconnect(); } catch { }
            try { v.gain.disconnect(); } catch { }
            try { v.panner.disconnect(); } catch { }
            this.voices.delete(facePosition);
        }, (R + stopDelay) * 1000);
        v.active = false;
    }
}
