export interface InstrumentVoice {
    start?(time: number): void;
    stop?(time?: number): void;
}

export interface InstrumentContext {
    audio: AudioContext;
    dry: GainNode;
    wet: GainNode;
    convolver: ConvolverNode;
    pannerForFace(facePosition: number): PannerNode;
}

export interface InstrumentAPI {
    noteOn(facePosition: number, freq: number, opts?: { duration?: number, stepTime?: number, frequencies?: number[] }): void;
    noteOff?(facePosition: number, immediate?: boolean): void;
}
