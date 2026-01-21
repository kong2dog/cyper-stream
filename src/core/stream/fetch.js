
import { EVENTS_ERROR, FETCH_ERROR } from "../../constant";
import { isFalse, isFetchSuccess } from "../../utils";

/**
 * Functional Fetch Stream
 * @param {string} url - Stream URL
 * @param {Object} options - Fetch options
 * @param {Object} callbacks - Callbacks for stream events
 * @param {Function} callbacks.onChunk - Called when a chunk is received
 * @param {Function} callbacks.onSuccess - Called when stream connects successfully
 * @param {Function} callbacks.onError - Called when an error occurs
 * @param {Function} callbacks.onStats - Called with stream bitrate stats
 * @returns {Object} - Control object { start, abort }
 */
export function createFetchStream(url, options = {}, callbacks = {}) {
  const { onChunk, onSuccess, onError, onStats } = callbacks;
  let abortController = null;
  let isReading = false;

  const abort = () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    isReading = false;
  };

  const start = () => {
    abortController = new AbortController();
    const fetchOptions = Object.assign(
      {
        signal: abortController.signal,
      },
      {
        headers: options.headers || {},
      }
    );

    fetch(url, fetchOptions)
      .then((res) => {
        if (isFalse(isFetchSuccess(res))) {
          abort();
          if (onError) {
            onError(EVENTS_ERROR.fetchError, `fetch response status is ${res.status} and ok is ${res.ok}`);
          }
          return;
        }

        const reader = res.body.getReader();
        if (onSuccess) onSuccess();

        isReading = true;
        const readNext = () => {
          if (!isReading) return;

          reader
            .read()
            .then(({ done, value }) => {
              if (done) {
                // End of stream
                isReading = false;
              } else {
                if (onStats) {
                  onStats(value.byteLength * 8);
                }
                if (onChunk) {
                  onChunk(value);
                }
                readNext();
              }
            })
            .catch((e) => {
              if (!isReading) return;
              
              const errorString = e.toString();
              if (
                errorString.indexOf(FETCH_ERROR.abortError1) !== -1 ||
                errorString.indexOf(FETCH_ERROR.abortError2) !== -1 ||
                e.name === FETCH_ERROR.abort ||
                e.name === "AbortError"
              ) {
                return;
              }

              abort();
              if (onError) onError(EVENTS_ERROR.fetchError, e);
            });
        };

        readNext();
      })
      .catch((e) => {
        if (e.name === "AbortError") return;
        abort();
        if (onError) onError(EVENTS_ERROR.fetchError, e);
      });
  };

  return {
    start,
    abort,
  };
}
