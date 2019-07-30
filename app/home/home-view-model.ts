import { Observable } from "tns-core-modules/data/observable";
import { exitEvent, lowMemoryEvent, resumeEvent, ApplicationEventData, on as applicationOn } from "tns-core-modules/application";

import { Vibrate } from 'nativescript-vibrate';
import * as Toast from "nativescript-toast";

import { AtsService, AtsEvents, AtsStates, AtsModes, Sensor } from "~/services/ats-service";

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

        applicationOn(resumeEvent, this.resumeEventHandler.bind(this));
        applicationOn(exitEvent, this.exitEventHandler.bind(this));
        applicationOn(lowMemoryEvent, this.lowMemoryEventHandler.bind(this));

        setTimeout(() => ats.getState()
            .then(data => this.onSystemStateChanged({ leftTimeout: 0, system: data }))
            .catch(error => console.log(error)), 500);


        this.set(KEYS.loading, !ats.connected);
    }

    private onSensorActived(data: any): void {
        console.log('onSensorActived', data);
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
        console.log('onSystemAlarmed', data);
        vibrator.vibrate([1000, 1000, 1000, 1000]);
        // setTopnavColor(appColors.danger);
    }
    
    private onSystemArmed(data: any): void {
        console.log('onSystemArmed', data);
        vibrator.vibrate(1000);
    }
    
    private onSystemDisarmed(data: any): void {
        console.log('onSystemDisarmed', data);
        vibrator.vibrate(1000, 1000);
        // setTopnavColor(appColors.dark);
    }

    private handleTimeout(state: number, leftTimeout: number): void {
        const _vm = this;
        if (leftTimeout > 0 && (state == 4 || state == 2)) {
            let _timeout: number = leftTimeout;
            timeoutIntervalId = setInterval(() => {
                if(_timeout > 0) {
                    _timeout--;
                    const message = `${_timeout || 0} seconds to ${state == 2 ? 'arm' : 'disarm'}`;
                    _vm.set(KEYS.message, message);
                } else {
                    _timeout = null;
                    _vm.set(KEYS.message, 'Waiting confirmation...');
                    clearInterval(timeoutIntervalId);
                }
           }, 1000);
        } else {
            clearInterval(timeoutIntervalId);
        }
    }
    
    private onSystemStateChanged(data: any): void {
        if (data && data.system) {
            
            const systemState: number = data.system.state;
            const systemMode: number = data.system.mode;
            const state: string = AtsStates[systemState];
            const mode: string = AtsModes[systemMode];
            const activedSensors: Array<number> = data.system.activedSensors || [];
            const activedSensorsCount: number = data.system.activedSensors ? data.system.activedSensors.length : 0;
            const timeout: number | null = data.leftTimeout;

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
                    this.set(KEYS.message, `${mode} mode`);
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

    private onConnected(data: any): void {
        // showNotification('Connected');
        this.set(KEYS.online, true);
        this.set(KEYS.loading, false);
        this.ats.getState()
            .then(res => this.onSystemStateChanged({ leftTimeout: 0, system: res }))
            .catch(error => console.log(error));
    }
    
    private onDisconnected(data: any): void {
        // showNotification('Disconnected', 6000);
        this.set(KEYS.online, false);
        this.set(KEYS.loading, true);
    }

    private resumeEventHandler(args: ApplicationEventData): void {
        console.log('resumeEventHandler');
    }

    /*private suspendEventHandler(args: ApplicationEventData): void {
        console.log('suspendEventHandler');
        clearInterval(this._intervalId);
    }*/

    private exitEventHandler(args: ApplicationEventData): void {
        console.log('exitEventHandler')
    }

    private lowMemoryEventHandler(args: ApplicationEventData): void {
        console.log('lowMemoryEventHandler');
    }
}
