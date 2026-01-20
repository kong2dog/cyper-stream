import Emitter from "../../utils/emitter";
import {
  FRAME_HEADER_EX,
  FRAME_TYPE_EX,
  MEDIA_TYPE,
  PACKET_TYPE_EX,
} from "../../constant";
import { hevcEncoderNalePacketNotLength } from "../../utils";

/**
 * @file commonLoader.js
 * @description 通用加载器模块 (General Loader Module)
 *
 * 主要职责：
 * 1. 实现媒体数据的基础加载逻辑
 * 2. 提供数据缓冲管理 (Buffer Management)
 * 3. 实现基础错误处理机制
 * 4. 负责将解封装后的数据包 (Audio/Video) 分发给相应的解码器 (WCS/MSE/Worker)
 */
export default class CommonLoader extends Emitter {
  /**
   * 构造函数
   * @param {Object} player - 播放器实例
   */
  constructor(player) {
    super();
    this.player = player;

    this.stopId = null; // 定时器ID
    this.firstTimestamp = null; // 首帧时间戳
    this.startTimestamp = null; // 开始播放的系统时间
    this.delay = -1; // 当前延迟
    this.bufferList = []; // //! 数据缓冲区 (Buffer List)
    this.dropping = false; // 是否正在丢帧
    this.initInterval(); // 启动消费循环
  }

  /**
   * 销毁实例，释放资源
   */
  destroy() {
    if (this.stopId) {
      clearInterval(this.stopId);
      this.stopId = null;
    }
    this.firstTimestamp = null;
    this.startTimestamp = null;
    this.delay = -1;
    this.bufferList = [];
    this.dropping = false;
    this.off(); // 移除事件监听
    this.player.debug.log("CommonDemux", "destroy");
  }

  /**
   * 计算当前播放延迟
   * @param {number} timestamp - 当前帧的时间戳
   * @returns {number} 延迟时间 (ms)
   */
  getDelay(timestamp) {
    if (!timestamp) {
      return -1;
    }
    if (!this.firstTimestamp) {
      this.firstTimestamp = timestamp;
      this.startTimestamp = Date.now();
      this.delay = -1;
    } else {
      if (timestamp) {
        const localTimestamp = Date.now() - this.startTimestamp;
        const timeTimestamp = timestamp - this.firstTimestamp;
        // 计算 接收时间 与 播放时间 的差值
        if (localTimestamp >= timeTimestamp) {
          this.delay = localTimestamp - timeTimestamp;
        } else {
          this.delay = timeTimestamp - localTimestamp;
        }
      }
    }
    return this.delay;
  }

  /**
   * 重置延迟计算状态
   */
  resetDelay() {
    this.firstTimestamp = null;
    this.startTimestamp = null;
    this.delay = -1;
    this.dropping = false;
  }

  /**
   * //! 初始化缓冲区消费循环
   * 缓冲区间管理算法的核心：
   * 1. 定时检查缓冲区
   * 2. 根据配置的 buffer 大小和当前延迟决定是否丢帧 (追帧策略)
   * 3. 将数据送入解码器
   */
  initInterval() {
    this.player.debug.log("common dumex", `init Interval`);
    let _loop = () => {
      let data;
      const videoBuffer = this.player._opt.videoBuffer;
      const videoBufferDelay = this.player._opt.videoBufferDelay;

      if (this.player.isDestroyedOrClosed()) {
        return;
      }

      // 如果使用 MSE 且 SourceBuffer 正在更新，则暂停推送，防止缓冲区溢出
      if (
        this.player._opt.useMSE &&
        this.player.mseDecoder &&
        this.player.mseDecoder.getSourceBufferUpdating()
      ) {
        this.player.debug.warn(
          "CommonDemux",
          `_loop getSourceBufferUpdating is true and bufferList length is ${this.bufferList.length}`,
        );
        return;
      }

      if (this.bufferList.length) {
        // //! 追帧/丢帧逻辑 (Dropping Logic)
        if (this.dropping) {
          // 处于丢帧模式
          // this.player.debug.log('common dumex', `is dropping`);
          data = this.bufferList.shift();

          // 音频配置帧不能丢 (sequence header)
          if (data.type === MEDIA_TYPE.audio && data.payload[1] === 0) {
            this._doDecoderDecode(data);
          }

          // 丢弃非关键帧
          while (!data.isIFrame && this.bufferList.length) {
            data = this.bufferList.shift();
            if (data.type === MEDIA_TYPE.audio && data.payload[1] === 0) {
              this._doDecoderDecode(data);
            }
          }

          // 遇到关键帧 (I frame)
          if (
            data.isIFrame &&
            this.getDelay(data.ts) <= Math.min(videoBuffer, 200) // 如果延迟已经追回，停止丢帧
          ) {
            this.dropping = false;
            this._doDecoderDecode(data);
          }
        } else {
          // 正常播放模式
          data = this.bufferList[0];
          if (this.getDelay(data.ts) === -1) {
            // 首帧或无法计算延迟，直接解码
            // this.player.debug.log('common dumex', `delay is -1`);
            this.bufferList.shift();
            this._doDecoderDecode(data);
          } else if (this.delay > videoBuffer + videoBufferDelay) {
            // 延迟过大，触发丢帧模式
            // this.player.debug.log('common dumex', `delay is ${this.delay}, set dropping is true`);
            this.resetDelay();
            this.dropping = true;
          } else {
            data = this.bufferList[0];
            // 微调：如果单帧延迟超过 buffer，丢弃该帧 (Drop frame)
            if (this.getDelay(data.ts) > videoBuffer) {
              this.bufferList.shift();
              this._doDecoderDecode(data);
            } else {
              // 正常情况，暂不处理
            }
          }
        }
      }
    };
    _loop();
    this.stopId = setInterval(_loop, 10);
  }

  /**
   * //! 处理解封装后的数据
   * 将数据推入缓冲区，或根据策略直接分发
   * @param {Uint8Array} payload - 媒体数据
   * @param {string} type - 媒体类型 (audio/video)
   * @param {number} ts - 时间戳
   * @param {boolean} isIFrame - 是否关键帧
   * @param {number} cts - Composition Time Offset
   */
  _doDecode(payload, type, ts, isIFrame, cts) {
    // console.log("commonLoader", "_doDecode", payload, type, ts, isIFrame, cts);
    const player = this.player;
    let options = {
      ts: ts,
      cts: cts,
      type: type,
      isIFrame: false,
    };

    // //! 跨平台/解码方案路由 (WCS / MSE / Worker)
    // 1. WebCodecs (且非 Offscreen 模式)
    if (player._opt.useWCS && !player._opt.useOffscreen) {
      if (type === MEDIA_TYPE.video) {
        options.isIFrame = isIFrame;
      }
      this.pushBuffer(payload, options);
    }
    // 2. MSE (Media Source Extensions)
    else if (player._opt.useMSE) {
      // console.log(2);
      if (type === MEDIA_TYPE.video) {
        options.isIFrame = isIFrame;
      }
      this.pushBuffer(payload, options);
    }
    // 3. Worker (软解或 Offscreen WCS)
    else {
      if (type === MEDIA_TYPE.video) {
        player.decoderWorker &&
          player.decoderWorker.decodeVideo(payload, ts, isIFrame);
      } else if (type === MEDIA_TYPE.audio) {
        if (player._opt.hasAudio) {
          player.decoderWorker && player.decoderWorker.decodeAudio(payload, ts);
        }
      }
    }
  }

  /**
   * 执行真正的解码操作 (发送给具体的解码器)
   * @param {Object} data - 缓冲队列中的数据项
   */
  _doDecoderDecode(data) {
    const player = this.player;
    const { webcodecsDecoder, mseDecoder } = player;

    if (data.type === MEDIA_TYPE.audio) {
      if (player._opt.hasAudio) {
        player.decoderWorker &&
          player.decoderWorker.decodeAudio(data.payload, data.ts);
      }
    } else if (data.type === MEDIA_TYPE.video) {
      if (player._opt.useWCS && !player._opt.useOffscreen) {
        webcodecsDecoder.decodeVideo(data.payload, data.ts, data.isIFrame);
      } else if (player._opt.useMSE) {
        mseDecoder.decodeVideo(data.payload, data.ts, data.isIFrame, data.cts);
      }
    }
  }

  /**
   * 将数据推入缓冲区
   * @param {Uint8Array} payload
   * @param {Object} options
   */
  pushBuffer(payload, options) {
    // audio
    if (options.type === MEDIA_TYPE.audio) {
      this.bufferList.push({
        ts: options.ts,
        payload: payload,
        type: MEDIA_TYPE.audio,
      });
    } else if (options.type === MEDIA_TYPE.video) {
      this.bufferList.push({
        ts: options.ts,
        cts: options.cts,
        payload: payload,
        type: MEDIA_TYPE.video,
        isIFrame: options.isIFrame,
      });
    }
  }

  close() {}

  /**
   * 解析并解码增强型 H.265 视频帧
   * @param {Uint8Array} payload
   * @param {number} ts
   */
  _decodeEnhancedH265Video(payload, ts) {
    const flags = payload[0];
    const frameTypeEx = flags & 0x30;
    const packetEx = flags & 0x0f;
    const codecId = payload.slice(1, 5);
    const tmp = new ArrayBuffer(4);
    const tmp32 = new Uint32Array(tmp);
    const isAV1 = String.fromCharCode(codecId[0]) == "a";

    if (packetEx === PACKET_TYPE_EX.PACKET_TYPE_SEQ_START) {
      if (frameTypeEx === FRAME_TYPE_EX.FT_KEY) {
        // header video info (VPS/SPS/PPS)
        const extraData = payload.slice(5);
        if (!isAV1) {
          const payloadBuffer = new Uint8Array(5 + extraData.length);
          payloadBuffer.set([0x1c, 0x00, 0x00, 0x00, 0x00], 0);
          payloadBuffer.set(extraData, 5);
          this._doDecode(payloadBuffer, MEDIA_TYPE.video, 0, true, 0);
        }
      }
    } else if (packetEx === PACKET_TYPE_EX.PACKET_TYPE_FRAMES) {
      let payloadBuffer = payload;
      let cts = 0;
      const isIFrame = frameTypeEx === FRAME_TYPE_EX.FT_KEY;

      if (!isAV1) {
        // h265
        tmp32[0] = payload[4];
        tmp32[1] = payload[3];
        tmp32[2] = payload[2];
        tmp32[3] = 0;
        cts = tmp32[0];
        const data = payload.slice(8);
        payloadBuffer = hevcEncoderNalePacketNotLength(data, isIFrame);
        this._doDecode(payloadBuffer, MEDIA_TYPE.video, ts, isIFrame, cts);
      }
    } else if (packetEx === PACKET_TYPE_EX.PACKET_TYPE_FRAMESX) {
      const isIFrame = frameTypeEx === FRAME_TYPE_EX.FT_KEY;
      const data = payload.slice(5);
      let payloadBuffer = hevcEncoderNalePacketNotLength(data, isIFrame);
      this._doDecode(payloadBuffer, MEDIA_TYPE.video, ts, isIFrame, 0);
    }
  }

  /**
   * 判断是否为增强型 H.265 头
   * @param {number} flags
   * @returns {boolean}
   */
  _isEnhancedH265Header(flags) {
    return (flags & FRAME_HEADER_EX) === FRAME_HEADER_EX;
  }
}
