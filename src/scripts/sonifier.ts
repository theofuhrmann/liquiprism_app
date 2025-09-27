import { Liquiprism, Face, FacePosition, Cell } from "./liquiprism";
import type { InstrumentAPI, InstrumentContext } from "./instruments/types";
import { BassInstrument } from "./instruments/bass";
import { SineInstrument } from "./instruments/sine";
import { LowDrumsInstrument } from "./instruments/lowDrums";
import { HighDrumsInstrument } from "./instruments/highDrums";
import { FluteInstrument } from "./instruments/flute";
import { PadsInstrument } from "./instruments/pads";
import { LeadInstrument } from "./instruments/lead";

enum ScaleType {
    Major = "major",
    Minor = "minor",
    Blues = "blues"
}

enum Instrument {
    Sine = "sine",
    Bass = "bass",
    LowDrums = "low_drums",
    HighDrums = "high_drums",
    Flute = "flute",
    Pads = "pads",
    Lead = "lead",
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
    private rootNote: string = "C";
    private convolver: ConvolverNode;
    private masterGain: GainNode;
    private wetGain: GainNode;
    private dryGain: GainNode;
    private reverbAmount: number = 0.3;
    private volumeAmount: number = 0.1;
    private pannerPool: PannerNode[] = [];
    private compressor: DynamicsCompressorNode;

    private instruments = new Map<Instrument, InstrumentAPI>();
    private arpStates: Map<FacePosition, { order: [Cell, number][] }> = new Map();

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

        const instrumentCtx: InstrumentContext = {
            audio: this.audioContext,
            dry: this.dryGain,
            wet: this.wetGain,
            convolver: this.convolver,
            pannerForFace: (fp: number) => this.getPannerNode(fp as FacePosition),
        };
        this.instruments.set(Instrument.Bass, new BassInstrument(instrumentCtx));
        this.instruments.set(Instrument.Sine, new SineInstrument(instrumentCtx));
        this.instruments.set(Instrument.LowDrums, new LowDrumsInstrument(instrumentCtx));
        this.instruments.set(Instrument.HighDrums, new HighDrumsInstrument(instrumentCtx));
        this.instruments.set(Instrument.Flute, new FluteInstrument(instrumentCtx));
        this.instruments.set(Instrument.Pads, new PadsInstrument(instrumentCtx));
        this.instruments.set(Instrument.Lead, new LeadInstrument(instrumentCtx));

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
            [FacePosition.BOTTOM, 24],  // C1 - Bass register
            [FacePosition.LEFT, 36],    // C2 - Low drums
            [FacePosition.FRONT, 48],   // C3 - Flute/Lead mid-range
            [FacePosition.BACK, 60],    // C4 - Pads (middle C)
            [FacePosition.RIGHT, 72],   // C5 - High drums
            [FacePosition.TOP, 84],     // C6 - Sine high register
        ]);

        const faceProperties = new Map<FacePosition, FaceProperties>();
        const instrumentMap = new Map<FacePosition, Instrument>([
            [FacePosition.BOTTOM, Instrument.Bass],
            [FacePosition.TOP, Instrument.Sine],
            [FacePosition.FRONT, Instrument.Flute],
            [FacePosition.BACK, Instrument.Pads],
            [FacePosition.LEFT, Instrument.LowDrums],
            [FacePosition.RIGHT, Instrument.HighDrums],
        ]);

        basePitches.forEach((basePitch, facePosition) => {
            const instrument = instrumentMap.get(facePosition) ?? Instrument.Sine;
            faceProperties.set(facePosition, {
                muted: false,
                instrument,
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

            const octaveOffset = Math.floor((this.liquiprism.size - 1 - row) / 2) * 12;
            const scaleBase = basePitch + octaveOffset;

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

    private getNotes(note_candidates: [Cell, number][], maxNotes?: number): [Cell, number][] {
        const candidates = [...note_candidates];

        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }

        const limit = maxNotes ?? this.noteThreshold;
        return candidates.slice(0, Math.min(limit, candidates.length));
    }

    private sonifyFace(face: Face, facePosition: FacePosition, pitchGrid: number[][]): void {
        const properties = this.faceProperties.get(facePosition);
        if (!properties) return;

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

        // Build or update arpeggiator order for this face
        const prevState = this.arpStates.get(facePosition);
        const sortedByPitch = [...note_candidates].sort((a, b) => a[1] - b[1]).slice(0, 5); // Limit to 5 notes
        const sameOrder = (a: [Cell, number][], b: [Cell, number][]) => {
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) if (a[i][1] !== b[i][1]) return false;
            return true;
        };

        if (!prevState || !sameOrder(prevState.order, sortedByPitch)) {
            // reset arp state for this face
            this.arpStates.set(facePosition, { order: sortedByPitch });
        } else if (prevState) {
            // keep existing order
            this.arpStates.set(facePosition, prevState);
        }

        const instr = this.faceProperties.get(facePosition)?.instrument ?? Instrument.Sine;
        const dur = this.getDuration(instr);

        if (instr === Instrument.Sine) {
            const state = this.arpStates.get(facePosition);
            if (!state || state.order.length === 0) return;

            // Randomly select arp mode for this arpeggio
            const arpModes: ("up" | "down" | "updown" | "random")[] = ["up", "down", "updown", "random"];
            const randomArpMode = arpModes[Math.floor(Math.random() * arpModes.length)];

            // Create the sequence based on randomly selected arp mode
            let sequence: number[] = [];
            if (randomArpMode === "up") {
                sequence = state.order.map((_, i) => i);
            } else if (randomArpMode === "down") {
                sequence = state.order.map((_, i) => state.order.length - 1 - i);
            } else if (randomArpMode === "updown") {
                sequence = state.order.map((_, i) => i);
                if (state.order.length > 1) {
                    // Add reverse sequence (excluding first and last to avoid duplication)
                    for (let i = state.order.length - 2; i > 0; i--) {
                        sequence.push(i);
                    }
                }
            } else { // random
                // Create a shuffled sequence of indices
                sequence = state.order.map((_, i) => i);
                // Fisher-Yates shuffle algorithm
                for (let i = sequence.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [sequence[i], sequence[j]] = [sequence[j], sequence[i]];
                }
            }

            // Calculate stepDuration based on liquiprism step_time divided by sequence length
            const stepTimeMs = this.liquiprism.step_time; // in milliseconds
            const stepDuration = (stepTimeMs / 1000) * 0.8; // Convert to seconds, use 80% of step time
            const noteDelay = sequence.length > 1 ? stepDuration / sequence.length : 0;

            // Schedule all notes in the sequence with delays
            sequence.forEach((orderIdx, seqIdx) => {
                const [, pitch] = state.order[orderIdx];
                const freq = this.midiToFrequency(pitch);
                const delay = seqIdx * noteDelay;

                // Schedule the note to start after the delay
                setTimeout(() => {
                    this.instruments.get(instr)?.noteOn(facePosition, freq, { duration: dur });
                }, delay * 1000); // Convert to milliseconds
            });

            return;
        }

        // Handle drum instruments (they don't use pitch information)
        if (instr === Instrument.LowDrums || instr === Instrument.HighDrums) {
            const notes = this.getNotes(note_candidates);
            notes.forEach(([cell, pitch]) => {
                // For drums, we pass frequency but the instrument ignores it and generates its own sounds
                const freq = this.midiToFrequency(pitch);
                this.instruments.get(instr)?.noteOn(facePosition, freq, {
                    duration: dur,
                    stepTime: this.liquiprism.step_time
                });
            });
            return;
        }

        // Handle Flute instrument with chord/arpeggio modes
        if (instr === Instrument.Flute) {
            const notes = this.getNotes(note_candidates, 6); // Maximum 6 notes for flute
            if (notes.length > 0) {
                const frequencies = notes.map(([cell, pitch]) => this.midiToFrequency(pitch));
                // Use first frequency as main freq, pass all as frequencies array
                this.instruments.get(instr)?.noteOn(facePosition, frequencies[0], {
                    duration: dur,
                    stepTime: this.liquiprism.step_time,
                    frequencies: frequencies
                });
            }
            return;
        }

        // Handle Lead instrument with melody generation
        if (instr === Instrument.Lead) {
            const notes = this.getNotes(note_candidates);
            if (notes.length > 0) {
                const frequencies = notes.map(([cell, pitch]) => this.midiToFrequency(pitch));
                // Use first frequency as main freq, pass all as frequencies array
                this.instruments.get(instr)?.noteOn(facePosition, frequencies[0], {
                    duration: dur,
                    stepTime: this.liquiprism.step_time,
                    frequencies: frequencies
                });
            }
            return;
        }

        // Handle Bass instrument with groovy monophonic patterns
        if (instr === Instrument.Bass) {
            const notes = this.getNotes(note_candidates);
            if (notes.length > 0) {
                const frequencies = notes.map(([cell, pitch]) => this.midiToFrequency(pitch));
                // Use first frequency as main freq, pass all as frequencies array
                this.instruments.get(instr)?.noteOn(facePosition, frequencies[0], {
                    duration: dur,
                    stepTime: this.liquiprism.step_time,
                    frequencies: frequencies
                });
            }
            return;
        }

        // default polyphonic behavior for other instruments
        const notes = this.getNotes(note_candidates);
        notes.forEach(([cell, pitch]) => {
            const freq = this.midiToFrequency(pitch);
            this.instruments.get(instr)?.noteOn(facePosition, freq, { duration: dur });
        });
    }

    public stopAll(immediate: boolean = true): void {
        const now = this.audioContext.currentTime;
        try {
            this.masterGain.gain.cancelScheduledValues(now);
            if (immediate) {
                this.masterGain.gain.setValueAtTime(0.0001, now);
            } else {
                this.masterGain.gain.setTargetAtTime(0.0001, now, 0.05);
            }
        } catch { }



        // Clear any remaining oscillators
        try {
            for (const [, faceMap] of this.oscillators) {
                for (const [, node] of faceMap) {
                    try { (node as OscillatorNode | AudioBufferSourceNode).stop(); } catch { }
                }
                faceMap.clear();
            }
        } catch { }

        // Clear arpeggiator states
        this.arpStates.clear();
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

    private getDuration(instrument: Instrument): number {
        return {
            [Instrument.Sine]: 0.5,
            [Instrument.Bass]: 0.6,
            [Instrument.LowDrums]: 0.3,
            [Instrument.HighDrums]: 0.2,
            [Instrument.Flute]: 0.8,
            [Instrument.Pads]: 2.0,
            [Instrument.Lead]: 0.7
        }[instrument];
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

                // Clear arpeggiator state for this face
                this.arpStates.delete(facePosition);
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

    public setFaceInstrument(facePosition: FacePosition, instrument: Instrument): void {
        facePosition = FacePosition[facePosition as unknown as keyof typeof FacePosition];
        const properties = this.faceProperties.get(facePosition);
        if (properties) {
            properties.instrument = instrument;
            this.updateLegendSonifier();
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

    public setKey(key: string): void {
        this.rootNote = key;
        // Regenerate pitch grids for all faces with the new key
        this.regeneratePitchGrids();
    }

    public setScale(scale: string): void {
        this.scaleType = scale as ScaleType;
        // Regenerate pitch grids for all faces with the new scale
        this.regeneratePitchGrids();
    }

    private regeneratePitchGrids(): void {
        // Regenerate pitch grids for all faces with new key/scale
        Object.values(FacePosition).forEach((facePosition) => {
            const properties = this.faceProperties.get(facePosition as FacePosition);
            if (properties) {
                const basePitch = this.getBasePitchForFace(facePosition as FacePosition);
                properties.pitchGrid = this.createPitchGrid(basePitch);
            }
        });
        this.update();
    } private getBasePitchForFace(facePosition: FacePosition): number {
        // Convert root note to MIDI note number
        const noteToMidi: Record<string, number> = {
            "C": 60, "C#": 61, "D": 62, "D#": 63, "E": 64, "F": 65,
            "F#": 66, "G": 55, "G#": 56, "A": 57, "A#": 58, "B": 59
        };

        const rootMidi = noteToMidi[this.rootNote] || 60; // Default to C4 if unknown key

        // Apply octave offset based on face position (same as original logic)
        const octaveOffsets: Record<FacePosition, number> = {
            [FacePosition.FRONT]: -12,
            [FacePosition.BACK]: 0,
            [FacePosition.LEFT]: -24,
            [FacePosition.RIGHT]: 12,
            [FacePosition.TOP]: 24,
            [FacePosition.BOTTOM]: -36
        };

        return rootMidi + (octaveOffsets[facePosition] || 0);
    }

}

export { Sonifier, Instrument };