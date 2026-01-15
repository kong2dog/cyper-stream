import mpegts from "mpegts.js";
import Hls from "hls.js";
import { logger } from "../../utils/logger.js";

/**
 * 基于 Video 标签的渲染器 (封装 mpegts/hls)
 * @author kong2dog
 */
export class VideoRenderer {
  constructor(container, options) {
    this.container = container;
    this.options = options;
    this.videoElement = document.createElement("video");
    this.videoElement.controls = false;
    this.videoElement.autoplay = true;
    this.videoElement.muted = true;
    this.videoElement.style.width = "100%";
    this.videoElement.style.height = "100%";
    this.videoElement.style.objectFit = "contain";
    this.container.appendChild(this.videoElement);
    this.player = null;
  }

  load(url, type) {
    if (this.player) {
      this.destroyInternal();
    }

    logger.info(`VideoRenderer 正在加载: ${url} (${type})`);

    if (type === "flv") {
      if (mpegts.isSupported()) {
        // Audio Codec 7 is G.711 A-law (PCMA), mpegts.js often needs specific config to support non-AAC/MP3
        // Or if it's strictly not supported by MSE, we might need to disable audio or transcode.
        // However, G.711 support in mpegts.js usually requires enabling it in config if supported,
        // or it might be unsupported by the browser's MSE implementation.
        // Common fix for surveillance streams (often G.711): Ignore audio if not critical, or try to configure.
        // But G.711 is not standard in FLV for web (AAC is standard).
        // mpegts.js doesn't natively support G.711 decoding to PCM for MSE unless extended.
        // For now, let's try to handle the error or disable audio if it fails.

        // Better approach: Catch the specific error and retry without audio?
        // Or just configure it to ignore audio if that's acceptable?
        // The error "Unsupported audio codec idx: 7" comes from mpegts.js demuxer.
        // Codec ID 7 is G.711 A-law.
        // Browser MSE typically only supports AAC (10) or MP3 (2).

        // Strategy: Try to load with audio. If it fails with the specific codec error, reload with hasAudio: false.
        // Since mpegts.js throws this error during parsing, we might catch it in the error handler?
        // Actually, "DemuxException" usually stops the player.

        const config = {
          enableWorker: true,
          lazyLoadMaxDuration: 3 * 60,
          seekType: "range",
          liveBufferLatencyChasing: true,
        };

        this.createMpegtsPlayer(url, true, config);
      } else {
        logger.error("不支持 mpegts");
      }
    } else if (type === "hls") {
      if (Hls.isSupported()) {
        this.player = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
        });
        this.player.loadSource(url);
        this.player.attachMedia(this.videoElement);
        this.player.on(Hls.Events.MANIFEST_PARSED, () => {
          this.videoElement.play().catch((e) => logger.error("播放错误", e));
        });
      } else if (
        this.videoElement.canPlayType("application/vnd.apple.mpegurl")
      ) {
        this.videoElement.src = url;
        this.videoElement.play();
      }
    }
  }

  createMpegtsPlayer(url, hasAudio, config) {
    if (this.player) {
      this.destroyInternal();
    }

    this.player = mpegts.createPlayer(
      {
        type: "flv",
        url: url,
        isLive: true,
        hasAudio: hasAudio,
        hasVideo: true,
      },
      config
    );

    this.player.attachMediaElement(this.videoElement);

    this.player.on(mpegts.Events.ERROR, (type, details, data) => {
      logger.error("Mpegts Error", type, details, data);

      // Check for unsupported audio codec error
      // Error type: mpegts.ErrorTypes.MEDIA_ERROR
      // Details: mpegts.ErrorDetails.MEDIA_DECODE_ERROR
      // Info: "Flv: Unsupported audio codec idx: 7" or similar

      const isCodecError =
        (data &&
          data.info &&
          (data.info.includes("Unsupported audio codec") ||
            data.info.includes("CodecUnsupported"))) ||
        (data && data.message && data.message.includes("CodecUnsupported"));

      if (isCodecError && hasAudio) {
        logger.warn("检测到不支持的音频编码，尝试禁用音频重试...");
        // Retry without audio
        setTimeout(() => {
          this.createMpegtsPlayer(url, false, config);
        }, 100);
      }
    });

    this.player.load();
    this.player.play().catch((e) => logger.error("播放错误", e));
  }

  play() {
    this.videoElement.play();
  }

  pause() {
    this.videoElement.pause();
  }

  destroyInternal() {
    if (this.player) {
      if (this.player.destroy) {
        this.player.destroy();
      } else if (this.player.detachMedia) {
        this.player.detachMedia();
        this.player.destroy && this.player.destroy();
      }
      this.player = null;
    }
  }

  destroy() {
    this.destroyInternal();
    this.videoElement.remove();
  }
}
