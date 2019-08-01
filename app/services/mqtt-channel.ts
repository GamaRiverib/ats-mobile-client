import { Channel, SystemState, SensorLocation, AtsErrors } from './ats-service';
import { MQTTClient, ClientOptions, SubscribeOptions, Message } from 'nativescript-mqtt';

const brokerUrl: string = '192.168.137.1';
const brokerPort: number = 9001;
const mqttUser: string = '';
const mqttPass: string = '';
const mqttTopic: string = 'ats';
const mqttCmnd: string = 'cmnd';

const timeout: number = 30000;

export class MQTTChannel implements Channel {

    private _connected: boolean = false;
    private _mqtt: MQTTClient = null;

    private _connectedHandler: () => void = null;
    private _disconnectedHandler: () => void = null;

    private _receiveTimeHandler: (time: number) => void = null;
    private _receiveWhoHandler: () => void = null;
    private _receiveEventsHandler: (config: any) => void = null;
    private _receiveSensorsHandler: (sensors: any) => void = null;

    private _listeners: { [event: string]: (data: any) => void } = {};

    constructor(private clientId: string) {
        this.init();
    }

    private init(): void {
        let opts: ClientOptions = {
            host: brokerUrl,
            port: brokerPort,
            retryOnDisconnect: true,
            useSSL: false,
            cleanSession: false,
            clientId: this.clientId
        };

        this._mqtt = new MQTTClient(opts);
        this._mqtt.onConnectionFailure.on(this.onMqttConnectionFailure.bind(this));
        this._mqtt.onConnectionSuccess.on(this.onMqttConnectionSuccess.bind(this));
        this._mqtt.onConnectionLost.on(this.onMqttConnectionLost.bind(this));
        this._mqtt.onMessageArrived.on(this.onMqttMessageArrived.bind(this));
    }

    private onMqttConnectionFailure(err: any): void {
        console.log('MQTT connection failure', err);
    }

    private onMqttConnectionSuccess(): void {
        this._connected = true;
        if (this._connectedHandler) {
            this._connectedHandler();
        }
        console.log('Connected to MQTT', brokerUrl, brokerPort);
        try {
            let subOpts: SubscribeOptions = { qos: 0};
            this._mqtt.subscribe(`${mqttTopic}/#`, subOpts);
        } catch(e) {
            console.log(e);
        }
    }

    private onMqttConnectionLost(err: any): void {
        this._connected = false;
        if(this._disconnectedHandler) {
            this._disconnectedHandler();
        }
        console.log('MQTT connection lost', err);
    }

    private onMqttMessageArrived(message: Message): void {
        const topic: string = message.topic;
        const event: string = topic.substr(mqttTopic.length + 1);
        const payload: string = message.payload;
        if(event == 'SENSORS') {
            this._receiveSensorsHandler(JSON.parse(payload));
        } else if(event == 'TIME') {
            let time: number = Number.parseInt(payload);
            if (Number.isInteger(time) && time > 0) {
                this._receiveTimeHandler(time);
            }
        } else if(event == 'EVENTS') {
            this._receiveEventsHandler(JSON.parse(payload));
        } else if (this._listeners[event]) {
            this._listeners[event](payload);
        }
    }

    private getMQTTRequest<T>(command: string, parser: (data: any) => T, token?: string): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            if (!this._connected) {
                reject({ error: AtsErrors.NOT_CONNECTED });
            }
            let messageId: string;
            if(token) {
                messageId = `${token}${Date.now().toString().substr(9)}`;
            } else {
                messageId = `${Date.now().toString().substr(3)}`;
            }
            let message: Message = {
                topic: `${mqttTopic}/${mqttCmnd}/${command}`,
                payload: messageId,
                bytes: null,
                qos: 0,
                retained: false
            };

            let subTopic: string = `RESULT/${messageId}`;

            this.subscribe(subTopic, (data: any) => {
                delete this._listeners[subTopic];
                clearTimeout(timeoutId);
                const response: T = parser(data);
                resolve(response);
            });

            let timeoutId = setTimeout(() => {
                delete this._listeners[subTopic];
                reject({ error: AtsErrors.TIMEOUT });
            }, timeout);

            this._mqtt.publish(message);
        });
    }

    connect(): void {
        console.log('Connecting to MQTT broker...');
        this._mqtt.connect(mqttUser, mqttPass);
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
        return this.getMQTTRequest<number>('TIME', Number.parseInt);
    }

    sendIsMessage(token: string): void {
        throw new Error("Method not implemented.");
    }

    getState(token: string): Promise<SystemState> {
        return this.getMQTTRequest<SystemState>('STATE', JSON.parse, token);
    }

    arm(token: string, mode: number, code?: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (!this._connected) {
                reject({ error: AtsErrors.NOT_CONNECTED });
            }

            const messageId: string = `${token}${Date.now().toString().substr(9)}`;
            const command: string = 'ARM';
            const clientId: string = this.clientId;
            const payload: any = { messageId, clientId, token, mode, code };
            
            let message: Message = {
                topic: `${mqttTopic}/${mqttCmnd}/${command}`,
                payload: JSON.stringify(payload),
                bytes: null,
                qos: 0,
                retained: false
            };

            let subTopic: string = `RESULT/${messageId}`;

            this.subscribe(subTopic, (data: any) => {
                delete this._listeners[subTopic];
                clearTimeout(timeoutId);
                if(data && data.toString() == 'TRUE') {
                    resolve();
                } else {
                    reject();
                }
            });

            let timeoutId = setTimeout(() => {
                delete this._listeners[subTopic];
                reject({ error: AtsErrors.TIMEOUT });
            }, timeout);

            this._mqtt.publish(message);
        });
    }

    disarm(token: string, code: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (!this._connected) {
                reject({ error: AtsErrors.NOT_CONNECTED });
            }

            const messageId: string = `${token}${Date.now().toString().substr(9)}`;
            const command: string = 'DISARM';
            const clientId: string = this.clientId;
            const payload: any = { messageId, clientId, token, code };
            
            let message: Message = {
                topic: `${mqttTopic}/${mqttCmnd}/${command}`,
                payload: JSON.stringify(payload),
                bytes: null,
                qos: 0,
                retained: false
            };

            let subTopic: string = `RESULT/${messageId}`;

            this.subscribe(subTopic, (data: any) => {
                delete this._listeners[subTopic];
                clearTimeout(timeoutId);
                if(data && data.toString() == 'TRUE') {
                    resolve();
                } else {
                    reject();
                }
            });

            let timeoutId = setTimeout(() => {
                delete this._listeners[subTopic];
                reject({ error: AtsErrors.TIMEOUT });
            }, timeout);

            this._mqtt.publish(message);
        });
    }

    bypass(token: string, location: SensorLocation, code: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (!this._connected) {
                reject({ error: AtsErrors.NOT_CONNECTED });
            }

            const messageId: string = `${token}${Date.now().toString().substr(9)}`;
            const command: string = 'BYPASS';
            const clientId: string = this.clientId;
            const payload: any = { messageId, clientId, token, code, location };
            
            let message: Message = {
                topic: `${mqttTopic}/${mqttCmnd}/${command}`,
                payload: JSON.stringify(payload),
                bytes: null,
                qos: 0,
                retained: false
            };

            let subTopic: string = `RESULT/${messageId}`;

            this.subscribe(subTopic, (data: any) => {
                delete this._listeners[subTopic];
                clearTimeout(timeoutId);
                if(data && data.toString() == 'TRUE') {
                    resolve();
                } else {
                    reject();
                }
            });

            let timeoutId = setTimeout(() => {
                delete this._listeners[subTopic];
                reject({ error: AtsErrors.TIMEOUT });
            }, timeout);

            try {
                this._mqtt.publish(message);
            } catch(e) {
                console.log(e);
                reject({ error: e });
            }
        });
    }

    bypassAll(token: string, locations: SensorLocation[], code: string): Promise<void> {
        throw new Error("Method not implemented.");
    }

    clearBypass(token: string, code: string): Promise<void> {
        throw new Error("Method not implemented.");
    }

    clearBypassOne(token: string, location: SensorLocation, code: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (!this._connected) {
                reject({ error: AtsErrors.NOT_CONNECTED });
            }

            const messageId: string = `${token}${Date.now().toString().substr(9)}`;
            const command: string = 'CLEARBYPASSONE';
            const clientId: string = this.clientId;
            const payload: any = { messageId, clientId, token, code, location };
            
            let message: Message = {
                topic: `${mqttTopic}/${mqttCmnd}/${command}`,
                payload: JSON.stringify(payload),
                bytes: null,
                qos: 0,
                retained: false
            };

            let subTopic: string = `RESULT/${messageId}`;

            this.subscribe(subTopic, (data: any) => {
                delete this._listeners[subTopic];
                clearTimeout(timeoutId);
                if(data && data.toString() == 'TRUE') {
                    resolve();
                } else {
                    reject();
                }
            });

            let timeoutId = setTimeout(() => {
                delete this._listeners[subTopic];
                reject({ error: AtsErrors.TIMEOUT });
            }, timeout);

            this._mqtt.publish(message);
        });
    }

    programm(token: string, code: string): Promise<void> {
        throw new Error("Method not implemented.");
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
        this._listeners[topic] = callback;
    }

}