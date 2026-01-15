/**
 * 日志工具类
 * @author kong2dog
 */
export class Logger {
    constructor(prefix = 'CyperStream') {
        this.prefix = prefix;
        this.enable = true;
    }

    info(...args) {
        if (!this.enable) return;
        console.log(`[${this.prefix}]`, ...args);
    }

    warn(...args) {
        if (!this.enable) return;
        console.warn(`[${this.prefix}]`, ...args);
    }

    error(...args) {
        if (!this.enable) return;
        console.error(`[${this.prefix}]`, ...args);
    }
}

export const logger = new Logger();
