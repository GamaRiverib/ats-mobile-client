import { Observable, fromObject, PropertyChangeData } from "tns-core-modules/data/observable";
// import { exitEvent, lowMemoryEvent, resumeEvent, ApplicationEventData, on as applicationOn } from "tns-core-modules/application";
import { AtsService, Sensor, AtsEvents } from "~/services/ats-service";
import { ObservableArray } from "tns-core-modules/data/observable-array/observable-array";
import { prompt, PromptOptions, inputType, PromptResult } from "tns-core-modules/ui/dialogs/dialogs";
import * as Toast from "nativescript-toast";

const KEYS = {
    sensors: 'sensors',
    normal: 'normal',
    actived: 'actived'
};

const SensorTypesFriendlyNames = [
    'Pir motion',
    'Magnetic switch',
    'IR switch'
];

const SensorGroupFriendlyNames = [
    'Interior',
    'Perimeter',
    'Exterior',
    'Access'
];

interface SensorData {
    id: string;
    name: string;
    type: string;
    group: string;
    actived: boolean;
    bypass: boolean;
    online: boolean;
}

export class SensorsViewModel extends Observable { 

    private _sensors = new ObservableArray([]);
    private _code: string = null;

    private _canceled: boolean = false;

    constructor(private ats: AtsService, private activedSensors?: Array<number>) {
        super();

        if(!this._sensors) {
            this._sensors = new ObservableArray([]);
        }

        this.set(KEYS.sensors, this._sensors);

        this.ats.subscribe(AtsEvents.SYSTEM_STATE_CHANGED, this.onSystemStateChanged.bind(this));
        this.ats.subscribe(AtsEvents.SENSOR_ACTIVED, this.onSensorActived.bind(this));
        this.ats.subscribe(AtsEvents.SENSORS_UPDATED, this.updateSensors.bind(this));

        this.configureSensors();

        /*applicationOn(resumeEvent, this.resumeEventHandler.bind(this));
        applicationOn(exitEvent, this.exitEventHandler.bind(this));
        applicationOn(lowMemoryEvent, this.lowMemoryEventHandler.bind(this));*/
    }

    private addSensor(s: Sensor, actived: boolean): void {
        let sensor: SensorData = {
            id: `${s.location.mac}:${s.location.pin}`,
            name: s.name,
            type: SensorTypesFriendlyNames[s.type],
            group: SensorGroupFriendlyNames[s.group],
            actived,
            bypass: s.bypass,
            online: s.online || false
        };
        let sensorObservable = fromObject(sensor);
        sensorObservable.on(Observable.propertyChangeEvent, (data: PropertyChangeData) => {
            if(data.propertyName == 'bypass') {
                if(this._canceled) {
                    this._canceled = false;
                    return true;
                }
                this.requestCode(data.value).then(() => {
                    if(data.value) {
                        this.ats.bypass(s.location, this._code)
                        .then(() => {
                            console.log('bypass', s);
                        }).catch((reason: { error: number }) => {
                            this._canceled = true;
                            sensorObservable.set('bypass', !data.value);
                            this.handleError.call(this, reason);
                        });
                    } else {
                        this.ats.clearBypassOne(s.location, this._code)
                        .then(() => {
                            console.log('clear bypass', s);
                        }).catch((reason: { error: number }) => {
                            this._canceled = true;
                            sensorObservable.set('bypass', !data.value);
                            this.handleError.call(this, reason);
                        });
                    }
                }).catch((reason: any) => {
                    console.log(reason);
                    this._canceled = true;
                    sensorObservable.set('bypass', !data.value);
                });
            }
        });
        this._sensors.push(sensorObservable);
    }

    private configureSensors(): void {
        for (let i = 0; i < this.ats.sensors.length; i++) {
            const s: Sensor = this.ats.sensors[i];
            let actived: boolean = false;
            if(!this.activedSensors) {
                this.activedSensors = [];
            }
            this.activedSensors.forEach((v: number) => {
                if (v == i) {
                    return actived = true;
                }
            });
            this.addSensor(s, actived);
        }
    }

    private updateSensors(sensors: Sensor[]): void {
        for (let i = 0; i < sensors.length; i++) {
            const s: Sensor = this.ats.sensors[i];
            let sensorFound: boolean = false;
            this._sensors.forEach((sensorData: SensorData) => {
                const id: string = `${s.location.mac}:${s.location.pin}`;
                if(sensorData.id == id) {
                    sensorData.name = s.name;
                    sensorData.type = SensorTypesFriendlyNames[s.type];
                    sensorData.group = SensorGroupFriendlyNames[s.group];
                    sensorData.bypass = s.bypass;
                    sensorData.online = s.online || false;

                    sensorFound = true;
                    return;
                }
            });

            if (!sensorFound) {
                this.addSensor(s, false);
            }
        }
    }

    private handleError(reason: { error: number}): void {
        let toast: Toast.Toast;
        switch(reason.error) {
            case 0:
                this._code = null;
                toast = Toast.makeText('Not authorized', 'long');
                break;
            case 1:
                toast = Toast.makeText('System is not ready or disarmed', 'long');
                break;

            default:
                toast = Toast.makeText('There was a problem', 'long');
        }
        toast.show();
    }

    private requestCode(bypass?: boolean): Promise<void> {
        let title: string = 'Change bypass';
        if (bypass !== undefined) {
            title = bypass ? 'Bypass sensor' : 'Clear bypass';
        }
        const promptOptions: PromptOptions = {
            title: title,
            message: 'Type your password',
            okButtonText: 'Ok',
            cancelButtonText: 'Cancel',
            defaultText: '',
            inputType: inputType.password
        };
        return new Promise<void>((resolve, reject) => {
            if(this._code !== null && this._code.length !== 0) {
                return resolve();
            }
            prompt(promptOptions).then((r: PromptResult) => {
                if(r.result && r.text.length > 0) {
                    this._code = r.text;
                    return resolve();
                }
                reject();
            });
        });
    }

    private onSystemStateChanged(data: any): void {
        this._sensors.forEach((s: SensorData) => s.actived = false);
        if (data && data.system && data.system.activedSensors) {
            data.system.activedSensors.forEach((index: number) => {
                if(index >= 0 && index < this._sensors.length) {
                    const s: SensorData = this._sensors.getItem(index);
                    s.actived = true;
                }
            });
        }
        this.set(KEYS.sensors, this._sensors);
    }

    private onSensorActived(data: { sensor: number, value: number }): void {
        if (data.sensor >= 0 && data.sensor < this._sensors.length) {
            const s: SensorData = this._sensors.getItem(data.sensor);
            s.actived = data.value == 1;
            s.online = true;
        }
    }

    /*private resumeEventHandler(args: ApplicationEventData): void {
        console.log('resumeEventHandler');
    }*/

    /*private suspendEventHandler(args: ApplicationEventData): void {
        console.log('suspendEventHandler');
        clearInterval(this._intervalId);
    }*/

    /*private exitEventHandler(args: ApplicationEventData): void {
        console.log('exitEventHandler');
        if(this._sensors) {
            this._sensors.forEach((o: Observable) => {
                if (o.hasListeners(Observable.propertyChangeEvent)) {
                    o.off(Observable.propertyChangeEvent);
                }
                o = null;
            });
            this._sensors = new ObservableArray([]);
        }
    }

    private lowMemoryEventHandler(args: ApplicationEventData): void {
        console.log('lowMemoryEventHandler');
    }*/
}