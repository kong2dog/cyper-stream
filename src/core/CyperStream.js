import mpegts from "mpegts.js";
import Hls from "hls.js";
import { RenderEngine } from "./RenderEngine.js";
import { WorkerPool } from "./WorkerPool.js";
import { ControlBar } from "../ui/ControlBar.js";
// Import worker URL specifically for Vite
import WorkerScript from "../worker/main.worker.js?worker&url";

export class CyperStream {
  constructor(container, options = {}) {
    this.container =
      typeof container === "string"
        ? document.querySelector(container)
        : container;
    this.options = {
      autoPlay: true,
      bufferLength: 1, // seconds
      lowLatency: true,
      renderMode: "video", // 'video' or 'canvas'
      ...options,
    };

    this.player = null; // mpegts or hls instance
    this.videoElement = null;
    this.canvasElement = null;
    this.renderEngine = null;
    this.workerPool = null;
    this.ui = null;

    this.stats = {
      fps: 0,
      bitrate: 0,
      droppedFrames: 0,
    };

    this._initUI();
    this._initWorkerPool();
  }

  _initUI() {
    // Create Wrapper
    this.wrapper = document.createElement("div");
    this.wrapper.className =
      "cyper-stream-wrapper relative w-full h-full bg-black overflow-hidden group";
    this.container.appendChild(this.wrapper);

    // Video Element (Hidden if canvas mode, or visible)
    this.videoElement = document.createElement("video");
    this.videoElement.className = "w-full h-full object-contain";
    this.videoElement.playsInline = true;
    this.videoElement.muted = true; // Auto-play policy often requires muted
    this.wrapper.appendChild(this.videoElement);

    // Canvas Element (Absolute top)
    this.canvasElement = document.createElement("canvas");
    this.canvasElement.className =
      "absolute top-0 left-0 w-full h-full object-contain pointer-events-none hidden";
    this.wrapper.appendChild(this.canvasElement);

    // Initialize Render Engine
    this.renderEngine = new RenderEngine(this.videoElement, this.canvasElement);

    // Initialize UI Controls
    this.ui = new ControlBar(this);

    // Set initial render mode
    this.setRenderMode(this.options.renderMode);
  }

  _initWorkerPool() {
    // Initialize worker pool with the worker script
    this.workerPool = new WorkerPool(WorkerScript);
    this.workerPool.init();
  }

  load(url) {
    this.url = url;
    const ext = url.split(".").pop().split("?")[0].toLowerCase();

    if (this.player) {
      this.destroy();
    }

    if (ext === "flv") {
      this._loadFlv(url);
    } else if (ext === "m3u8" || url.includes("hls")) {
      this._loadHls(url);
    } else {
      console.warn("Unknown format, trying native");
      this.videoElement.src = url;
    }
  }

  _loadFlv(url) {
    if (mpegts.getFeatureList().mseLivePlayback) {
      console.log("FLV supported", url);
      this.player = mpegts.createPlayer(
        {
          type: "flv",
          isLive: true,
          url: url,
          hasAudio: false,
          hasVideo: true,
        },
        {
          enableWorker: true, // Use mpegts internal worker
          lazyLoad: false,
          stashInitialSize: 128,
          enableStashBuffer: !this.options.lowLatency,
          liveBufferLatencyChasing: this.options.lowLatency,
          liveBufferLatencyMaxLatency: this.options.bufferLength * 2,
          liveBufferLatencyMinRemain: this.options.bufferLength,
        }
      );

      this.player.attachMediaElement(this.videoElement);
      this.player.load();

      if (this.options.autoPlay) {
        this.play();
      }

      this.player.on(mpegts.Events.ERROR, (e) => {
        console.error("Mpegts Error", e);
      });
    }
  }

  _loadHls(url) {
    if (Hls.isSupported()) {
      this.player = new Hls({
        enableWorker: true,
        lowLatencyMode: this.options.lowLatency,
        backBufferLength: 90,
      });
      this.player.loadSource(url);
      this.player.attachMedia(this.videoElement);
      this.player.on(Hls.Events.MANIFEST_PARSED, () => {
        if (this.options.autoPlay) this.play();
      });
    } else if (this.videoElement.canPlayType("application/vnd.apple.mpegurl")) {
      this.videoElement.src = url;
    }
  }

  play() {
    this.videoElement.play().catch((e) => console.error("Play failed", e));
    if (this.options.renderMode === "canvas") {
      this.renderEngine.start();
    }
  }

  pause() {
    this.videoElement.pause();
    this.renderEngine.stop();
  }

  setRenderMode(mode) {
    this.options.renderMode = mode;
    if (mode === "canvas") {
      this.videoElement.classList.add("invisible");
      this.canvasElement.classList.remove("hidden");
      this.renderEngine.start();
    } else {
      this.videoElement.classList.remove("invisible");
      this.canvasElement.classList.add("hidden");
      this.renderEngine.stop();
    }
  }

  setVolume(value) {
    this.videoElement.volume = value;
    this.videoElement.muted = value === 0;
  }

  destroy() {
    if (this.player) {
      if (this.player.destroy) this.player.destroy(); // mpegts
      if (this.player.destroy) this.player.destroy(); // hls (same method name usually)
      this.player = null;
    }
    this.renderEngine.stop();
    this.workerPool.terminate();
  }

  // Example of using the worker pool
  calculateJitter() {
    // Collect buffer info from player (if available) and send to worker
    // This is just a simulation of the flow
    if (this.player && this.player.statisticsInfo) {
      // mpegts stats
      // ...
    }

    // Mock task
    this.workerPool
      .runTask({ type: "CALCULATE_JITTER", payload: [0.1, 0.2, 0.1, 0.3] })
      .then((result) => {
        console.log("Jitter calculated in worker:", result);
      });
  }
}
