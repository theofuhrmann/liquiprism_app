import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Liquiprism, FacePosition } from '../src/scripts/liquiprism';

// Helpers
function makePrism(size = 3) {
    const lp = new Liquiprism(size, false);
    // determinism: clear randomness in initial grid
    for (const face of lp.faces) {
        for (const cell of face.cells) {
            cell.isAlive = false;
            cell.willBeAlive = null;
            cell.stimulated = false;
        }
    }
    lp.activity = 0;
    lp.stepCounter = 0;
    lp.frontmostFace = lp.getFace(FacePosition.FRONT); // default
    return lp;
}

function coords(size: number) {
    const arr: [number, number][] = [];
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) arr.push([i, j]);
    }
    return arr;
}

describe('Neighbor retrieval', () => {
    it('returns 8 neighbors for a center cell on same face', () => {
        const size = 5;
        const lp = makePrism(size);
        const face = lp.getFace(FacePosition.FRONT);
        const cell = face.getCell([2, 2]);
        const neighbors = lp.getCellNeighbors(face, cell);
        expect(neighbors.length).toBe(8);
    });

    it('wraps to adjacent faces for edge neighbors (corner may have 7)', () => {
        const size = 3;
        const lp = makePrism(size);
        const face = lp.getFace(FacePosition.FRONT);

        // Top-left corner (0,0) should look to TOP and LEFT faces for out-of-bounds
        const corner = face.getCell([0, 0]);
        const neighbors = lp.getCellNeighbors(face, corner);
        // Current implementation does not include diagonal across two faces,
        // so a corner will have 7 neighbors.
        expect(neighbors.length).toBe(7);
    });

    it('getBellowCellNeighbor returns next row or bottom face first row', () => {
        const size = 4;
        const lp = makePrism(size);
        const face = lp.getFace(FacePosition.FRONT);

        let cell = face.getCell([1, 2]);
        let below = lp.getBellowCellNeighbor(face, cell);
        expect(below.position).toEqual([2, 2]);

        cell = face.getCell([size - 1, 2]);
        below = lp.getBellowCellNeighbor(face, cell);
        const bottomFace = lp.getFace(lp.faceMap.get(FacePosition.FRONT)!.get(1 /* BOTTOM */)!);
        expect(below.face).toBe(bottomFace);
        expect(below.position).toEqual([0, 2]);
    });
});

describe('Rules: conventional', () => {
    beforeEach(() => vi.restoreAllMocks());

    it('alive cell survives with 2 or 3 neighbors; dies otherwise (conventional)', () => {
        const lp = makePrism(3);
        const face = lp.getFace(FacePosition.RIGHT);
        const c = face.getCell([1, 1]);
        c.isAlive = true;
        // Force conventional rule path
        lp.activity = lp.CELL_STATE_CHANGE_THRESHOLD + 1;

        // Set exactly 2 alive neighbors
        const neighbors = lp.getCellNeighbors(face, c);
        neighbors.forEach(n => (n.isAlive = false));
        neighbors[0].isAlive = true;
        neighbors[1].isAlive = true;

        lp.applyRules(face, c);
        expect(c.willBeAlive).toBe(true);

        // Now 3 alive neighbors
        neighbors[2].isAlive = true;
        lp.applyRules(face, c);
        expect(c.willBeAlive).toBe(true);

        // 1 neighbor only
        neighbors.forEach(n => (n.isAlive = false));
        neighbors[0].isAlive = true;
        lp.applyRules(face, c);
        expect(c.willBeAlive).toBe(false);

        // 4 neighbors -> dies in conventional
        neighbors.forEach(n => (n.isAlive = false));
        neighbors.slice(0, 4).forEach(n => (n.isAlive = true));
        lp.applyRules(face, c);
        expect(c.willBeAlive).toBe(false);
    });

    it('dead cell is born with >=4 neighbors (conventional)', () => {
        const lp = makePrism(3);
        const face = lp.getFace(FacePosition.LEFT);
        const c = face.getCell([1, 1]);
        c.isAlive = false;
        // Force conventional rule path
        lp.activity = lp.CELL_STATE_CHANGE_THRESHOLD + 1;

        const neighbors = lp.getCellNeighbors(face, c);
        neighbors.forEach(n => (n.isAlive = false));

        // 3 neighbors -> stays dead
        neighbors.slice(0, 3).forEach(n => (n.isAlive = true));
        lp.applyRules(face, c);
        expect(c.willBeAlive).toBe(false);

        // 4 neighbors -> born
        neighbors[3].isAlive = true;
        lp.applyRules(face, c);
        expect(c.willBeAlive).toBe(true);
    });
});

describe('Rules: stochastic', () => {
    beforeEach(() => vi.restoreAllMocks());

    it('alive cell follows same survival as conventional', () => {
        const lp = makePrism(3);
        lp.activity = 0; // ensures stochastic path would be taken when not frontmost
        const face = lp.getFace(FacePosition.BACK);
        const c = face.getCell([1, 1]);
        c.isAlive = true;

        const neighbors = lp.getCellNeighbors(face, c);
        neighbors.forEach(n => (n.isAlive = false));

        // 2 neighbors -> survive
        neighbors[0].isAlive = true;
        neighbors[1].isAlive = true;
        // Force applyRules to pick stochastic by reducing threshold high and ensure not frontmost
        lp.frontmostFace = lp.getFace(FacePosition.FRONT);
        lp.CELL_STATE_CHANGE_THRESHOLD = 9999;
        lp.applyRules(face, c);
        expect(c.willBeAlive).toBe(true);

        // 1 neighbor -> die
        neighbors[1].isAlive = false;
        lp.applyRules(face, c);
        expect(c.willBeAlive).toBe(false);
    });

    it('dead cell can be born based on below neighbor and randomness (1/3)', () => {
        const lp = makePrism(3);
        const face = lp.getFace(FacePosition.TOP);
        const c = face.getCell([1, 1]);
        c.isAlive = false;

        // Ensure path: use stochastic rule
        lp.frontmostFace = lp.getFace(FacePosition.FRONT);
        lp.CELL_STATE_CHANGE_THRESHOLD = 9999;

        // Below neighbor alive
        const below = lp.getBellowCellNeighbor(face, c);
        below.isAlive = true;

        // Control randomness: first call < 1/3, second >= 1/3
        const rand = vi.spyOn(Math, 'random');
        rand.mockReturnValueOnce(0.2).mockReturnValueOnce(0.5);

        lp.applyRules(face, c);
        expect(c.willBeAlive).toBe(true);

        // Try again with value >= 1/3
        c.willBeAlive = null;
        lp.applyRules(face, c);
        expect(c.willBeAlive).toBe(false);
    });
});

describe('Rules: stimulus (frontmost face)', () => {
    beforeEach(() => vi.restoreAllMocks());

    it('activates dead cell with given probability on frontmost face', () => {
        const lp = makePrism(3);
        const face = lp.getFace(FacePosition.RIGHT);
        lp.frontmostFace = face; // make it frontmost so stimulus rule applies

        const c = face.getCell([0, 0]);
        c.isAlive = false;

        const r = vi.spyOn(Math, 'random');
        // With activationProbability default 0.2, a value 0.1 should activate
        r.mockReturnValueOnce(0.1);

        lp.applyRules(face, c);
        expect(c.willBeAlive).toBe(true);

        // Next time with 0.9 should stay dead
        c.willBeAlive = null;
        r.mockReturnValueOnce(0.9);
        lp.applyRules(face, c);
        expect(c.willBeAlive).toBe(false);
    });

    it('keeps alive cells alive on frontmost face', () => {
        const lp = makePrism(3);
        const face = lp.getFace(FacePosition.FRONT);
        lp.frontmostFace = face;

        const c = face.getCell([2, 2]);
        c.isAlive = true;

        const r = vi.spyOn(Math, 'random');
        r.mockReturnValueOnce(0.99); // irrelevant when already alive

        lp.applyRules(face, c);
        expect(c.willBeAlive).toBe(true);
    });
});


describe('Corner behavior', () => {
    it('corner cells have 7 neighbors (no cross-corner across two faces)', () => {
        const size = 3;
        const lp = makePrism(size);
        const faces = [
            FacePosition.FRONT,
            FacePosition.BACK,
            FacePosition.LEFT,
            FacePosition.RIGHT,
            FacePosition.TOP,
            FacePosition.BOTTOM,
        ];

        for (const pos of faces) {
            const f = lp.getFace(pos);
            const corners: [number, number][] = [
                [0, 0],
                [0, size - 1],
                [size - 1, 0],
                [size - 1, size - 1],
            ];
            for (const cPos of corners) {
                const cell = f.getCell(cPos);
                const neighbors = lp.getCellNeighbors(f, cell);
                expect(neighbors.length).toBe(7);
            }
        }
    });

    it('conventional rule applies correctly for a corner cell', () => {
        const size = 3;
        const lp = makePrism(size);
        // Use a non-frontmost face to ensure we don't use stimulus rule
        const face = lp.getFace(FacePosition.RIGHT);
        lp.frontmostFace = lp.getFace(FacePosition.FRONT);
        const cell = face.getCell([0, 0]); // corner
        cell.isAlive = false;

        // Make 4 neighbors alive around this corner across faces
        const neighbors = lp.getCellNeighbors(face, cell);
        neighbors.forEach(n => (n.isAlive = false));
        neighbors.slice(0, 4).forEach(n => (n.isAlive = true));

        // Force conventional rule: set activity beyond threshold
        lp.activity = lp.CELL_STATE_CHANGE_THRESHOLD + 1;

        lp.applyRules(face, cell);
        expect(cell.willBeAlive).toBe(true);
    });
});
