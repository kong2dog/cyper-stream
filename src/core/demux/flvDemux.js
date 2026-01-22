import {
  FLV_MEDIA_TYPE,
  MEDIA_TYPE,
  PACKET_TYPE_EX,
  FRAME_TYPE_EX,
  FRAME_HEADER_EX,
} from "../../constant";
import { hevcEncoderNalePacketNotLength } from "../../utils";

/**
 * 功能性 FLV 解复用器
 * @param {Object} callbacks - { onPacket, onStats }
 * @param {Object} config - { hasAudio, hasVideo }
 * @returns {Object} - { push, close }
 */
export function createFlvDemuxer(callbacks, config = {}) {
  const { onPacket, onStats } = callbacks;
  const { hasAudio = true, hasVideo = true } = config;

  let demuxStartTimestamp = null;

  // --- 增强型 H.265 逻辑（来自 CommonLoader） ---
  const isEnhancedH265Header = (flags) => {
    return (flags & FRAME_HEADER_EX) === FRAME_HEADER_EX;
  };

  const decodeEnhancedH265Video = (payload, ts) => {
    const flags = payload[0];
    const frameTypeEx = flags & 0x30;
    const packetEx = flags & 0x0f;
    const codecId = payload.slice(1, 5);
    const tmp = new ArrayBuffer(4);
    const tmp32 = new Uint32Array(tmp);
    const isAV1 = String.fromCharCode(codecId[0]) == "a";

    if (packetEx === PACKET_TYPE_EX.PACKET_TYPE_SEQ_START) {
      if (frameTypeEx === FRAME_TYPE_EX.FT_KEY) {
        // 头部视频信息（VPS/SPS/PPS）
        const extraData = payload.slice(5);
        if (!isAV1) {
          const payloadBuffer = new Uint8Array(5 + extraData.length);
          payloadBuffer.set([0x1c, 0x00, 0x00, 0x00, 0x00], 0);
          payloadBuffer.set(extraData, 5);

          if (onPacket) {
            onPacket({
              payload: payloadBuffer,
              type: MEDIA_TYPE.video,
              ts: 0,
              isIFrame: true,
              cts: 0,
            });
          }
        }
      }
    } else if (packetEx === PACKET_TYPE_EX.PACKET_TYPE_FRAMES) {
      let payloadBuffer = payload;
      let cts = 0;
      const isIFrame = frameTypeEx === FRAME_TYPE_EX.FT_KEY;

      if (!isAV1) {
        // H.265
        tmp32[0] = payload[4];
        tmp32[1] = payload[3];
        tmp32[2] = payload[2];
        tmp32[3] = 0;
        cts = tmp32[0];
        const data = payload.slice(8);
        payloadBuffer = hevcEncoderNalePacketNotLength(data, isIFrame);

        if (onPacket) {
          onPacket({
            payload: payloadBuffer,
            type: MEDIA_TYPE.video,
            ts: ts,
            isIFrame: isIFrame,
            cts: cts,
          });
        }
      }
    } else if (packetEx === PACKET_TYPE_EX.PACKET_TYPE_FRAMESX) {
      const isIFrame = frameTypeEx === FRAME_TYPE_EX.FT_KEY;
      const data = payload.slice(5);
      let payloadBuffer = hevcEncoderNalePacketNotLength(data, isIFrame);

      if (onPacket) {
        onPacket({
          payload: payloadBuffer,
          type: MEDIA_TYPE.video,
          ts: ts,
          isIFrame: isIFrame,
          cts: 0,
        });
      }
    }
  };

  // --- 生成器逻辑 ---
  function* inputFlv() {
    // 1. FLV 头部（9 字节）
    yield 9;

    const tmp = new ArrayBuffer(4);
    const tmp8 = new Uint8Array(tmp);
    const tmp32 = new Uint32Array(tmp);

    while (true) {
      // 2. 前一个标签大小（4 字节）
      tmp8[3] = 0; // 重置

      // 3. 标签头部（11 字节）+ 前一个标签大小（4 字节）= 总共 15 字节
      // 等待，原始代码：yield 15
      // 注释说明："等待，preTagSize=4，Header=11，Total=15"
      const t = yield 15;

      // 提取标签类型（偏移量 4）
      const type = t[4];

      // 提取数据长度（3 字节）
      tmp8[0] = t[7];
      tmp8[1] = t[6];
      tmp8[2] = t[5];
      const length = tmp32[0];

      // 提取时间戳（3 字节 + 1 字节扩展）
      tmp8[0] = t[10];
      tmp8[1] = t[9];
      tmp8[2] = t[8];
      let ts = tmp32[0];

      if (ts === 0xffffff) {
        tmp8[3] = t[11];
        ts = tmp32[0];
      }

      // 4. 标签体（有效载荷）
      const payload = yield length;

      // 5. 处理
      switch (type) {
        case FLV_MEDIA_TYPE.audio:
          if (hasAudio) {
            if (onStats) onStats({ abps: payload.byteLength });

            if (payload.byteLength > 0) {
              // 将原始有效载荷传递给解码器（WASM）
              if (onPacket) {
                onPacket({
                  payload: payload,
                  type: MEDIA_TYPE.audio,
                  ts: ts,
                  isIFrame: false,
                });
              }
            }
          }
          break;

        case FLV_MEDIA_TYPE.video:
          if (!demuxStartTimestamp) {
            demuxStartTimestamp = Date.now();
          }
          if (hasVideo) {
            if (onStats) onStats({ vbps: payload.byteLength });

            const flags = payload[0];

            // 增强型 H.265
            if (isEnhancedH265Header(flags)) {
              decodeEnhancedH265Video(payload, ts);
            } else {
              // 标准 FLV
              const isIFrame = payload[0] >> 4 === 1;

              if (payload.byteLength > 0) {
                tmp32[0] = payload[4];
                tmp32[1] = payload[3];
                tmp32[2] = payload[2];
                tmp32[3] = 0;
                let cts = tmp32[0];

                if (onPacket) {
                  onPacket({
                    payload: payload,
                    type: MEDIA_TYPE.video,
                    ts: ts,
                    isIFrame: isIFrame,
                    cts: cts,
                  });
                }
              }
            }
          }
          break;
      }
    }
  }

  // --- 分发器逻辑 ---
  const gen = inputFlv();
  let need = gen.next();
  let buffer = null;

  const push = (value) => {
    let data = new Uint8Array(value);

    if (buffer) {
      let combine = new Uint8Array(buffer.length + data.length);
      combine.set(buffer);
      combine.set(data, buffer.length);
      data = combine;
      buffer = null;
    }

    while (data.length >= need.value) {
      let remain = data.slice(need.value);
      need = gen.next(data.slice(0, need.value));
      data = remain;
    }

    if (data.length > 0) {
      buffer = data;
    }
  };

  const close = () => {
    gen.return(null);
  };

  return {
    push,
    close,
  };
}
