// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { log } from 'console';

// テンプレートオブジェクトの型を定義
interface TemplateConfig {
	templateName: string;
	filename: string;
	template: string;
}
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// package.jsonで定義したコマンドを登録します
	let disposable = vscode.commands.registerCommand(
		'MyNewFileTemplate.create', // package.jsonで定義したコマンドIDと一致させる
		async (uri: vscode.Uri) => { // コマンドが実行されるときに渡される引数。contextメニューからは選択されたリソースのURIが渡されます。

			// 選択されたリソースのパスを取得
			// explorer/contextからの場合、uriは選択されたファイル/フォルダのURIです
			const folderPath = uri.fsPath; // ファイルシステムのパスとして取得

			// 設定からテンプレートのリストを読み込む
			const config = vscode.workspace.getConfiguration('MyNewFileTemplate');
			const templates = config.get<TemplateConfig[]>('Templates', []); // 'Templates'設定を取得。型はTemplateConfigの配列([])、デフォルト値は空配列

			if (!templates || templates.length === 0) {
				vscode.window.showErrorMessage('設定にファイルテンプレートが定義されていません。');
				return;
			}


			const pickItems = templates.map(template => ({
				label: template.templateName, // クイックピックに表示するテキスト
				description: template.filename, // テキストの下に表示する補足 (任意)
				templateConfig: template // 選択されたときに参照できるようにテンプレートオブジェクト自体を持たせておく
			}));
			const selectedItem = await vscode.window.showQuickPick(pickItems, {
				placeHolder: 'テンプレートを選択してください'
			});
			if (!selectedItem) {
				return;
			}
			const selectedTemplateConfig = selectedItem.templateConfig;
			const selectedTemplate = selectedTemplateConfig.template;
			// ファイル名の入力をユーザーに促す
			vscode.window.showInputBox(
				{
					prompt: '作成するファイル名を入力してください',
					placeHolder: 'ファイル名 (例: newfile)'
				})
				.then(async (fileNameInput) => { // async/awaitを使って非同期処理を扱いやすくする
					if (!fileNameInput) {
						// ファイル名が入力されなかった場合、処理を中断
						return;
					}
					//ファイル名作成
					const finallyFileName: string = replaceAllFilePath(selectedTemplateConfig.filename, folderPath, fileNameInput)
					// フルパスを作成
					const filePath = path.join(folderPath, finallyFileName);
					const fileContents: string = replaceAllFilePath(selectedTemplate, folderPath, fileNameInput);
					// ファイルを作成する
					await makeFile(finallyFileName, filePath, fileContents);
				}
				);
		}
	);

	// 拡張機能が非アクティブになる際に登録したコマンドを解放
	context.subscriptions.push(disposable);
}

function replaceAllFilePath(targetText: string, folderPath: string, fileName: string) {


	return targetText.replace(/{filePath\[(\d+)\]}/g,
		(match) => {
			const matchedMatch = match.match(/\d/);
			let matchedNumber: number;
			if (matchedMatch == null) {
				vscode.window.showErrorMessage('置換エラー');
				return match;
			}
			else matchedNumber = parseInt(matchedMatch[0]);

			if (matchedNumber == 0) {
				return fileName;
			}
			else {
				let pathToCheck: string = folderPath;
				for (let i = 1; i < matchedNumber; i++) {
					// 現在のパスの親ディレクトリを取得
					const parentDir = path.dirname(pathToCheck);

					// 親ディレクトリが元のパスと変わらない場合、それはルートディレクトリに到達したことを意味する
					if (parentDir === pathToCheck) {
						// ルートに到達したのでこれ以上遡れない
						break;
					}




					// 次のループのために、親ディレクトリを新しい現在のパスとする
					pathToCheck = parentDir;
				}
				// 親ディレクトリの名前を取得 (basenameはパスの最後の部分を取得)
				return path.basename(pathToCheck);
			}
		}
	)
}
async function makeFile(fileName: string, filePath: string, fileContents: string) {
	try {

		// fs.writeFileでファイルを作成 (ファイルが存在する場合は上書きされます)
		// ファイルが存在するか確認したい場合は fs.existsSync などで事前にチェック
		await fs.promises.writeFile(filePath, fileContents); // 空のファイルを作成

		vscode.window.showInformationMessage(`${fileName}を作成しました。`);

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
