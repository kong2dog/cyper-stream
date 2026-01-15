// Main Worker for CyperStream offloading

self.onmessage = (e) => {
    const { id, type, payload } = e.data;

    try {
        let result = null;
        switch (type) {
            case 'CALCULATE_JITTER':
                result = calculateJitter(payload);
                break;
            case 'PROCESS_STATS':
                result = processStats(payload);
                break;
            default:
                throw new Error(`Unknown task type: ${type}`);
        }
        self.postMessage({ id, result });
    } catch (err) {
        self.postMessage({ id, error: err.message });
    }
};

function calculateJitter(bufferLevels) {
    // Simple std deviation calculation or similar
    if (!bufferLevels || bufferLevels.length === 0) return 0;
    const mean = bufferLevels.reduce((a, b) => a + b, 0) / bufferLevels.length;
    const variance = bufferLevels.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / bufferLevels.length;
    return Math.sqrt(variance);
}

function processStats(stats) {
    // Heavy JSON processing simulation
    return {
        ...stats,
        processedAt: Date.now()
    };
}
