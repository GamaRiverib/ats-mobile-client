import { NavigatedData, Page, EventData, ViewBase } from "tns-core-modules/ui/page/page";
import { ItemEventData } from "tns-core-modules/ui/list-view";

import { AtsService } from "../services/ats-service";
import { SensorsViewModel } from "./sensors-view-model";

const atsService: AtsService = AtsService.getInstance();

export function onNavigatingTo(args: NavigatedData): void {
    const context: { activedSensors: Array<number> } = args.context;
    const page: Page = <Page>args.object;
    page.bindingContext = new SensorsViewModel(atsService, context.activedSensors);
}

export function onNavigatingFrom(args: NavigatedData): void {
    console.log('onNavigatingFrom');
    console.log(args);
}

export function onLoaded(args: EventData): void {
    console.log('onLoaded');
    // const page = args.object as Page;
    // const txtHost: TextField = page.getViewById('txtHost');
    // txtHost.focus();
}

export function onItemTap(args: ItemEventData): void {
    const view: ViewBase = <ViewBase>args.object;
    const page: Page = view.page;
    // page.closeModal(args.index);
}

export function onListViewLoaded(args: EventData): void {
    console.log('onListViewLoaded');
}

export function onButtonBackTap(args: EventData): void {
    const view: ViewBase = <ViewBase>args.object;
    const page: Page = view.page;
    page.closeModal(null);
}