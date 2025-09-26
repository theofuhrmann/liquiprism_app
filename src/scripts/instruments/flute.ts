import type { InstrumentAPI, InstrumentContext } from "./types";

// Flute: flute-like wind instrument with soft, warm timbre
export class FluteInstrument implements InstrumentAPI {
    constructor(private ctx: InstrumentContext) { }

    noteOn(facePosition: number, freq: number, opts?: { duration?: number, stepTime?: number, frequencies?: number[] }) {
        const { audio, pannerForFace, dry, convolver } = this.ctx;
        const now = audio.currentTime;
        const duration = opts?.duration ?? 0.8;
        const stepTime = opts?.stepTime ?? 1000;
        const frequencies = opts?.frequencies;

        // If multiple frequencies provided, always use arpeggio mode
        if (frequencies && frequencies.length > 1) {
            this.playFluteArpeggio(facePosition, frequencies, stepTime);
            return;
        }

        // Single note - use regular flute sound
        this.playFlute(facePosition, freq, now, duration);
    }

    private playFlute(facePosition: number, freq: number, startTime: number, duration: number) {
        const { audio, pannerForFace, dry, convolver } = this.ctx;

        // Create harmonics for brighter, more organic sound with randomness
        const harmonics = [
            { mult: 1, gain: 0.9 + Math.random() * 0.2 },      // Fundamental (random variation)
            { mult: 2, gain: 0.4 + Math.random() * 0.2 },      // Octave (brighter)
            { mult: 3, gain: 0.2 + Math.random() * 0.15 },     // Fifth (more present)
            { mult: 4, gain: 0.12 + Math.random() * 0.1 },     // Double octave (brighter)
            { mult: 5, gain: 0.08 + Math.random() * 0.08 }     // Third above octave (adds brightness)
        ];

        const masterGain = audio.createGain();
        masterGain.gain.setValueAtTime(0, startTime);

        harmonics.forEach((harmonic, index) => {
            const osc = audio.createOscillator();
            const harmonicGain = audio.createGain();

            // Mix of sine and triangle for more organic timbre
            osc.type = index === 0 ? "sine" : (Math.random() < 0.7 ? "sine" : "triangle");
            osc.frequency.setValueAtTime(freq * harmonic.mult, startTime);

            // Add more detuning variation for organic sound
            const detune = (Math.random() - 0.5) * 8; // ±4 cents (more variation)
            osc.detune.setValueAtTime(detune, startTime);

            // Set harmonic volume
            harmonicGain.gain.setValueAtTime(harmonic.gain, startTime);

            // Connect harmonic to master
            osc.connect(harmonicGain);
            harmonicGain.connect(masterGain);

            // Start and stop
            osc.start(startTime);
            osc.stop(startTime + duration + 0.1);
        });

        // Wind instrument envelope with organic variation
        const A = 0.06 + Math.random() * 0.04; // Random attack 0.06-0.1s
        const D = 0.08 + Math.random() * 0.04; // Random decay 0.08-0.12s
        const S = 0.5 + Math.random() * 0.2;   // Random sustain 0.5-0.7
        const peak = 0.45 + Math.random() * 0.15; // Random peak volume

        masterGain.gain.setValueAtTime(0, startTime);
        masterGain.gain.linearRampToValueAtTime(peak, startTime + A);
        masterGain.gain.exponentialRampToValueAtTime(S, startTime + A + D);
        masterGain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

        // Brighter low-pass filter with random variation
        const lpFilter = audio.createBiquadFilter();
        lpFilter.type = "lowpass";
        const lpFreq = 4000 + Math.random() * 1500; // Random 4-5.5kHz cutoff (brighter)
        lpFilter.frequency.setValueAtTime(lpFreq, startTime);
        lpFilter.Q.setValueAtTime(0.4 + Math.random() * 0.4, startTime); // Random resonance

        // Add a subtle presence boost for brightness
        const presenceFilter = audio.createBiquadFilter();
        presenceFilter.type = "peaking";
        presenceFilter.frequency.setValueAtTime(2000 + Math.random() * 1000, startTime); // Random 2-3kHz
        presenceFilter.gain.setValueAtTime(1 + Math.random() * 2, startTime); // +1 to +3dB boost
        presenceFilter.Q.setValueAtTime(0.8 + Math.random() * 0.4, startTime);

        const panner = pannerForFace(facePosition);

        // Signal chain: harmonics -> low-pass -> presence -> panner (brighter, organic)
        masterGain.connect(lpFilter);
        lpFilter.connect(presenceFilter);
        presenceFilter.connect(panner);

        // Split for dry/wet
        const dryGain = audio.createGain();
        const wetGain = audio.createGain();
        dryGain.gain.setValueAtTime(0.8, startTime); // Mostly dry
        wetGain.gain.setValueAtTime(0.3, startTime); // Some reverb

        panner.connect(dryGain).connect(dry);
        panner.connect(wetGain).connect(convolver);
    }

    private playFluteArpeggio(facePosition: number, frequencies: number[], stepTimeMs: number) {
        const { audio } = this.ctx;
        const now = audio.currentTime;

        // Generate arpeggio pattern within 8-step grid
        const arpeggio = this.generateFluteArpeggioPattern(frequencies, 8);
        const stepDurationMs = stepTimeMs / 8; // Each grid step duration in ms
        const stepDurationSec = stepDurationMs / 1000; // Convert to seconds

        arpeggio.forEach((note) => {
            // Add micro-timing variations for human feel
            const microTiming = (Math.random() - 0.5) * 0.02; // ±20ms variation
            const startTime = now + (note.startStep * stepDurationSec) + microTiming;
            const noteDuration = note.duration * stepDurationSec;

            this.playFlute(facePosition, note.freq, startTime, noteDuration);
        });
    }

    private generateFluteArpeggioPattern(frequencies: number[], gridSteps: number): Array<{ freq: number, startStep: number, duration: number }> {
        const arpeggio: Array<{ freq: number, startStep: number, duration: number }> = [];
        let currentStep = 0;

        // Shuffle frequencies for random order
        const shuffledFreqs = [...frequencies].sort(() => Math.random() - 0.5);

        for (const freq of shuffledFreqs) {
            if (currentStep >= gridSteps) break;

            // More varied note durations with organic timing
            const weights = [1, 1, 2, 3]; // Favor longer notes
            const maxDuration = Math.min(4, gridSteps - currentStep);
            const noteDuration = weights[Math.floor(Math.random() * Math.min(weights.length, maxDuration))];

            // Add slight timing offset for organic feel
            const timingOffset = (Math.random() - 0.5) * 0.1; // ±10% timing variation

            arpeggio.push({
                freq,
                startStep: currentStep + timingOffset,
                duration: noteDuration
            });

            currentStep += noteDuration;

            // More varied silence patterns (40% chance, longer silences possible)
            if (currentStep < gridSteps && Math.random() < 0.4) {
                const maxSilence = Math.min(2, gridSteps - currentStep);
                const silenceWeights = [0.5, 1, 1.5]; // Favor shorter silences
                const silenceSteps = silenceWeights[Math.floor(Math.random() * Math.min(silenceWeights.length, maxSilence))];
                currentStep += silenceSteps;
            }
        }

        return arpeggio;
    }


}
