
import { EVENTS_ERROR, MEDIA_SOURCE_STATE, MP4_CODECS } from "../../constant";
import MP4 from "../remux/mp4-generator";
import { formatMp4VideoCodec } from "../../utils";
import { parseAVCDecoderConfigurationRecord } from "../../utils/h264";

/**
 * Functional MSE Decoder
 * @param {Object} callbacks - { onError, onLog, onSourceOpen, onSourceClose }
 * @param {Object} config - { videoElement, width, height }
 * @returns {Object} - { decode, destroy, getSourceBufferUpdating }
 */
export function createMseDecoder(callbacks, config = {}) {
  const { onError, onLog, onSourceOpen, onSourceClose } = callbacks;
  const { videoElement, width = 640, height = 360 } = config;

  let mediaSource = new MediaSource();
  let sourceBuffer = null;
  let init = false;
  let mediaSourceOpen = false;
  let queue = [];
  let isUpdating = false;

  const log = (tag, ...args) => {
    if (onLog) onLog(tag, ...args);
  };

  const destroy = () => {
    if (mediaSource) {
      if (mediaSource.readyState === MEDIA_SOURCE_STATE.open) {
        mediaSource.endOfStream();
      }
      mediaSource = null;
    }
    if (sourceBuffer) {
      try {
        sourceBuffer.abort();
      } catch (e) {
        // ignore
      }
      sourceBuffer = null;
    }
    init = false;
    mediaSourceOpen = false;
    queue = [];
    isUpdating = false;
    
    // Revoke Object URL if needed (usually handled by browser or video element change)
    if (videoElement && videoElement.src) {
        URL.revokeObjectURL(videoElement.src);
        videoElement.removeAttribute('src');
    }
    
    log("MediaSourceDecoder", "destroy");
  };

  // Bind events
  mediaSource.addEventListener("sourceopen", () => {
    log("MediaSourceDecoder", "sourceopen");
    mediaSourceOpen = true;
    if (onSourceOpen) onSourceOpen();
  });

  mediaSource.addEventListener("sourceclose", () => {
    log("MediaSourceDecoder", "sourceclose");
    mediaSourceOpen = false;
    if (onSourceClose) onSourceClose();
  });

  if (videoElement) {
    videoElement.src = URL.createObjectURL(mediaSource);
  }

  const appendBuffer = (buffer) => {
    if (sourceBuffer && !sourceBuffer.updating && !isUpdating) {
      try {
        isUpdating = true;
        sourceBuffer.appendBuffer(buffer);
      } catch (e) {
        isUpdating = false;
        log("MediaSourceDecoder", "appendBuffer error", e);
        if (onError) onError(EVENTS_ERROR.mediaSourceAppendBufferError, e);
      }
    } else {
      queue.push(buffer);
    }
  };

  const initDecoder = (msg) => {
    const mimeType = formatMp4VideoCodec(msg.codec);
    log("MediaSourceDecoder", `initDecoder check mimeType:${mimeType}`);

    if (MediaSource.isTypeSupported(mimeType)) {
      log("MediaSourceDecoder", `isTypeSupported true mimeType:${mimeType}`);
      try {
        sourceBuffer = mediaSource.addSourceBuffer(mimeType);
        sourceBuffer.addEventListener("updateend", () => {
          isUpdating = false;
          if (queue.length) {
            const buffer = queue.shift();
            appendBuffer(buffer);
          }
        });
        sourceBuffer.addEventListener("error", (e) => {
          log("MediaSourceDecoder", "sourceBuffer error", e);
          if (onError) onError(EVENTS_ERROR.mediaSourceBufferError, e);
        });
        init = true;
      } catch (e) {
        log("MediaSourceDecoder", "addSourceBuffer error", e);
        if (onError) onError(EVENTS_ERROR.mediaSourceError, e);
      }
    } else {
      log("MediaSourceDecoder", `isTypeSupported false mimeType:${mimeType}`);
      if (onError) onError(EVENTS_ERROR.mediaSourceH265NotSupport);
    }
  };

  const decode = (packet) => {
    const { payload, ts, isIFrame, cts } = packet;

    if (!mediaSourceOpen) {
      return;
    }

    if (!init) {
      // H265
      if (payload[0] === 0x1c && payload[1] === 0x00) {
        log("MediaSourceDecoder", "H.265 not supported in MediaSourceDecoder");
        if (onError) onError(EVENTS_ERROR.mediaSourceH265NotSupport);
        return;
      }

      // H264
      if (payload[0] === 0x17 && payload[1] === 0x00) {
        const avcC = payload.slice(5);
        const meta = parseAVCDecoderConfigurationRecord(avcC);
        meta.id = 1;
        meta.timescale = 1000;
        meta.duration = 0;
        meta.avcc = avcC;
        meta.codecWidth = meta.codecWidth || width;
        meta.codecHeight = meta.codecHeight || height;
        meta.presentWidth = meta.presentWidth || width;
        meta.presentHeight = meta.presentHeight || height;

        initDecoder({
          encTypeCode: 7,
          codec: meta.codec,
        });
        // init segment
        const initSegment = MP4.generateInitSegment(meta);
        appendBuffer(initSegment);
      }
    } else {
      const data = payload.slice(5);
      const moof = MP4.moof(
        {
          id: 1,
          sequenceNumber: 0,
          duration: 40, // 25fps fixed? Original code has this.
          size: data.byteLength,
          flags: {
            isLeading: 0,
            dependsOn: isIFrame ? 2 : 1,
            isDependedOn: 0,
            hasRedundancy: 0,
            isNonSync: isIFrame ? 0 : 1,
          },
          cts: cts,
        },
        ts
      );

      const mdat = MP4.mdat(data);
      const buffer = new Uint8Array(moof.byteLength + mdat.byteLength);
      buffer.set(moof, 0);
      buffer.set(mdat, moof.byteLength);
      appendBuffer(buffer);
    }
  };

  const getSourceBufferUpdating = () => {
    return sourceBuffer && sourceBuffer.updating;
  };

  return {
    decode,
    destroy,
    getSourceBufferUpdating,
  };
}
