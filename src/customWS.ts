import WebSocket = require("ws");

interface CustomSocket extends WebSocket {
    isAlive: boolean
}

// @ts-ignore
class WS {
    private heartbeat: ReturnType<typeof setInterval>;
    private _wss: WebSocket.Server;


    constructor(port: number) {
        this._wss = new WebSocket.Server({port});

        this._wss.on('connection', this.handleConnection)
    }

    private handleConnection(socket: CustomSocket) {
        socket.on('pong', () => socket.isAlive = true)
    }

}

export {WS};