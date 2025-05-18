import { TemplateConfig } from './TemplateConfig.js'
import { CommandKey } from './CommandKey.js'
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const FILENAME = "SettingWindow";
const PLACEHOLDER = "{cspSource}";
const SECURITYPOLICY = "{securityPolicy}";
const WEBVIEW_READY_TIMEOUT_MS = 100; // Webviewがreadyコマンドを送信するまでのタイムアウト
const INITIAL_DATA_PROCESSING_TIMEOUT_MS = 500; // initialConfig送信後、WebviewがUI準備完了を通知するまでのタイムアウト

// TimeoutErrorクラス (extension.tsにも同様のクラスがあるため、共通化を推奨)
class TimeoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TimeoutError';
    }
}

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

    let readyCommandTimeoutId: NodeJS.Timeout | undefined;
    let dataProcessingTimeoutId: NodeJS.Timeout | undefined;
    let mainMessageListener: vscode.Disposable | undefined;

    // Phase 1: Webviewがreadyコマンドを送信するのを待つ
    const webviewReadyPhase = new Promise<void>((resolve, reject) => {
        readyCommandTimeoutId = setTimeout(() => {
            reject(new TimeoutError(`編集ウィンドウの起動ができませんでした。`));
        }, WEBVIEW_READY_TIMEOUT_MS);

        const readyListener = panel.webview.onDidReceiveMessage(message => {
            if (message.command === CommandKey.readyCommand) {
                if (readyCommandTimeoutId) clearTimeout(readyCommandTimeoutId);
                readyCommandTimeoutId = undefined;
                readyListener.dispose(); // このリスナーは用済み
                resolve();
            }
        });
        // パネルが予期せず閉じられた場合、このリスナーも破棄
        const disposeSubscription = panel.onDidDispose(() => {
            readyListener.dispose();
            if (readyCommandTimeoutId) {
                clearTimeout(readyCommandTimeoutId);
                readyCommandTimeoutId = undefined;
            }
            disposeSubscription.dispose(); // 自分自身も破棄
        });
    });

    // メインの処理フロー
    webviewReadyPhase.then(() => {
        // Webview is ready, send initial data
        panel.webview.postMessage({
            command: 'initialData',
            data: initialConfig
        });

        // Phase 2: Webviewが初期データを処理し、UIが操作可能になったことを示すコマンド (dataProcessedCommand) を待つ
        // または、ユーザーが保存/キャンセル操作を行うのを待つ
        // このPromiseは最終的なTemplateConfig | undefinedを解決/拒否する
        const dataProcessingAndInteractionPhase = new Promise<TemplateConfig | undefined>((resolveDataPhase, rejectDataPhase) => {
            dataProcessingTimeoutId = setTimeout(() => {
                // このタイムアウトは、initialData送信後、Webviewからの応答がない場合に発生
                rejectDataPhase(new TimeoutError(`ファイルの内容が表示できません。`));
            }, INITIAL_DATA_PROCESSING_TIMEOUT_MS);

            mainMessageListener = panel.webview.onDidReceiveMessage(message => {
                // 'dataProcessedCommand' は Webview 側で initialData 受信・UI準備後に送信される想定
                if (message.command === 'dataProcessedCommand') { // ★ Webview側で対応が必要な新しいコマンド名
                    if (dataProcessingTimeoutId) {
                        clearTimeout(dataProcessingTimeoutId);
                        dataProcessingTimeoutId = undefined; // UI準備完了の合図なので、このタイムアウトはクリア
                    }
                    // UI準備完了。ユーザーの次の操作 (save/cancel) を待つ。
                    // この時点ではまだ dataProcessingAndInteractionPhase を解決しない。
                } else if (message.command === CommandKey.saveCommand) {
                    if (dataProcessingTimeoutId) clearTimeout(dataProcessingTimeoutId); // 操作があったのでタイムアウトクリア
                    dataProcessingTimeoutId = undefined;

                    const savedConfig = message.data as TemplateConfig;
                    if (checkTemplateConfigValidValue(savedConfig)) {
                        if (initialConfig.templateName !== savedConfig.templateName ||
                            initialConfig.filename !== savedConfig.filename ||
                            initialConfig.template !== savedConfig.template) {
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
                } else if (message.command === CommandKey.cancelCommand) {
                    if (dataProcessingTimeoutId) clearTimeout(dataProcessingTimeoutId);
                    dataProcessingTimeoutId = undefined;
                    resolveDataPhase(undefined); // キャンセル
                }
            });
        });

        // dataProcessingAndInteractionPhase の結果を resultPromise に反映
        dataProcessingAndInteractionPhase
            .then(config => {
                resolvePromise(config); // 外部のPromiseを解決
                panel.dispose(); // 成功時(undefined含む)はパネルを閉じる
            })
            .catch(error => {
                rejectPromise(error); // 外部のPromiseを拒否
                panel.dispose(); // エラー時もパネルを閉じる
            });

    })
        .catch(error => { // webviewReadyPhase でのエラー (起動タイムアウトなど)
            if (readyCommandTimeoutId) clearTimeout(readyCommandTimeoutId); //念のため
            rejectPromise(error); // 外部のPromiseを拒否
            panel.dispose(); // エラー時はパネルを閉じる
        });

    // パネルが閉じられたときの処理
    panel.onDidDispose(
        () => {
            if (mainMessageListener) mainMessageListener.dispose();
            if (readyCommandTimeoutId) clearTimeout(readyCommandTimeoutId);
            if (dataProcessingTimeoutId) clearTimeout(dataProcessingTimeoutId);

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