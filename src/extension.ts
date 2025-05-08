// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// package.jsonで定義したコマンドを登録します
	let disposable = vscode.commands.registerCommand(
		'NewFileTemplate.create', // package.jsonで定義したコマンドIDと一致させる
		(uri: vscode.Uri) => { // コマンドが実行されるときに渡される引数。contextメニューからは選択されたリソースのURIが渡されます。

			// 選択されたリソースのパスを取得
			// explorer/contextからの場合、uriは選択されたファイル/フォルダのURIです
			const folderPath = uri.fsPath; // ファイルシステムのパスとして取得

			// ファイル名の入力をユーザーに促す
			vscode.window.showInputBox(
				{
					prompt: '作成するファイル名を入力してください',
					placeHolder: 'ファイル名 (例: newfile)'
				})
				.then(async (fileName) => { // async/awaitを使って非同期処理を扱いやすくする
					if (!fileName) {
						// ファイル名が入力されなかった場合、処理を中断
						vscode.window.showInformationMessage('ファイル作成をキャンセルしました。');
						return;
					}

					// フルパスを作成
					const filePath = path.join(folderPath, `${fileName}.cs`);
					const fileContents: string = `public class ${fileName}{\n\n}`;
					// ファイルを作成する
					await makeFile(fileName, filePath, fileContents);
				}
				);
		}
	);

	// 拡張機能が非アクティブになる際に登録したコマンドを解放
	context.subscriptions.push(disposable);
}
async function makeFile(fileName: string, filePath: string, fileContents: string) {
	try {

		// fs.writeFileでファイルを作成 (ファイルが存在する場合は上書きされます)
		// ファイルが存在するか確認したい場合は fs.existsSync などで事前にチェック
		await fs.promises.writeFile(filePath, fileContents); // 空のファイルを作成

		vscode.window.showInformationMessage(`${fileName}.cs を作成しました。`);

		// 作成したファイルをVS Codeで開く (任意)
		const fileUri = vscode.Uri.file(filePath);
		await vscode.window.showTextDocument(fileUri);

	} catch (error: any) {
		// エラーハンドリング
		vscode.window.showErrorMessage(`ファイルの作成に失敗しました: ${error.message}`);
		console.error('ファイル作成エラー:', error);
	}
}
// This method is called when your extension is deactivated
export function deactivate() { }
