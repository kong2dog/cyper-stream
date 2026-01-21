
import {
  FLV_MEDIA_TYPE,
  MEDIA_TYPE,
  PACKET_TYPE_EX,
  FRAME_TYPE_EX,
  FRAME_HEADER_EX,
} from "../../constant";
import { decodeALaw } from "../../utils/g711.js";
import { hevcEncoderNalePacketNotLength } from "../../utils";

/**
 * Functional FLV Demuxer
 * @param {Object} callbacks - { onPacket, onStats, onAudioInfo, onLog }
 * @param {Object} config - { hasAudio, hasVideo }
 * @returns {Object} - { push, close }
 */
export function createFlvDemuxer(callbacks, config = {}) {
  const { onPacket, onStats, onAudioInfo, onLog } = callbacks;
  const { hasAudio = true, hasVideo = true } = config;

  let firstAudio = true;
  let demuxStartTimestamp = null;

  // Helper to log
  const log = (tag, ...args) => {
    if (onLog) onLog(tag, ...args);
  };

  // --- Enhanced H.265 Logic (from CommonLoader) ---
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
        // header video info (VPS/SPS/PPS)
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
                cts: 0
            });
          }
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
        
        if (onPacket) {
            onPacket({
                payload: payloadBuffer,
                type: MEDIA_TYPE.video,
                ts: ts,
                isIFrame: isIFrame,
                cts: cts
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
            cts: 0
        });
      }
    }
  };

  // --- Generator Logic ---
  function* inputFlv() {
    // 1. FLV Header (9 bytes)
    yield 9;

    const tmp = new ArrayBuffer(4);
    const tmp8 = new Uint8Array(tmp);
    const tmp32 = new Uint32Array(tmp);

    while (true) {
      // 2. PreviousTagSize (4 bytes)
      tmp8[3] = 0; // reset
      
      // 3. Tag Header (11 bytes) + PreviousTagSize (4 bytes) = 15 bytes total?
      // Wait, original code: yield 15.
      // And commented: "Wait, preTagSize=4, Header=11, Total=15"
      const t = yield 15;

      // Extract Tag Type (offset 4)
      const type = t[4];

      // Extract Data Length (3 bytes)
      tmp8[0] = t[7];
      tmp8[1] = t[6];
      tmp8[2] = t[5];
      const length = tmp32[0];

      // Extract Timestamp (3 bytes + 1 byte extended)
      tmp8[0] = t[10];
      tmp8[1] = t[9];
      tmp8[2] = t[8];
      let ts = tmp32[0];

      if (ts === 0xffffff) {
        tmp8[3] = t[11];
        ts = tmp32[0];
      }

      // 4. Tag Body (Payload)
      const payload = yield length;

      // 5. Processing
      switch (type) {
        case FLV_MEDIA_TYPE.audio:
          if (hasAudio) {
            if (onStats) onStats({ abps: payload.byteLength });

            if (payload.byteLength > 0) {
              const firstByte = payload[0];
              const soundFormat = (firstByte & 0xf0) >> 4;

              // CodecID 7 = G.711 A-law
              if (soundFormat === 7) {
                const audioData = payload.subarray(1);
                const pcmData = decodeALaw(audioData);

                if (firstAudio) {
                  log("FlvDemux", "Detected G.711 A-law audio, utilizing JS decoder");
                  firstAudio = false;
                  if (onAudioInfo) {
                    onAudioInfo({
                      codecId: 7,
                      sampleRate: 8000,
                      channels: 1,
                    });
                  }
                }
                
                // For G711a, we send decoded PCM directly?
                // The pipeline expects { payload, type ... }
                // If we send PCM, the decoder needs to handle it or we skip decoder?
                // Original code called `player.audio.playPcm(pcmData, ts)`.
                // In pipeline, we should probably emit a special packet type or handle it in Decoder/Audio.
                // Let's emit a "PCM" packet.
                if (onPacket) {
                    onPacket({
                        payload: pcmData,
                        type: 'pcm', // Special type for PCM
                        ts: ts
                    });
                }

              } else {
                // Normal Audio (AAC etc)
                if (onPacket) {
                    onPacket({
                        payload: payload,
                        type: MEDIA_TYPE.audio,
                        ts: ts,
                        isIFrame: false
                    });
                }
              }
            }
          }
          break;

        case FLV_MEDIA_TYPE.video:
          if (!demuxStartTimestamp) {
            demuxStartTimestamp = Date.now();
            // We might want to notify timing?
          }
          if (hasVideo) {
            if (onStats) onStats({ vbps: payload.byteLength });

            const flags = payload[0];
            const codecId = flags & 0x0f;
            
            // Enhanced H.265
            if (isEnhancedH265Header(flags)) {
              decodeEnhancedH265Video(payload, ts);
            } else {
              // Standard FLV
              const isIFrame = (payload[0] >> 4) === 1;

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
                        cts: cts
                    });
                }
              }
            }
          }
          break;
      }
    }
  }

  // --- Dispatcher Logic ---
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
    close
  };
}
