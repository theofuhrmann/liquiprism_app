import type { InstrumentAPI, InstrumentContext } from "./types";

// Low drums: kick and snare with varied noise and pitch characteristics
export class LowDrumsInstrument implements InstrumentAPI {
    constructor(private ctx: InstrumentContext) { }

    noteOn(facePosition: number, freq: number, opts?: { duration?: number, stepTime?: number }) {
        const { audio, pannerForFace, dry, convolver } = this.ctx;
        const now = audio.currentTime;
        const duration = opts?.duration ?? 0.3;
        const stepTime = opts?.stepTime ?? 1000; // Default 1 second if not provided

        // Generate random timing offset within the step
        const randomOffset = this.generateRandomOffset(stepTime);
        const triggerTime = now + (randomOffset / 1000); // Convert to seconds

        // Randomly choose between kick-like and snare-like sounds
        const isKick = Math.random() < 0.6; // 60% chance for kick, 40% for snare

        if (isKick) {
            this.playKick(facePosition, triggerTime, duration);
        } else {
            this.playSnare(facePosition, triggerTime, duration);
        }
    }

    private generateRandomOffset(stepTimeMs: number): number {
        // Divide step time into 8 subdivisions
        const subdivisions = 8;
        const subdivisionTime = stepTimeMs / subdivisions;

        // Pick a random subdivision (0-7)
        const randomSubdivision = Math.floor(Math.random() * subdivisions);

        // Add some micro-timing variation within the subdivision (±10% of subdivision time)
        const microVariation = (Math.random() - 0.5) * 0.2 * subdivisionTime;

        return (randomSubdivision * subdivisionTime) + microVariation;
    } private playKick(facePosition: number, now: number, duration: number) {
        const { audio, pannerForFace, dry, convolver } = this.ctx;

        // Kick: Low frequency oscillator + noise burst
        const kickOsc = audio.createOscillator();
        const noiseBuffer = this.createNoiseBuffer(0.05); // Short noise burst
        const noiseSource = audio.createBufferSource();
        noiseSource.buffer = noiseBuffer;

        // Kick oscillator (sine wave, low freq)
        kickOsc.type = "sine";
        const baseFreq = 40 + Math.random() * 20; // 40-60 Hz variation
        kickOsc.frequency.setValueAtTime(baseFreq * 2, now);
        kickOsc.frequency.exponentialRampToValueAtTime(baseFreq, now + 0.05);

        // Filter for kick (lowpass)
        const kickFilter = audio.createBiquadFilter();
        kickFilter.type = "lowpass";
        kickFilter.frequency.setValueAtTime(80 + Math.random() * 40, now); // 80-120 Hz
        kickFilter.Q.setValueAtTime(0.5, now);

        // Noise filter (bandpass for punch)
        const noiseFilter = audio.createBiquadFilter();
        noiseFilter.type = "bandpass";
        noiseFilter.frequency.setValueAtTime(200 + Math.random() * 300, now); // 200-500 Hz
        noiseFilter.Q.setValueAtTime(2 + Math.random() * 3, now); // 2-5 Q

        // Gain envelopes
        const kickGain = audio.createGain();
        const noiseGain = audio.createGain();
        const mixGain = audio.createGain();

        // Kick envelope (punchy)
        kickGain.gain.setValueAtTime(0.8 + Math.random() * 0.2, now);
        kickGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15 + Math.random() * 0.1);

        // Noise envelope (very short)
        noiseGain.gain.setValueAtTime(0.3 + Math.random() * 0.2, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.03 + Math.random() * 0.02);

        mixGain.gain.setValueAtTime(0.9, now);

        const panner = pannerForFace(facePosition);

        // Connect kick path
        kickOsc.connect(kickFilter).connect(kickGain).connect(mixGain);

        // Connect noise path
        noiseSource.connect(noiseFilter).connect(noiseGain).connect(mixGain);

        mixGain.connect(panner);
        panner.connect(dry);
        panner.connect(convolver);

        // Start and stop
        kickOsc.start(now);
        noiseSource.start(now);
        kickOsc.stop(now + duration);
        noiseSource.stop(now + 0.05);

        const cleanup = () => {
            try { kickFilter.disconnect(); } catch { }
            try { noiseFilter.disconnect(); } catch { }
            try { kickGain.disconnect(); } catch { }
            try { noiseGain.disconnect(); } catch { }
            try { mixGain.disconnect(); } catch { }
            try { panner.disconnect(); } catch { }
        };

        kickOsc.onended = cleanup;
    }

    private playSnare(facePosition: number, now: number, duration: number) {
        const { audio, pannerForFace, dry, convolver } = this.ctx;

        // Snare: Tone + filtered noise
        const snareOsc = audio.createOscillator();
        const noiseBuffer = this.createNoiseBuffer(0.15); // Longer noise for snare
        const noiseSource = audio.createBufferSource();
        noiseSource.buffer = noiseBuffer;

        // Snare tone (triangle/square mix)
        snareOsc.type = Math.random() < 0.5 ? "triangle" : "square";
        const snareFreq = 180 + Math.random() * 80; // 180-260 Hz
        snareOsc.frequency.setValueAtTime(snareFreq, now);

        // Filters
        const snareFilter = audio.createBiquadFilter();
        snareFilter.type = "bandpass";
        snareFilter.frequency.setValueAtTime(200 + Math.random() * 150, now); // 200-350 Hz
        snareFilter.Q.setValueAtTime(1 + Math.random(), now);

        const noiseFilter = audio.createBiquadFilter();
        noiseFilter.type = "highpass";
        noiseFilter.frequency.setValueAtTime(2000 + Math.random() * 3000, now); // 2-5 kHz
        noiseFilter.Q.setValueAtTime(0.5 + Math.random() * 0.5, now);

        // Gain envelopes
        const snareGain = audio.createGain();
        const noiseGain = audio.createGain();
        const mixGain = audio.createGain();

        // Snare envelope
        snareGain.gain.setValueAtTime(0.4 + Math.random() * 0.2, now);
        snareGain.gain.exponentialRampToValueAtTime(0.01, now + 0.08 + Math.random() * 0.04);

        // Noise envelope (snare buzz)
        noiseGain.gain.setValueAtTime(0.6 + Math.random() * 0.3, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12 + Math.random() * 0.06);

        mixGain.gain.setValueAtTime(0.7, now);

        const panner = pannerForFace(facePosition);

        // Connect paths
        snareOsc.connect(snareFilter).connect(snareGain).connect(mixGain);
        noiseSource.connect(noiseFilter).connect(noiseGain).connect(mixGain);

        mixGain.connect(panner);
        panner.connect(dry);
        panner.connect(convolver);

        // Start and stop
        snareOsc.start(now);
        noiseSource.start(now);
        snareOsc.stop(now + duration);
        noiseSource.stop(now + 0.15);

        const cleanup = () => {
            try { snareFilter.disconnect(); } catch { }
            try { noiseFilter.disconnect(); } catch { }
            try { snareGain.disconnect(); } catch { }
            try { noiseGain.disconnect(); } catch { }
            try { mixGain.disconnect(); } catch { }
            try { panner.disconnect(); } catch { }
        };

        snareOsc.onended = cleanup;
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
