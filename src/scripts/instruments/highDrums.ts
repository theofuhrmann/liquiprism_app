import type { InstrumentAPI, InstrumentContext } from "./types";

// High drums: hihats and crashes with varied metallic and noise characteristics  
export class HighDrumsInstrument implements InstrumentAPI {
    constructor(private ctx: InstrumentContext) { }

    noteOn(facePosition: number, freq: number, opts?: { duration?: number, stepTime?: number }) {
        const { audio, pannerForFace, dry, convolver } = this.ctx;
        const now = audio.currentTime;
        const duration = opts?.duration ?? 0.2;
        const stepTime = opts?.stepTime ?? 1000; // Default 1 second if not provided

        // Generate random timing offset within the step
        const randomOffset = this.generateRandomOffset(stepTime);
        const triggerTime = now + (randomOffset / 1000); // Convert to seconds

        // Randomly choose between hihat-like and crash-like sounds
        const isCrash = Math.random() < 0.3; // 30% chance for crash, 70% for hihat

        if (isCrash) {
            this.playCrash(facePosition, triggerTime, duration);
        } else {
            this.playHihat(facePosition, triggerTime, duration);
        }
    }

    private generateRandomOffset(stepTimeMs: number): number {
        // Divide step time into 16 subdivisions
        const subdivisions = 16;
        const subdivisionTime = stepTimeMs / subdivisions;

        // Pick a random subdivision (0-15)
        const randomSubdivision = Math.floor(Math.random() * subdivisions);

        // Add some micro-timing variation within the subdivision (±10% of subdivision time)
        const microVariation = (Math.random() - 0.5) * 0.2 * subdivisionTime;

        return (randomSubdivision * subdivisionTime) + microVariation;
    }

    private playHihat(facePosition: number, startTime: number, duration: number) {
        const { audio, pannerForFace, dry, convolver } = this.ctx;

        // Create noise buffer for hihat
        const noiseBuffer = this.createNoiseBuffer(duration * 0.6);
        const noiseSource = audio.createBufferSource();
        noiseSource.buffer = noiseBuffer;

        // High-pass filter for bright, crispy hihat sound
        const filter = audio.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(8000 + Math.random() * 4000, startTime); // 8-12kHz
        filter.Q.setValueAtTime(2 + Math.random() * 3, startTime); // High Q for sharp sound

        // Gain control
        const gain = audio.createGain();
        const initialGain = 0.15 + Math.random() * 0.1; // 0.15-0.25
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(initialGain, startTime + 0.001);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration * 0.6);

        // Connect the chain
        const panner = pannerForFace(facePosition);
        noiseSource.connect(filter);
        filter.connect(gain);
        gain.connect(panner);
        panner.connect(dry);

        noiseSource.start(startTime);
        noiseSource.stop(startTime + duration * 0.6);
    }

    private playCrash(facePosition: number, startTime: number, duration: number) {
        const { audio, pannerForFace, dry, convolver } = this.ctx;

        // Create noise buffer for crash (longer than hihat)
        const noiseBuffer = this.createNoiseBuffer(duration * 1.2);
        const noiseSource = audio.createBufferSource();
        noiseSource.buffer = noiseBuffer;

        // Band-pass filter for crash - wider frequency range than hihat
        const filter = audio.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(6000 + Math.random() * 6000, startTime); // 6-12kHz center
        filter.Q.setValueAtTime(1 + Math.random() * 2, startTime); // Medium Q for fuller sound

        // Gain control with longer decay
        const gain = audio.createGain();
        const initialGain = 0.25 + Math.random() * 0.15; // 0.25-0.4 (louder than hihat)
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(initialGain, startTime + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration * 1.2);

        // Connect the chain
        const panner = pannerForFace(facePosition);
        noiseSource.connect(filter);
        filter.connect(gain);
        gain.connect(panner);
        panner.connect(dry);

        noiseSource.start(startTime);
        noiseSource.stop(startTime + duration * 1.2);
    }

    private createNoiseBuffer(duration: number): AudioBuffer {
        const { audio } = this.ctx;
        const sampleRate = audio.sampleRate;
        const length = Math.floor(sampleRate * duration);
        const buffer = audio.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < length; i++) {
            data[i] = (Math.random() * 2 - 1);
        }

        return buffer;
    }
}
