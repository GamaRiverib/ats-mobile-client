/*
In NativeScript, a file with the same name as an XML file is known as
a code-behind file. The code-behind is a great place to place your view
logic, and to set up your page’s data binding.
*/

import { NavigatedData, Page, EventData, ShownModallyData, ShowModalOptions, ViewBase } from "tns-core-modules/ui/page";
import { GestureTypes, SwipeGestureEventData, SwipeDirection } from "tns-core-modules/ui/gestures";
import { Frame, NavigationEntry } from "tns-core-modules/ui/frame/frame";
import { Button } from "tns-core-modules/ui/button";
import * as Toast from "nativescript-toast";

import { action, ActionOptions } from "tns-core-modules/ui/dialogs";
import { prompt, PromptOptions, PromptResult, inputType } from "tns-core-modules/ui/dialogs";

import { HomeViewModel } from "./home-view-model";

import { AtsService, AtsModes, AtsEvents } from "../services/ats-service";
import { ActionBar } from "tns-core-modules/ui/action-bar/action-bar";

import { messaging, Message } from "nativescript-plugin-firebase/messaging";

const atsService: AtsService = AtsService.getInstance();

export function onNavigatingTo(args: NavigatedData) {
    const page = <Page>args.object;

    page.bindingContext = new HomeViewModel(atsService);

    page.layoutView.on(GestureTypes.swipe, handleGestureSwipe);

    const actionBar: ActionBar = page.actionBar;

    atsService.subscribe(AtsEvents.WEB_SOCKET_CONNECTED, updateNavBarColor.bind(page, actionBar, atsService));
    atsService.subscribe(AtsEvents.WEB_SOCKET_DISCONNECTED, updateNavBarColor.bind(page, actionBar, atsService));
    atsService.subscribe(AtsEvents.MQTT_CONNECTED, updateNavBarColor.bind(page, actionBar, atsService));
    atsService.subscribe(AtsEvents.MQTT_DISCONNECTED, updateNavBarColor.bind(page, actionBar, atsService));

    setTimeout(enablePushNotifications, 2000);
}

function enablePushNotifications(): void {
    console.log(`Are push notifications enabled? ${messaging.areNotificationsEnabled()}`);
    if(!messaging.areNotificationsEnabled()) {
        console.log('Register for push notifications...');
        messaging.registerForPushNotifications({
            onPushTokenReceivedCallback: (token: string) => {
                console.log('Firebase plugin received a push token: ', token);
            },
            onMessageReceivedCallback: (message: Message) => { 
                console.log('Firebase message received', message.title, message.body);
            },
            showNotifications: true,
            showNotificationsWhenInForeground: true
        }).then(() => {
            console.log('Registered for push notifications');
            messaging.subscribeToTopic('ats')
                .then(() => console.log('Registered to topic ats'))
                .catch((reason: any) => console.log('Error', reason));
        }).catch((reason: any) => console.log('Error', reason));
    } else {
        messaging.subscribeToTopic('ats')
            .then(() => console.log('Registered to topic ats'))
            .catch((reason: any) => console.log('Error', reason));
    }
}

function updateNavBarColor(actionBar: ActionBar, ats: AtsService): void {
    if(ats.locallyConnected) {
        actionBar.backgroundColor = '#007F0E';
    } else if(ats.remotelyConnected) {
        actionBar.backgroundColor =  '#729FE3';
    } else {
        actionBar.backgroundColor = '#A2A2A2';
    }
}

function handleGestureSwipe(args: SwipeGestureEventData) {
    const v = <ViewBase>args.object;
    const page = v.page;
    switch(args.direction) {
        case SwipeDirection.down:
            break;
        case SwipeDirection.up:
            break;
        case SwipeDirection.left:
            showModalSensors(page);
            break;
        case SwipeDirection.right:
            break;
    }
}

export function onBtnArmTap(args: EventData): void {
    const actionOptions: ActionOptions = {
        title: "Arm system",
        message: "Select mode",
        cancelButtonText: "Cancel",
        actions: AtsModes,
        cancelable: true // Android only
    };
    
    action(actionOptions).then((result) => {
        const mode: number = AtsModes.indexOf(result);
        if(mode >= 0) {
            atsService.arm(mode).then(() => {
                console.log('arm system...');
            }).catch((reason: { error: number }) => {
                let toast: Toast.Toast;
                switch(reason.error) {
                    case 0:
                        toast = Toast.makeText('Not authorized', 'long');
                        break;
                    case 1:
                        toast = Toast.makeText('System is not ready to arm', 'long');
                        break;

                    default:
                        toast = Toast.makeText('There was a problem', 'long');
                }
                toast.show();
            });
        }
    });
}

export function onBtnSensorsTap(args: EventData): void {
    const button = <Button>args.object;
    const page: Page = button.page;
    showModalSensors(page);
}

function showModalSensors(page: Page): void {
    const modalFrame: Frame = new Frame();

    // TODO: get default mode

    modalFrame.once('shownModally', (args: ShownModallyData) => {
        const entry: NavigationEntry = {
            moduleName: 'home/sensors-page',
            context: args.context
        };
        modalFrame.navigate(entry);
    });

    const activedSensors: Array<number> = page.bindingContext.get('activedSensors') || [];

    const modalOpts: ShowModalOptions = {
        fullscreen: true,
        context: { activedSensors },
        closeCallback: () => {
            console.log('modal closed');
        }
    };
    page.showModal(modalFrame, modalOpts);
}

export function onBtnDisarmTap(args: EventData): void {
    const promptOptions: PromptOptions = {
        title: "Disarm system",
        message: "Type your password",
        okButtonText: "Ok",
        cancelButtonText: "Cancel",
        defaultText: "",
        inputType: inputType.password
    };
    prompt(promptOptions).then((r: PromptResult) => {
        if(r.result && r.text.length > 0) {
            atsService.disarm(r.text).then(() => {
                console.log('disarm system...');
            }).catch((reason: { error: number }) => {
                let toast: Toast.Toast;
                switch(reason.error) {
                    case 0:
                        toast = Toast.makeText('Not authorized', 'long');
                        break;
                    case 1:
                        toast = Toast.makeText('System is not armed or alarmed', 'long');
                        break;

                    default:
                        toast = Toast.makeText('There was a problem', 'long');
                }
                toast.show();
            });
        }
    });
}
