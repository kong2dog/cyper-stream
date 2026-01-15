import { VideoRenderer } from "./render/video-renderer.js";
import { CanvasRenderer } from "./render/canvas-renderer.js";
import { Controls } from "../ui/controls.js";
import { logger } from "../utils/logger.js";

/**
 * CyperStream 主播放器类
 * @author kong2dog
 */
export class CyperStream {
  constructor(options) {
    this.options = Object.assign(
      {
        container: null,
        renderType: "video", // 'video' 或 'canvas'
        autoPlay: true,
        buffer: {
          maxTime: 60,
        },
      },
      options
    );

    if (!this.options.container) throw new Error("必须指定容器");

    this.container =
      typeof this.options.container === "string"
        ? document.querySelector(this.options.container)
        : this.options.container;

    this.renderer = null;
    this.controls = null;
    this.currentUrl = "";
    this.currentType = "flv";
    this.init();
  }

  init() {
    this.container.innerHTML = "";
    this.container.style.position = "relative";
    this.container.style.backgroundColor = "#000";
    this.container.style.overflow = "hidden";

    this.controls = new Controls(this);
  }

  load(url, type = "flv") {
    this.currentUrl = url;
    this.currentType = type;

    if (this.renderer) {
      this.renderer.destroy();
    }

    logger.info(
      `CyperStream 正在加载 ${url}，模式: ${this.options.renderType}`
    );

    if (this.options.renderType === "canvas") {
      this.renderer = new CanvasRenderer(this.container, this.options);
    } else {
      this.renderer = new VideoRenderer(this.container, this.options);
    }

    // 在控件之前插入渲染器 (z-index 处理)
    // 控件在 init() 中追加，所以渲染器应该前置插入或插入到 uiLayer 之前
    if (this.controls && this.controls.uiLayer) {
      // 渲染器追加到容器。
      // 我们需要确保控件保持在顶部。
      // VideoRenderer/CanvasRenderer 追加到容器。
      // 我们应该重新追加控件或确保 z-index 有效。
      // 因为它们是绝对定位的，如果渲染器是默认的 (0)，控件上的 z-index 10 就可以工作。
    }

    this.renderer.load(url, type);
  }

  play() {
    if (this.renderer && this.renderer.play) this.renderer.play();
  }

  pause() {
    if (this.renderer && this.renderer.pause) this.renderer.pause();
  }

  setVolume(value) {
    if (this.renderer && this.renderer.videoElement) {
      this.renderer.videoElement.volume = value;
      this.renderer.videoElement.muted = value === 0;
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      this.container.requestFullscreen().catch((err) => {
        logger.error(`尝试启用全屏时出错: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  }

  switchRenderMode(mode) {
    if (mode === this.options.renderType) return;
    this.options.renderType = mode;
    // 如果可能，重新加载当前流？
    // 我们需要存储当前 URL。
  }

  destroy() {
    if (this.renderer) this.renderer.destroy();
    this.container.innerHTML = "";
  }
}
