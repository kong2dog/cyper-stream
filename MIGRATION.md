# Migration Guide: Jessibuca to CyperStream

## Overview
This document details the migration of core business logic from `Jessibuca` to `CyperStream`. The codebase has been refactored to modularize components, improve readability, and adopt modern JavaScript practices.

## Directory Structure Changes

| Jessibuca Path | CyperStream Path | Description |
|Handler | Handler | Description |
|---|---|---|
| `src/jessibuca.js` | `src/core/CyperStream.js` | Main Entry Facade |
| `src/player/index.js` | `src/core/Player.js` | Core Player Logic |
| `src/player/*` | `src/core/player/*` | Player helpers (events, property, observer) |
| `src/video/*` | `src/core/video/*` | Video Rendering (Canvas/Video Element) |
| `src/audio/*` | `src/core/audio/*` | Audio Context & Decoding |
| `src/stream/*` | `src/core/stream/*` | Stream Loading (Fetch/WebSocket) |
| `src/demux/*` | `src/core/demux/*` | Demuxing Logic (FLV/M7S) |
| `src/decoder/*` | `src/core/decoder/*` | Decoding Logic (WASM/WebCodecs/MSE) |
| `src/remux/*` | `src/core/remux/*` | Remuxing Logic (MP4 Generation) |
| `src/worker/*` | `src/core/worker/*` | Web Worker Management |
| `src/utils/*` | `src/utils/*` | Shared Utilities |
| `src/constant/*` | `src/constant/*` | Constants |
| `src/control/*` | `src/core/control/*` | UI Controls (Stubbed/Simplified) |

## API Changes

### Class Name
- `Jessibuca` -> `CyperStream`

### Events
- Event constants `JESSIBUCA_EVENTS` renamed to `CYPER_EVENTS`.
- All internal events use the new `EVENTS` constant map in `src/constant/index.js`.

### Configuration
- `decoder` option default path: `decoder.js` (ensure this file is in your public/root directory).
- `container` option now supports CSS selector string or HTMLElement.

### New Features
- **Modular Architecture**: Components are strictly separated into `core/{module}`.
- **Enhanced Logging**: Debug logs now prefixed with `CS:` for CyperStream.
- **Stubbed Control**: The UI control layer has been decoupled. A basic stub is provided in `src/core/control/index.js`.

## Implementation Details

### Core Logic
The `Player` class (`src/core/Player.js`) serves as the central controller, orchestrating:
1.  **Stream Loading**: Via `Stream` (Fetch/WebSocket).
2.  **Demuxing**: Via `Demux` (FLV/M7S).
3.  **Decoding**:
    *   **WASM**: Via `DecoderWorker` (using `decoder.js` + `decoder.wasm`).
    *   **WebCodecs**: Via `WebcodecsDecoder`.
    *   **MSE**: Via `MseDecoder`.
4.  **Rendering**: Via `Video` (Canvas/Video Element).

### Audio
Audio handling (`src/core/audio`) uses `AudioContext` and `ScriptProcessorNode` for PCM playback, with support for AAC/ALAW/MULAW via WASM decoding.

### Recording
Recording (`src/core/recorder`) uses `RecordRTC` (migrated from `recordRTCLoader.js`) to capture the stream.

## Setup & Build

1.  **Install Dependencies**:
    ```bash
    pnpm install
    ```
2.  **Assets**:
    Ensure `decoder.js` and `decoder.wasm` are in the `public` folder.
3.  **Run**:
    ```bash
    pnpm dev
    ```

## Testing
- Run `pnpm dev` to start the demo.
- Verify FLV/HLS playback.
- Verify WASM decoding by forcing `useWCS: false, useMSE: false`.

