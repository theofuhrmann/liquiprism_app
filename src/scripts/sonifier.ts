import { Liquiprism, Face, FacePosition, Cell } from "./liquiprism";

enum ScaleType {
    Major = "major",
    Minor = "minor",
    Blues = "blues"
}

enum Instrument {
    Sine = "sine",
    Drums = "drums"
}

interface FaceProperties {
    muted: boolean;
    instrument: Instrument;
    pitchGrid: number[][];
}

class Sonifier {
    private liquiprism: Liquiprism;
    private audioContext: AudioContext;
    private oscillators: Map<FacePosition, Map<Cell, AudioBufferSourceNode | OscillatorNode>>;
    private noteThreshold: number;
    private faceProperties: Map<FacePosition, FaceProperties>;
    private scaleType: ScaleType;
    private convolver: ConvolverNode;
    private gainNode: GainNode;
    private compressor: DynamicsCompressorNode;

    constructor(liquiprism: Liquiprism, scaleType: ScaleType = ScaleType.Major) {
        this.liquiprism = liquiprism;
        this.audioContext = new AudioContext();
        this.oscillators = new Map();
        this.noteThreshold = 5;
        this.scaleType = scaleType;
        this.faceProperties = this.initializeFaceProperties();

        this.convolver = this.audioContext.createConvolver();
        this.convolver.buffer = this.createImpulseResponse(2, 2, true);

        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = 0.1;

        this.compressor = this.audioContext.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-50, this.audioContext.currentTime);
        this.compressor.knee.setValueAtTime(40, this.audioContext.currentTime);
        this.compressor.ratio.setValueAtTime(12, this.audioContext.currentTime);
        this.compressor.attack.setValueAtTime(0, this.audioContext.currentTime);
        this.compressor.release.setValueAtTime(0.25, this.audioContext.currentTime);

        this.convolver.connect(this.gainNode);
        this.gainNode.connect(this.compressor);
        this.compressor.connect(this.audioContext.destination);

        this.updateLegendSonifier();

    }


    private initializeFaceProperties(): Map<FacePosition, FaceProperties> {
        const basePitches = new Map<FacePosition, number>([
            [FacePosition.BOTTOM, 24],
            [FacePosition.TOP, 84],
            [FacePosition.FRONT, 48],
            [FacePosition.BACK, 60],
            [FacePosition.LEFT, 36],
            [FacePosition.RIGHT, 72],
        ]);

        const faceProperties = new Map<FacePosition, FaceProperties>();

        basePitches.forEach((basePitch, facePosition) => {
            faceProperties.set(facePosition, {
                muted: false,
                instrument: Instrument.Sine,
                pitchGrid: this.createPitchGrid(basePitch)
            });
        });

        return faceProperties;
    }


    private createImpulseResponse(duration: number, decay: number, reverse: boolean): AudioBuffer {
        const sampleRate = this.audioContext.sampleRate;
        const length = sampleRate * duration;
        const impulse = this.audioContext.createBuffer(2, length, sampleRate);
        for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
            const channelData = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                const n = reverse ? length - i : i;
                channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
            }
        }
        return impulse;
    }

    private createPitchGrid(basePitch: number): number[][] {
        const pitchGrid: number[][] = [];

        const majorScaleIntervals = [0, 2, 4, 5, 7, 9, 11];
        const minorScaleIntervals = [0, 2, 3, 5, 7, 8, 10];
        const bluesScaleIntervals = [0, 3, 5, 6, 7, 10];

        let intervals: number[];
        if (this.scaleType === ScaleType.Minor) {
            intervals = minorScaleIntervals;
        } else if (this.scaleType === ScaleType.Blues) {
            intervals = bluesScaleIntervals;
        } else {
            intervals = majorScaleIntervals;
        }

        const intervalLength = intervals.length;

        for (let row = 0; row < this.liquiprism.size; row++) {
            let rowIntervals = [...intervals];

            if (this.liquiprism.size < intervalLength) {
                while (rowIntervals.length > this.liquiprism.size) {
                    const randomIndex = Math.floor(Math.random() * rowIntervals.length);
                    rowIntervals.splice(randomIndex, 1);
                }
            } else if (this.liquiprism.size > intervalLength) {
                while (rowIntervals.length < this.liquiprism.size) {
                    const randomInterval = intervals[Math.floor(Math.random() * intervalLength)];
                    rowIntervals.push(randomInterval);
                }
                rowIntervals.sort((a, b) => a - b);
            }

            const scaleBase = basePitch + (intervalLength - 1 - row);
            const rowPitches = rowIntervals.map(
                (interval) => scaleBase + interval
            );
            pitchGrid.push(rowPitches);
        }

        return pitchGrid;
    }

    public update(): void {
        Object.values(FacePosition).forEach((facePosition) => {
            const properties = this.faceProperties.get(facePosition as FacePosition);
            if (properties?.muted) {
                return;
            }
            const face = this.liquiprism.getFace(facePosition as FacePosition);
            if (properties?.pitchGrid) {
                this.sonifyFace(face, facePosition as FacePosition, properties.pitchGrid);
            }
        });
    }

    private getNotes(note_candidates: [Cell, number][]): [Cell, number][] {
        const candidates = [...note_candidates];

        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }

        return candidates.slice(0, Math.min(this.noteThreshold, candidates.length));
    }

    private sonifyFace(face: Face, facePosition: FacePosition, pitchGrid: number[][]): void {
        let note_candidates: [Cell, number][] = [];
        for (let i = 0; i < this.liquiprism.size; i++) {
            for (let j = 0; j < this.liquiprism.size; j++) {
                const cell = face.getCell([i, j]);
                const pitch = pitchGrid[i][j];
                if (cell.stimulated) {
                    note_candidates.push([cell, pitch]);
                } else {
                    this.playNoteOff(facePosition, cell);
                }
            }
        }

        const notes = this.getNotes(note_candidates);
        notes.forEach(([cell, pitch]) => {
            this.playNoteOn(facePosition, cell, pitch);
        });
    }

    private midiToFrequency(note: number): number {
        return 440 * Math.pow(2, (note - 69) / 12);
    }

    private playNoteOn(facePosition: FacePosition, cell: Cell, pitch: number, duration: number = 0.25): void {
        const properties = this.faceProperties.get(facePosition);
        const instrument = properties?.instrument;

        if (instrument === Instrument.Drums) {
            // Create a percussive sound using a noise buffer
            const bufferSize = this.audioContext.sampleRate * duration;
            const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
            const data = buffer.getChannelData(0);

            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1; // White noise
            }

            const noise = this.audioContext.createBufferSource();
            noise.buffer = buffer;

            const gainNode = this.audioContext.createGain();
            gainNode.gain.setValueAtTime(1, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

            noise.connect(gainNode);
            gainNode.connect(this.convolver);
            noise.start();
            noise.stop(this.audioContext.currentTime + duration);

            if (!this.oscillators.has(facePosition)) {
                this.oscillators.set(facePosition, new Map());
            }
            this.oscillators.get(facePosition)?.set(cell, noise);
        } else {
            const oscillator = this.audioContext.createOscillator();
            oscillator.type = "sine"; // You can change the type to "square", "sawtooth", "triangle"
            oscillator.frequency.setValueAtTime(this.midiToFrequency(pitch), this.audioContext.currentTime);

            const gainNode = this.audioContext.createGain();
            gainNode.gain.setValueAtTime(1, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

            oscillator.connect(gainNode);
            gainNode.connect(this.convolver);
            oscillator.start();
            oscillator.stop(this.audioContext.currentTime + duration);

            if (!this.oscillators.has(facePosition)) {
                this.oscillators.set(facePosition, new Map());
            }
            this.oscillators.get(facePosition)?.set(cell, oscillator);
        }

    }


    private playNoteOff(facePosition: FacePosition, cell: Cell): void {
        const face_oscillators = this.oscillators.get(facePosition) as Map<Cell, AudioBufferSourceNode | OscillatorNode>;
        if (face_oscillators) {
            const oscillator = face_oscillators.get(cell);
            if (oscillator) {
                oscillator.stop();
                oscillator.disconnect();
                face_oscillators.delete(cell);
            }
        }
    }

    public setMuteFace(facePosition: FacePosition, mute: boolean): void {
        facePosition = FacePosition[facePosition as unknown as keyof typeof FacePosition]
        const properties = this.faceProperties.get(facePosition);
        if (properties) {
            properties.muted = mute;
            if (mute) {
                const face = this.liquiprism.getFace(facePosition);
                face.cells.forEach((cell) => {
                    this.playNoteOff(facePosition, cell);
                });
            }
        }
    }

    public updateLegendSonifier() {
        const faceData = Array.from(this.faceProperties, ([position, props]) => ({
            position: FacePosition[position].toLowerCase(),
            instrument: props.instrument
        }));
        const event = new CustomEvent("updateLegendSonifier", {
            detail: { legendData: faceData },
        });
        document.dispatchEvent(event);
    }

}

export { Sonifier };