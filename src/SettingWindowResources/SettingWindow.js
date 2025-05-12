const vscode = acquireVsCodeApi();
const templateNameInput = document.getElementById('templateName');
const filenameInput = document.getElementById('filename');
const templateContentTextarea = document.getElementById('template');
const decideButton = document.getElementById('decideButton');
const cancelButton = document.getElementById('cancelButton'); // キャンセルボタン参照

//  DOMContentLoaded イベント後に ready メッセージを送信 
window.addEventListener('DOMContentLoaded', () => {
    vscode.postMessage({ command: "ready" });

    // DOMがロードされたら、指定したクラスを持つすべての要素にサジェスト機能を適用する
    const suggestibleInputs = document.querySelectorAll('.js-suggestible-input');

    // サンプル用の共通サジェストデータ (入力要素ごとに変えたい場合は、要素のデータ属性などから取得するように拡張)

    const filePathTriggers = ["fi", "fil", "file", "fileP", "filePa", "filePat", "filePath", "filePath[",
        "{f", "{fi", "{fil", "{file", "{fileP", "{filePa", "{filePat", "{filePath", "{filePath["];
    const filePathSuggestions = ["{filePath[]}", "{filePath[0]}", "{filePath[1]}", "{filePath[2]}", "{filePath[3]}"];

    suggestibleInputs.forEach(inputElement => {
        // 各入力要素に対してSuggestionEditorのインスタンスを作成
        new SuggestionEditor(inputElement, {
            triggerStrings: filePathTriggers, // トリガー文字は必要に応じて変更可能
            suggestionsData: filePathSuggestions // この入力要素で使用するサジェストデータ
        });
    });
})
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
     * @param {string[]} options.triggerStrings - サジェストを表示するトリガー文字列 (例: '@')
     * @param {string[]} options.suggestionsData - サジェスト候補のデータ配列
     */
    constructor(inputElement, options) {
        this.inputElement = inputElement;
        this.options = options;
        this.triggerStrings = options.triggerStrings || ['@'];
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


        this.currentInputWordForSearch = ''; // カーソル位置で追跡している文字列

        // イベントリスナーをバインド（thisのコンテキストを保持）
        this.handleInput = this.handleInput.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleSelectionChange = this.handleSelectionChange.bind(this);
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
        // this.inputElement.addEventListeners('selectionchange', this.handleSelectionChange)
        this.suggestionsDiv.addEventListener('mousedown', this.handleSuggestionClick); // サジェストリスト内のクリック
    }

    /**
     * 入力、カーソル移動、クリックなどでサジェスト表示を更新する
     */
    updateSuggestions() {
        const text = this.inputElement.value;
        const caretPos = this.inputElement.selectionStart; // 現在のカーソル位置

        // カーソル位置から逆方向にトリガーを探す
        let currentSearchStartIndex = -1;
        for (let i = caretPos - 1; i >= 0; i--) {
            const char = text[i];
            // スペース、改行、特定の記号で単語の区切りとみなす
            if (char === ' ' || char === '\n' || char === '\r' || char === ',' || char === '.' || char === '!' || char === '?') {
                currentSearchStartIndex = i + 1;
                break;
            }
            if (i === 0) {
                currentSearchStartIndex = 0;
            }
        }

        if (currentSearchStartIndex === -1) {
            currentSearchStartIndex = 0;
        }

        //現在入力中の文字
        const potentialSearchWordInputting = text.substring(currentSearchStartIndex, caretPos);

        let triggerIsFound = new Boolean(false);


        let foundValidTriggers = [];

        this.triggerStrings.forEach(trigger => {
            triggerIsFound |= potentialSearchWordInputting.endsWith(trigger);
            if (!foundValidTriggers.includes(trigger) && potentialSearchWordInputting.endsWith(trigger))
                foundValidTriggers.push(trigger);
        });

        if (triggerIsFound) {
            this.currentInputWordForSearch = potentialSearchWordInputting; // 追跡中の単語を更新


            /** @type {{ suggest: string, triggerPos: number }[]} */
            let filteredSuggestions = [];
            let willDeleteFilePathSuggest = false;
            foundValidTriggers.forEach((trigger) => {


                let filteredSuggestionsWithBeforeCursor = this.suggestionsData.filter(suggestion =>
                    suggestion.toLowerCase().includes(trigger.toLowerCase()) // 大文字小文字を区別しない検索
                );
                filteredSuggestions.push(...
                    filteredSuggestionsWithBeforeCursor
                        .filter(suggestionWithBeforeCursor => {
                            //同じサジェストならトリガーが長い方を採る
                            let sameSuggestIndex = -1;
                            filteredSuggestions.forEach((suggest, index) => {
                                if (suggest.suggest === suggestionWithBeforeCursor) {
                                    sameSuggestIndex = index
                                };
                            })
                            if (sameSuggestIndex !== -1) {
                                if (trigger.length >= (caretPos - (filteredSuggestions[sameSuggestIndex].triggerPos))) {
                                    filteredSuggestions.splice(sameSuggestIndex, 1);
                                    return true;
                                }
                                else return false;
                            }
                            else return true;
                        })
                        .filter(suggestionWithBeforeCursor => {
                            // サジェスト候補のうち、検索語に続く部分を取得
                            const restOfSuggestion = suggestionWithBeforeCursor.substring(trigger.length);
                            // カーソル位置の直後にあるテキストを取得
                            const textAfterCaret = text.substring(caretPos);

                            // カーソル位置の直後のテキストが、サジェスト候補の残りの部分で始まっているかチェック
                            // 始まっている場合は、そのサジェストは既にテキストに含まれているとみなし、表示しない
                            const willAllow = !textAfterCaret.startsWith(restOfSuggestion)
                            if (!willAllow && suggestionWithBeforeCursor.includes("filePath[")) {
                                willDeleteFilePathSuggest = true;
                            }
                            return willAllow;
                        })
                        .map((suggestion) => {
                            return { suggest: suggestion, triggerPos: (caretPos - trigger.length) }
                        })
                );
            });
            console.log(willDeleteFilePathSuggest);
            if (willDeleteFilePathSuggest) {
                filteredSuggestions = filteredSuggestions.filter(suggestion => !suggestion.suggest.includes("filePath["));
            }
            this.showSuggestions(filteredSuggestions); // サジェストを表示
        } else {
            // トリガー文字列で始まらない場合、サジェストを非表示
            this.currentInputWordForSearch = ''; // 追跡中の単語をリセット
            this.hideSuggestions();
        }
    }

    /**
     * サジェスト候補を表示する
     * @param {{suggest:string,triggerPos:number}[]} suggestions - 表示する候補の配列
     */
    showSuggestions(suggestions) {
        this.suggestionsDiv.innerHTML = ''; // リストをクリア
        if (suggestions.length > 0) {
            console.log(suggestions.length);
            suggestions.forEach(suggestion => {
                let suggestText;
                switch (suggestion.suggest) {
                    case "{filePath[0]}":
                        suggestText = `${suggestion.suggest} : 入力されたファイル名`;
                        break;
                    case "{filePath[1]}":
                        suggestText = `${suggestion.suggest} : フォルダ名`;
                        break;
                    case "{filePath[2]}":
                        suggestText = `${suggestion.suggest} : 一つ上のフォルダ名`;
                        break;
                    default:
                        suggestText = suggestion.suggest;
                        break;

                }
                const item = document.createElement('div');
                item.classList.add('suggestion-item');
                item.textContent = suggestText;
                item.dataset.suggestion = this.suggestToString(suggestion); // 候補文字列をデータ属性に保持
                this.suggestionsDiv.appendChild(item);
            });
            this.suggestionsDiv.style.display = 'block'; // リストを表示
        }
        else {
            this.hideSuggestions(); // 候補がなければ非表示
        }
    }
    /** @param {suggest:string,triggerPos:number} suggest */
    suggestToString(suggest) {
        return `suggest:${suggest.suggest},triggerPos:${suggest.triggerPos}}`;
    }
    /** 
     * @param {string} str 
     * @returns {suggest:string,triggerPos:number}
    */
    stringToSuggest(str) {
        const parts = str.split(',');
        const suggest = parts[0].split(':')[1];
        const triggerPos = parseInt(parts[1].split(':')[1]);
        return { suggest, triggerPos };
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
        event.preventDefault(); // デフォルトの動作をキャンセル
        const target = event.target;
        if (target.classList.contains('suggestion-item')) {
            const suggestionText = target.dataset.suggestion;
            this.insertSuggestion(this.stringToSuggest(suggestionText)); // 選択した候補を挿入
            this.hideSuggestions(); // サジェストリストを非表示にする
        }
    }

    //todo
    /**
     * テキストエリアにサジェスト文字列を挿入する
     * @param {{suggest:string,triggerPos:number}} suggestion - 挿入する文字列
     */
    insertSuggestion(suggestion) {
        const text = this.inputElement.value;
        const caretPos = this.inputElement.selectionStart; // 現在のカーソル位置

        // トリガーが見つかっている場合、トリガーからカーソル位置までの部分を置換
        const beforeText = text.substring(0, suggestion.triggerPos);
        const afterText = text.substring(caretPos);

        const newText = beforeText + suggestion.suggest + afterText;

        this.inputElement.value = newText;

        // 値が変更されたことを示すために 'input' イベントを手動で発火させる
        // これにより、後続の updateSuggestions が適切に動作する
        this.inputElement.dispatchEvent(new Event('input', { bubbles: true })); // bubbles: true を推奨


        this.inputElement.focus(); // 挿入後にテキストエリアにフォーカスを戻す
        // 新しいカーソル位置を設定（挿入した文字列の直後）
        let newCaretPos = suggestion.triggerPos + suggestion.suggest.length;
        if (suggestion.suggest === "{filePath[]}") newCaretPos -= "]}".length;
        this.inputElement.setSelectionRange(newCaretPos, newCaretPos);
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
    handleSelectionChange() {
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