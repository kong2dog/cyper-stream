import { WorkerPool } from '../worker/worker-pool.js';
import { logger } from '../../utils/logger.js';

/**
 * 基于 Canvas 的渲染器 (高性能 Worker 渲染)
 * @author kong2dog
 */
export class CanvasRenderer {
    constructor(container, options) {
        this.container = container;
        this.options = options;
        this.canvas = document.createElement('canvas');
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.objectFit = 'contain';
        this.container.appendChild(this.canvas);
        
        try {
            this.offscreen = this.canvas.transferControlToOffscreen();
        } catch (e) {
            logger.error('OffscreenCanvas 不支持或已转移', e);
        }
        
        this.workerObj = null;
    }

    load(url) {
        if (!this.offscreen) {
            logger.error('无法加载: OffscreenCanvas 失败');
            return;
        }

        this.workerObj = WorkerPool.getInstance().acquire();
        
        // 将 offscreen canvas 转移到 worker
        this.workerObj.worker.postMessage({
            type: 'init',
            payload: { canvas: this.offscreen }
        }, [this.offscreen]);
        
        this.workerObj.worker.postMessage({
            type: 'connect',
            payload: { url }
        });
        
        this.offscreen = null; // 已转移
    }

    destroy() {
        if (this.workerObj) {
            this.workerObj.worker.postMessage({ type: 'close' });
            WorkerPool.getInstance().release(this.workerObj);
            this.workerObj = null;
        }
        this.canvas.remove();
    }
}
