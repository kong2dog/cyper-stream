export class WorkerPool {
    constructor(workerScript, maxWorkers = navigator.hardwareConcurrency ? Math.floor(navigator.hardwareConcurrency / 2) : 2) {
        this.workerScript = workerScript;
        this.maxWorkers = maxWorkers || 2;
        this.workers = [];
        this.tasks = [];
        this.activeWorkers = new Map(); // worker -> activeTaskCount
    }

    init() {
        // Pre-warm a few workers? Or lazy load. Lazy is better for resources.
    }

    _createWorker() {
        if (this.workers.length >= this.maxWorkers) {
            return null;
        }
        const worker = new Worker(this.workerScript, { type: 'module' });
        worker.onmessage = (e) => this._handleWorkerMessage(worker, e);
        this.workers.push(worker);
        this.activeWorkers.set(worker, 0);
        return worker;
    }

    runTask(data, transferList = []) {
        return new Promise((resolve, reject) => {
            const task = { data, transferList, resolve, reject };
            this._schedule(task);
        });
    }

    _schedule(task) {
        // Find least busy worker
        let bestWorker = null;
        let minLoad = Infinity;

        // Try to find existing worker
        for (const worker of this.workers) {
            const load = this.activeWorkers.get(worker);
            if (load < minLoad) {
                minLoad = load;
                bestWorker = worker;
            }
        }

        // If all busy or we can create new one and load is non-zero
        if ((!bestWorker || minLoad > 0) && this.workers.length < this.maxWorkers) {
            bestWorker = this._createWorker();
        }

        if (bestWorker) {
            this._execute(bestWorker, task);
        } else {
            this.tasks.push(task);
        }
    }

    _execute(worker, task) {
        const load = this.activeWorkers.get(worker);
        this.activeWorkers.set(worker, load + 1);
        
        // We need a way to map response to promise. 
        // Simple request/response ID approach needed in real generic pool.
        // For simplicity here, we assume one-off tasks or we attach ID.
        const taskId = Date.now() + Math.random();
        
        // Attach temporary handler or map ID. 
        // A robust pool needs a Map<id, {resolve, reject}>.
        if (!worker.pendingTasks) worker.pendingTasks = new Map();
        worker.pendingTasks.set(taskId, task);

        worker.postMessage({ id: taskId, ...task.data }, task.transferList);
    }

    _handleWorkerMessage(worker, e) {
        const { id, result, error } = e.data;
        if (worker.pendingTasks && worker.pendingTasks.has(id)) {
            const task = worker.pendingTasks.get(id);
            if (error) task.reject(error);
            else task.resolve(result);
            
            worker.pendingTasks.delete(id);
            
            // Decrement load
            const load = this.activeWorkers.get(worker);
            this.activeWorkers.set(worker, load - 1);

            // Check queue
            if (this.tasks.length > 0) {
                const nextTask = this.tasks.shift();
                this._execute(worker, nextTask);
            }
        }
    }

    terminate() {
        this.workers.forEach(w => w.terminate());
        this.workers = [];
        this.activeWorkers.clear();
    }
}
