// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { TemplateConfig } from './TemplateConfig'
import { showTemplateEditWindow } from './SettingWindowCore'
import { quickPickChain } from './QuickPickChain';
interface pickTemplate extends vscode.QuickPickItem {
	label: string;
	description: string;
	templateConfig: TemplateConfig
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// package.jsonで定義したコマンドを登録します
	let newFileDisposable = vscode.commands.registerCommand(
		'MyNewFileTemplate.newFile', // package.jsonで定義したコマンドIDと一致させる
		async (uri: vscode.Uri) => { // コマンドが実行されるときに渡される引数。contextメニューからは選択されたリソースのURIが渡されます。

			// 選択されたリソースのパスを取得
			// explorer/contextからの場合、uriは選択されたファイル/フォルダのURIです
			const folderPath = uri.fsPath; // ファイルシステムのパスとして取得

			// 設定からテンプレートのリストを読み込む
			const templates = getTemplatesFromConfig(); // 'Templates'設定を取得。型はTemplateConfigの配列([])、デフォルト値は空配列
			const hiddenTemplates = context.workspaceState.get<string[]>('HiddenArray', []);

			// 非表示テンプレートを除外して、表示するテンプレートリストを作成
			const visibleTemplates = templates.filter(template =>
				!hiddenTemplates.includes(template.templateName) // hiddenTemplates リストに含まれていないテンプレートのみを残す
			);

			if (!visibleTemplates || visibleTemplates.length === 0) {
				vscode.window.showErrorMessage('設定にファイルテンプレートが定義されていません。');
				return;
			}
			const selectedItem = await openTemplatesQuickPickSelectOne(visibleTemplates, 'テンプレートを選択してください');

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

	let hideTemplateInWorkSpaceDisposable = vscode.commands.registerCommand(
		'MyNewFileTemplate.template.workspace.hide',
		async (uri: vscode.Uri) => {
			if (!vscode.workspace.workspaceFolders) {
				vscode.window.showErrorMessage('このコマンドはワークスペース内で実行してください。');
				return;
			}
			// 全てのテンプレートを読み込む (非表示設定はまだ考慮しない)
			const allTemplateConfigs = getTemplatesFromConfig();
			// ★現在のワークスペース設定から非表示リストを読み込む★
			const currentHiddenTemplates = context.workspaceState.get<string[]>('HiddenArray', []);
			if (!allTemplateConfigs || allTemplateConfigs.length === 0) {
				vscode.window.showErrorMessage('設定にファイルテンプレートが定義されていません。非表示/表示設定を行えません。');
				return;
			}
			// クイックピックの項目を作成（全てのテンプレートを対象）
			// 既に非表示のものはチェックマークをつけておく
			const pickItems = allTemplateConfigs.map(templateConfig => ({
				label: templateConfig.templateName,
				description: templateConfig.filename, // 補足情報
				picked: !(currentHiddenTemplates.includes(templateConfig.templateName)), // ★既に非表示ならチェックマークをつける★
				templateConfig: templateConfig // 後で使うテンプレート名を保存しておく
			}));

			const selectedItems = await vscode.window.showQuickPick(pickItems, {
				placeHolder: 'ワークスペースで非表示/表示を切り替えるテンプレートを選択してください (複数選択可)',
				canPickMany: true // ★複数選択を許可★
			});

			if (selectedItems === undefined) return;

			// 選択された項目 (チェックマークがついた項目) のテンプレート名リストを作成
			const namesToShow = selectedItems.map(item => item.label);
			const namesToHide = allTemplateConfigs.map(item => item.templateName)
				.filter(item => !namesToShow.includes(item));

			try {
				await context.workspaceState.update(
					'HiddenArray', // 更新する設定項目のキー
					namesToHide,       // 更新する値 (非表示にしたいテンプレート名の配列)
				);
				vscode.window.showInformationMessage('ワークスペースのテンプレート表示設定を更新しました。');
			} catch (error: any) {
				vscode.window.showErrorMessage(`ワークスペース設定の更新に失敗しました: ${error.message}`);
				console.error('設定更新エラー:', error);
			}

		}
	);
	let settingWindowDisposable = vscode.commands.registerCommand(
		'MyNewFileTemplate.template.global',
		async (uri: vscode.Uri) => {
			openEditOptionQuickPick();
		});
	let createTemplateInGlobalDisposable = vscode.commands.registerCommand(
		'MyNewFileTemplate.template.global.create',
		async (uri: vscode.Uri) => {
			let createdConfig: TemplateConfig | undefined;
			try {
				createdConfig = await showTemplateEditWindow(context);
			}
			finally {
				if (createdConfig) {
					const config = getTemplateConfiguration();
					const templates = getTemplatesFromConfig();
					templates.push(createdConfig);
					config.update('Templates', templates, vscode.ConfigurationTarget.Global);
					vscode.window.showInformationMessage(
						`"${createdConfig.templateName}"を作成しました`
					);
				}
			}
		}
	);

	let editTemplateDisposable = vscode.commands.registerCommand(
		'MyNewFileTemplate.template.global.edit',
		async (uri: vscode.Uri) => {

			const templates = getTemplatesFromConfig();
			const selectedItem = await openTemplatesQuickPickSelectOne(templates, '編集するテンプレートを選択してください');
			if (selectedItem) {
				const editedConfig = await showTemplateEditWindow(context, selectedItem.templateConfig);
				if (editedConfig) {
					vscode.window.showInformationMessage(
						`"${selectedItem.templateConfig.templateName}"を更新しました`
					);
					const updatedConfigs = templates.filter(template => template.templateName !== selectedItem.label)
					updatedConfigs.push(editedConfig);
					const config = getTemplateConfiguration();
					config.update('Templates', updatedConfigs, vscode.ConfigurationTarget.Global);

				}
			}
		}
	);
	let duplicateTemplateInGlobalDisposable = vscode.commands.registerCommand(
		'MyNewFileTemplate.template.global.duplicate',
		async (uri: vscode.Uri) => {
			const TemplatesConfig = getTemplatesFromConfig();

			const selectedItem = await openTemplatesQuickPickSelectOne(TemplatesConfig, '複製するテンプレートを選択');
			if (selectedItem) {
				vscode.window.showInformationMessage(
					`"${selectedItem.templateConfig.templateName}"を複製しました`
				);
				const editedConfig = await showTemplateEditWindow(context, selectedItem.templateConfig);
				if (editedConfig) {
					TemplatesConfig.push(editedConfig);
					const config = getTemplateConfiguration();
					config.update('Templates', TemplatesConfig, vscode.ConfigurationTarget.Global);
					vscode.window.showInformationMessage(
						`"${editedConfig.templateName}"を作成しました`
					);
				}
			}
		}
	);
	let deleteTemplateDisposable = vscode.commands.registerCommand(
		'MyNewFileTemplate.template.global.delete',
		async (uri: vscode.Uri) => {
			const templates = getTemplatesFromConfig();
			const selectedItems = await openTemplatesQuickPickSelectMany(templates, '削除するテンプレートを選択してください');
			if (selectedItems) {
				const config = getTemplateConfiguration();
				let updatedConfigs = templates;
				for (const selectedItem of selectedItems) {
					updatedConfigs = updatedConfigs.filter(template => template.templateName !== selectedItem.label);
					vscode.window.showInformationMessage(
						`"${selectedItem.label}"を削除しました`
					);
				}
				config.update('Templates', updatedConfigs, vscode.ConfigurationTarget.Global);
			}
		});
	// 拡張機能が非アクティブになる際に登録したコマンドを解放
	context.subscriptions.push(newFileDisposable,
		hideTemplateInWorkSpaceDisposable,
		settingWindowDisposable,
		createTemplateInGlobalDisposable,
		editTemplateDisposable,
		duplicateTemplateInGlobalDisposable,
		deleteTemplateDisposable);
}

function getTemplatesFromConfig(): TemplateConfig[] {
	return getTemplateConfiguration().get<TemplateConfig[]>('Templates', []);
}
function getTemplateConfiguration() {
	return vscode.workspace.getConfiguration('MyNewFileTemplate');
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

async function openTemplatesQuickPickSelectOne(templates: TemplateConfig[], placeHolder: string) {
	return await openTemplatesQuickPick(templates, placeHolder) as pickTemplate | undefined;
}
async function openTemplatesQuickPickSelectMany(templates: TemplateConfig[], placeHolder: string) {
	return await openTemplatesQuickPick(templates, placeHolder, true) as pickTemplate[] | undefined;
}
async function openTemplatesQuickPick(templates: TemplateConfig[], placeHolder: string, canPickMany: boolean = false)
	: Promise<pickTemplate | pickTemplate[] | undefined> {

	const pickItems = templates.map(template => ({
		label: template.templateName,
		description: template.filename,
		templateConfig: template
	}));
	const selectedItem = await vscode.window.showQuickPick(pickItems, {
		canPickMany: canPickMany,
		placeHolder: placeHolder
	});
	return selectedItem as pickTemplate | pickTemplate[] | undefined;
}
function openEditOptionQuickPick() {
	enum editChoice {
		create,
		edit,
		duplicate,
		delete
	}
	interface editOption extends vscode.QuickPickItem {
		label: string;
		description: string;
		choice: editChoice
	}
	const editOptionItems: editOption[] = [
		{
			label: '新規テンプレートの作成',
			description: 'MyNewFileTemplate.template.global.create',
			choice: editChoice.create,
		},
		{
			label: '既存テンプレートの編集',
			description: 'MyNewFileTemplate.template.global.edit',
			choice: editChoice.edit,
		},
		{
			label: '既存テンプレートから新規テンプレートを作成',
			description: 'MyNewFileTemplate.template.global.duplicate',
			choice: editChoice.duplicate,
		},
		{
			label: 'テンプレートの削除',
			description: 'MyNewFileTemplate.template.global.delete',
			choice: editChoice.delete,
		}
	]
	const editQuickPickChain = quickPickChain.chain<editOption>()
		.setItems(editOptionItems)
		.subscribeOnDidAccept(
			(selectedChoice: editOption) => {
				switch (selectedChoice.choice) {
					case editChoice.create:
						vscode.commands.executeCommand('MyNewFileTemplate.template.global.create');
						break;
					case editChoice.edit:
						vscode.commands.executeCommand('MyNewFileTemplate.template.global.edit');
						break;
					case editChoice.duplicate:
						vscode.commands.executeCommand('MyNewFileTemplate.template.global.duplicate');
						break;
					case editChoice.delete:
						vscode.commands.executeCommand('MyNewFileTemplate.template.global.delete');
						break;
				}
				editQuickPickChain.dispose();
			})
		.show();
}
// This method is called when your extension is deactivated
export function deactivate() { }
