import { TemplateConfig } from '../TemplateConfig'
import { CommandKey } from '../CommandKey.js'
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const FILENAME = "SettingWindow";
const PLACEHOLDER = "{cspSource}";

/**
 * テンプレート設定用のカスタム入力ウィンドウを表示する非同期メソッド。
 *
 * @param initialConfig - ウィンドウを開いたときに入力フォームに表示される初期値。Webview側で準備ができてから送信される。
 * @returns 決定ボタンが押された場合は入力された値を含むPromise、キャンセルされた場合は undefined を返すPromise。
 */
export async function showTemplateEditWindow(context: vscode.ExtensionContext, initialConfig: TemplateConfig | undefined = undefined): Promise<TemplateConfig | undefined> {

    const windowResourcesFolderPath = path.join(context.extensionPath, 'src', 'SettingWindowResources');
    const panel = vscode.window.createWebviewPanel(
        'templateEdit', // パネルの識別子 (内部用)
        'templateSettings', // パネルのタイトル
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

    htmlContent = htmlContent.replace(`${PLACEHOLDER}.css`, cssUri.toString())
        .replace(`${PLACEHOLDER}.js`, jsUri.toString());

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
                    resolvePromise(message.data as TemplateConfig);
                    panel.dispose(); // パネルを閉じる
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
