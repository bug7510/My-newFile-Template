import { TemplateConfig } from './TemplateConfig.js'
import { CommandKey } from './CommandKey.js'
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TimeoutError } from './TimeoutError';

const FILENAME = "SettingWindow";
const PLACEHOLDER = "{cspSource}";
const SECURITYPOLICY = "{securityPolicy}";
const HTML_READ_TIMEOUT_MS = 1000; // HTMLファイルの読み込みタイムアウト
const WEBVIEW_READY_TIMEOUT_MS = 2000; // Webviewがreadyコマンドを送信するまでのタイムアウト
const WEBVIEW_DATA_RECEIVE_TIMEOUT_MS = 100;//WebviewがdataReceivedコマンドを送信するまでのタイムアウト
const INITIAL_DATA_PROCESSING_TIMEOUT_MS = 100; // initialConfig送信後、WebviewがUI準備完了を通知するまでのタイムアウト


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
    let rejectPromise: (reason?: any) => void; // rejectResultPromise のエイリアスとして使う
    const resultPromise = new Promise<TemplateConfig | undefined>((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
    });
    let readHtmlTimeoutId: NodeJS.Timeout | undefined = setTimeout(() => {
        clearTimeout(readHtmlTimeoutId);
        readHtmlTimeoutId = undefined;
        rejectPromise(new TimeoutError(`リソースが読みこめませんでした`));
    }, HTML_READ_TIMEOUT_MS);
    const htmlPath = path.join(windowResourcesFolderPath, `${FILENAME}.html`);
    const readFilePromise = fs.promises.readFile(htmlPath, 'utf8');
    readFilePromise.then(() => {
        clearTimeout(readHtmlTimeoutId);
        readHtmlTimeoutId = undefined;
    });
    let htmlContent = await readFilePromise;

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

    let readyCommandTimeoutId: NodeJS.Timeout | undefined;
    let dataPostedTimeoutId: NodeJS.Timeout | undefined;
    let dataProcessingTimeoutId: NodeJS.Timeout | undefined;
    let readyMassageListener: vscode.Disposable | undefined;
    let receivedMassageListener: vscode.Disposable | undefined;
    let processedMessageListener: vscode.Disposable | undefined;
    let userActionMessageListener: vscode.Disposable | undefined;
    let mainMessageListener: vscode.Disposable | undefined;

    console.log("before phase");
    // Phase 1: Webviewがreadyコマンドを送信するのを待つ
    new Promise<void>((resolve, reject) => {
        readyCommandTimeoutId = setTimeout(() => {
            reject(new TimeoutError(`編集ウィンドウの起動ができませんでした。`));
        }, WEBVIEW_READY_TIMEOUT_MS);
        readyMassageListener = panel.webview.onDidReceiveMessage(message => {
            console.log('Message received from webview');
            if (message.command == CommandKey.readyCommand) {
                console.log('ready command received');
                if (readyCommandTimeoutId) clearTimeout(readyCommandTimeoutId);
                readyCommandTimeoutId = undefined;
                readyMassageListener?.dispose(); // このリスナーは用済み
                resolve();
            }
        });
    })
        // Phase 2: メッセージを送り、WebViewが受け取れたのかの確認
        .then(() => new Promise<void>((resolve, reject) => {
            console.log('Webview is ready.');
            // Webview is ready, send initial data
            const postError = new TimeoutError(`ウィンドウにテンプレート情報を送信できませんでした。`);
            console.log("settingTimeout");
            dataPostedTimeoutId = setTimeout(() => {
                // このタイムアウトは、initialData送信後、Webviewからの応答がない場合に発生
                reject(postError);
            }, WEBVIEW_DATA_RECEIVE_TIMEOUT_MS);
            console.log("settingTimeout");
            receivedMassageListener = panel.webview.onDidReceiveMessage(message => {
                console.log('Message received from webview');
                switch (message.command) {
                    case CommandKey.dataReceivedCommand:
                        console.log("dataReceivedCommand受信");
                        if (dataPostedTimeoutId) {
                            console.log("Id一致");
                            clearTimeout(dataPostedTimeoutId);
                            dataPostedTimeoutId = undefined; // UI準備完了の合図なので
                            receivedMassageListener?.dispose(); // このリスナーは用済み
                            resolve();
                        }
                        break;
                    case CommandKey.nullDataReceivedCommand:
                        if (dataPostedTimeoutId) {
                            clearTimeout(dataPostedTimeoutId);
                            dataPostedTimeoutId = undefined;
                        }
                        receivedMassageListener?.dispose(); // このリスナーは用済み
                        reject(postError);
                        break;
                }
            });
            panel.webview.postMessage({
                command: 'initialData',
                data: initialConfig
            });
        }))
        // Phase3: データをWebViewに反映したか確認
        .then(() => new Promise<void>((resolve, reject) => {
            console.log("settingTimeout");
            dataProcessingTimeoutId = setTimeout(() => {
                // このタイムアウトは、initialData送信後、Webviewからの応答がない場合に発生
                reject(new TimeoutError(`テンプレートの内容が表示できません。`));
            }, INITIAL_DATA_PROCESSING_TIMEOUT_MS);
            processedMessageListener = panel.webview.onDidReceiveMessage(message => {
                console.log('Message received from webview');
                if (message.command === CommandKey.dataProcessedCommand) {
                    console.log("dataProcessedCommand受信");
                    if (dataProcessingTimeoutId) {
                        console.log("Id一致");
                        clearTimeout(dataProcessingTimeoutId);
                        dataProcessingTimeoutId = undefined; // UI準備完了の合図なので、このタイムアウトはクリア
                        processedMessageListener?.dispose(); // このリスナーは用済み
                        resolve();
                    }
                    // UI準備完了。ユーザーの次の操作 (save/cancel) を待つ。
                }
            })

            console.log("setTimeout");
        })
        )
        // Phase 4: 編集データを待機
        .then(() => new Promise<TemplateConfig | undefined>((resolveDataPhase, rejectDataPhase) => {

            userActionMessageListener = panel.webview.onDidReceiveMessage(message => {
                console.log('Message received from webview');
                // 'dataProcessedCommand' は Webview 側で initialData 受信・UI準備後に送信される想定
                switch (message.command) {
                    case CommandKey.saveCommand:
                        const savedConfig = message.data as TemplateConfig;
                        if (checkTemplateConfigValidValue(savedConfig)) {
                            if (initialConfig.templateName !== savedConfig.templateName ||
                                initialConfig.filename !== savedConfig.filename ||
                                initialConfig.template !== savedConfig.template) {

                                userActionMessageListener?.dispose();
                                resolveDataPhase(savedConfig);
                            }
                            else {
                                vscode.window.showErrorMessage("テンプレートを変更してください。");
                                // 変更がない場合は、UIは開いたまま。このPromiseは解決しない。
                            }
                        }
                        else {
                            vscode.window.showErrorMessage("入力されていない項目があります。");
                            // 入力不備の場合も、UIは開いたまま。このPromiseは解決しない。
                        }
                        break;
                    case CommandKey.cancelCommand:
                        userActionMessageListener?.dispose();
                        resolveDataPhase(undefined); // キャンセル
                        break;
                }
            });
            console.log('[SettingWindowCore] Webview message listener attached.'); // 追加: リスナー登録処理の直後にログ
        }))
        // dataProcessingAndInteractionPhase の結果を resultPromise に反映
        .then(config => {
            resolvePromise(config); // 外部のPromiseを解決
            panel.dispose(); // 成功時(undefined含む)はパネルを閉じる
        })
        .catch(error => {
            rejectPromise(error); // 外部のPromiseを拒否
            panel.dispose(); // エラー時もパネルを閉じる
        });


    // パネルが閉じられたときの処理
    panel.onDidDispose(
        () => {
            if (readHtmlTimeoutId) clearTimeout(readHtmlTimeoutId);
            if (readyCommandTimeoutId) clearTimeout(readyCommandTimeoutId);
            if (readyMassageListener) readyMassageListener.dispose();
            if (dataPostedTimeoutId) clearTimeout(dataPostedTimeoutId);
            if (receivedMassageListener) receivedMassageListener.dispose();
            if (dataProcessingTimeoutId) clearTimeout(dataProcessingTimeoutId);
            if (processedMessageListener) processedMessageListener.dispose();
            if (userActionMessageListener) userActionMessageListener.dispose();
            if (mainMessageListener) mainMessageListener.dispose();

            // resultPromise がまだ解決/拒否されていなければ、キャンセルとして解決
            // (既にタイムアウトや保存/キャンセルで解決/拒否されている場合は、この呼び出しは無視される)
            resolvePromise(undefined); // onDidDispose は resolvePromise(undefined) をデフォルト動作とする
        },
        undefined,
        context.subscriptions
    );

    // Promiseを呼び出し元に返し、結果を待ってもらう
    return resultPromise;
}

function checkTemplateConfigValidValue(config: TemplateConfig) {
    // テンプレート名、ファイル名、テンプレート内容がすべて入力されているかチェック
    return config.templateName && config.filename && config.template
}