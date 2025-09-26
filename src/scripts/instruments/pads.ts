import type { InstrumentAPI, InstrumentContext } from "./types";

// Ambient pads: slow attack, lush modulation, heavy reverb for atmospheric background
export class PadsInstrument implements InstrumentAPI {
    constructor(private ctx: InstrumentContext) { }

    noteOn(facePosition: number, freq: number, opts?: { duration?: number, stepTime?: number, frequencies?: number[] }) {
        const { audio, pannerForFace, dry, convolver } = this.ctx;
        const now = audio.currentTime;
        const duration = opts?.duration ?? 2.0; // Long pad notes

        // Create ambient pad sound
        this.playPad(facePosition, freq, now, duration);
    }

    private playPad(facePosition: number, freq: number, startTime: number, duration: number) {
        const { audio, pannerForFace, dry, convolver } = this.ctx;

        // Create multiple detuned layers for richness
        const layers = [
            { detune: 0, gain: 0.3, type: 'sawtooth' as OscillatorType },
            { detune: -8, gain: 0.25, type: 'sawtooth' as OscillatorType },
            { detune: 12, gain: 0.2, type: 'triangle' as OscillatorType },
            { detune: -5, gain: 0.15, type: 'sine' as OscillatorType },
            { detune: 7, gain: 0.1, type: 'sine' as OscillatorType }
        ];

        const masterGain = audio.createGain();
        masterGain.gain.setValueAtTime(0, startTime);

        layers.forEach((layer, index) => {
            const osc = audio.createOscillator();
            const layerGain = audio.createGain();

            osc.type = layer.type;
            osc.frequency.setValueAtTime(freq, startTime);
            osc.detune.setValueAtTime(layer.detune, startTime);

            // Add subtle frequency modulation for movement
            const lfo = audio.createOscillator();
            const lfoGain = audio.createGain();
            lfo.type = 'sine';
            lfo.frequency.setValueAtTime(0.2 + Math.random() * 0.3, startTime); // 0.2-0.5 Hz
            lfoGain.gain.setValueAtTime(3 + Math.random() * 4, startTime); // ±3-7 cents modulation

            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);

            // Set layer volume
            layerGain.gain.setValueAtTime(layer.gain, startTime);

            // Connect layer to master
            osc.connect(layerGain);
            layerGain.connect(masterGain);

            // Start oscillators
            osc.start(startTime);
            lfo.start(startTime);
            osc.stop(startTime + duration + 1.0);
            lfo.stop(startTime + duration + 1.0);
        });

        // Very slow attack and release for ambient feel
        const A = 0.8, D = 0.4, S = 0.6, R = 1.5;
        masterGain.gain.setValueAtTime(0, startTime);
        masterGain.gain.linearRampToValueAtTime(0.4, startTime + A);
        masterGain.gain.linearRampToValueAtTime(S, startTime + A + D);
        masterGain.gain.exponentialRampToValueAtTime(0.01, startTime + duration + R);

        // Warm lowpass filter with gentle sweep
        const filter = audio.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(800, startTime);
        filter.frequency.linearRampToValueAtTime(1200, startTime + A); // Open during attack
        filter.frequency.exponentialRampToValueAtTime(600, startTime + duration); // Close during release
        filter.Q.setValueAtTime(0.5, startTime);

        // Filter modulation for subtle movement
        const filterLfo = audio.createOscillator();
        const filterLfoGain = audio.createGain();
        filterLfo.type = 'sine';
        filterLfo.frequency.setValueAtTime(0.1 + Math.random() * 0.2, startTime); // Very slow 0.1-0.3 Hz
        filterLfoGain.gain.setValueAtTime(150 + Math.random() * 100, startTime); // ±150-250 Hz modulation

        filterLfo.connect(filterLfoGain);
        filterLfoGain.connect(filter.frequency);
        filterLfo.start(startTime);
        filterLfo.stop(startTime + duration + 1.0);

        // Gentle chorus effect
        const delay1 = audio.createDelay(0.1);
        const delay2 = audio.createDelay(0.1);
        const chorusGain1 = audio.createGain();
        const chorusGain2 = audio.createGain();

        delay1.delayTime.setValueAtTime(0.02, startTime);
        delay2.delayTime.setValueAtTime(0.035, startTime);
        chorusGain1.gain.setValueAtTime(0.3, startTime);
        chorusGain2.gain.setValueAtTime(0.2, startTime);

        // Modulate delay times for chorus effect
        const chorusLfo1 = audio.createOscillator();
        const chorusLfo2 = audio.createOscillator();
        const chorusLfoGain1 = audio.createGain();
        const chorusLfoGain2 = audio.createGain();

        chorusLfo1.type = 'sine';
        chorusLfo2.type = 'triangle';
        chorusLfo1.frequency.setValueAtTime(0.4, startTime);
        chorusLfo2.frequency.setValueAtTime(0.6, startTime);
        chorusLfoGain1.gain.setValueAtTime(0.005, startTime); // ±5ms modulation
        chorusLfoGain2.gain.setValueAtTime(0.007, startTime); // ±7ms modulation

        chorusLfo1.connect(chorusLfoGain1);
        chorusLfo2.connect(chorusLfoGain2);
        chorusLfoGain1.connect(delay1.delayTime);
        chorusLfoGain2.connect(delay2.delayTime);

        chorusLfo1.start(startTime);
        chorusLfo2.start(startTime);
        chorusLfo1.stop(startTime + duration + 1.0);
        chorusLfo2.stop(startTime + duration + 1.0);

        const panner = pannerForFace(facePosition);

        // Signal chain: layers -> filter -> delays (chorus) -> panner
        masterGain.connect(filter);

        // Direct signal
        filter.connect(panner);

        // Chorus signals
        filter.connect(delay1);
        filter.connect(delay2);
        delay1.connect(chorusGain1);
        delay2.connect(chorusGain2);
        chorusGain1.connect(panner);
        chorusGain2.connect(panner);

        // Heavy reverb for ambient space - mostly wet signal
        const dryGain = audio.createGain();
        const wetGain = audio.createGain();
        dryGain.gain.setValueAtTime(0.2, startTime); // Very little dry signal
        wetGain.gain.setValueAtTime(1.2, startTime); // Lots of reverb

        panner.connect(dryGain).connect(dry);
        panner.connect(wetGain).connect(convolver);
    }
}
