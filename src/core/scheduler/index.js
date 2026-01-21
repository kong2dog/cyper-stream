
import { MEDIA_TYPE } from "../../constant";

/**
 * Functional Scheduler (Buffer & Drop Logic)
 * @param {Object} config - Configuration object
 * @param {number} config.videoBuffer - Target video buffer length (ms)
 * @param {number} config.videoBufferDelay - Max delay before dropping (ms)
 * @param {boolean} config.useMSE - Whether MSE is being used
 * @param {Function} config.isMseUpdating - Callback to check if MSE is updating
 * @param {Object} callbacks - Callbacks
 * @param {Function} callbacks.onFrame - Called when a frame is ready to decode
 * @returns {Object} - { push, start, stop, reset }
 */
export function createScheduler(config, callbacks) {
  const { onFrame } = callbacks;
  
  let bufferList = [];
  let stopId = null;
  let firstTimestamp = null;
  let startTimestamp = null;
  let delay = -1;
  let dropping = false;
  let isStopped = true;

  const getDelay = (timestamp) => {
    if (!timestamp) return -1;
    
    if (!firstTimestamp) {
      firstTimestamp = timestamp;
      startTimestamp = Date.now();
      delay = -1;
    } else {
      const localTimestamp = Date.now() - startTimestamp;
      const timeTimestamp = timestamp - firstTimestamp;
      
      if (localTimestamp >= timeTimestamp) {
        delay = localTimestamp - timeTimestamp;
      } else {
        delay = timeTimestamp - localTimestamp;
      }
    }
    return delay;
  };

  const resetDelay = () => {
    firstTimestamp = null;
    startTimestamp = null;
    delay = -1;
    dropping = false;
  };

  const push = (packet) => {
    // packet structure: { payload, type, ts, isIFrame, cts }
    bufferList.push(packet);
  };

  const start = () => {
    if (!isStopped) return;
    isStopped = false;
    
    const loop = () => {
      if (isStopped) return;

      const { videoBuffer, videoBufferDelay, useMSE, isMseUpdating } = config;

      // If MSE is busy, wait
      if (useMSE && isMseUpdating && isMseUpdating()) {
        return;
      }

      if (bufferList.length) {
        let data;

        if (dropping) {
          // Dropping mode: consume frames until we catch up or find I-Frame
          data = bufferList.shift();

          // Audio config frame (sequence header) cannot be dropped
          if (data.type === MEDIA_TYPE.audio && data.payload[1] === 0) {
            onFrame(data);
          }

          // Drop non-key frames
          while (!data.isIFrame && bufferList.length) {
            data = bufferList.shift();
            if (data.type === MEDIA_TYPE.audio && data.payload[1] === 0) {
              onFrame(data);
            }
          }

          // If we found an I-Frame and delay is recovered
          if (data.isIFrame && getDelay(data.ts) <= Math.min(videoBuffer, 200)) {
            dropping = false;
            onFrame(data);
          }
        } else {
          // Normal playback mode
          data = bufferList[0];
          
          if (getDelay(data.ts) === -1) {
            // First frame or unknown delay
            bufferList.shift();
            onFrame(data);
          } else if (delay > videoBuffer + videoBufferDelay) {
             // Delay too high, start dropping
             resetDelay();
             dropping = true;
          } else {
             // Check single frame delay
             data = bufferList[0];
             if (getDelay(data.ts) > videoBuffer) {
               // Slight delay, drop this frame if possible (though logic here seems to just send it in original code? 
               // Original code: if (this.getDelay(data.ts) > videoBuffer) { this.bufferList.shift(); this._doDecoderDecode(data); }
               // It sends it for decoding anyway, effectively "playing fast"? Or just consuming it.
               bufferList.shift();
               onFrame(data);
             } else {
               // Normal speed, do nothing? 
               // Original code had `else { // 正常情况，暂不处理 }` which means it waits for next loop? 
               // But we need to consume frames to play!
               // Wait, `getDelay` compares `localTimestamp` (wall clock) vs `timeTimestamp` (media time).
               // If `localTimestamp` >= `timeTimestamp`, it means we should have played this frame already.
               // So we play it.
               
               // Let's re-read original logic carefully.
               // if (this.getDelay(data.ts) > videoBuffer) { ... decode }
               // else { // 正常情况，暂不处理 }
               
               // Wait, if delay is SMALL (meaning we are ahead of schedule?), we wait?
               // If delay is > videoBuffer (we are lagging), we play immediately?
               
               // Actually, `delay` = `localTimestamp` - `timeTimestamp`.
               // If delay > 0, local time is ahead of media time. We are lagging behind real-time (if live).
               
               // Let's stick to the original logic:
               if (getDelay(data.ts) > videoBuffer) {
                  bufferList.shift();
                  onFrame(data);
               }
             }
          }
        }
      }
    };

    stopId = setInterval(loop, 10);
  };

  const stop = () => {
    isStopped = true;
    if (stopId) {
      clearInterval(stopId);
      stopId = null;
    }
    resetDelay();
    bufferList = [];
  };

  return {
    push,
    start,
    stop,
    reset: resetDelay
  };
}
