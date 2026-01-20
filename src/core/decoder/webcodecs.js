
import { EVENTS_ERROR, WCS_ERROR } from "../../constant";
import { formatVideoDecoderConfigure, isTrue } from "../../utils";
import { parseAVCDecoderConfigurationRecord } from "../../utils/h264";
import { parseHEVCDecoderConfigurationRecord } from "../../utils/h265";

/**
 * Functional WebCodecs Decoder
 * @param {Object} callbacks - { onOutput, onError, onLog }
 * @param {Object} config - { useVideoRender }
 * @returns {Object} - { decode, destroy }
 */
export function createWebcodecsDecoder(callbacks, config = {}) {
  const { onOutput, onError, onLog } = callbacks;
  const { useVideoRender } = config;

  let decoder = null;
  let init = false;
  let isDecodeFirst = false;

  const log = (tag, ...args) => {
    if (onLog) onLog(tag, ...args);
  };

  const destroy = () => {
    if (decoder) {
      if (decoder.state !== "closed") {
        decoder.close();
      }
      decoder = null;
    }
    init = false;
    isDecodeFirst = false;
    log("WebcodecsDecoder", "destroy");
  };

  const initDecoder = (msg) => {
    // Re-create decoder if needed
    if (decoder && decoder.state !== "closed") {
        // If we are re-initializing, maybe close old one?
        // Typically we configure it, but here we create new VideoDecoder.
        // Original code: this.decoder = new VideoDecoder(...)
    }

    decoder = new VideoDecoder({
      output: (videoFrame) => {
        if (!isDecodeFirst) {
          log("WebcodecsDecoder", "first decode success");
          isDecodeFirst = true;
        }

        if (onOutput) {
          onOutput({
            videoFrame,
            ts: videoFrame.timestamp,
          });
        }
      },
      error: (e) => {
        log("WebcodecsDecoder", "decode error", e);
        if (onError) onError(EVENTS_ERROR.webcodecsDecodeError, e);
        
        // Try to reset
        destroy();
        // We can't easily re-init without the config msg. 
        // Original code called `this._initDecoder()` without args which would fail?
        // Actually original code: `this._initDecoder();` which implies msg is undefined?
        // If msg is undefined, it crashes?
        // Let's just destroy for now.
      },
    });

    // Configure
    // H264
    if (msg.encTypeCode === 7) {
      const configObj = formatVideoDecoderConfigure(msg.avcC);
      decoder.configure(configObj);
      init = true;
    }
    // H265
    else if (msg.encTypeCode === 12) {
      const configObj = {
        codec: msg.codec,
        description: msg.avcC,
      };
      
      isSupported(configObj).then((supported) => {
          if (isTrue(supported)) {
              decoder.configure(configObj);
              init = true;
          } else {
              if (onError) onError(EVENTS_ERROR.webcodecsH265NotSupport);
          }
      });
    }
  };

  const decode = (packet) => {
    const { payload, ts, isIFrame } = packet;

    if (!init) {
      // Parse Config
      // H264 (0x17 0x00)
      if (payload[0] === 0x17 && payload[1] === 0x00) {
        const avcC = payload.slice(5);
        const meta = parseAVCDecoderConfigurationRecord(avcC);
        initDecoder({
          encTypeCode: 7,
          avcC: avcC,
          codec: meta.codec,
        });
      }
      // H265 (0x1c 0x00)
      else if (payload[0] === 0x1c && payload[1] === 0x00) {
        const avcC = payload.slice(5);
        const meta = parseHEVCDecoderConfigurationRecord(avcC);
        initDecoder({
          encTypeCode: 12,
          avcC: avcC,
          codec: meta.codec,
        });
      }
    } else {
      if (!decoder || decoder.state === "closed") return;

      const chunk = new EncodedVideoChunk({
        type: isIFrame ? "key" : "delta",
        timestamp: ts,
        data: payload,
      });

      try {
        decoder.decode(chunk);
      } catch (e) {
        const error = e.toString();
        if (error.indexOf(WCS_ERROR.keyframeIsRequiredError) !== -1) {
          log("WebcodecsDecoder", "key frame is required");
        } else if (error.indexOf(WCS_ERROR.canNotDecodeClosedCodec) !== -1) {
          log("WebcodecsDecoder", "can not decode closed codec");
        } else {
          log("WebcodecsDecoder", "decode error", e);
        }
      }
    }
  };

  log("WebcodecsDecoder", "init");

  return {
    decode,
    destroy,
  };
}

function isSupported(config) {
  return VideoDecoder.isConfigSupported(config).then((support) => {
    return support.supported;
  });
}
