import * as THREE from "three";

export interface ThreeInstance {
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    renderer: THREE.WebGLRenderer;
    container: HTMLElement;
    d: number;
}

export function setupThree(containerId: string): ThreeInstance {
    const container = document.getElementById(containerId);
    if (!container) {
        throw new Error("Container not found");
    }

    const aspect = container.clientWidth / container.clientHeight;
    const d = 7;
    const camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 0.1, 1000);
    camera.position.set(10, 10, 10);
    camera.lookAt(new THREE.Vector3(0, 0, 0));

    const scene = new THREE.Scene();

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    return { scene, camera, renderer, container, d };
}