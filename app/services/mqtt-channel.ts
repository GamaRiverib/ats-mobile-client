import { Channel, SystemState, SensorLocation, AtsErrors } from './ats-service';
import { MQTTClient, ClientOptions, SubscribeOptions, Message } from 'nativescript-mqtt';

const brokerUrl: string = 'postman.cloudmqtt.com';
const brokerPort: number = 30115;
const brokerSsl: boolean = true;
const mqttUser: string = 'yqdiugmw';
const mqttPass: string = '2sXis5gMuqK7';
const mqttTopic: string = 'ats';
const mqttCmnd: string = 'cmnd';

const timeout: number = 30000;

interface Listener {
    topic: string;
    callback: [(data: any) => void];
}

export class MQTTChannel implements Channel {

    private _connected: boolean = false;
    private _mqtt: MQTTClient = null;

    private _connectedHandler: () => void = null;
    private _disconnectedHandler: () => void = null;

    private _receiveTimeHandler: (time: number) => void = null;
    private _receiveWhoHandler: () => void = null;
    private _receiveEventsHandler: (config: any) => void = null;
    private _receiveSensorsHandler: (sensors: any) => void = null;

    private _lwtHandler: (online: boolean) => void = null;

    private _listeners: Listener[] = [];

    constructor(private clientId: string) {
        this.init();
    }

    private init(): void {
        let opts: ClientOptions = {
            host: brokerUrl,
            port: brokerPort,
            retryOnDisconnect: true,
            useSSL: brokerSsl,
            cleanSession: false,
            clientId: `${this.clientId}`
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
            this._mqtt.subscribe(`${mqttTopic}/TIME`, subOpts);
            this._mqtt.subscribe(`${mqttTopic}/SENSORS`, subOpts);
            this._mqtt.subscribe(`${mqttTopic}/EVENTS`, subOpts);
            this._mqtt.subscribe(`${mqttTopic}/LWT`, subOpts);
            // this._mqtt.subscribe(`${mqttTopic}/RESULT/#`, subOpts);
            // this._mqtt.subscribe(`${mqttTopic}/STATE/#`, subOpts);
            
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
        const subTopic: string = topic.substr(mqttTopic.length + 1);
        const payload: string = message.payload;
        if(subTopic == 'SENSORS') {
            const sensors = JSON.parse(payload);
            this._receiveSensorsHandler(Array.isArray(sensors) ? sensors : []);
        } else if(subTopic == 'TIME') {
            let time: number = Number.parseInt(payload);
            if (Number.isInteger(time) && time > 0) {
                this._receiveTimeHandler(time);
            }
        } else if(subTopic == 'EVENTS') {
            this._receiveEventsHandler(JSON.parse(payload));
        } else if(subTopic == 'LWT') {
            if (this._lwtHandler) {
                const online: boolean = payload.toLowerCase() == 'online';
                this._lwtHandler(online);
            }
        } else if(subTopic.startsWith('RESULT/')) {
            const messageId: string = subTopic.split('/')[1];
            this.listeners(messageId, payload);
            this.forgetResult(messageId);
        } else if(subTopic.startsWith('STATE/')) {
            const event: string = subTopic.split('/')[1];
            this.listeners(event, payload);
        }
    }

    private getListenerIndex(topic: string): number {
        let index: number = -1;
        this._listeners.forEach((l: Listener, i: number) => {
            if(l.topic == topic) {
                index = i;
                return;
            }
        });
        return index;
    }

    private addListener(topic: string, callback: (data: any) => void): void {
        let index: number = this.getListenerIndex(topic);
        if(index >= 0) {
            this._listeners[index].callback.push(callback);
        } else {
            this._listeners.push({ topic, callback: [callback] });
        }
    }

    private removeAllListeners(topic: string): void {
        let index: number = this.getListenerIndex(topic);
        if(index >= 0) {
            this._listeners.slice(index, 1);
        }
    }

    private listeners(topic: string, data: any): void {
        let index: number = this.getListenerIndex(topic);
        if(index >= 0) {
            const listeners = this._listeners[index].callback;
            listeners.forEach((l: (data: any) => void) => {
                if (l) {
                    l(data);
                }
            });
        }
    }

    private waitResult(messageId: string, callback: (data: any) => void): void {
        this._mqtt.subscribe(`${mqttTopic}/RESULT/${messageId}`, { qos: 0 });
        this.addListener(messageId, callback);
    }

    private forgetResult(messageId: string): void {
        this.removeAllListeners(messageId);
        this._mqtt.unsubscribe(`${mqttTopic}/RESULT/${messageId}`);
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
        return new Promise<number>((resolve, reject) => {
            if (!this._connected) {
                reject({ error: AtsErrors.NOT_CONNECTED });
            }
            let messageId: string = `${Date.now().toString().substr(3)}`;
            
            let message: Message = {
                topic: `${mqttTopic}/${mqttCmnd}/TIME`,
                payload: messageId,
                bytes: null,
                qos: 0,
                retained: false
            };

            const callback = (data: any) => {
                clearTimeout(timeoutId);
                timeoutId = null;
                const response: number = Number.parseInt(data);
                resolve(response);
            };

            this.waitResult(messageId, callback);

            let timeoutId = setTimeout(() => {
                this.forgetResult(messageId);
                reject({ error: AtsErrors.TIMEOUT });
            }, timeout);

            this._mqtt.publish(message);
        });
    }

    sendIsMessage(token: string): void {
        throw new Error("Method not implemented.");
    }

    getState(token: string): Promise<SystemState> {
        return new Promise<SystemState>((resolve, reject) => {
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
                topic: `${mqttTopic}/${mqttCmnd}/STATE`,
                payload: messageId,
                bytes: null,
                qos: 0,
                retained: false
            };

            const callback = (data: any): void => {
                clearTimeout(timeoutId);
                timeoutId = null;
                const response: SystemState = JSON.parse(data);
                resolve(response);
            };

            this.waitResult(messageId, callback);

            let timeoutId = setTimeout(() => {
                this.forgetResult(messageId);
                reject({ error: AtsErrors.TIMEOUT });
            }, timeout);

            this._mqtt.publish(message);
        });
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

            const callback = (data: any) => {
                clearTimeout(timeoutId);
                if(data && data.toString() == 'TRUE') {
                    resolve();
                } else {
                    reject();
                }
            };

            this.waitResult(messageId, callback);

            let timeoutId = setTimeout(() => {
                this.forgetResult(messageId);
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

            const callback = (data: any) => {
                clearTimeout(timeoutId);
                if(data && data.toString() == 'TRUE') {
                    resolve();
                } else {
                    reject();
                }
            };

            this.waitResult(messageId, callback);

            let timeoutId = setTimeout(() => {
                this.forgetResult(messageId);
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

            const callback = (data: any) => {
                clearTimeout(timeoutId);
                if(data && data.toString() == 'TRUE') {
                    resolve();
                } else {
                    reject();
                }
            };

            this.waitResult(messageId, callback);

            let timeoutId = setTimeout(() => {
                this.forgetResult(messageId);
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

            const callback = (data: any) => {
                clearTimeout(timeoutId);
                if(data && data.toString() == 'TRUE') {
                    resolve();
                } else {
                    reject();
                }
            };

            this.waitResult(messageId, callback);

            let timeoutId = setTimeout(() => {
                this.forgetResult(messageId);
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
        this._mqtt.subscribe(`${mqttTopic}/STATE/${topic}`, { qos: 0 });
        this.addListener(topic, callback);
    }

    onLWT(handler: (online: boolean) => void): void {
        this._lwtHandler = handler;
    }

}