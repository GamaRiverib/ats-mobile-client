import { Observable, fromObject } from "tns-core-modules/data/observable";
import { AtsService, Sensor, AtsEvents } from "~/services/ats-service";
import { ObservableArray } from "tns-core-modules/data/observable-array/observable-array";

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
    name: string;
    type: string;
    group: string;
    actived: boolean;
    bypass: boolean;
}

export class SensorsViewModel extends Observable { 

    private _sensors = new ObservableArray([]);

    constructor(private ats: AtsService, private activedSensors?: Array<number>) {
        super();

        for (let i = 0; i < this.ats.sensors.length; i++) {
            const s: Sensor = this.ats.sensors[i];
            let actived: boolean = false;
            this.activedSensors.forEach((v: number) => {
                if (v == i) {
                    return actived = true;
                }
            });
            this._sensors.push(fromObject({
                name: s.name,
                type: SensorTypesFriendlyNames[s.type],
                group: SensorGroupFriendlyNames[s.group],
                actived,
                bypass: false
            }));
        }

        this.set(KEYS.sensors, this._sensors);

        this.ats.subscribe(AtsEvents.SYSTEM_STATE_CHANGED, this.onSystemStateChanged.bind(this));
    }

    /*selectItemTemplate(item: SensorData, index: number, items: ObservableArray<SensorData>): string {        
        return item.actived ? KEYS.actived : KEYS.normal;

        /*if(!this.activedSensors) {
            return KEYS.normal;
        }

        for (let i = 0; i < this.activedSensors.length; i++) {
            if(this.activedSensors[i] == i) {
                return KEYS.actived;
            }
        }

        return KEYS.normal;*//*

    }*/

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
}