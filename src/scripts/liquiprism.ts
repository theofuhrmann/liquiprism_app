enum RelativeFacePosition {
    TOP = 0,
    BOTTOM = 1,
    LEFT = 2,
    RIGHT = 3
}

export enum FacePosition {
    FRONT = 0,
    BACK = 1,
    LEFT = 2,
    RIGHT = 3,
    TOP = 4,
    BOTTOM = 5
}

class Cell {
    face: Face;
    position: [number, number];
    isAlive: boolean;
    willBeAlive: boolean | null;
    stimulated: boolean;

    constructor(face: Face, position: [number, number], isAlive: boolean) {
        this.face = face;
        this.position = position;
        this.isAlive = isAlive;
        this.willBeAlive = null;
        this.stimulated = false;
    }

    isCellOnFaceEdge(): boolean {
        const [i, j] = this.position;
        return (
            i === 0 ||
            i === this.face.size - 1 ||
            j === 0 ||
            j === this.face.size - 1
        );
    }

    toString(): string {
        return `Cell(face=${this.face.position}, position=${this.position}, isAlive=${this.isAlive})`;
    }
}

export class Face {
    position: FacePosition;
    size: number;
    cells: Cell[];
    updateRate: number;

    constructor(position: FacePosition, size: number, updateRate: number = 1) {
        this.position = position;
        this.size = size;
        this.cells = this.initializeCells();
        this.updateRate = updateRate;
    }

    initializeCells(): Cell[] {
        const cells: Cell[] = [];
        for (let i = 0; i < this.size; i++) {
            for (let j = 0; j < this.size; j++) {
                cells.push(new Cell(this, [i, j], Math.random() < 0.5));
            }
        }
        return cells;
    }

    getCell(position: [number, number]): Cell {
        return this.cells[position[0] * this.size + position[1]];
    }

    toString(): string {
        return `Face(position=${this.position})`;
    }
}

export class Liquiprism {
    size: number;
    faces: Face[];
    faceMap: Map<FacePosition, Map<RelativeFacePosition, FacePosition>>;
    activity: number;
    CELL_STATE_CHANGE_THRESHOLD: number;
    stepCounter: number;
    frontmostFace: Face;
    random_update_rate: boolean;

    constructor(size: number, random_update_rate: boolean = false) {
        const facePositions: FacePosition[] = [
            FacePosition.FRONT,
            FacePosition.BACK,
            FacePosition.LEFT,
            FacePosition.RIGHT,
            FacePosition.TOP,
            FacePosition.BOTTOM
        ];
        this.size = size;
        this.random_update_rate = random_update_rate;
        this.faces = facePositions.map(position =>
            new Face(
                position,
                size,
                random_update_rate ? Math.floor(Math.random() * 3) + 1 : 1
            )
        );
        this.faceMap = this.initializeFaceMap();
        this.activity = 0;
        this.CELL_STATE_CHANGE_THRESHOLD = size ** 2;
        this.stepCounter = 0;
        this.frontmostFace = this.faces[0];
    }

    initializeFaceMap(): Map<FacePosition, Map<RelativeFacePosition, FacePosition>> {
        const faceMap = new Map();
        faceMap.set(FacePosition.FRONT, new Map([
            [RelativeFacePosition.TOP, FacePosition.TOP],
            [RelativeFacePosition.BOTTOM, FacePosition.BOTTOM],
            [RelativeFacePosition.LEFT, FacePosition.LEFT],
            [RelativeFacePosition.RIGHT, FacePosition.RIGHT]
        ]));
        faceMap.set(FacePosition.BACK, new Map([
            [RelativeFacePosition.TOP, FacePosition.TOP],
            [RelativeFacePosition.BOTTOM, FacePosition.BOTTOM],
            [RelativeFacePosition.LEFT, FacePosition.RIGHT],
            [RelativeFacePosition.RIGHT, FacePosition.LEFT]
        ]));
        faceMap.set(FacePosition.LEFT, new Map([
            [RelativeFacePosition.TOP, FacePosition.TOP],
            [RelativeFacePosition.BOTTOM, FacePosition.BOTTOM],
            [RelativeFacePosition.LEFT, FacePosition.BACK],
            [RelativeFacePosition.RIGHT, FacePosition.FRONT]
        ]));
        faceMap.set(FacePosition.RIGHT, new Map([
            [RelativeFacePosition.TOP, FacePosition.TOP],
            [RelativeFacePosition.BOTTOM, FacePosition.BOTTOM],
            [RelativeFacePosition.LEFT, FacePosition.FRONT],
            [RelativeFacePosition.RIGHT, FacePosition.BACK]
        ]));
        faceMap.set(FacePosition.TOP, new Map([
            [RelativeFacePosition.TOP, FacePosition.BACK],
            [RelativeFacePosition.BOTTOM, FacePosition.FRONT],
            [RelativeFacePosition.LEFT, FacePosition.LEFT],
            [RelativeFacePosition.RIGHT, FacePosition.RIGHT]
        ]));
        faceMap.set(FacePosition.BOTTOM, new Map([
            [RelativeFacePosition.TOP, FacePosition.FRONT],
            [RelativeFacePosition.BOTTOM, FacePosition.BACK],
            [RelativeFacePosition.LEFT, FacePosition.LEFT],
            [RelativeFacePosition.RIGHT, FacePosition.RIGHT]
        ]));
        return faceMap;
    }

    getFace(facePosition: FacePosition): Face {
        return this.faces.find(face => face.position === facePosition)!;
    }

    getCellNeighbors(face: Face, cell: Cell): Cell[] {
        const [i, j] = cell.position;
        const neighbors: Cell[] = [];

        for (let iOffset = -1; iOffset <= 1; iOffset++) {
            for (let jOffset = -1; jOffset <= 1; jOffset++) {
                if (iOffset === 0 && jOffset === 0) continue;
                const ni = i + iOffset;
                const nj = j + jOffset;
                if (0 <= ni && ni < face.size && 0 <= nj && nj < face.size) {
                    neighbors.push(face.getCell([ni, nj]));
                } else {
                    neighbors.push(...this.getAdjacentFaceCellNeighbors(face, cell, iOffset, jOffset));
                }
            }
        }

        return neighbors;
    }

    getBellowCellNeighbor(face: Face, cell: Cell): Cell {
        const [i, j] = cell.position;
        if (i === face.size - 1) {
            const neighborFace = this.getFace(this.faceMap.get(face.position)!.get(RelativeFacePosition.BOTTOM)!);
            return neighborFace.getCell([0, j]);
        }

        return face.getCell([i + 1, j]);
    }

    getAdjacentFaceCellNeighbors(face: Face, cell: Cell, iOffset: number, jOffset: number): Cell[] {
        const neighbors: Cell[] = [];
        const [i, j] = cell.position;
        let ni = i + iOffset;
        let nj = j + jOffset;

        let neighborFace = face;
        let nNeighborFaces = 0;

        if (ni < 0) {
            neighborFace = this.getFace(this.faceMap.get(face.position)!.get(RelativeFacePosition.TOP)!);
            ni = face.size - 1;
            nNeighborFaces++;
        } else if (ni >= face.size) {
            neighborFace = this.getFace(this.faceMap.get(face.position)!.get(RelativeFacePosition.BOTTOM)!);
            ni = 0;
            nNeighborFaces++;
        }

        if (nj < 0) {
            neighborFace = this.getFace(this.faceMap.get(face.position)!.get(RelativeFacePosition.LEFT)!);
            nj = face.size - 1;
            nNeighborFaces++;
        } else if (nj >= face.size) {
            neighborFace = this.getFace(this.faceMap.get(face.position)!.get(RelativeFacePosition.RIGHT)!);
            nj = 0;
            nNeighborFaces++;
        }

        if (nNeighborFaces === 1) {
            neighbors.push(neighborFace.getCell([ni, nj]));
        }

        return neighbors;
    }

    step(): void {
        this.activity = 0;

        for (const face of this.faces) {
            if (this.stepCounter % face.updateRate === 0) {
                for (const cell of face.cells) {
                    this.applyRules(face, cell);
                }
            }
        }

        for (const face of this.faces) {
            if (this.stepCounter % face.updateRate === 0) {
                for (const cell of face.cells) {
                    cell.isAlive = cell.willBeAlive!;
                    cell.willBeAlive = null;
                }
            }
        }

        this.stepCounter++;
    }

    applyRules(face: Face, cell: Cell): void {
        if (this.frontmostFace === face) {
            cell.willBeAlive = this.applyStimulusRule(cell);
        } else {
            const neighbors = this.getCellNeighbors(face, cell);
            const aliveNeighbors = neighbors.filter(neighbor => neighbor.isAlive).length;

            if (this.activity < this.CELL_STATE_CHANGE_THRESHOLD) {
                cell.willBeAlive = this.applyStochasticRule(cell, aliveNeighbors);
            } else {
                cell.willBeAlive = this.applyConventionalRule(cell, aliveNeighbors);
            }
        }

        cell.stimulated = cell.willBeAlive && !cell.isAlive;
        if (cell.stimulated) {
            this.activity++;
        }
    }

    applyConventionalRule(cell: Cell, aliveNeighbors: number): boolean {
        if (cell.isAlive) {
            return aliveNeighbors === 2 || aliveNeighbors === 3;
        }

        return aliveNeighbors >= 4;
    }

    applyStochasticRule(cell: Cell, aliveNeighbors: number): boolean {
        if (cell.isAlive) {
            return aliveNeighbors === 2 || aliveNeighbors === 3;
        }

        const bellowNeighbor = this.getBellowCellNeighbor(cell.face, cell);

        return bellowNeighbor.isAlive && Math.random() < 1 / 3;
    }

    applyStimulusRule(cell: Cell, activationProbability: number = 0.2): boolean {
        return cell.isAlive || Math.random() < activationProbability;
    }
}