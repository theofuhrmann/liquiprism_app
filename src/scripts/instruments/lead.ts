import type { InstrumentAPI, InstrumentContext } from "./types";

interface MelodyNote {
    freq: number;
    startStep: number;
    duration: number; // in grid steps (1-4)
    useGlide?: boolean;
}

// Simple synth lead: dual detuned saws -> filter -> drive -> envelope
export class LeadInstrument implements InstrumentAPI {
    constructor(private ctx: InstrumentContext) { }

    noteOn(facePosition: number, freq: number, opts?: { duration?: number, stepTime?: number, frequencies?: number[] }) {
        const { audio, pannerForFace, dry, convolver } = this.ctx;
        const now = audio.currentTime;
        const duration = opts?.duration ?? 0.4;
        const stepTime = opts?.stepTime ?? 1000;
        const frequencies = opts?.frequencies;

        // If multiple frequencies provided, generate a melody
        if (frequencies && frequencies.length > 1) {
            this.playMelody(facePosition, frequencies, stepTime);
            return;
        }

        // For single notes, just use the playNote method
        this.playNote(facePosition, freq, now, duration);
    }

    private playMelody(facePosition: number, frequencies: number[], stepTimeMs: number) {
        const { audio } = this.ctx;
        const now = audio.currentTime;

        // Generate melody pattern within 16-step grid
        const melody = this.generateMelodyPattern(frequencies, 16);
        const stepDurationMs = stepTimeMs / 16; // Each grid step duration in ms
        const stepDurationSec = stepDurationMs / 1000; // Convert to seconds

        melody.forEach((note) => {
            const startTime = now + (note.startStep * stepDurationSec);
            const noteDuration = note.duration * stepDurationSec;

            if (note.useGlide && melody.indexOf(note) > 0) {
                // Find previous note for glide
                const prevNote = melody[melody.indexOf(note) - 1];
                this.playNoteWithGlide(facePosition, prevNote.freq, note.freq, startTime, noteDuration);
            } else {
                this.playNote(facePosition, note.freq, startTime, noteDuration);
            }
        });
    }

    private generateMelodyPattern(frequencies: number[], gridSteps: number): MelodyNote[] {
        const melody: MelodyNote[] = [];
        let currentStep = 0;

        // Shuffle frequencies for interesting order
        const shuffledFreqs = [...frequencies].sort(() => Math.random() - 0.5);

        for (const freq of shuffledFreqs) {
            if (currentStep >= gridSteps) break;

            // Random note duration (1-4 steps)
            const maxDuration = Math.min(4, gridSteps - currentStep);
            const noteDuration = Math.floor(Math.random() * maxDuration) + 1;

            // Random chance for glide (30% chance)
            const useGlide = Math.random() < 0.3;

            melody.push({
                freq,
                startStep: currentStep,
                duration: noteDuration,
                useGlide: useGlide && melody.length > 0 // Only glide if not first note
            });

            currentStep += noteDuration;

            // Random silence (0-2 steps, 40% chance)
            if (currentStep < gridSteps && Math.random() < 0.4) {
                const maxSilence = Math.min(2, gridSteps - currentStep);
                const silenceSteps = Math.floor(Math.random() * maxSilence) + 1;
                currentStep += silenceSteps;
            }
        }

        return melody;
    }

    private playNote(facePosition: number, freq: number, startTime: number, duration: number) {
        const { audio, pannerForFace, dry, convolver } = this.ctx;

        // Create oscillators - mix of sawtooth and triangle for softer tone
        const osc1 = audio.createOscillator();
        const osc2 = audio.createOscillator();
        osc1.type = "sawtooth";
        osc2.type = "triangle";
        osc1.frequency.setValueAtTime(freq, startTime);
        osc2.frequency.setValueAtTime(freq, startTime);
        osc1.detune.setValueAtTime(-12, startTime);
        osc2.detune.setValueAtTime(15, startTime);

        // Mix gains - favor the softer triangle wave
        const mixGain1 = audio.createGain();
        const mixGain2 = audio.createGain();
        mixGain1.gain.setValueAtTime(0.4, startTime);
        mixGain2.gain.setValueAtTime(0.6, startTime);

        // Filter - lower cutoff and gentler resonance for warmth
        const filter = audio.createBiquadFilter();
        filter.type = "lowpass";
        filter.Q.setValueAtTime(0.4, startTime);
        filter.frequency.setValueAtTime(1800, startTime);

        // Very soft drive
        const shaper = audio.createWaveShaper();
        shaper.curve = this.makeDriveCurve(1.2);
        shaper.oversample = "4x";

        // Envelope - softer attack, higher sustain for lushness
        const gain = audio.createGain();
        const A = 0.015, D = 0.12, S = 0.7, R = 0.4;
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.linearRampToValueAtTime(0.7, startTime + A);
        gain.gain.linearRampToValueAtTime(S, startTime + A + D);

        const panner = pannerForFace(facePosition);

        // Connect
        const mix = audio.createGain();
        mix.gain.setValueAtTime(1.0, startTime);
        osc1.connect(mixGain1).connect(mix);
        osc2.connect(mixGain2).connect(mix);
        mix.connect(filter).connect(shaper).connect(gain).connect(panner);
        panner.connect(dry);

        // Start and stop
        osc1.start(startTime);
        osc2.start(startTime);
        const stopTime = startTime + duration + R;
        osc1.stop(stopTime);
        osc2.stop(stopTime);

        // Release
        gain.gain.setValueAtTime(S, startTime + duration);
        gain.gain.setTargetAtTime(0.0001, startTime + duration, R / 3);
    }

    private playNoteWithGlide(facePosition: number, fromFreq: number, toFreq: number, startTime: number, duration: number) {
        const { audio, pannerForFace, dry, convolver } = this.ctx;

        // Create oscillators
        const osc1 = audio.createOscillator();
        const osc2 = audio.createOscillator();
        osc1.type = "sawtooth";
        osc2.type = "sawtooth";

        // Start from previous frequency and glide to new frequency
        osc1.frequency.setValueAtTime(fromFreq, startTime);
        osc2.frequency.setValueAtTime(fromFreq, startTime);

        // Glide time (30% of note duration)
        const glideTime = duration * 0.3;
        osc1.frequency.exponentialRampToValueAtTime(toFreq, startTime + glideTime);
        osc2.frequency.exponentialRampToValueAtTime(toFreq, startTime + glideTime);

        osc1.detune.setValueAtTime(-7, startTime);
        osc2.detune.setValueAtTime(6, startTime);

        // Mix gains
        const mixGain1 = audio.createGain();
        const mixGain2 = audio.createGain();
        mixGain1.gain.setValueAtTime(0.6, startTime);
        mixGain2.gain.setValueAtTime(0.6, startTime);

        // Filter
        const filter = audio.createBiquadFilter();
        filter.type = "lowpass";
        filter.Q.setValueAtTime(0.9, startTime);
        filter.frequency.setValueAtTime(2400, startTime);

        // Drive
        const shaper = audio.createWaveShaper();
        shaper.curve = this.makeDriveCurve(2.0);
        shaper.oversample = "2x";

        // Envelope
        const gain = audio.createGain();
        const A = 0.006, D = 0.08, S = 0.5, R = 0.25;
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.linearRampToValueAtTime(0.9, startTime + A);
        gain.gain.linearRampToValueAtTime(S, startTime + A + D);

        const panner = pannerForFace(facePosition);

        // Connect
        const mix = audio.createGain();
        mix.gain.setValueAtTime(1.0, startTime);
        osc1.connect(mixGain1).connect(mix);
        osc2.connect(mixGain2).connect(mix);
        mix.connect(filter).connect(shaper).connect(gain).connect(panner);
        panner.connect(dry);

        // Start and stop
        osc1.start(startTime);
        osc2.start(startTime);
        const stopTime = startTime + duration + R;
        osc1.stop(stopTime);
        osc2.stop(stopTime);

        // Release
        gain.gain.setValueAtTime(S, startTime + duration);
        gain.gain.setTargetAtTime(0.0001, startTime + duration, R / 3);
    }

    private makeDriveCurve(amount: number) {
        const n = 256;
        const curve = new Float32Array(n);
        const k = amount;
        for (let i = 0; i < n; i++) {
            const x = (i / (n - 1)) * 2 - 1;
            curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
        }
        return curve;
    }
}
