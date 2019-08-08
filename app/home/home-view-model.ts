import { Observable } from "tns-core-modules/data/observable";
// import { exitEvent, lowMemoryEvent, resumeEvent, ApplicationEventData, on as applicationOn } from "tns-core-modules/application";

import { Vibrate } from 'nativescript-vibrate';
import * as Toast from "nativescript-toast";

import { AtsService, AtsEvents, AtsStates, AtsModes, Sensor, SystemState } from "~/services/ats-service";

const KEYS = {
    online: 'online',
    loading: 'loading',
    icon: 'icon',
    systemState: 'systemState',
    systemMode: 'systemMode',
    activedSensors: 'activedSensors',
    state: 'state',
    message: 'message'
};

const KEYS_ICONS = [
    'ready',
    'disarmed',
    'leaving',
    'armed',
    'entering',
    'alarmed',
    'programming'
];

const vibrator = new Vibrate();

let timeoutIntervalId: number;

let stateLoaded: boolean = false;

let stateLoadedTimeout: number;

let stateLoadedRetryCount: number = 0;

export class HomeViewModel extends Observable {

    constructor(private ats: AtsService) {
        super();

        this.set(KEYS.loading, true);
        this.set(KEYS.online, ats.connected);

        this.ats.subscribe(AtsEvents.SENSOR_ACTIVED, this.onSensorActived.bind(this));
        this.ats.subscribe(AtsEvents.SYSTEM_ALERT, this.onAlert.bind(this));
        this.ats.subscribe(AtsEvents.SIREN_ACTIVED, this.onSirenActived.bind(this));
        this.ats.subscribe(AtsEvents.SIREN_SILENCED, this.onSirenSilenced.bind(this));
        this.ats.subscribe(AtsEvents.SYSTEM_ALARMED, this.onSystemAlarmed.bind(this));
        this.ats.subscribe(AtsEvents.SYSTEM_ARMED, this.onSystemArmed);
        this.ats.subscribe(AtsEvents.SYSTEM_DISARMED, this.onSystemDisarmed.bind(this));
        this.ats.subscribe(AtsEvents.SYSTEM_STATE_CHANGED, this.onSystemStateChanged.bind(this));
        this.ats.subscribe(AtsEvents.MAX_ALERTS, this.onMaxAlerts.bind(this));
        this.ats.subscribe(AtsEvents.MAX_UNAUTHORIZED_INTENTS, this.onMaxUnauthorizedIntents.bind(this));
        this.ats.subscribe(AtsEvents.BYPASS_CHANGE, this.onBypassChange.bind(this));

        this.ats.subscribe(AtsEvents.WEB_SOCKET_CONNECTED, this.onConnected.bind(this));
        this.ats.subscribe(AtsEvents.WEB_SOCKET_DISCONNECTED, this.onDisconnected.bind(this));

        this.ats.subscribe(AtsEvents.MQTT_CONNECTED, this.onRemotelyConnected.bind(this));
        this.ats.subscribe(AtsEvents.MQTT_DISCONNECTED, this.onRemotelyDisconnected.bind(this));

        this.ats.subscribe(AtsEvents.SERVER_LWT_ONLINE, this.onServerConnectionChange.bind(this, true));
        this.ats.subscribe(AtsEvents.SERVER_LWT_OFFLINE, this.onServerConnectionChange.bind(this, false));

        /*applicationOn(resumeEvent, this.resumeEventHandler.bind(this));
        applicationOn(exitEvent, this.exitEventHandler.bind(this));
        applicationOn(lowMemoryEvent, this.lowMemoryEventHandler.bind(this));*/

        if (ats.connected) {
            console.log('constructor-getState');
            setTimeout(() => ats.getState().then(this.onSystemStateChanged.bind(this)), 500);
        }
        
        this.set(KEYS.loading, !ats.connected);
    }

    private onSensorActived(data: any): void {
        // console.log('onSensorActived', data);
    }

    private onAlert(data: any): void {
        let toast: Toast.Toast
        if(data && data.system) {
            const activedSensors: Array<number> = data.system.activedSensors || [];
            const sensors: Array<string> = [];
            activedSensors.forEach((s: number) => sensors.push(this.ats.getSensor(s).name ));
            toast = Toast.makeText(`Received system alert: ${sensors}`);
        } else {
            toast = Toast.makeText('Received system alert');
        }
        toast.setDuration(5000);
        toast.show();
        // vibrator.vibrate([1000, 300, 300]);
        // setTopnavColor(appColors.warning);
        // TODO: log to recent activity
    }

    private onSirenActived(data: any): void {
        console.log('onSirenActived', data);
    }

    private onSirenSilenced(data: any): void {
        console.log('onSirenSilenced', data);
    }
    
    private onSystemAlarmed(data: any): void {
        // console.log('onSystemAlarmed', data);
        vibrator.vibrate([1000, 1000, 1000, 1000]);
        // setTopnavColor(appColors.danger);
    }
    
    private onSystemArmed(data: any): void {
        // console.log('onSystemArmed', data);
        vibrator.vibrate(1000);
    }
    
    private onSystemDisarmed(data: any): void {
        // console.log('onSystemDisarmed', data);
        vibrator.vibrate(1000, 1000);
        // setTopnavColor(appColors.dark);
    }

    private handleTimeout(state: number, leftTimeout: number): void {
        const _vm = this;
        if (leftTimeout > 0 && (state == 4 || state == 2)) {
            let _timeout: number = leftTimeout;
            if (!timeoutIntervalId) {
                timeoutIntervalId = setInterval(() => {
                    if(_timeout > 0) {
                        _timeout--;
                        const message = `${_timeout || 0} seconds to ${state == 2 ? 'arm' : 'disarm'}`;
                        _vm.set(KEYS.message, message);
                    } else {
                        _timeout = null;
                        _vm.set(KEYS.message, 'Waiting confirmation...');
                        clearInterval(timeoutIntervalId);
                        timeoutIntervalId = undefined;
                        _vm.ats.getState()
                            .then(this.onSystemStateChanged.bind(this))
                            .catch(error => console.log(error));
                    }
                }, 1000);
            }
        } else if(timeoutIntervalId) {
            clearInterval(timeoutIntervalId);
            timeoutIntervalId = undefined;
        }
    }
    
    private onSystemStateChanged(data: any): void {
        if (data) {
            stateLoaded = true;
            const system: SystemState = data.system ? data.system : data;
            const systemState: number = system.state;
            const systemMode: number = system.mode;
            const state: string = AtsStates[systemState];
            const mode: string = AtsModes[systemMode];
            const activedSensors: Array<number> = system.activedSensors || [];
            const activedSensorsCount: number = system.activedSensors ? system.activedSensors.length : 0;
            const timeout: number | null = data.leftTimeout | ((system.leftTime - system.uptime) / 1000);

            this.handleTimeout(systemState, timeout);

            this.set(KEYS.systemState, systemState);
            this.set(KEYS.systemMode, systemMode);
            this.set(KEYS.activedSensors, activedSensors);
            this.set(KEYS.state, state);
            this.set(KEYS.icon, `res://${KEYS_ICONS[systemState]}`);

            switch(systemState) {
                case 0:
                    this.set(KEYS.message, '');
                    break;
                case 1:
                    this.set(KEYS.message, `${activedSensorsCount} sensors actived`);
                    break;
                case 2:
                    this.set(KEYS.message, timeout ? `${timeout || 0} seconds to arm` : 'Waiting confirmation...');
                    break;
                case 3:
                    this.set(KEYS.message, `${mode}`);
                    break;
                case 4:
                    this.set(KEYS.message, timeout ? `${timeout || 0} seconds to disarm` : 'Waiting confirmation...');
                    break;
                case 5:
                    this.set(KEYS.message, '');
                    break;
                case 6:
                    this.set(KEYS.message, 'Programming mode');
                    break;
                default:
                    this.set(KEYS.state, '');
                    this.set(KEYS.message, '');
            }
        }
    }

    private onMaxAlerts(data: any): void {
        console.log(data);
        let info  = '';
        if(data && data.system) {
            // TODO
            let sensors: Array<number> = data.system.activedSensors;
            let sensor: Sensor = this.ats.getSensor(sensors[0]);
            info = `Sensor ${sensor.name} actived`;
            console.log(data.extras);
            console.log(`ALERT ${info}`);
        }
        vibrator.vibrate([2000, 300, 300]);
        // showNotification(`ALERT ${info}`, 6000);
        // setTopnavColor(appColors.warning);
        /* if (window.navigator.vibrate) {
            window.navigator.vibrate([200, 200, 200]);
        }*/
    }

    private onMaxUnauthorizedIntents(data: any): void {
        console.log('onMaxUnauthorizedIntents', data);
    }

    private onBypassChange(data: any): void {
        console.log('onBypassChange', data);
    }

    private getStateIfNotLoaded(): void {
        const MAX_RETRIES: number = 5;
        if (stateLoadedRetryCount >= MAX_RETRIES) {
            this.set(KEYS.message, 'It seems that the server is not responding');
            return;
        }
        if (stateLoaded) {
            stateLoadedRetryCount = 0;
            clearTimeout(stateLoadedTimeout);
            stateLoadedTimeout = undefined;
            return;
        }

        stateLoadedRetryCount++;
        this.set(KEYS.message, `Waiting state... Retry ${stateLoadedRetryCount} of ${MAX_RETRIES}`);
        stateLoadedTimeout = setTimeout(this.getStateIfNotLoaded.bind(this), 5000);
        this.ats.getState()
            .then((data: any) => {
                clearTimeout(stateLoadedTimeout);
                stateLoadedTimeout = undefined;
                this.onSystemStateChanged.call(this, data);
            })
            .catch((reason: any) => {
                console.log(reason);
        });
    }

    private onConnected(data: any): void {
        // showNotification('Connected');
        this.set(KEYS.online, true);
        this.set(KEYS.loading, false);
        console.log('onLocallyConnected');
        setTimeout(this.getStateIfNotLoaded.bind(this), 2000);
    }
    
    private onDisconnected(data: any): void {
        // showNotification('Disconnected', 6000);
        if (!this.ats.connected) {
            this.set(KEYS.online, false);
            this.set(KEYS.loading, true);
        }
    }

    private onRemotelyConnected(data: any): void {
        this.set(KEYS.online, true);
        this.set(KEYS.loading, false);
        console.log('onRemotelyConnected');
        setTimeout(this.getStateIfNotLoaded.bind(this), 2000);
    }

    private onRemotelyDisconnected(data: any): void {
        if(!this.ats.connected) {
            this.set(KEYS.online, false);
            this.set(KEYS.loading, true);
            this.set(KEYS.message, 'Connecting...');
        }
    }

    private onServerConnectionChange(online: boolean): void {
        const message: string = online ? 'Server online' : 'Server offline';
        let toast: Toast.Toast = Toast.makeText(message);
        toast.setDuration(5000);
        toast.show();
    }

    /*private resumeEventHandler(args: ApplicationEventData): void {
        console.log('resumeEventHandler');
        this.set(KEYS.loading, true);
        this.set(KEYS.online, this.ats.connected);
        if (this.ats.connected) {
            setTimeout(() => this.ats.getState().then(this.onSystemStateChanged.bind(this)), 500);
        }
        this.set(KEYS.loading, !this.ats.connected);
    }*/

    /*private suspendEventHandler(args: ApplicationEventData): void {
        console.log('suspendEventHandler');
        clearInterval(this._intervalId);
    }*/

    /*private exitEventHandler(args: ApplicationEventData): void {
        console.log('exitEventHandler');
        stateLoaded = false;
        clearInterval(timeoutIntervalId);
        timeoutIntervalId = undefined;
    }

    private lowMemoryEventHandler(args: ApplicationEventData): void {
        console.log('lowMemoryEventHandler');
    }*/
}
