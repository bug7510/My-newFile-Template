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


class SuggestionEditor {
    /**
     * @param {HTMLTextAreaElement | HTMLInputElement} inputElement - サジェスト機能を適用する入力要素
     * @param {object} options - 設定オプション
     * @param {string[]} options.triggerString - サジェストを表示するトリガー文字列 (例: '@')
     * @param {string[]} options.suggestionsData - サジェスト候補のデータ配列
     */
    constructor(inputElement, options) {
        this.inputElement = inputElement;
        this.options = options;
        this.triggerString = options.triggerString || ['@'];
        this.suggestionsData = options.suggestionsData || [];

        // サジェストリスト要素を生成し、入力要素の直後に挿入
        this.suggestionsDiv = document.createElement('div');
        this.suggestionsDiv.classList.add('suggestions-list');
        // 入力要素の親要素を見つけて、その子として追加する（containerを使っている前提）
        if (this.inputElement.parentElement) {
            this.inputElement.parentElement.appendChild(this.suggestionsDiv);
        } else {
            // 親要素がない場合は、入力要素の直後に挿入
            this.inputElement.parentNode.insertBefore(this.suggestionsDiv, this.inputElement.nextSibling);
        }


        this.currentWord = ''; // カーソル位置で追跡している文字列
        this.triggerStartIndex = -1; // トリガー文字が見つかったインデックス

        // イベントリスナーをバインド（thisのコンテキストを保持）
        this.handleInput = this.handleInput.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleSuggestionClick = this.handleSuggestionClick.bind(this);
        this.handleBlur = this.handleBlur.bind(this);

        this.addEventListeners();
    }

    /**
     * イベントリスナーを設定する
     */
    addEventListeners() {
        this.inputElement.addEventListener('input', this.handleInput);
        this.inputElement.addEventListener('keyup', this.handleKeyUp);
        this.inputElement.addEventListener('mouseup', this.handleMouseUp);
        this.inputElement.addEventListener('blur', this.handleBlur); // フォーカスが外れたとき
        this.suggestionsDiv.addEventListener('click', this.handleSuggestionClick); // サジェストリスト内のクリック
    }

    /**
     * 入力、カーソル移動、クリックなどでサジェスト表示を更新する
     */
    updateSuggestions() {
        const text = this.inputElement.value;
        const caretPos = this.inputElement.selectionStart; // 現在のカーソル位置

        // カーソル位置から逆方向にトリガーを探す
        let currentWordStartIndex = -1;
        for (let i = caretPos - 1; i >= 0; i--) {
            const char = text[i];
            // スペース、改行、特定の記号で単語の区切りとみなす
            if (char === ' ' || char === '\n' || char === '\r' || char === ',' || char === '.' || char === '!' || char === '?') {
                currentWordStartIndex = i + 1;
                break;
            }
            if (i === 0) {
                currentWordStartIndex = 0;
            }
        }

        if (currentWordStartIndex === -1) {
            currentWordStartIndex = 0;
        }


        const potentialWord = text.substring(currentWordStartIndex, caretPos);

        if (potentialWord.startsWith(this.triggerString)) {
            // トリガー文字列が見つかった場合
            this.triggerStartIndex = currentWordStartIndex; // トリガーの開始位置を記録
            this.currentWord = potentialWord; // 追跡中の単語を更新

            const searchTerm = this.currentWord.substring(this.triggerString.length); // トリガー以降の文字列を検索語とする
            const filteredSuggestions = this.suggestionsData.filter(suggestion =>
                suggestion.toLowerCase().includes(searchTerm.toLowerCase()) // 大文字小文字を区別しない検索
            );

            this.showSuggestions(filteredSuggestions); // サジェストを表示
        } else {
            // トリガー文字列で始まらない場合、サジェストを非表示
            this.currentWord = ''; // 追跡中の単語をリセット
            this.triggerStartIndex = -1;
            this.hideSuggestions();
        }
    }

    /**
     * サジェスト候補を表示する
     * @param {string[]} suggestions - 表示する候補の配列
     */
    showSuggestions(suggestions) {
        this.suggestionsDiv.innerHTML = ''; // リストをクリア
        if (suggestions.length > 0) {
            suggestions.forEach(suggestion => {
                const item = document.createElement('div');
                item.classList.add('suggestion-item');
                item.textContent = suggestion;
                item.dataset.suggestion = suggestion; // 候補文字列をデータ属性に保持
                this.suggestionsDiv.appendChild(item);
            });
            this.suggestionsDiv.style.display = 'block'; // リストを表示
        } else {
            this.hideSuggestions(); // 候補がなければ非表示
        }
    }

    /**
     * サジェスト候補を非表示にする
     */
    hideSuggestions() {
        this.suggestionsDiv.style.display = 'none';
        this.suggestionsDiv.innerHTML = ''; // リストをクリア
    }

    /**
     * サジェスト候補を選択（クリック）したときの処理
     * @param {MouseEvent} event
     */
    handleSuggestionClick(event) {
        const target = event.target;
        if (target.classList.contains('suggestion-item')) {
            const suggestionText = target.dataset.suggestion;
            this.insertSuggestion(suggestionText); // 選択した候補を挿入
            this.hideSuggestions(); // サジェストリストを非表示にする
        }
    }

    /**
     * テキストエリアにサジェスト文字列を挿入する
     * @param {string} suggestion - 挿入する文字列
     */
    insertSuggestion(suggestion) {
        const text = this.inputElement.value;
        const caretPos = this.inputElement.selectionStart; // 現在のカーソル位置

        if (this.triggerStartIndex !== -1) {
            // トリガーが見つかっている場合、トリガーからカーソル位置までの部分を置換
            const beforeText = text.substring(0, this.triggerStartIndex);
            const afterText = text.substring(caretPos);

            const newText = beforeText + suggestion + afterText;

            this.inputElement.value = newText;

            // 新しいカーソル位置を設定（挿入した文字列の直後）
            const newCaretPos = this.triggerStartIndex + suggestion.length;
            this.inputElement.selectionStart = newCaretPos;
            this.inputElement.selectionEnd = newCaretPos;

            // 値が変更されたことを示すために 'input' イベントを手動で発火させる
            // これにより、後続の updateSuggestions が適切に動作する
            this.inputElement.dispatchEvent(new Event('input', { bubbles: true })); // bubbles: true を推奨

        } else {
            // 基本的にはここには来ない想定だが、念のため
            // カーソル位置にそのまま挿入
            const beforeText = text.substring(0, caretPos);
            const afterText = text.substring(caretPos);
            const newText = beforeText + suggestion + afterText;
            this.inputElement.value = newText;

            const newCaretPos = caretPos + suggestion.length;
            this.inputElement.selectionStart = newCaretPos;
            this.inputElement.selectionEnd = newCaretPos;

            this.inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        }

        this.inputElement.focus(); // 挿入後にテキストエリアにフォーカスを戻す
    }


    // --- イベントハンドラー（updateSuggestionsを呼び出すだけ） ---

    handleInput() {
        this.updateSuggestions();
    }

    handleKeyUp(event) {
        // カーソル移動に関係するキーでも updateSuggestions を呼び出す
        this.updateSuggestions();
    }

    handleMouseUp() {
        // マウスでカーソル位置を変更した場合
        this.updateSuggestions();
    }

    handleBlur() {
        // テキストエリアからフォーカスが外れたときにサジェストを非表示
        // サジェストのクリックによってもblurは発生するため、少し遅延させる
        setTimeout(() => {
            // relatedTarget が suggestionsDiv またはその子孫である場合は非表示にしない
            // これは、サジェストをクリックしたときにリストが即座に消えないようにするため
            if (!this.suggestionsDiv.contains(document.activeElement)) {
                this.hideSuggestions();
            }
        }, 100); // 100ms 遅延
    }

    // 必要に応じて、removeEventListeners() メソッドも追加して、要素がDOMから削除される際にリスナーを解除できるようにする
    // removeEventListeners() {
    //     this.inputElement.removeEventListener('input', this.handleInput);
    //     this.inputElement.removeEventListener('keyup', this.handleKeyUp);
    //     this.inputElement.removeEventListener('mouseup', this.handleMouseUp);
    //     this.inputElement.removeEventListener('blur', this.handleBlur);
    //     this.suggestionsDiv.removeEventListener('click', this.handleSuggestionClick);
    //     // this.suggestionsDiv もDOMから削除する必要があるかもしれません
    //     if (this.suggestionsDiv.parentElement) {
    //          this.suggestionsDiv.parentElement.removeChild(this.suggestionsDiv);
    //     }
    // }
}