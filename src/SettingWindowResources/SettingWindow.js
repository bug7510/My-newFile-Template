const vscode = acquireVsCodeApi();
const templateNameInput = document.getElementById('templateName');
const filenameInput = document.getElementById('filename');
const templateContentTextarea = document.getElementById('template');
const decideButton = document.getElementById('decideButton');
const cancelButton = document.getElementById('cancelButton'); // キャンセルボタン参照

// ★ DOMContentLoaded イベント後に ready メッセージを送信 ★
window.addEventListener('DOMContentLoaded', () => {
    vscode.postMessage({ command: "ready" });
});
// 拡張機能からのメッセージを
window.addEventListener('message', event => {
    const message = event.data; // 拡張機能から送られたデータ

    switch (message.command) {
        case 'initialData':
            // 初期データが送られてきたらフォームに設定
            if (message.data) {
                templateNameInput.value = message.data.templateName || '';
                filenameInput.value = message.data.filename || '';
                templateContentTextarea.value = message.data.template || '';
            }
            break;
    }
});

// 決定ボタンのクリックイベント
decideButton.addEventListener('click', () => {
    // 現在のフォームの値を収集
    const result = {
        templateName: templateNameInput.value,
        filename: filenameInput.value,
        template: templateContentTextarea.value
    };

    // 拡張機能に 'save' コマンドとデータを送信
    vscode.postMessage({
        command: "save",
        data: result
    });

    // Webview側では自身を閉じる処理は行わない（拡張機能側が行う）
});

// キャンセルボタンのクリックイベント
cancelButton.addEventListener('click', () => {
    // 拡張機能に 'cancel' コマンドを送信
    vscode.postMessage({
        command: "cancel"
    });
});
