/*
In NativeScript, a file with the same name as an XML file is known as
a code-behind file. The code-behind is a great place to place your view
logic, and to set up your page’s data binding.
*/

import { NavigatedData, Page, EventData, ShownModallyData, ShowModalOptions } from "tns-core-modules/ui/page";
import { Frame, NavigationEntry } from "tns-core-modules/ui/frame/frame";
import { Button } from "tns-core-modules/ui/button";
import * as Toast from "nativescript-toast";

import { action, ActionOptions } from "tns-core-modules/ui/dialogs";
import { prompt, PromptOptions, PromptResult, inputType } from "tns-core-modules/ui/dialogs";

import { HomeViewModel } from "./home-view-model";

import { AtsService, AtsModes } from "../services/ats-service";

const atsService: AtsService = AtsService.getInstance();

export function onNavigatingTo(args: NavigatedData) {
    const page = <Page>args.object;

    page.bindingContext = new HomeViewModel(atsService);
}

export function onBtnArmTap(args: EventData): void {
    // const button = <Button>args.object;
    // const page: Page = button.page;

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
            atsService.arm(mode.toString()).then(() => {
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
        inputType: inputType.password//, // email, number, text, password, or email
        // capitalizationType: capitalizationType.sentences // all. none, sentences or words
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
                        toast = Toast.makeText('System is not armed or alamred', 'long');
                        break;

                    default:
                        toast = Toast.makeText('There was a problem', 'long');
                }
                toast.show();
            })
        }
    });
}
