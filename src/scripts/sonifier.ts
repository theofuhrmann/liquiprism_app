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
    private masterGain: GainNode;
    private wetGain: GainNode;
    private dryGain: GainNode;
    private reverbAmount: number = 0.3;
    private volumeAmount: number = 0.1;
    private pannerPool: PannerNode[] = [];
    private gainNodePool: GainNode[] = [];
    private compressor: DynamicsCompressorNode;

    constructor(liquiprism: Liquiprism, scaleType: ScaleType = ScaleType.Major) {
        this.liquiprism = liquiprism;
        this.audioContext = new AudioContext();
        this.oscillators = new Map();
        this.noteThreshold = 3;
        this.scaleType = scaleType;
        this.faceProperties = this.initializeFaceProperties();

        this.convolver = this.audioContext.createConvolver();
        this.convolver.buffer = this.createImpulseResponse(3, 2, false);

        this.wetGain = this.audioContext.createGain();
        this.dryGain = this.audioContext.createGain();
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = this.volumeAmount;

        this.compressor = this.audioContext.createDynamicsCompressor();
        this.configureCompressor();

        this.convolver.connect(this.wetGain);
        this.wetGain.connect(this.masterGain);
        this.dryGain.connect(this.masterGain);
        this.masterGain.connect(this.compressor);
        this.compressor.connect(this.audioContext.destination);

        this.setReverb(this.reverbAmount);
        this.setVolume(this.volumeAmount);

        this.updateLegendSonifier();

    }

    private configureCompressor(): void {
        this.compressor.threshold.setValueAtTime(-50, this.audioContext.currentTime);
        this.compressor.knee.setValueAtTime(40, this.audioContext.currentTime);
        this.compressor.ratio.setValueAtTime(12, this.audioContext.currentTime);
        this.compressor.attack.setValueAtTime(0, this.audioContext.currentTime);
        this.compressor.release.setValueAtTime(0.25, this.audioContext.currentTime);
    }


    private initializeFaceProperties(): Map<FacePosition, FaceProperties> {
        const basePitches = new Map<FacePosition, number>([
            [FacePosition.BOTTOM, 24], [FacePosition.TOP, 84],
            [FacePosition.FRONT, 48], [FacePosition.BACK, 60],
            [FacePosition.LEFT, 36], [FacePosition.RIGHT, 72],
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

    private getScaleIntervals(): number[] {
        return {
            [ScaleType.Major]: [0, 2, 4, 5, 7, 9, 11],
            [ScaleType.Minor]: [0, 2, 3, 5, 7, 8, 10],
            [ScaleType.Blues]: [0, 3, 5, 6, 7, 10]
        }[this.scaleType];
    }

    private createPitchGrid(basePitch: number): number[][] {
        const intervals = this.getScaleIntervals();
        const pitchGrid: number[][] = [];
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
                    this.stopNote(facePosition, cell);
                }
            }
        }

        const notes = this.getNotes(note_candidates);
        notes.forEach(([cell, pitch]) => {
            this.playNote(facePosition, cell, pitch);
        });
    }

    private stopNote(facePosition: FacePosition, cell: Cell): void {
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

    private playNote(facePosition: FacePosition, cell: Cell, pitch: number): void {
        const properties = this.faceProperties.get(facePosition);
        if (!properties) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.getGainNode();
        const panner = this.getPannerNode(facePosition);

        this.configureInstrument(oscillator, gainNode, properties.instrument, pitch);

        oscillator.connect(gainNode).connect(panner);
        panner.connect(this.dryGain);
        panner.connect(this.convolver);
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + this.getDuration(properties.instrument));

        oscillator.onended = () => {
            this.releaseResources(gainNode, panner);
        };
    }

    private getGainNode(): GainNode {
        return this.gainNodePool.pop() || this.audioContext.createGain();
    }

    private getPannerNode(facePosition: FacePosition): PannerNode {
        const panner = this.pannerPool.pop() || this.audioContext.createPanner();
        panner.panningModel = "HRTF";
        const faceCenter = this.liquiprism.faceCenters.get(facePosition);
        if (faceCenter) {
            if ('positionX' in panner) {
                panner.positionX.setValueAtTime(faceCenter.x, this.audioContext.currentTime);
                panner.positionY.setValueAtTime(faceCenter.y, this.audioContext.currentTime);
                panner.positionZ.setValueAtTime(faceCenter.z, this.audioContext.currentTime);
            } else if ((panner as any).setPosition) {
                (panner as any).setPosition(faceCenter.x, faceCenter.y, faceCenter.z);
            }
        } else {
            // Fallback to default position if face center not yet calculated
            if ('positionX' in panner) {
                panner.positionX.setValueAtTime(0, this.audioContext.currentTime);
                panner.positionY.setValueAtTime(0, this.audioContext.currentTime);
                panner.positionZ.setValueAtTime(0, this.audioContext.currentTime);
            } else if ((panner as any).setPosition) {
                (panner as any).setPosition(0, 0, 0);
            }
        }
        return panner;
    }

    private configureInstrument(
        oscillator: OscillatorNode,
        gainNode: GainNode,
        instrument: Instrument,
        pitch: number
    ): void {
        const frequency = this.midiToFrequency(pitch);
        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);

        switch (instrument) {
            case Instrument.Drums:
                oscillator.type = "sine";
                this.configureDrumEnvelope(gainNode);
                break;
            default:
                oscillator.type = "sine";
                this.configureSineEnvelope(gainNode);
        }
    }

    private configureDrumEnvelope(gainNode: GainNode): void {
        gainNode.gain.setValueAtTime(1, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.25);
    }

    private configureSineEnvelope(gainNode: GainNode): void {
        gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.5);
    }

    private getDuration(instrument: Instrument): number {
        return {
            [Instrument.Drums]: 0.25,
            [Instrument.Sine]: 0.5
        }[instrument];
    }

    private releaseResources(gainNode: GainNode, panner: PannerNode): void {
        try { gainNode.disconnect(); } catch { }
        try { panner.disconnect(); } catch { }
        this.gainNodePool.push(gainNode);
        this.pannerPool.push(panner);
    }

    private midiToFrequency(note: number): number {
        return 440 * Math.pow(2, (note - 69) / 12);
    }

    public setMuteFace(facePosition: FacePosition, mute: boolean): void {
        facePosition = FacePosition[facePosition as unknown as keyof typeof FacePosition]
        const properties = this.faceProperties.get(facePosition);
        if (properties) {
            properties.muted = mute;
            if (mute) {
                const face = this.liquiprism.getFace(facePosition);
                face.cells.forEach((cell) => {
                    this.stopNote(facePosition, cell);
                });
            }
        }
    }

    public setReverb(amount: number): void {
        const a = Math.max(0, Math.min(1, amount));
        this.reverbAmount = a;
        const wet = Math.sin(a * Math.PI / 2);
        const dry = Math.cos(a * Math.PI / 2);
        this.wetGain.gain.setValueAtTime(wet, this.audioContext.currentTime);
        this.dryGain.gain.setValueAtTime(dry, this.audioContext.currentTime);
    }

    public setVolume(amount: number): void {
        const a = Math.max(0, Math.min(1, amount));
        this.volumeAmount = a;
        this.masterGain.gain.setValueAtTime(a, this.audioContext.currentTime);
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