import AudioContextLoader from "./audioContextLoader";

export default class Audio {
    constructor(player) {
        return new AudioContextLoader(player);
    }
}
