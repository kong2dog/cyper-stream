// 作者：kong2dog
// 日期：2026-1-21
// 版本：1.0.0
// 描述：功能性 Fetch 流，用于从 URL 加载流媒体数据
import { EVENTS_ERROR, FETCH_ERROR } from "../../constant";
import { isFalse, isFetchSuccess } from "../../utils";

/**
 * 功能性 Fetch 流
 * @param {string} url - 流媒体 URL
 * @param {Object} options - Fetch 选项
 * @param {Object} callbacks - 流事件回调函数
 * @param {Function} callbacks.onChunk - 当接收到数据块时调用
 * @param {Function} callbacks.onSuccess - 当流连接成功时调用
 * @param {Function} callbacks.onError - 当发生错误时调用
 * @param {Function} callbacks.onStats - 当有流比特率统计信息时调用
 * @returns {Object} - 控制对象 { start, abort }
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
      },
    );

    fetch(url, fetchOptions)
      .then((res) => {
        if (isFalse(isFetchSuccess(res))) {
          abort();
          if (onError) {
            onError(
              EVENTS_ERROR.fetchError,
              `fetch response status is ${res.status} and ok is ${res.ok}`,
            );
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
                // 流结束
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
