import { Channel, SystemState, SensorLocation, AtsErrors, ProtocolMesssages } from "./ats-service";
import { SocketIO } from 'nativescript-socketio';
import { HttpRequestOptions, HttpResponse, request } from "tns-core-modules/http/http";

const serverUrl: string = 'http://192.168.137.1:3000';

export class WebSocketChannel implements Channel {

    private _connected: boolean = false;
    private _socket: SocketIO = null;

    private _reconnectIntents: number = 0;
    private _reconnectIntervalId: number = null;

    private _connectedHandler: () => void = null;
    private _disconnectedHandler: () => void = null;

    private _receiveTimeHandler: (time: number) => void = null;
    private _receiveWhoHandler: () => void = null;
    private _receiveEventsHandler: (config: any) => void = null;
    private _receiveSensorsHandler: (sensors: any) => void = null;

    constructor(private clientId: string) {
        this.init();
    }

    private init(): void {
        this._socket = new SocketIO(serverUrl);
        this._socket.on('connect', this.onSocketConnected.bind(this));
        this._socket.on('disconnect', this.onSocketDisconnected.bind(this));
        this._socket.on(ProtocolMesssages.Time, this.onReceiveTimeHandler.bind(this));
        this._socket.on(ProtocolMesssages.Who, this.onReceiveWhoHandler.bind(this));
        this._socket.on(ProtocolMesssages.Events, this.onReceiveEventsHandler.bind(this));
        this._socket.on(ProtocolMesssages.Sensors, this.onReceiveSensorsHandler.bind(this));
    }

    private apiRequest(opts: HttpRequestOptions): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            request(opts).then((res: HttpResponse) => {
                switch (res.statusCode) {
                    case 401:
                    case 403:
                        return reject({ error: AtsErrors.NOT_AUTHORIZED });

                    case 409:
                        return reject({ error: AtsErrors.INVALID_SYSTEM_STATE });

                    case 204:
                        return resolve();

                    default:
                        return reject({ error: AtsErrors.BAD_REQUEST });
                }
            }).catch((reason: any) => {
                console.log(reason);
                reject({ error: AtsErrors.WAS_A_PROBLEM });
            });
        });
    }

    private reconnect(): void {
        if(this._reconnectIntents > 5) {
            clearInterval(this._reconnectIntervalId);
            this._reconnectIntents = 0;
            this._reconnectIntervalId = setInterval(this.reconnect.bind(this), 60000 * 5);
            if(this._disconnectedHandler) {
                this._disconnectedHandler();
            }
        } else {
            this._reconnectIntents++;
            this._socket.connect();
        }
    }

    private onSocketConnected(): void {
        this._connected = true;
        this._reconnectIntents = 0;
        clearInterval(this._reconnectIntervalId);
        if(this._connectedHandler) {
            this._connectedHandler();
        }
    }

    private onSocketDisconnected(): void {
        this._connected = false;
        this._reconnectIntervalId = setInterval(this.reconnect.bind(this), 3000);
        if(this._disconnectedHandler) {
            this._disconnectedHandler();
        }
    }

    private onReceiveTimeHandler(time: number): void {
        if(this._receiveTimeHandler) {
            this._receiveTimeHandler(time);
        }
    }

    private onReceiveWhoHandler(): void {
        if(this._receiveWhoHandler) {
            this._receiveWhoHandler();
        }
    }

    private onReceiveEventsHandler(config: any): void {
        if(this._receiveEventsHandler) {
            this._receiveEventsHandler(config);
        }
    }

    private onReceiveSensorsHandler(sensors: any): void {
        if(this._receiveSensorsHandler) {
            this._receiveSensorsHandler(sensors);
        }
    }

    connect(): void {
        console.log(`AtsService connecting to server ${serverUrl}`);
        this._socket.connect();
    }

    connected(): boolean {
        return this._connected;
    }

    onConnected(handler: () => void): void {
        this._connectedHandler = handler;
    }

    onDisconnected(handler: () => void): void {
        this._disconnectedHandler = handler;
    }

    getServerTime(): Promise<number> {
        const url = `${serverUrl}/uptime`;
        return new Promise<number>((resolve, reject) => {
            request({ url, method: 'GET' }).then((res: HttpResponse) => {
                let time: number = parseInt(res.content.toString());
                resolve(time);
            }).catch(reject);
        });
    }

    sendIsMessage(token: string): void {
        const clientId = this.clientId;
        const code = parseInt(token);
        const payload = { code, clientId };
        this._socket.emit(ProtocolMesssages.is, payload);
    }

    getState(token: string): Promise<SystemState> {
        const clientId = this.clientId;
        const url = `${serverUrl}/state`;
        const method = 'GET';
        const headers = { 'Authorization': `${clientId} ${token}` };
        const opts: HttpRequestOptions = { url, method, headers };

        return new Promise<SystemState>((resolve, reject) => {
            request(opts).then((res: HttpResponse) => {
                switch (res.statusCode) {
                    case 403:
                    case 401:
                        return reject({ error: AtsErrors.NOT_AUTHORIZED });

                    case 200:
                    case 201:
                    case 204:
                        if (res.content) {
                            const data: SystemState = res.content.toJSON();
                            return resolve(data);
                        }
                        return reject({ error: AtsErrors.EMPTY_RESPONSE });

                    default:
                        return reject({ error: AtsErrors.WAS_A_PROBLEM });
                }
            }).catch((reason: any) => {
                console.log(reason);
                reject({ error: AtsErrors.WAS_A_PROBLEM });
            });
        });
    }
    
    arm(token: string, mode: number, code?: string): Promise<void> {
        const clientId = this.clientId;
        const url = `${serverUrl}/arm`;
        const method = 'PUT';
        let content = `mode=${mode}`;
        if(code) {
            content += `&code=${code}`;
        }
        const headers = { 
            'Authorization': `${clientId} ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        const opts: HttpRequestOptions = { url, method, content, headers };

        return this.apiRequest(opts);
    }

    disarm(token: string, code: string): Promise<void> {
        const clientId = this.clientId;
        const url = `${serverUrl}/disarm`;
        const method = 'PUT';
        const content = `code=${code}`;
        const headers = {
            'Authorization': `${clientId} ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        const opts: HttpRequestOptions = { url, method, content, headers };

        return this.apiRequest(opts);
    }

    bypass(token: string, location: SensorLocation, code: string): Promise<void> {
        const clientId = this.clientId;
        const url = `${serverUrl}/bypass/one`;
        const method = 'PUT';
        let content = `location=${JSON.stringify(location)}`;
        if(code) {
            content += `&code=${code}`;
        }
        const headers = {
            'Authorization': `${clientId} ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        const opts: HttpRequestOptions = { url, method, content, headers };

        return this.apiRequest(opts);
    }

    bypassAll(token: string, locations: SensorLocation[], code: string): Promise<void> {
        const clientId = this.clientId;
        const url = `${serverUrl}/bypass/all`;
        const method = 'PUT';
        let content = `locations=${JSON.stringify(locations)}`;
        if(code) {
            content += `&code=${code}`;
        }
        const headers = {
            'Authorization': `${clientId} ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        const opts: HttpRequestOptions = { url, method, content, headers };

        return this.apiRequest(opts);
    }

    clearBypass(token: string, code: string): Promise<void> {
        const clientId = this.clientId;
        const url = `${serverUrl}/unbypass/all`;
        const method = 'PUT';
        const content = `code=${code}`;
        const headers = {
            'Authorization': `${clientId} ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        const opts: HttpRequestOptions = { url, method, content, headers };

        return this.apiRequest(opts);
    }

    clearBypassOne(token: string, location: SensorLocation, code: string): Promise<void> {
        const clientId = this.clientId;
        const url = `${serverUrl}/unbypass/one`;
        const method = 'PUT';
        let content = `location=${JSON.stringify(location)}`;
        if(code) {
            content += `&code=${code}`;
        }
        const headers = {
            'Authorization': `${clientId} ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        const opts: HttpRequestOptions = { url, method, content, headers };

        return this.apiRequest(opts);
    }

    programm(token: string, code: string): Promise<void>{
        const clientId = this.clientId;
        const url = `${serverUrl}/config/programm`;
        const method = 'PUT';
        const content = `code=${code}`;
        const headers = {
            'Authorization': `${clientId} ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        const opts: HttpRequestOptions = { url, method, content, headers };

        return this.apiRequest(opts);
    }

    onReceiveTime(handler: (time: number) => void): void {
        this._receiveTimeHandler = handler;
    }

    onReceiveWho(handler: () => void): void {
        this._receiveWhoHandler = handler;
    }

    onReceiveEvents(handler: (config: any) => void): void {
        this._receiveEventsHandler = handler;
    }

    onReceiveSensors(handler: (sensors: any) => void): void {
        this._receiveSensorsHandler = handler;
    }

    subscribe(topic: string, callback: (data: any) => void): void {
        this._socket.on(topic, callback);
    }
}