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
        return this.sensors;
    }

    get connected(): boolean {
        return this._connected;
    }

    private init(): void {
        this._socket = new SocketIO(this.serverUrl);
        this.syncServerTime();
        this._timeSynchronizationIntervalId = setInterval(this.syncServerTime.bind(this), 60000 *this._timeSynchronizationFrequency);
        this._socket.on('connect', this.onSocketConnected.bind(this));
        this._socket.on('disconnect', this.onSocketDisconnected.bind(this));
        this._socket.on('Time', this.onReceiveTime.bind(this));
        this._socket.on('Who', this.onReceiveWho.bind(this));
        this._socket.on('Events', this.onReceiveEvents.bind(this));
        this._socket.on('Sensors', this.onReceiveSensors.bind(this));
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
        }).catch((error) => {
            console.log(error);
        });
    }

    private reconnect(): void {
        if(this._reconnectIntents > 10) {
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
        this.publish(AtsEvents.WEB_SOCKET_CONNECTED);
        clearInterval(this._reconnectIntervalId);
        this._reconnectIntents = 0;
    }

    private onSocketDisconnected(): void {
        this._connected = false;
        this.publish(AtsEvents.WEB_SOCKET_DISCONNECTED);
        this._reconnectIntervalId = setInterval(this.reconnect.bind(this), 3000);
    }

    private onReceiveTime(time: number): void {
        const serverTime = new Date(time * 1000);
        const localTime = new Date();
        this._timeDiff = localTime.getTime() - serverTime.getTime();
        this._lastTimeSynchronization = localTime;
    }

    private onReceiveWho(): void {
        const token = parseInt(this.getToken());
        const payload = { code: token, clientId: this.clientId };
        this._socket.emit('is', payload);
    }

    private payloadEventsIncludes(event: string): boolean {
        let e: boolean = false;
        PayloadEvents.forEach((v: string) => {
            if(v == event) {
                e = true;
                return;
            }
        });
        return e;
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
                this._socket.on(config[event], data => {
                    this.publish(AtsEvents[event], data);
                });
            }
        }
    }

    onReceiveSensors(sensors: any): void {
        this._sensors = sensors;
    }

    private publish(event: string, data?: any): void {
        if(AtsEvents[event] && this._eventHandlers[event]) {
            this._eventHandlers[event].forEach(h => h(data));
        }
    }

    getState(): Promise<HttpResponse> {
        const url = `${this.serverUrl}/state`;
        const method = 'GET';
        const token = this.getToken();
        const headers = { 'Authorization': `${this.clientId} ${token}` };
        const opts: HttpRequestOptions = { url, method, headers };

        return request(opts);
    };

    arm(mode: string, code: string): Promise<HttpResponse> {
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

        return request(opts);
    };

    disarm(code: string): Promise<HttpResponse> {
        const url = `${this.serverUrl}/disarm`;
        const method = 'PUT';
        const content = `code=${code}`;
        const token = this.getToken();
        const headers = {
            'Authorization': `${this.clientId} ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        const opts: HttpRequestOptions = { url, method, content, headers };

        return request(opts);
    };

    bypass (location: string, code: string): Promise<HttpResponse> {
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

        return request(opts);
    };

    bypassAll(locations: any, code: string): Promise<HttpResponse> {
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

        return request(opts);
    };

    clearBypass(code: string): Promise<HttpResponse> {
        const url = `${this.serverUrl}/bypass/all`;
        const method = 'DEL';
        const content = `code=${code}`;
        const token = this.getToken();
        const headers = {
            'Authorization': `${this.clientId} ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        const opts: HttpRequestOptions = { url, method, content, headers };

        return request(opts);
    };

    programm(code: string): Promise<HttpResponse> {
        const url = `${this.serverUrl}/config/programm`;
        const method = 'PUT';
        const content = `code=${code}`;
        const token = this.getToken();
        const headers = {
            'Authorization': `${this.clientId} ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        const opts: HttpRequestOptions = { url, method, content, headers };

        return request(opts);
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