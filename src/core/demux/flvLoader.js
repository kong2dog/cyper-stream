import { FLV_MEDIA_TYPE, MEDIA_TYPE } from "../../constant";
import CommonLoader from "./commonLoader";
import { now } from "../../utils";
import { decodeALaw } from "../../utils/g711.js";

/**
 * @file flvLoader.js
 * @description FLV格式专用加载器模块 (FLV Specific Loader Module)
 *
 * 主要职责：
 * 1. 解析 FLV 格式的媒体流 (FLV Tag Parsing)
 * 2. 处理 FLV 特有的 Tag 结构 (Header, Video Tag, Audio Tag)
 * 3. 视音频数据分离 (Demuxing)
 * 4. 时间戳同步与提取
 */
export default class FlvLoader extends CommonLoader {
  /**
   * 构造函数
   * @param {Object} player - 播放器实例
   */
  constructor(player) {
    super(player);
    // 初始化 FLV 解析生成器
    this.input = this._inputFlv();
    // 创建数据分发闭包
    this.flvDemux = this.dispatchFlvData(this.input);
    this._firstAudio = true; // Flag for first audio packet
    player.debug.log("FlvDemux", "init");
  }

  /**
   * 销毁实例
   */
  destroy() {
    super.destroy();
    this.input = null;
    this.flvDemux = null;
    this.player.debug.log("FlvDemux", "destroy");
  }

  /**
   * 分发数据入口
   * 外部调用此方法传入原始二进制数据
   * @param {ArrayBuffer|Uint8Array} data
   */
  dispatch(data) {
    this.flvDemux(data);
  }

  /**
   * //! FLV 解析核心生成器 (Generator)
   * 使用 yield 机制实现流式解析状态机
   *
   * 解析流程：
   * 1. 跳过 FLV Header (9 bytes)
   * 2. 循环解析 PreviousTagSize (4 bytes)
   * 3. 解析 Tag Header (11 bytes) -> 提取 type, length, timestamp
   * 4. 解析 Tag Body (length bytes)
   * 5. 根据 Tag Type (Audio/Video) 分发数据
   */
  *_inputFlv() {
    // 1. FLV Header (9 bytes): Signature(3) + Version(1) + Flags(1) + HeaderSize(4)
    yield 9;

    // 临时缓冲区，用于读取 4字节 整数
    const tmp = new ArrayBuffer(4);
    const tmp8 = new Uint8Array(tmp);
    const tmp32 = new Uint32Array(tmp);
    const player = this.player;

    while (true) {
      // 2. PreviousTagSize (4 bytes)
      // 实际上我们并不需要这个值，但必须消耗这4个字节
      // FLV 格式中，PreviousTagSize 位于每个 Tag 之前
      tmp8[3] = 0; // reset

      // 3. Tag Header (11 bytes)
      // Byte 0: Tag Type (8=Audio, 9=Video, 18=Script)
      // Byte 1-3: Data Size
      // Byte 4-6: Timestamp
      // Byte 7: Timestamp Extended
      // Byte 8-10: Stream ID
      // Total: 1+3+3+1+3 = 11 bytes. (Wait, preTagSize=4, Header=11, Total=15)
      const t = yield 15;

      // Extract Tag Type (offset 4 because first 4 bytes are PreviousTagSize)
      const type = t[4];

      // Extract Data Length (3 bytes)
      tmp8[0] = t[7];
      tmp8[1] = t[6];
      tmp8[2] = t[5];
      const length = tmp32[0]; // Little Endian read of constructed buffer

      // Extract Timestamp (3 bytes + 1 byte extended)
      tmp8[0] = t[10];
      tmp8[1] = t[9];
      tmp8[2] = t[8];
      let ts = tmp32[0];

      // Handle Timestamp Extended (if ts == 0xFFFFFF)
      if (ts === 0xffffff) {
        tmp8[3] = t[11];
        ts = tmp32[0];
      }

      // 4. Tag Body (Payload)
      const payload = yield length;
      // 5. 数据处理与分发
      switch (type) {
        case FLV_MEDIA_TYPE.audio:
          if (player._opt.hasAudio) {
            player.updateStats({
              abps: payload.byteLength,
            });
            if (payload.byteLength > 0) {
              const firstByte = payload[0];
              const soundFormat = (firstByte & 0xf0) >> 4;

              // CodecID 7 = G.711 A-law (ALAW)
              if (soundFormat === 7) {
                // G.711 A-law data (skip 1 byte header)
                const audioData = payload.subarray(1);
                // Decode to PCM (Float32) using our JS decoder
                const pcmData = decodeALaw(audioData);

                // 如果是第一次收到 ALAW，初始化 AudioContext 并更新信息
                if (this._firstAudio) {
                  this.player.debug.log(
                    "FlvLoader",
                    "Detected G.711 A-law audio, utilizing JS decoder",
                  );
                  this._firstAudio = false;
                  // ALAW 通常是 8000Hz 单声道
                  if (this.player.audio) {
                    this.player.audio.updateAudioInfo({
                      codecId: 7,
                      sampleRate: 8000,
                      channels: 1,
                    });
                  }
                }

                // 直接发送 PCM 数据播放，绕过 worker 解码流程
                if (this.player.audio) {
                  this.player.audio.playPcm(pcmData, ts);
                }
              } else {
                // 其他格式 (如 AAC) 走原有流程 (发送到 worker 解码)
                this._doDecode(payload, MEDIA_TYPE.audio, ts);
              }
            }
          }
          break;
        case FLV_MEDIA_TYPE.video:
          if (!player._times.demuxStart) {
            player._times.demuxStart = now();
          }
          if (player._opt.hasVideo) {
            player.updateStats({
              vbps: payload.byteLength,
            });

            // 解析 VideoTagHeader (1 byte minimum)
            // FrameType (4 bits) + CodecID (4 bits)
            const flags = payload[0];
            const codecId = flags & 0x0f;
            this.player.debug.log(
              "FlvLoader",
              `Video Tag: flags=${flags.toString(16)}, codecId=${codecId}`,
            );

            // 处理增强型 H.265 (Enhanced RTMP)
            if (this._isEnhancedH265Header(flags)) {
              this._decodeEnhancedH265Video(payload, ts);
            } else {
              // 标准 FLV Video Tag
              // FrameType: 1 = Keyframe (I-frame)
              const isIFrame = payload[0] >> 4 === 1;

              if (payload.byteLength > 0) {
                // Extract CompositionTime (CTS) - 3 bytes
                // Byte 1-3 of payload (if CodecID=7 AVC)
                tmp32[0] = payload[4];
                tmp32[1] = payload[3];
                tmp32[2] = payload[2];
                tmp32[3] = 0;
                let cts = tmp32[0];

                // 分发视频数据
                this._doDecode(payload, MEDIA_TYPE.video, ts, isIFrame, cts);
              }
            }
          }
          break;
      }
    }
  }

  /**
   * //! 数据流驱动器 (Driver)
   * 负责将输入的二进制流喂给 generator 状态机
   * 实现了分块数据的拼接与状态保存
   *
   * @param {Generator} input - _inputFlv 生成器实例
   * @returns {Function} 数据接收回调
   */
  dispatchFlvData(input) {
    let need = input.next(); // 启动生成器，获取第一个所需的字节数
    let buffer = null; // 内部暂存缓冲区 (用于处理跨包数据)

    return (value) => {
      let data = new Uint8Array(value);

      // 如果有暂存数据，先拼接
      if (buffer) {
        let combine = new Uint8Array(buffer.length + data.length);
        combine.set(buffer);
        combine.set(data, buffer.length);
        data = combine;
        buffer = null;
      }

      // 循环消费数据，直到不够 `need` 为止
      while (data.length >= need.value) {
        // 切分出需要的数据块
        let remain = data.slice(need.value);
        // 将数据块传给生成器，并获取下一次需要的字节数
        need = input.next(data.slice(0, need.value));
        data = remain;
      }

      // 剩下的不够一次消费的数据，暂存起来
      if (data.length > 0) {
        buffer = data;
      }
    };
  }

  close() {
    this.input && this.input.return(null);
  }
}
