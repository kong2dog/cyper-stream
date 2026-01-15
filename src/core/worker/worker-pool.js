import { logger } from '../../utils/logger.js';

/**
 * Worker 线程池管理
 * @author kong2dog
 */
export class WorkerPool {
    constructor() {
        // 要求: 限制 Worker 数量为 CPU 核心数的一半
        this.maxWorkers = Math.max(1, Math.floor((navigator.hardwareConcurrency || 4) / 2));
        this.workers = []; 
        logger.info(`WorkerPool 已初始化。最大 Worker 数: ${this.maxWorkers}`);
    }

    static getInstance() {
        if (!WorkerPool.instance) {
            WorkerPool.instance = new WorkerPool();
        }
        return WorkerPool.instance;
    }

    acquire() {
        // 负载均衡策略:
        // 1. 寻找空闲 Worker
        let candidate = this.workers.find(w => w.load === 0);
        if (candidate) {
            candidate.load++;
            return candidate;
        }

        // 2. 如果未达到限制，创建新 Worker
        if (this.workers.length < this.maxWorkers) {
            return this.createWorker();
        }

        // 3. 复用负载最小的 Worker (轮询 / 最小连接数)
        const sorted = this.workers.sort((a, b) => a.load - b.load);
        candidate = sorted[0];
        candidate.load++;
        logger.warn(`Worker 池已满。复用 Worker ${candidate.id}，当前负载: ${candidate.load}`);
        return candidate;
    }

    createWorker() {
        // 使用 Vite 的 worker 导入语法支持
        const worker = new Worker(new URL('./decoder.worker.js', import.meta.url), { type: 'module' });
        const id = Math.random().toString(36).substr(2, 9);
        const workerObj = { id, worker, load: 1 };
        
        worker.addEventListener('error', (e) => {
            logger.error(`Worker ${id} 错误:`, e);
        });

        this.workers.push(workerObj);
        logger.info(`创建了新 Worker ${id}。总数: ${this.workers.length}`);
        return workerObj;
    }

    release(workerObj) {
        const found = this.workers.find(w => w.id === workerObj.id);
        if (found) {
            found.load = Math.max(0, found.load - 1);
            logger.info(`释放了 Worker ${found.id}。负载: ${found.load}`);
        }
    }
}
