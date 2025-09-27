import type { InstrumentAPI, InstrumentContext } from "./types";

interface BassNote {
    freq: number;
    startStep: number;
    duration: number; // in grid steps (1-2)
    useGlide?: boolean;
}

export class BassInstrument implements InstrumentAPI {
    constructor(private ctx: InstrumentContext) { }

    noteOn(facePosition: number, freq: number, opts?: { duration?: number, stepTime?: number, frequencies?: number[] }) {
        const { audio, pannerForFace, dry, convolver } = this.ctx;
        const now = audio.currentTime;
        const duration = opts?.duration ?? 0.6;
        const stepTime = opts?.stepTime ?? 1000;
        const frequencies = opts?.frequencies;

        // If multiple frequencies provided, create a groovy bass line
        if (frequencies && frequencies.length > 1) {
            this.playBassLine(facePosition, frequencies, stepTime);
            return;
        }

        // For single notes, just play the bass note
        this.playBassNote(facePosition, freq, now, duration);
    }

    private playBassLine(facePosition: number, frequencies: number[], stepTimeMs: number) {
        const { audio } = this.ctx;
        const now = audio.currentTime;

        // Generate groovy bass pattern within 4-step grid based on activity level
        const bassLine = this.generateGroovyBassPattern(frequencies, 4);
        const stepDurationMs = stepTimeMs / 4; // Each grid step duration in ms
        const stepDurationSec = stepDurationMs / 1000; // Convert to seconds

        bassLine.forEach((note, index) => {
            const startTime = now + (note.startStep * stepDurationSec);
            const noteDuration = note.duration * stepDurationSec;

            if (note.useGlide && index > 0) {
                // Find previous note for glide
                const prevNote = bassLine[index - 1];
                this.playBassNoteWithGlide(facePosition, prevNote.freq, note.freq, startTime, noteDuration);
            } else {
                this.playBassNote(facePosition, note.freq, startTime, noteDuration);
            }
        });
    }

    private generateGroovyBassPattern(frequencies: number[], gridSteps: number): BassNote[] {
        const bassLine: BassNote[] = [];
        const numFreqs = frequencies.length;

        // Shuffle frequencies but prefer lower frequencies for bass
        const sortedFreqs = [...frequencies].sort((a, b) => a - b); // Sort low to high
        const shuffledFreqs = [...sortedFreqs].sort(() => Math.random() - 0.5); // Add some randomness

        // Select pattern based on number of active frequencies (cells)
        let pattern: { steps: number[], style: string };

        if (numFreqs <= 2) {
            // Minimal pattern - sparse, simple
            pattern = this.getMinimalPattern();
        } else if (numFreqs <= 4) {
            // Moderate pattern - standard groove
            pattern = this.getStandardPattern();
        } else if (numFreqs <= 7) {
            // Active pattern - more notes, syncopation
            pattern = this.getActivePattern();
        } else {
            // Busy pattern - complex rhythms
            pattern = this.getBusyPattern();
        }

        // Create bass line based on selected pattern
        const freqsToUse = shuffledFreqs.slice(0, Math.min(pattern.steps.length, numFreqs));

        pattern.steps.forEach((step, index) => {
            if (step >= gridSteps || index >= freqsToUse.length) return;

            const freq = freqsToUse[index % freqsToUse.length];

            // Vary note durations based on pattern style
            let noteDuration: number;
            let glideChance: number;

            switch (pattern.style) {
                case 'minimal':
                    noteDuration = Math.random() < 0.6 ? 1.5 : 0.8; // Longer, sustained notes
                    glideChance = 0.2; // Less gliding
                    break;
                case 'standard':
                    noteDuration = Math.random() < 0.4 ? 1.2 : 0.6; // Mix of lengths
                    glideChance = 0.4; // Moderate gliding
                    break;
                case 'active':
                    noteDuration = Math.random() < 0.3 ? 1.0 : 0.4; // Shorter, punchier
                    glideChance = 0.5; // More gliding
                    break;
                case 'busy':
                    noteDuration = Math.random() < 0.2 ? 0.8 : 0.3; // Mostly short notes
                    glideChance = 0.6; // Lots of gliding
                    break;
                default:
                    noteDuration = 0.6;
                    glideChance = 0.4;
            }

            // Add swing/groove timing offset
            const swingOffset = (Math.random() - 0.5) * 0.15; // ±7.5% timing variation

            bassLine.push({
                freq,
                startStep: step + swingOffset,
                duration: noteDuration,
                useGlide: Math.random() < glideChance
            });
        });

        return bassLine;
    }

    private getMinimalPattern(): { steps: number[], style: string } {
        const patterns = [
            [0, 2], // Simple on-beat
            [0, 3], // Root and fourth
            [0], // Just root
            [1, 3], // Off-beat minimal
        ];
        return {
            steps: patterns[Math.floor(Math.random() * patterns.length)],
            style: 'minimal'
        };
    }

    private getStandardPattern(): { steps: number[], style: string } {
        const patterns = [
            [0, 1.5, 3], // Classic syncopation
            [0, 2, 3.5], // Standard groove
            [0, 1, 2.5], // Moderate activity
            [0.5, 2, 3], // Off-beat start
        ];
        return {
            steps: patterns[Math.floor(Math.random() * patterns.length)],
            style: 'standard'
        };
    }

    private getActivePattern(): { steps: number[], style: string } {
        const patterns = [
            [0, 0.75, 1.5, 2.25, 3], // Busy syncopation
            [0, 1, 1.75, 2.5, 3.25], // Sixteenth note activity
            [0.25, 1, 1.5, 2.75, 3.5], // Off-beat heavy
            [0, 1.25, 2, 2.75, 3.5], // Irregular spacing
        ];
        return {
            steps: patterns[Math.floor(Math.random() * patterns.length)],
            style: 'active'
        };
    }

    private getBusyPattern(): { steps: number[], style: string } {
        const patterns = [
            [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], // Eighth notes
            [0, 0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25], // Complex syncopation
            [0.25, 0.75, 1.25, 1.5, 2, 2.5, 3, 3.75], // Irregular busy
            [0, 0.5, 1.25, 1.5, 2.25, 2.5, 3.25, 3.75], // Syncopated busy
        ];
        return {
            steps: patterns[Math.floor(Math.random() * patterns.length)],
            style: 'busy'
        };
    }

    private playBassNote(facePosition: number, freq: number, startTime: number, duration: number) {
        const { audio, pannerForFace, dry, convolver } = this.ctx;

        // Create oscillator with sawtooth wave for bass character
        const osc = audio.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(Math.max(20, freq), startTime);

        // Low-pass filter for bass tone shaping
        const filter = audio.createBiquadFilter();
        filter.type = "lowpass";
        filter.Q.setValueAtTime(1.2, startTime); // Higher Q for more character
        filter.frequency.setValueAtTime(400, startTime);

        // Gain with punchy bass envelope
        const gain = audio.createGain();
        const A = 0.001, D = 0.05, S = 0.7, R = 0.1; // Punchier envelope

        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.linearRampToValueAtTime(1.0, startTime + A); // More punch
        gain.gain.exponentialRampToValueAtTime(S, startTime + A + D);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

        // Filter envelope for groove
        const baseCutoff = 300;
        const envAmt = 800;
        filter.frequency.setValueAtTime(baseCutoff, startTime);
        filter.frequency.linearRampToValueAtTime(baseCutoff + envAmt, startTime + 0.005);
        filter.frequency.exponentialRampToValueAtTime(baseCutoff + 100, startTime + 0.1);

        // Connect audio chain
        const panner = pannerForFace(facePosition);
        osc.connect(filter).connect(gain).connect(panner);
        panner.connect(dry);
        panner.connect(convolver);

        // Start and schedule stop
        osc.start(startTime);
        osc.stop(startTime + duration + 0.1);

        // Cleanup when finished
        osc.onended = () => {
            try { filter.disconnect(); } catch { }
            try { gain.disconnect(); } catch { }
            try { panner.disconnect(); } catch { }
        };
    }

    private playBassNoteWithGlide(facePosition: number, fromFreq: number, toFreq: number, startTime: number, duration: number) {
        const { audio, pannerForFace, dry, convolver } = this.ctx;

        // Create oscillator
        const osc = audio.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(Math.max(20, fromFreq), startTime);

        // Glide to target frequency
        const glideTime = Math.min(0.15, duration * 0.3); // 30% of note duration or 150ms max
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, toFreq), startTime + glideTime);

        // Same filter and gain setup as regular bass note
        const filter = audio.createBiquadFilter();
        filter.type = "lowpass";
        filter.Q.setValueAtTime(1.2, startTime);
        filter.frequency.setValueAtTime(400, startTime);

        const gain = audio.createGain();
        const A = 0.001, D = 0.05, S = 0.7;

        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.linearRampToValueAtTime(1.0, startTime + A);
        gain.gain.exponentialRampToValueAtTime(S, startTime + A + D);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

        // Filter envelope
        const baseCutoff = 300;
        const envAmt = 800;
        filter.frequency.setValueAtTime(baseCutoff, startTime);
        filter.frequency.linearRampToValueAtTime(baseCutoff + envAmt, startTime + 0.005);
        filter.frequency.exponentialRampToValueAtTime(baseCutoff + 100, startTime + 0.1);

        const panner = pannerForFace(facePosition);
        osc.connect(filter).connect(gain).connect(panner);
        panner.connect(dry);
        panner.connect(convolver);

        osc.start(startTime);
        osc.stop(startTime + duration + 0.1);

        osc.onended = () => {
            try { filter.disconnect(); } catch { }
            try { gain.disconnect(); } catch { }
            try { panner.disconnect(); } catch { }
        };
    }
}
