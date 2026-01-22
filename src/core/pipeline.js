import { createFetchStream } from "./loader/fetchStream";
// import { createWebsocketStream } from "./stream/websocket"; // 尚未实现
import { createFlvDemuxer } from "./demux/flvDemux";
// import { createM7sDemuxer } from "./demux/m7s"; // 尚未实现
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
 * 管道协调器
 * 连接 Stream -> Demux -> Scheduler -> Decoder -> Render
 * @param {Object} player - 播放器实例上下文
 * @returns {Object} - { start, stop, pause }
 */
export function createPipeline(player) {
  let stream = null;
  let demuxer = null;
  let scheduler = null;
  let videoDecoder = null;
  let audioDecoder = null; // 可能与 videoDecoder 相同（对于 MSE），或者是 Worker

  const { _opt: options, debug } = player;

  const log = (tag, ...args) => {
    debug.log(tag, ...args);
  };

  const destroy = () => {
    if (stream) stream.abort();
    if (demuxer) demuxer.close();
    if (scheduler) scheduler.stop();
    if (videoDecoder) videoDecoder.destroy();
    // audioDecoder 可能是共享的或外部的（worker），所以要小心处理
    // 如果是 MSE，它是同一个实例

    stream = null;
    demuxer = null;
    scheduler = null;
    videoDecoder = null;
    audioDecoder = null;
  };

  const start = (url) => {
    // 1. 创建解码器
    // 从 Player.js 中获取逻辑来决定解码器
    let useWCS = options.useWCS;
    let useMSE = options.useMSE;

    // 视频解码器
    if (useWCS && !options.useOffscreen) {
      videoDecoder = createWebcodecsDecoder(
        {
          onOutput: ({ videoFrame, ts }) => {
            if (player.video) {
              player.video.render({ videoFrame, ts });
            } else {
              // 如果没有视频渲染器，关闭帧
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
      // Worker 解码器（软解码或离屏渲染）
      // 我们使用 player.decoderWorker
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

    // 2. 创建调度器
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
          // 路由分发
          if (packet.type === MEDIA_TYPE.video) {
            if (videoDecoder) videoDecoder.decode(packet);
          } else if (packet.type === MEDIA_TYPE.audio) {
            // 音频路由
            if (options.hasAudio) {
              // 对于 MSE，如果我们支持 MP4 音频（AAC），音频可能会进入相同的解码器
              // 但是 CommonLoader 在 WCS 模式下将音频发送到 Worker
              // 对于 MSE 模式，CommonLoader 将音频发送到...哪里？
              // CommonLoader: if (type === MEDIA_TYPE.audio) player.decoderWorker.decodeAudio(...)
              // 所以音频总是进入 Worker（除了可能是 G711a PCM）
              if (player.decoderWorker) {
                player.decoderWorker.decodeAudio(packet.payload, packet.ts);
              }
            }
          }
        },
      },
    );

    // 3. 创建解复用器
    const demuxCallbacks = {
      onPacket: (packet) => {
        // 推送到调度器
        // 注意：CommonLoader 将音频和视频都推送到 bufferList
        scheduler.push(packet);
      },
      onStats: (stats) => {
        player.updateStats(stats);
      },
    };

    // 根据类型选择解复用器
    if (options.demuxType === DEMUX_TYPE.flv) {
      demuxer = createFlvDemuxer(demuxCallbacks, {
        hasAudio: options.hasAudio,
        hasVideo: options.hasVideo,
      });
    } else {
      // M7S 或其他尚未重构
      // 根据任务要求，目前假设使用 FLV
      log("Pipeline", "Only FLV demux is fully refactored. M7S might fail.");
      // 回退还是直接报错
    }

    // 4. 创建流
    const streamCallbacks = {
      onChunk: (chunk) => {
        if (demuxer) demuxer.push(chunk);
      },
      onSuccess: () => {
        player.emit(EVENTS.streamSuccess);
        // 开始播放视频
        if (player.video) player.video.play();
        // 启动调度器循环
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
      // WebSocket 尚未重构？
      // 我们可以包装旧类吗？
      // 或者暂时抛出错误
      log("Pipeline", "Websocket protocol not refactored yet.");
    }

    // 启动流
    if (stream) {
      stream.start();
    }
  };

  const pause = () => {
    // 暂停通常意味着停止流
    // Player.js 的 pause() 调用 close()
    destroy();
  };

  return {
    start,
    pause,
    stop: destroy,
  };
}
