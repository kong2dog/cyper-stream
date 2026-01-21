import { createFetchStream } from "./stream/fetch";
// import { createWebsocketStream } from "./stream/websocket"; // Not implemented yet
import { createFlvDemuxer } from "./demux/flv";
// import { createM7sDemuxer } from "./demux/m7s"; // Not implemented yet
import { createScheduler } from "./scheduler";
import { createWebcodecsDecoder } from "./decoder/webcodecs";
import { createMseDecoder } from "./decoder/mediaSource";
import {
  EVENTS,
  EVENTS_ERROR,
  PLAYER_PLAY_PROTOCOL,
  DEMUX_TYPE,
  MEDIA_TYPE,
} from "../constant";
import { isMobile } from "../utils";

/**
 * Pipeline Orchestrator
 * Connects Stream -> Demux -> Scheduler -> Decoder -> Render
 * @param {Object} player - Player instance context
 * @returns {Object} - { start, stop, pause }
 */
export function createPipeline(player) {
  let stream = null;
  let demuxer = null;
  let scheduler = null;
  let videoDecoder = null;
  let audioDecoder = null; // Could be same as videoDecoder for MSE, or Worker

  const { _opt: options, debug } = player;

  const log = (tag, ...args) => {
    debug.log(tag, ...args);
  };

  const destroy = () => {
    if (stream) stream.abort();
    if (demuxer) demuxer.close();
    if (scheduler) scheduler.stop();
    if (videoDecoder) videoDecoder.destroy();
    // audioDecoder might be shared or external (worker), so handle carefully
    // If it's MSE, it's same instance.

    stream = null;
    demuxer = null;
    scheduler = null;
    videoDecoder = null;
    audioDecoder = null;
  };

  const start = (url) => {
    // 1. Create Decoder
    // Logic from Player.js to decide decoder
    let useWCS = options.useWCS;
    let useMSE = options.useMSE;

    // Video Decoder
    if (useWCS && !options.useOffscreen) {
      videoDecoder = createWebcodecsDecoder(
        {
          onOutput: ({ videoFrame, ts }) => {
            if (player.video) {
              player.video.render({ videoFrame, ts });
            } else {
              // close frame if no video renderer
              if (videoFrame.close) videoFrame.close();
            }
            player.updateStats({ fps: true, ts, buf: 0 });
          },
          onError: (type, e) => player.emitError(type, e),
          onLog: log,
        },
        {
          useVideoRender: options.wcsUseVideoRender,
        },
      );
    } else if (useMSE) {
      videoDecoder = createMseDecoder(
        {
          onError: (type, e) => player.emitError(type, e),
          onLog: log,
          onSourceOpen: () => player.emit(EVENTS.mseSourceOpen),
          onSourceClose: () => player.emit(EVENTS.mseSourceClose),
        },
        {
          videoElement: player.video.$videoElement,
          width: player.width,
          height: player.height,
        },
      );
    } else {
      // Worker Decoder (Soft decode or Offscreen)
      // We use player.decoderWorker
      videoDecoder = {
        decode: (packet) => {
          if (player.decoderWorker) {
            player.decoderWorker.decodeVideo(
              packet.payload,
              packet.ts,
              packet.isIFrame,
            );
          }
        },
        destroy: () => {},
      };
    }

    // 2. Create Scheduler
    scheduler = createScheduler(
      {
        videoBuffer: options.videoBuffer,
        videoBufferDelay: options.videoBufferDelay,
        useMSE: useMSE,
        isMseUpdating: () =>
          videoDecoder && videoDecoder.getSourceBufferUpdating
            ? videoDecoder.getSourceBufferUpdating()
            : false,
      },
      {
        onFrame: (packet) => {
          // Routing
          if (packet.type === MEDIA_TYPE.video) {
            if (videoDecoder) videoDecoder.decode(packet);
          } else if (packet.type === MEDIA_TYPE.audio) {
            // Audio Routing
            if (options.hasAudio) {
              // For MSE, audio might go to same decoder if we supported MP4 audio (AAC).
              // But CommonLoader sent audio to Worker for WCS mode.
              // And for MSE mode, CommonLoader sent audio to... where?
              // CommonLoader: if (type === MEDIA_TYPE.audio) player.decoderWorker.decodeAudio(...)
              // So Audio ALWAYS goes to Worker (except maybe G711a PCM).
              if (player.decoderWorker) {
                player.decoderWorker.decodeAudio(packet.payload, packet.ts);
              }
            }
          }
        },
      },
    );

    // 3. Create Demuxer
    const demuxCallbacks = {
      onPacket: (packet) => {
        // Push to scheduler
        // Note: CommonLoader pushed both Audio and Video to bufferList.
        scheduler.push(packet);
      },
      onStats: (stats) => {
        player.updateStats(stats);
      },
      onAudioInfo: (info) => {
        if (player.audio) {
          player.audio.updateAudioInfo(info);
        }
      },
      onLog: log,
    };

    // Choose Demuxer based on type
    if (options.demuxType === DEMUX_TYPE.flv) {
      demuxer = createFlvDemuxer(demuxCallbacks, {
        hasAudio: options.hasAudio,
        hasVideo: options.hasVideo,
      });
    } else {
      // M7S or others not refactored yet, fallback or error?
      // Assuming FLV for now as per task.
      // If needed we can wrap M7sLoader similarly.
      log("Pipeline", "Only FLV demux is fully refactored. M7S might fail.");
      // Fallback or just error
    }

    // 4. Create Stream
    const streamCallbacks = {
      onChunk: (chunk) => {
        if (demuxer) demuxer.push(chunk);
      },
      onSuccess: () => {
        player.emit(EVENTS.streamSuccess);
        // Start playing video
        if (player.video) player.video.play();
        // Start scheduler loop
        if (scheduler) scheduler.start();
      },
      onError: (type, msg) => {
        player.emitError(type, msg);
      },
      onStats: (bitrate) => {
        player.emit(EVENTS.kBps, (bitrate / 1000).toFixed(2));
      },
    };

    if (options.protocol === PLAYER_PLAY_PROTOCOL.fetch) {
      stream = createFetchStream(url, options, streamCallbacks);
    } else {
      // Websocket not refactored yet?
      // We can use the old class if we wrap it?
      // Or just throw error for now.
      log("Pipeline", "Websocket protocol not refactored yet.");
    }

    // Start Stream
    if (stream) {
      stream.start();
    }
  };

  const pause = () => {
    // Pause usually means stop stream?
    // Player.js pause() calls close().
    destroy();
  };

  return {
    start,
    pause,
    stop: destroy,
  };
}
