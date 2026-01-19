/**
 * CyperStream Debugger
 */
export default class Debug {
    constructor(master) {
        this.log = (name, ...args) => {
            if (master._opt && master._opt.debug) {
                console.log(`CS: [${name}]`, ...args);
            }
        };

        this.warn = (name, ...args) => {
            if (master._opt && master._opt.debug) {
                console.warn(`CS: [${name}]`, ...args);
            }
        };

        this.error = (name, ...args) => {
            console.error(`CS: [${name}]`, ...args);
        };
    }
}
