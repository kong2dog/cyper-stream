import RecordRTCLoader from "./recordRTCLoader";

export default class Recorder {
    constructor(player) {
        return new RecordRTCLoader(player);
    }
}
