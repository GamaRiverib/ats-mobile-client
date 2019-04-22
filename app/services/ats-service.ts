import { SocketIO } from 'nativescript-socketio';
import { request, HttpResponse, HttpRequestOptions } from 'tns-core-modules/http';
import { getTotp } from './otp-provider';

const serverUrl: string = "http://192.168.137.1:3000";
const clientId: string = "galaxys6";
const secret: string = "79STCF7GW7Q64TLD";

var atsServiceInstance = null;

export const AtsEvents = {
    NOT_AUTHORIZED: 'NOT_AUTHORIZED',
    PIN_CODE_UPDATED: 'PIN_CODE_UPDATED',
    SYSTEM_STATE_CHANGED: 'SYSTEM_STATE_CHANGED',
    SENSOR_REGISTERED: 'SENSOR_REGISTERED',
    SENSOR_CHANGED: 'SENSOR_CHANGED',
    SENSOR_DELETED: 'SENSOR_DELETED',
    SENSOR_ACTIVED: 'SENSOR_ACTIVED',
    ENTRY_TIME_CHANGED: 'ENTRY_TIME_CHANGED',
    EXIT_TIME_CHANGED: 'EXIT_TIME_CHANGED',
    BEEP_CHANGED: 'BEEP_CHANGED',
    SILENT_ALARM_CHANGED: 'SILENT_ALARM_CHANGED',
    CENTRAL_PHONE_CHANGED: 'CENTRAL_PHONE_CHANGED',
    ADMIN_PHONE_CHANGED: 'ADMIN_PHONE_CHANGED',
    OWNER_PHONE_ADDED: 'OWNER_PHONE_ADDED',
    OWNER_PHONE_CHANGED: 'OWNER_PHONE_CHANGED',
    OWNER_PHONE_DELETED: 'OWNER_PHONE_DELETED',
    CENTRAL_EMAIL_CHANGED: 'CENTRAL_EMAIL_CHANGED',
    ADMIN_EMAIL_CHANGED: 'ADMIN_EMAIL_CHANGED',
    OWNER_EMAIL_ADDED: 'OWNER_EMAIL_ADDED',
    OWNER_EMAIL_CHANGED: 'OWNER_EMAIL_CHANGED',
    OWNER_EMAIL_DELETED: 'OWNER_EMAIL_DELETED',
    BYPASS_CHANGE: 'BYPASS_CHANGE',
    SYSTEM_ARMED: 'SYSTEM_ARMED',
    SYSTEM_DISARMED: 'SYSTEM_DISARMED',
    SYSTEM_ALARMED: 'SYSTEM_ALARMED',
    SYSTEM_ALERT: 'SYSTEM_ALERT',
    SIREN_ACTIVED: 'SIREN_ACTIVED',
    SIREN_SILENCED: 'SIREN_SILENCED',
    MAX_ALERTS: 'MAX_ALERTS',
    MAX_UNAUTHORIZED_INTENTS: 'MAX_UNAUTHORIZED_INTENTS',
    WEB_SOCKET_CONNECTED: 'WEB_SOCKET_CONNECTED',
    WEB_SOCKET_DISCONNECTED: 'WEB_SOCKET_DISCONNECTED',
};

export const ProtocolMesssages = {
    Time: 'Time',
    Events: 'Events',
    Sensors: 'Sensors',
    is: 'is',
    Who: 'Who',
    state: 'state',
    command: 'command'
};

const PayloadEvents = [
    AtsEvents.SYSTEM_STATE_CHANGED,
    AtsEvents.SYSTEM_ALARMED,
    AtsEvents.SYSTEM_ARMED,
    AtsEvents.SYSTEM_DISARMED,
    AtsEvents.SYSTEM_ALERT
];

export const AtsModes = ['AWAY', 'STAY', 'MAXIMUM', 'NIGHT STAY', 'INSTANT', 'CHIME'];

export const AtsStates = ['READY', 'DISARMED', 'LEAVING', 'ARMED', 'ENTERING', 'ALARMED', 'PROGRAMMING'];

export enum SensorTypes {
    PIR_MOTION = 0,
    MAGNETIC_SWITCH = 1,
    IR_SWITCH = 2
}

export enum SensorGroup {
    INTERIOR = 0,
    PERIMETER = 1,
    EXTERIOR = 2,
    ACCESS = 3
}

export interface SensorLocation {
    mac: string;
    pin: number;
}

export interface Sensor {
    location: SensorLocation;
    type: SensorTypes;
    name: string;
    group: SensorGroup;
    chime?: string;
}

export interface SystemState {
    before: number;
    state: number;
    mode: number;
    activedSensors: Array<number>;
    leftTime: number;
    uptime: number;
}

export enum AtsErrors {
    NOT_AUTHORIZED = 0,
    INVALID_SYSTEM_STATE = 1,
    BAD_REQUEST = 2,
    WAS_A_PROBLEM = 3,
    EMPTY_RESPONSE = 4
}

export class AtsService {

    private _connected: boolean = false;
    private _socket: SocketIO = null;
    private _timeDiff: number = 0;
    private _lastTimeSynchronization: Date = null;
    private _timeSynchronizationFrequency: number = 10;
    private _timeSynchronizationIntervalId: number = null;
    private _sensors: Array<Sensor> = [];
    private _eventHandlers: any = {};

    private _reconnectIntents: number = 0;
    private _reconnectIntervalId: number = null;

    private constructor(private serverUrl: string, private clientId: string, private secret: string) {
        this._connected = false;
        this.init();
    }

    static getInstance(): AtsService {
        if(atsServiceInstance === null) {
            atsServiceInstance = new AtsService(serverUrl, clientId, secret);
        }

        return atsServiceInstance;
    }

    get sensors(): Array<Sensor> {
        return this._sensors;
    }

    get connected(): boolean {
        return this._connected;
    }

    private init(): void {
        this._socket = new SocketIO(this.serverUrl);
        this.syncServerTime();
        this._timeSynchronizationIntervalId = setInterval(this.syncServerTime.bind(this), 60000 * this._timeSynchronizationFrequency);
        this._socket.on('connect', this.onSocketConnected.bind(this));
        this._socket.on('disconnect', this.onSocketDisconnected.bind(this));
        this._socket.on(ProtocolMesssages.Time, this.onReceiveTime.bind(this));
        this._socket.on(ProtocolMesssages.Who, this.onReceiveWho.bind(this));
        this._socket.on(ProtocolMesssages.Events, this.onReceiveEvents.bind(this));
        this._socket.on(ProtocolMesssages.Sensors, this.onReceiveSensors.bind(this));
        this._socket.connect();
        console.log(`AtsService connecting to server ${this.serverUrl}`);
    }

    private getToken(): string {
        const time = Date.now() - this._timeDiff;
        const epoch = Math.round(time / 1000.0);
        const code = getTotp(this.secret, { epoch: epoch });
        return code;
    }

    private syncServerTime(): void {
        const url = `${this.serverUrl}/uptime`;
        request({ url, method: 'GET' }).then((res: HttpResponse) => {
            const now = new Date();
            this._timeDiff = now.getTime() - parseInt(res.content.toString());
            this._lastTimeSynchronization = now;
        }).catch((reason: any) => {
            console.log(reason);
        });
    }

    private reconnect(): void {
        if(this._reconnectIntents > 5) {
            clearInterval(this._timeSynchronizationIntervalId);
            clearInterval(this._reconnectIntervalId);
            this._reconnectIntents = 0;
            this.init();
        } else {
            this._reconnectIntents++;
            this._socket.connect();
        }
    }

    private onSocketConnected(): void {
        this._connected = true;
        this._reconnectIntents = 0;
        clearInterval(this._reconnectIntervalId);
        this.publish(AtsEvents.WEB_SOCKET_CONNECTED);
    }

    private onSocketDisconnected(): void {
        this._connected = false;
        this._reconnectIntervalId = setInterval(this.reconnect.bind(this), 3000);
        this.publish(AtsEvents.WEB_SOCKET_DISCONNECTED);
    }

    private onReceiveTime(time: number): void {
        const serverTime = new Date(time * 1000);
        const localTime = new Date();
        this._timeDiff = localTime.getTime() - serverTime.getTime();
        this._lastTimeSynchronization = localTime;
    }

    private onReceiveWho(): void {
        const code = parseInt(this.getToken());
        const payload = { code, clientId: this.clientId };
        this._socket.emit(ProtocolMesssages.is, payload);
    }

    private payloadEventsIncludes(event: string): boolean {
        for (let i = 0; i < PayloadEvents.length; i++) {
            if (PayloadEvents[i] === event) {
                return true;
            } 
        }
        return false;
    }

    private onReceiveEvents(config: any): void {
        for(let event in config) {
            if (this.payloadEventsIncludes(event)) {
                this._socket.on(config[event], (data) => {
                    const d = data.toString();
                    const systemState = { state: 0, mode: 0, activedSensors: [] };
                    systemState.state = Number.parseInt(d.charAt(0), 32);
                    systemState.mode = Number.parseInt(d.charAt(1), 32);
                    const leftTimeout = Number.parseInt(d.charAt(2) + '' + d.charAt(3), 32);
                    const count = Number.parseInt(d.charAt(4) + '' + d.charAt(5), 32);
                    for(let i = 6; i < 6 + count * 2; i++) {
                        systemState.activedSensors.push(Number.parseInt(d.charAt(i++) + '' + d.charAt(i), 32));
                    }
                    const payload = { system: systemState, leftTimeout: leftTimeout };
                    this.publish(AtsEvents[event], payload);
                });
            } else {
                this._socket.on(config[event], data => this.publish(AtsEvents[event], data));
            }
        }
    }

    private publish(event: string, data?: any): void {
        if(AtsEvents[event] && this._eventHandlers[event]) {
            this._eventHandlers[event].forEach(h => h(data));
        }
    }

    private onReceiveSensors(sensors: any): void {
        if (sensors && Array.isArray(sensors)) {
            this._sensors = sensors;
        } else {
            this._sensors = [];
        }
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

    getState(): Promise<SystemState> {
        const url = `${this.serverUrl}/state`;
        const method = 'GET';
        const token = this.getToken();
        const headers = { 'Authorization': `${this.clientId} ${token}` };
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
    };

    arm(mode: string, code?: string): Promise<void> {
        const url = `${this.serverUrl}/arm`;
        const method = 'PUT';
        let content = `mode=${mode}`;
        if(code) {
            content += `&code=${code}`;
        }
        const token = this.getToken();
        const headers = { 
            'Authorization': `${this.clientId} ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        const opts: HttpRequestOptions = { url, method, content, headers };

        return this.apiRequest(opts);
    };

    disarm(code: string): Promise<void> {
        const url = `${this.serverUrl}/disarm`;
        const method = 'PUT';
        const content = `code=${code}`;
        const token = this.getToken();
        const headers = {
            'Authorization': `${this.clientId} ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        const opts: HttpRequestOptions = { url, method, content, headers };

        return this.apiRequest(opts);
    };

    bypass (location: string, code: string): Promise<void> {
        const url = `${this.serverUrl}/bypass/one`;
        const method = 'PUT';
        let content = `location=${location}`;
        if(code) {
            content += `&code=${code}`;
        }
        const token = this.getToken();
        const headers = {
            'Authorization': `${this.clientId} ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        const opts: HttpRequestOptions = { url, method, content, headers };

        return this.apiRequest(opts);
    };

    bypassAll(locations: any, code: string): Promise<void> {
        const url = `${this.serverUrl}/bypass/all`;
        const method = 'PUT';
        let content = `locations=${locations}`;
        if(code) {
            content += `&code=${code}`;
        }
        const token = this.getToken();
        const headers = {
            'Authorization': `${this.clientId} ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        const opts: HttpRequestOptions = { url, method, content, headers };

        return this.apiRequest(opts);
    };

    clearBypass(code: string): Promise<void> {
        const url = `${this.serverUrl}/bypass/all`;
        const method = 'DEL';
        const content = `code=${code}`;
        const token = this.getToken();
        const headers = {
            'Authorization': `${this.clientId} ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        const opts: HttpRequestOptions = { url, method, content, headers };

        return this.apiRequest(opts);
    };

    programm(code: string): Promise<void> {
        const url = `${this.serverUrl}/config/programm`;
        const method = 'PUT';
        const content = `code=${code}`;
        const token = this.getToken();
        const headers = {
            'Authorization': `${this.clientId} ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        const opts: HttpRequestOptions = { url, method, content, headers };

        return this.apiRequest(opts);
    };

    subscribe(event: string, callback: (data: any) => void): void {
        if(AtsEvents[event]) {
            if(!this._eventHandlers[event]) {
                this._eventHandlers[event] = [];
            }
            if(typeof callback === 'function') {
                this._eventHandlers[event].push(callback);
            }
        }
    };

    getSensor(index: number): Sensor | null {
        if(index >= 0 && index < this._sensors.length) {
            return this._sensors[index];
        }
        return null;
    };
    
}