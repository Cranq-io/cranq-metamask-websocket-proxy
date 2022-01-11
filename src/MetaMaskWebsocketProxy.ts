import express, {Express} from "express";
import * as http from "http";
import WebSocket from "ws";
import path from "path";

const DEFAULT_PORT = 3333;

// Generate a request id to track callbacks from async methods
const generateRequestId = () => {
  const s4 = () =>
    Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
};

const parseResponse = (response: string) => {
  try {
    return JSON.parse(response);
  } catch (e) {
    return undefined;
  }
};

type MetaMaskWebsocketProxyOptions = {
  port: number,
};

type RequestQueueItem = [string, WebSocket];
type JsonRpcRequest = {
  jsonrpc: string,
  id: number
}

type JsonRpcResponse = {
  jsonrpc: string,
  id: number,
  result: unknown
}

export default class MetaMaskWebsocketProxy {
  private config: MetaMaskWebsocketProxyOptions;
  private metaMaskClient?: WebSocket;
  private clients: Set<WebSocket> = new Set();
  private _app?: Express;
  private _server?: http.Server;
  private _wss?: WebSocket.WebSocketServer;
  private requestQueue: RequestQueueItem[] = [];
  private responseMap: Map<string, [JsonRpcRequest, WebSocket]> = new Map();

  constructor(options: MetaMaskWebsocketProxyOptions) {
    this.config = Object.assign({}, {port: DEFAULT_PORT}, options);
  }

  async start() {
    this._app = express();
    this._app.use(express.static(path.resolve(__dirname, "../client")));
    this._server = this._app.listen(
      this.config.port,
      "localhost", // for security reasons, it can only run on localhost
      () => {
        this._wss = new WebSocket.Server({server: this._server});
        this._wss.on("connection", (ws: WebSocket) => this.onConnect(ws));
      });
    this._server.on("error", err => {
      throw new Error(`Error occurred, stopping MetaMaskWebsocketProxy. Error was ${err.message}`);
    });
  }

  async stop() {
    this._wss && this._wss.close(() => {
      this._server && this._server.close(() => {
        this.clients = new Set();
        this.requestQueue = [];
        this.responseMap = new Map();
        return true;
      });
    });
  }

  onConnect(ws: WebSocket) {
    this.clients.add(ws);
    ws.on("message", (data) => {
      this.onMessage(ws, data.toString())
    });
  }

  onMessage = (client: WebSocket, msg: string) => {
    if (msg === "MetaMask client connected") {
      this.onMetaMaskClientConnected(client);
    } else {
      if (client === this.metaMaskClient) {
        this.forwardResponse(msg);
      } else {
        this.forwardRequest(msg, client);
      }
    }
  };

  private onMetaMaskClientConnected(client: WebSocket): void {
    if (
      this.metaMaskClient && this.metaMaskClient.readyState === WebSocket.OPEN
    ) {
      client.close(); // don't accept another metamask client
      return;
    }
    this.clients.delete(client); // remove from clients as it is special
    this.metaMaskClient = client;
    this.flushRequestQueue();
  }

  flushRequestQueue() {
    const queue = this.requestQueue;
    this.requestQueue = [];
    queue.forEach(([request, client]) => this.forwardRequest(request, client));
  }

  ready() {
    return (
      this.metaMaskClient && this.metaMaskClient.readyState === WebSocket.OPEN
    );
  }

  forwardRequest(incomingRequestJson: string, client: WebSocket) {
    if (this.metaMaskClient) {
      const requestId = generateRequestId();
      const action = "execute";
      const request = JSON.parse(incomingRequestJson) as JsonRpcRequest;
      const msg = JSON.stringify({
        action,
        requestId,
        payload: request
      });
      this.responseMap.set(requestId, [request, client]);
      this.metaMaskClient.send(msg);
    } else {
      this.requestQueue.push([incomingRequestJson, client]);
    }
  }

  forwardResponse(incomingResponseJson: string) {
    const {requestId, payload} = parseResponse(incomingResponseJson);

    const [request, client] = this.responseMap.get(requestId) || [undefined, undefined];
    if (client && request) {
      const response = {
        id: request.id,
        jsonrpc: request.jsonrpc,
        result: payload
      } as JsonRpcResponse;
      client.send(JSON.stringify(response));
      this.responseMap.delete(requestId);
    } else {
      console.log(`Could not find client for requestId ${requestId}`);
    }
  }
}