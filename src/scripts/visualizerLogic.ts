import * as THREE from "three";
import { Liquiprism, FacePosition } from "./liquiprism.ts";

interface FaceMeshData {
    faceCellMeshes: THREE.Mesh[][];
    faceGroups: THREE.Group[];
}

export function createLiquiprismMeshes(
    liquiprism: Liquiprism,
    scene: THREE.Group,
    FACE_TINTS: Record<number, [number, number, number]>
): FaceMeshData {
    const faceCellMeshes: THREE.Mesh[][] = [];
    const faceGroups: THREE.Group[] = [];

    scene.clear();

    liquiprism.faces.forEach((face, fIdx) => {
        const faceGroup = new THREE.Group();
        scene.add(faceGroup);
        faceGroups.push(faceGroup);

        faceCellMeshes[fIdx] = [];
        const cellSize = 4 / liquiprism.faces[0].size;
        const [rTint, gTint, bTint] = FACE_TINTS[face.position];

        face.cells.forEach((cell, cIdx) => {
            const color = cell.isAlive
                ? new THREE.Color(rTint / 255, gTint / 255, bTint / 255)
                : 0x000000;

            const geometry = new THREE.BoxGeometry(cellSize, cellSize, 0);
            const material = new THREE.MeshBasicMaterial({ color });
            const mesh = new THREE.Mesh(geometry, material);

            const edges = new THREE.EdgesGeometry(geometry);
            const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
            const edgeLines = new THREE.LineSegments(edges, lineMaterial);
            mesh.add(edgeLines);

            const n = face.size;
            const x = (cIdx % n) - (n - 1) / 2;
            const y = Math.floor(cIdx / n) - (n - 1) / 2;
            mesh.position.set(x * cellSize, y * cellSize, 0);
            faceGroup.add(mesh);
            faceCellMeshes[fIdx].push(mesh);
        });

        const offset = (face.size * cellSize) / 2;
        switch (face.position) {
            case 0: // FRONT
                faceGroup.position.z = offset;
                break;
            case 1: // BACK
                faceGroup.rotation.y = Math.PI;
                faceGroup.position.z = -offset;
                break;
            case 2: // LEFT
                faceGroup.rotation.y = -Math.PI / 2;
                faceGroup.position.x = -offset;
                break;
            case 3: // RIGHT
                faceGroup.rotation.y = Math.PI / 2;
                faceGroup.position.x = offset;
                break;
            case 4: // TOP
                faceGroup.rotation.x = -Math.PI / 2;
                faceGroup.position.y = offset;
                break;
            case 5: // BOTTOM
                faceGroup.rotation.x = Math.PI / 2;
                faceGroup.position.y = -offset;
                break;
        }
    });

    return { faceCellMeshes, faceGroups };
}

const getFaceCenter = (faceMeshes: THREE.Mesh[]) => {
    const center = new THREE.Vector3();
    faceMeshes.forEach(mesh => {
        center.add(new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld));
    });
    return center.divideScalar(faceMeshes.length);
};

export function updateFrontmostFace(
    liquiprism: Liquiprism,
    faceCellMeshes: THREE.Mesh[][],
    liquiprismGroup: THREE.Group,
    camera: THREE.Camera
) {
    let minDot = Infinity;
    let frontmostFace = liquiprism.faces[0];

    liquiprism.faces.forEach((face) => {
        const faceCenter = getFaceCenter(faceCellMeshes[face.position]);
        const faceDirection = new THREE.Vector3()
            .subVectors(faceCenter, liquiprismGroup.position)
            .normalize();

        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);

        const dot = faceDirection.dot(cameraDirection);
        if (dot < minDot) {
            minDot = dot;
            frontmostFace = face;
        }
    });

    liquiprism.frontmostFace = frontmostFace;
}

export function updateRotation(keys: Record<string, boolean>, angle_x: number, angle_y: number, delta: number) {
    const rotationSpeed = 1;
    if (keys["ArrowUp"]) {
        angle_x -= rotationSpeed * delta;
    }
    if (keys["ArrowDown"]) {
        angle_x += rotationSpeed * delta;
    }
    if (keys["ArrowLeft"]) {
        angle_y -= rotationSpeed * delta;
    }
    if (keys["ArrowRight"]) {
        angle_y += rotationSpeed * delta;
    }
    return { angle_x, angle_y };
}

export function calculateFaceDepth(faceVertices: number[], transformedVertices: THREE.Vector3[]) {
    let depth = 0;
    faceVertices.forEach((vertexIndex) => {
        depth += transformedVertices[vertexIndex].z;
    });
    return depth / faceVertices.length;
}

export function updateCells(liquiprism: Liquiprism, faceCellMeshes: THREE.Mesh[][], FACE_TINTS: Record<number, [number, number, number]>) {
    const THREEColor = THREE.Color;
    liquiprism.faces.forEach((face, fIdx) => {
        const [rTint, gTint, bTint] = FACE_TINTS[face.position];
        const baseColor = new THREEColor(rTint / 255, gTint / 255, bTint / 255);

        face.cells.forEach((cell, cIdx) => {
            const mat = faceCellMeshes[fIdx][cIdx].material as THREE.MeshBasicMaterial;
            if (cell.isAlive) {
                const aliveColor = baseColor.clone().lerp(new THREEColor(1, 1, 1), 0.25);
                mat.color.copy(aliveColor);
            } else {
                const deadColor = baseColor.clone().lerp(new THREEColor(0, 0, 0), 0.75);
                mat.color.copy(deadColor);
            }
        });
    });
}

export function updateLegendVisualizer(liquiprism: Liquiprism, FACE_TINTS: Record<number, [number, number, number]>) {
    const legendData = liquiprism.faces.map(face => {
        const [rTint, gTint, bTint] = FACE_TINTS[face.position];
        return {
            position: FacePosition[face.position],
            color: `rgb(${rTint}, ${gTint}, ${bTint})`,
            updateRate: face.updateRate,
        };
    });
    const event = new CustomEvent("updateLegendVisualizer", { detail: { legendData } });
    document.dispatchEvent(event);
}

