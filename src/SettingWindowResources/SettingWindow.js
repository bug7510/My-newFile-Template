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
            this.inputElement.parentElement.insertBefore(this.suggestionsDiv, this.inputElement.nextSibling);
        } else {
            // 親要素がない場合は、入力要素の直後に挿入
            this.inputElement.parentNode.insertBefore(this.suggestionsDiv, this.inputElement.nextSibling);
        }

        //  選択されているサジェスト項目のインデックス (-1 は何も選択されていない状態)
        this.ResetSelectedIndex();

        this.currentInputWordForSearch = ''; // カーソル位置で追跡している文字列

        // イベントリスナーをバインド（thisのコンテキストを保持）
        this.handleInput = this.handleInput.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleBlur = this.handleBlur.bind(this);
        // this.handleSelectionChange = this.handleSelectionChange.bind(this);
        this.handleResizeOrScroll = this.updateListPositionAndHeight.bind(this); // windowイベント用のバインド済みメソッド
        this.handleSuggestionClick = this.handleSuggestionClick.bind(this);

        this.addEventListeners();
    }
    ResetSelectedIndex() {
        this.selectedIndex = -1;
    }

    /**
     * イベントリスナーを設定する
     */
    addEventListeners() {
        this.inputElement.addEventListener('input', this.handleInput);
        this.inputElement.addEventListener('keydown', this.handleKeyDown);
        this.inputElement.addEventListener('mouseup', this.handleMouseUp);
        this.inputElement.addEventListener('blur', this.handleBlur); // フォーカスが外れたとき
        this.suggestionsDiv.addEventListener('mousedown', this.handleSuggestionClick); // サジェストリスト内のクリック
        window.addEventListener('resize', this.handleResizeOrScroll);
        // document.addEventListener('selectionchange', this.handleSelectionChange); // Listen on document for selection changes
        window.addEventListener('scroll', this.handleResizeOrScroll, true); // true はキャプチャフェーズで実行する場合。通常は不要かも。

        this.resizeObserver = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                // style 属性が変更されたか、またはサイズに影響する可能性のある属性が変更されたかチェック
                // 例えば、width/height 属性なども監視対象に加えるか検討
                if (mutation.type === 'attributes' && (mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
                    // リサイズによってスタイルが変わった可能性があるので、リストを更新
                    // ただし、リストが表示中の場合のみ実行するのが効率的です。
                    if (this.suggestionsDiv.style.display === 'block') {
                        this.updateListPositionAndHeight();
                    }
                }
            })
        });
        this.resizeObserver.observe(this.inputElement, {
            attributes: true, // 属性の変更を監視
            attributeFilter: ['style', 'class'] // style属性やclass属性の変更を特に監視
            // または attributeFilter を省略して attributes: true のみでも良いが、より多くの変更で発火する
        });

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
            if (willDeleteFilePathSuggest) {
                filteredSuggestions = filteredSuggestions.filter(suggestion => !suggestion.suggest.includes("filePath["));
            }
            if (filteredSuggestions.length !== 0) {
                this.showSuggestions(filteredSuggestions); // サジェストを表示
                this.updateHighlight(0); // ハイライトを解除
                this.updateListPositionAndHeight(); // 位置と高さを調整
                this.suggestionsDiv.style.display = 'block'; // リストを表示
            }
            else this.hideSuggestions(); // サジェストを表示しない

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
        suggestions.forEach(suggestion => {
            let suggestText = suggestion.suggest;
            //サジェストがfilePath関係だったときの説明を加算
            switch (suggestion.suggest) {
                case "{filePath[0]}":
                    suggestText += ` : 入力されたファイル名`;
                    break;
                case "{filePath[1]}":
                    suggestText += ` : フォルダ名`;
                    break;
                case "{filePath[2]}":
                    suggestText += ` : 一つ上のフォルダ名`;
                    break;
            }
            const item = document.createElement('div');
            item.classList.add('suggestion-item');
            item.textContent = suggestText;
            item.dataset.suggestion = this.suggestToString(suggestion); // 候補文字列をデータ属性に保持
            this.suggestionsDiv.appendChild(item);
        });

    }
    /** 
     * @param {{suggest:string,triggerPos:number}} suggest 
     * @returns 
    */
    suggestToString(suggest) {
        return `suggest:${suggest.suggest},triggerPos:${suggest.triggerPos}}`;
    }
    /** 
     * @param {string} str 
     * @returns {{suggest:string,triggerPos:number}}
    */
    stringToSuggest(str) {
        const parts = str.split(',');
        const suggest = parts[0].split(':')[1];
        const triggerPos = parseInt(parts[1].split(':')[1]);
        return { suggest, triggerPos };
    }
    /**
     * サジェストリストの位置（必要に応じて）と最大高さを更新する
     * ウィンドウのリサイズやスクロール時にも呼ばれる
     */
    updateListPositionAndHeight() {
        // リストが非表示の場合は何もしない
        if (this.suggestionsDiv.style.display === 'none') {
            return;
        }
        const maxHeight = 100;//リストの最大高さ
        const inputRect = this.inputElement.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const bottomMargin = 10; // ページ下端からの余白 (px)

        // 入力要素の下端からウィンドウの下端までの距離
        const spaceBelow = viewportHeight - inputRect.bottom - bottomMargin;

        // 入力要素の上端からウィンドウの上端までの距離

        // デフォルトでは下に表示する
        this.suggestionsDiv.style.top = '100%'; // 親要素 (.editor-container) の下端に
        this.suggestionsDiv.style.bottom = 'auto';

        const topMargin = 10; // ページ上端からの余白 (px)
        const spaceAbove = inputRect.top - topMargin;
        const listHeight = this.suggestionsDiv.offsetHeight; // 現在のリストの高さ（表示されていれば）
        if (spaceBelow < listHeight && spaceAbove > spaceBelow) {
            // 下に収まらず、かつ上にスペースがある程度ある場合、上に表示
            this.suggestionsDiv.style.top = 'auto';
            this.suggestionsDiv.style.bottom = '100%'; // 入力要素の上に
            this.suggestionsDiv.style.maxHeight = `${Math.max(50, Math.min(spaceAbove, maxHeight))}px`; // 上方向の利用可能なスペースを max-height に
        } else {
            // それ以外の場合は下に表示 (デフォルト)
            this.suggestionsDiv.style.top = '100%';
            this.suggestionsDiv.style.bottom = 'auto';
            this.suggestionsDiv.style.maxHeight = `${Math.max(50, Math.min(spaceBelow, maxHeight))}px`;
        }

        // リストの幅を入力要素に合わせる（CSSで width: 100% にしていれば親要素依存になるので不要な場合も）
        // this.suggestionsDiv.style.width = `${inputRect.width}px`;
    }
    /**
     * サジェスト候補を非表示にする
     */
    hideSuggestions() {
        this.suggestionsDiv.style.display = 'none';
        this.suggestionsDiv.innerHTML = ''; // リストをクリア
        this.ResetSelectedIndex();
    }
    /**
     * @param {number} newIndex -サジェスト数を考慮しない(循環するよう加工する前の)サジェスト移動先
     */
    updateHighlight(newIndex) {
        const items = this.suggestionsDiv.querySelectorAll('.suggestion-item');
        const itemCount = items.length;
        console.log(`itemCount: ${itemCount}`);

        if (itemCount === 0) {
            this.ResetSelectedIndex();
            return;
        }

        // 現在選択されている項目からクラスを削除
        if (this.selectedIndex !== -1 && items[this.selectedIndex]) {
            items[this.selectedIndex].classList.remove('selected');
        }

        // 新しいインデックスが有効範囲内かチェック
        let safeIndex = newIndex;
        if (safeIndex < 0) {
            safeIndex = itemCount - 1; // 上方向への循環
        } else if (safeIndex >= itemCount) {
            safeIndex = 0; // 下方向への循環
        }

        // 新しい項目にクラスを追加し、選択インデックスを更新
        if (items[safeIndex]) {
            items[safeIndex].classList.add('selected');
            this.selectedIndex = safeIndex;
            console.log(`selectedIndex: ${safeIndex}`);

            // 選択された項目がスクロールビューに収まるようにする
            items[safeIndex].scrollIntoView({
                block: 'nearest', // 上下方向で最も近い端に表示
                inline: 'nearest', // 左右方向で最も近い端に表示 (横スクロールがある場合)
                behavior: 'smooth' // スムーズにスクロール (好みで 'auto' も可)
            });
        } else {
            // 何らかの理由でインデックスが無効な場合
            this.ResetSelectedIndex();
        }
    }
    //toCheck
    /**  
     *  キーボードイベントを処理する
     * @param {KeyboardEvent} event 
     */
    handleKeyDown(event) {
        // サジェストリストが表示されていない場合は何もしない
        if (this.suggestionsDiv.style.display === 'none') {
            return;
        }

        const items = this.suggestionsDiv.querySelectorAll('.suggestion-item');
        const itemCount = items.length;

        // 候補がない場合、Enter/Tab/Escでリストを閉じ、デフォルト動作を防ぐ
        if (itemCount === 0) {
            return; // 他のキーは無視（デフォルト動作させる）
        }

        let handled = false; // このイベントがハンドリングされたかを示すフラグ

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault(); // デフォルトのカーソル移動を防ぐ
                if (this.selectedIndex != -1) {
                    let nextIndexDown = this.selectedIndex + 1;
                    // 最初のEnter/Downでの選択（-1から0へ）や、循環を updateHighlight に任せる
                    this.updateHighlight(nextIndexDown);
                } else {
                    this.updateHighlight(0);
                }
                handled = true;
                break;
            case 'ArrowUp':
                event.preventDefault(); // デフォルトのカーソル移動を防ぐ
                if (this.selectedIndex != -1) {
                    let nextIndexUp = this.selectedIndex - 1;
                    // 最初のUpでの選択（-1から itemCount-1 へ）や、循環を updateHighlight に任せる
                    this.updateHighlight(nextIndexUp);
                }
                else {
                    this.updateHighlight(0);
                }
                handled = true;
                break;
            case 'Enter':
            case 'Tab':
                // EnterまたはTabは、項目が選択されている場合のみ挿入
                if (this.selectedIndex !== -1) {
                    //toCheck
                    event.preventDefault(); // デフォルト動作（改行、タブ、フォーカス移動）を防ぐ
                    const selectedItem = items[this.selectedIndex];
                    const suggestionText = selectedItem.dataset.suggestion;
                    this.insertSuggestion(this.stringToSuggest(suggestionText)); // 選択項目を挿入
                    // hideSuggestions は insertSuggestion の中で input イベント発火により呼ばれる想定ですが、
                    // 念のため明示的に呼んでも良いです。二重呼び出しにならないように注意。
                    // this.hideSuggestions(); // リストを閉じる
                    // 注: insertSuggestion の中でdispatchEvent('input') しており、
                    // それが updateSuggestions を呼び出し、候補がなくなるため hideSuggestions が呼ばれます。
                    // ここで再度 hideSuggestions を呼ぶとタイミングによっては問題になる可能性があります。
                    // insertSuggestion の後続処理に任せるのが良いでしょう。
                    handled = true; // イベント処理済み
                } else {
                    // 項目が選択されていない状態で Enter/Tab が押された場合、リストを閉じる
                    event.preventDefault(); // デフォルト動作を防ぐ
                    const selectedItem = items[0];
                    const suggestionText = selectedItem.dataset.suggestion;
                    this.insertSuggestion(this.stringToSuggest(suggestionText));
                    handled = true; // イベント処理済み
                }
                break;
            case 'Escape': // Escキーでリストを閉じる
                if (this.suggestionsDiv.style.display === 'block') {
                    event.preventDefault();
                    this.hideSuggestions();
                    handled = true; // イベント処理済み
                }
                break;
            default:
                this.updateSuggestions();
                break;
            // 他のキーは処理しない（デフォルト動作させる）
        }

        // イベントがハンドリングされた場合は、他のリスナーへの伝播を停止しても良いですが、
        // 通常は preventDefault() だけで十分です。
        // if (handled) {
        //     event.stopPropagation();
        // }
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
        let newText;
        if (suggestion.suggest !== "{filePath[]}") {
            newText = beforeText + suggestion.suggest + afterText;
        }
        else {
            newText = beforeText + "{filePath[number]}" + afterText;
        }

        this.inputElement.value = newText;

        // 値が変更されたことを示すために 'input' イベントを手動で発火させる
        // これにより、後続の updateSuggestions が適切に動作する
        this.inputElement.dispatchEvent(new Event('input', { bubbles: true })); // bubbles: true を推奨


        this.inputElement.focus(); // 挿入後にテキストエリアにフォーカスを戻す

        // 新しいカーソル位置を設定（挿入した文字列の直後）
        if (suggestion.suggest !== "{filePath[]}") {
            const newCaretPos = suggestion.triggerPos + suggestion.suggest.length;
            this.inputElement.setSelectionRange(newCaretPos, newCaretPos);
        }
        else {
            const beginCaretPos = suggestion.triggerPos + suggestion.suggest.length + "number".length - "number]}".length;
            const endCaretPos = suggestion.triggerPos + suggestion.suggest.length + "number".length - "]}".length;
            this.inputElement.setSelectionRange(beginCaretPos, endCaretPos);
            this.hideSuggestions(); // サジェストリストを非表示にする
        }
    }


    // --- イベントハンドラー（updateSuggestionsを呼び出すだけ） ---

    handleInput() {
        this.updateSuggestions();
    }

    handleMouseUp() {
        // マウスでカーソル位置を変更した場合
        this.updateSuggestions();
    }
    // handleSelectionChange() {
    //     // Check if the active element is the input element this instance is managing
    //     // This is important if 'selectionchange' is listened to on document/window
    //     if (document.activeElement === this.inputElement) {
    //         this.updateSuggestions();
    //     } else {
    //         this.hideSuggestions(); // Hide if selection change is outside this input
    //     }
    // }

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
    removeEventListeners() {
        this.inputElement.removeEventListener('input', this.handleInput);
        this.inputElement.removeEventListener('keydown', this.handleKeyDown);
        this.inputElement.removeEventListener('mouseup', this.handleMouseUp);
        this.suggestionsDiv.removeEventListener('mousedown', this.handleSuggestionClick);
        // document.removeEventListener('selectionchange', this.handleSelectionChange); // Remove from document
        this.inputElement.removeEventListener('blur', this.handleBlur);
        if (this.resizeObserver) {
            this.resizeObserver.disconnect(); // オブザーバーを停止
        }
        // window に登録したリスナーを削除
        window.removeEventListener('resize', this.handleResizeOrScroll);
        window.removeEventListener('scroll', this.handleResizeOrScroll, true);

        // this.suggestionsDiv もDOMから削除する必要があるかもしれません
        if (this.suggestionsDiv.parentElement) {
            this.suggestionsDiv.parentElement.removeChild(this.suggestionsDiv);
        }

    }
}