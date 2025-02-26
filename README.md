# Liquiprism

Liquiprism is an experimental web application that uses cellular automata to generate polyrhythms and visualizations. It leverages [Astro](https://astro.build/) for its project framework, [Three.js](https://threejs.org/) for 3D rendering, and the Web Audio API for sound synthesis. 

The project is designed to provide a creative tool for musicians and composers to explore new sonic possibilities.

## Features

- **Cellular Automata**: Render dynamic, grid-based cellular automata on different faces.
- **3D Visualization**: Visualize the automata with interactive 3D views using Three.js (see [`src/components/Visualizer.astro`](src/components/Visualizer.astro), ).
- **Audio Sonification**: Generate polyrhythms and soundscapes based on the automata state (see [`src/scripts/sonifier.ts`](src/scripts/sonifier.ts)).
- **Interactivity**: Control animation, rotation, and sound properties through an intuitive sidebar (see [`src/components/Sidebar.astro`](src/components/Sidebar.astro)).

## Acknowledgments

Inspired by Dorin, Alan. "LiquiPrism: Generating polyrhythms with cellular automata." _Proceedings of the 2002 International Conference on Auditory Display, Kyoto, Japan, July 2._ Vol. 5. 2002.
