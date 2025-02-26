import { Liquiprism, Face, FacePosition, Cell } from "./liquiprism";

enum ScaleType {
    Major = "major",
    Minor = "minor",
    Blues = "blues"
}

class Sonifier {
    private liquiprism: Liquiprism;
    private audioContext: AudioContext;
    private oscillators: Map<FacePosition, Map<Cell, OscillatorNode>>;
    private noteThreshold: number;
    private pitchGrids: Map<FacePosition, number[][]>;
    private scaleType: ScaleType;
    private convolver: ConvolverNode;
    private mutedFaces: Map<FacePosition, boolean> = new Map();

    constructor(liquiprism: Liquiprism, scaleType: ScaleType = ScaleType.Major) {
        this.liquiprism = liquiprism;
        this.audioContext = new AudioContext();
        this.oscillators = new Map();
        this.noteThreshold = 5;
        this.scaleType = scaleType;
        this.pitchGrids = this.createPitchGrids();
        this.mutedFaces = new Map();

        this.convolver = this.audioContext.createConvolver();
        this.convolver.buffer = this.createImpulseResponse(3, 2, true);
        this.convolver.connect(this.audioContext.destination);
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

    private createPitchGrids(): Map<FacePosition, number[][]> {
        const pitchGrids = new Map<FacePosition, number[][]>();
        const basePitches = new Map<FacePosition, number>([
            [FacePosition.BOTTOM, 24],
            [FacePosition.TOP, 84],
            [FacePosition.FRONT, 48],
            [FacePosition.BACK, 60],
            [FacePosition.LEFT, 36],
            [FacePosition.RIGHT, 72],
        ]);

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

        basePitches.forEach((basePitch, facePosition) => {
            const pitchGrid: number[][] = [];
            for (let row = 0; row < intervalLength; row++) {
                const scaleBase = basePitch + (intervalLength - 1 - row);
                const rowPitches = intervals.map(
                    (interval) => scaleBase + interval
                );
                pitchGrid.push(rowPitches);
            }
            pitchGrids.set(facePosition, pitchGrid);
        });

        return pitchGrids;
    }

    public update(): void {
        Object.values(FacePosition).forEach((facePosition) => {
            if (this.mutedFaces.get(facePosition as FacePosition)) {
                return;
            }
            const face = this.liquiprism.getFace(facePosition as FacePosition);
            const pitchGrid = this.pitchGrids.get(facePosition as FacePosition);
            if (pitchGrid) {
                this.sonifyFace(face, facePosition as FacePosition, pitchGrid);
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
        //if (facePosition === FacePosition.FRONT) {
        const oscillator = this.audioContext.createOscillator();
        oscillator.type = "sine"; // You can change the type to "square", "sawtooth", "triangle"
        oscillator.frequency.setValueAtTime(this.midiToFrequency(pitch),
            this.audioContext.currentTime);
        oscillator.connect(this.convolver);
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + duration);

        if (!this.oscillators.has(facePosition)) {
            this.oscillators.set(facePosition, new Map());
        }
        this.oscillators.get(facePosition)?.set(cell, oscillator);
        //}
    }

    private playNoteOff(facePosition: FacePosition, cell: Cell): void {
        const face_oscillators = this.oscillators.get(facePosition);
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
        this.mutedFaces.set(facePosition, mute);
        if (mute) {
            const face = this.liquiprism.getFace(facePosition);
            face.cells.forEach((cell) => {
                this.playNoteOff(facePosition, cell);
            });
        }
    }
}

export { Sonifier };