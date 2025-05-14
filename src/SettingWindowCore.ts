import { TemplateConfig } from './TemplateConfig.js'
import { CommandKey } from './CommandKey.js'
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const FILENAME = "SettingWindow";
const PLACEHOLDER = "{cspSource}";
const SECURITYPOLICY = "{securityPolicy}";

/**
 * テンプレート設定用のカスタム入力ウィンドウを表示する非同期メソッド。
 *
 * @param initialConfig - ウィンドウを開いたときに入力フォームに表示される初期値。Webview側で準備ができてから送信される。
 * @returns 決定ボタンが押された場合は入力された値を含むPromise、キャンセルされた場合は undefined を返すPromise。
 */
export async function showTemplateEditWindow(context: vscode.ExtensionContext, initialConfig:
    TemplateConfig = {
        templateName: "新しいテンプレート",
        filename: "{filePath[0]}.txt",
        template: ""
    })
    : Promise<TemplateConfig | undefined> {

    const windowResourcesFolderPath = path.join(context.extensionPath, 'dist', 'SettingWindowResources');
    const panel = vscode.window.createWebviewPanel(
        'templateEdit', // パネルの識別子 (内部用)
        'MyNewFileTemplate', // パネルのタイトル
        vscode.ViewColumn.Beside, // パネルを表示するエディタ列 (例: 現在のアクティブな列)
        {
            // Webviewの設定を有効化
            enableScripts: true, // Webview内でJavaScriptを有効にする
            retainContextWhenHidden: true // パネルが非表示になっても状態を保持する (任意だが便利)
        }
    );

    let resolvePromise: (value: TemplateConfig | undefined) => void;
    let rejectPromise: (reason?: any) => void;
    const resultPromise = new Promise<TemplateConfig | undefined>((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject; // エラーハンドリングが必要なら使う
    });

    const htmlPath = path.join(windowResourcesFolderPath, `${FILENAME}.html`);
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');

    const cssUri = panel.webview.asWebviewUri(vscode.Uri.file(path.join(windowResourcesFolderPath, `${FILENAME}.css`)));
    const jsUri = panel.webview.asWebviewUri(vscode.Uri.file(path.join(windowResourcesFolderPath, `${FILENAME}.js`)));


    // CSP (Content Security Policy) - Webviewのセキュリティのため重要
    const cspSource = panel.webview.cspSource;
    const securityPolicy = `
            default-src 'none';
            script-src ${cspSource};
            style-src ${cspSource};`;

    htmlContent = htmlContent.replace(`${PLACEHOLDER}.css`, cssUri.toString())
        .replace(`${PLACEHOLDER}.js`, jsUri.toString())
        .replace(SECURITYPOLICY, securityPolicy.replace(/\n/g, '').trim());

    panel.webview.html = htmlContent;
    panel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case CommandKey.readyCommand:
                    // ★ Webviewから ready メッセージを受け取ったら、初期データを送信する ★
                    panel.webview.postMessage({
                        command: 'initialData',
                        data: initialConfig
                    });
                    break;
                case CommandKey.saveCommand:
                    // 'save' コマンドが来た場合、Promiseを解決して値を返す
                    const savedConfig = message.data as TemplateConfig;
                    if (checkTemplateConfigValidValue(savedConfig)) {
                        if (initialConfig.templateName != savedConfig.templateName
                            || initialConfig.filename != savedConfig.filename
                            || initialConfig.template != savedConfig.template
                        ) {
                            resolvePromise(savedConfig);
                            panel.dispose(); // パネルを閉じる
                        }
                        else {
                            vscode.window.showErrorMessage("This template is not changed at all.");
                        }
                    }
                    else {
                        vscode.window.showErrorMessage("Fill all Textarea.");
                    }
                    break;
                case CommandKey.cancelCommand:
                    // 'cancel' コマンドが来た場合、Promiseを undefined で解決
                    resolvePromise(undefined);
                    panel.dispose(); // パネルを閉じる
                    break;
                default:
                    break;
            }
        }
    )

    // パネルが閉じられたときの処理
    panel.onDidDispose(
        () => {
            resolvePromise(undefined);
        },
        undefined,
        context.subscriptions
    );

    // Promiseを呼び出し元に返し、結果を待ってもらう
    return resultPromise;
}

function checkTemplateConfigValidValue(config: TemplateConfig) {
    return config.templateName && config.filename && config.template
}