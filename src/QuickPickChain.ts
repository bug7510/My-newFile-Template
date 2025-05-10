import * as vscode from 'vscode';

export class quickPickChain<pickItemType extends vscode.QuickPickItem> {
    quickPick: vscode.QuickPick<pickItemType>;
    constructor(quickPick: vscode.QuickPick<pickItemType>) {
        this.quickPick = quickPick;
    }
    static chain<pickItemType extends vscode.QuickPickItem>(): quickPickChain<pickItemType>;
    static chain<pickItemType extends vscode.QuickPickItem>(quickPick: vscode.QuickPick<pickItemType>): quickPickChain<pickItemType>;
    static chain<pickItemType extends vscode.QuickPickItem>(quickPick?: vscode.QuickPick<pickItemType>): quickPickChain<pickItemType> {
        let chain;
        if (quickPick) chain = new quickPickChain(quickPick);
        else chain = new quickPickChain(vscode.window.createQuickPick<pickItemType>());
        return chain;
    }
    setPlaceHolder(placeHolder: string) {
        this.quickPick.placeholder = placeHolder;
        return this;
    }
    setItems(items: pickItemType[]) {
        this.quickPick.items = items;
        return this;
    }
    setButtons(buttons: vscode.QuickInputButton[]) {
        this.quickPick.buttons = buttons;
        return this;
    }
    setCanPickMany(canSelectMany: boolean) {
        this.quickPick.canSelectMany = canSelectMany;
        return this;
    }
    subscribeOnDidAccept(event: () => any): quickPickChain<pickItemType>;
    subscribeOnDidAccept(event: (pickedItem: pickItemType) => any): quickPickChain<pickItemType>;

    subscribeOnDidAccept(event: (() => any) | ((pickedItem: pickItemType) => any)) {
        if (event.length === 0) {
            this.quickPick.onDidAccept(event as () => any);
        }
        else {
            this.quickPick.onDidAccept(() =>
                ((event as (pickedItem: pickItemType) => any)(this.quickPick.selectedItems[0])));

        }
        return this;
    }
    subscribeOnDidHide(event: () => any) {
        this.quickPick.onDidHide(event);
        return this;
    }
    subscribeOnDidTriggerButton(listener: (e: vscode.QuickInputButton) => any) {
        this.quickPick.onDidTriggerButton((e) => listener(e));
        return this;
    }
    show() {
        this.quickPick.show();
        return this;
    }
    hide() {
        this.quickPick.hide();
        return this;
    }
    dispose() {
        this.quickPick.dispose();
        return this;
    }
}