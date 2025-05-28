# My newFile Template

[![Stars](https://img.shields.io/github/stars/bug7510/My-newFile-Template)](https://github.com/bug7510/My-newFile-Template)
[![GitHub Sponsors](https://img.shields.io/github/sponsors/bug7510)](https://github.com/sponsors/bug7510)

[![LICENSE](https://img.shields.io/badge/License-Copyright-blue)](https://github.com/bug7510/My-newFile-Template/blob/develop/docs/LICENSE.md)
[![version](https://img.shields.io/github/package-json/v/bug7510/My-newFile-Template)](https://github.com/bug7510/My-newFile-Template)
![Release](https://img.shields.io/github/v/release/bug7510/My-newFile-Template)

## ファイル作成を可能な限り簡単に

**My newFile Template** は、VS Codeにおけるすべての新規ファイル作成体験を向上させるための拡張機能です。自由にカスタマイズ可能なテンプレートを利用して、定型的なファイル作成の手間を大幅に削減し、スムーズな開発が可能になります。

<img alt="firstImpression"  src="https://github.com/bug7510/newfiletemplate/blob/6178f27759c6c290b61221d86d64f4c4fb739ef2/docs/ReadmeResource/ja/firstImpression.gif?raw=true" width="600">

## 特徴

* **テンプレートベースのファイル作成:** ご自身でカスタマイズしたテンプレートから素早く新しいファイルを作成できます。
* **高いカスタマイズ性:** プロジェクトの種類や個人の好みに合わせて、テンプレートの内容を自由に変更・追加できます。
* **簡単な操作:** 直感的なGUIによる操作で、誰でも簡単に利用を開始できます。
* **作業効率の向上:** ボイラープレートコードの記述時間を短縮し、本来のコーディング作業に集中できます。

## 機能

### テンプレートによる新規ファイル作成(File from Template)

<img alt="how to make file with template"  src="https://github.com/bug7510/newfiletemplate/blob/6178f27759c6c290b61221d86d64f4c4fb739ef2/docs/ReadmeResource/ja/firstImpression.gif?raw=true" width="600">

1. ファイルを作りたいフォルダーを右クリックします。
2. 右クリックメニューで"テンプレートから作成"を選択します。
3. テンプレートを選択します。
4. ファイル名を入力すればファイル作成完了です。

### テンプレートの作成(Template from File)

<img alt="how to make template from file"  src="https://github.com/bug7510/newfiletemplate/blob/fd3fd4fbb3be407b9a7cd8281c7b4543dad97209/docs/ReadmeResource/ja/TemplateFromFile.gif?raw=true" width="600">

1. テンプレートの元となるファイルを右クリックします。
2. 右クリックメニューで"ファイルからテンプレートを作成"を選択します。
3. テンプレート設定のウィンドウが表示されるので、適宜編集します。
4. Saveボタンを押せば、テンプレートが作成でき、新しいファイルをテンプレートから作ることができます。

#### 完全な新規テンプレートを作る(.create)

既存ファイルを参考にせず、全く新しいテンプレートを作成することも可能です。

<img alt="how to make new template"  src="https://github.com/bug7510/newfiletemplate/blob/fd3fd4fbb3be407b9a7cd8281c7b4543dad97209/docs/ReadmeResource/ja/createTemplate.gif?raw=true" width="600">

1. 拡張機能の設定を開き、"テンプレートの編集"リンクをクリックします。
2. "新規テンプレートの作成"を選択することで、編集ウィンドウを開くことができます。

### ファイル名やフォルダ名を新規ファイルに反映する(filePath)

テンプレート編集時に ***{filePath[(何らかの数値)]}*** というキーワードを記述することで、作成するファイルの名前やフォルダの名前を、新規ファイルの内容に反映させることができます。

予測変換が出るので入力に時間はかかりません。

<img alt="how to make template reflecting file name or file path"  src="https://github.com/bug7510/newfiletemplate/blob/fd3fd4fbb3be407b9a7cd8281c7b4543dad97209/docs/ReadmeResource/ja/filePathTemplate.gif?raw=true" height="250">

{filePath[0]}はファイル作成時に入力されたファイルの名前(拡張子なし)に、

{filePath[1]}はファイルが作成されるフォルダの名前に置換されます。

<img alt="newFile with filePath"  src="https://github.com/bug7510/newfiletemplate/blob/fd3fd4fbb3be407b9a7cd8281c7b4543dad97209/docs/ReadmeResource/ja/filePathNewFile.gif?raw=true" width="600">

{filePath[2]}、{filePath[3]}と数値を増やすことで、さらに上の階層のフォルダ名を参照することも可能です。(用途があるかはわかりませんが……)

### 発展的な機能

* **既存テンプレートの編集・複製・削除**
  
  拡張機能の設定の"テンプレートの編集"リンクをクリックすると、これらの作業が簡単に実行可能です。

* **現在のワークスペースで使わないテンプレートを隠す**
  
  拡張機能の設定の"ワークスペースのテンプレート表示設定"をクリックし、表示したいテンプレートにチェックをつけ、表示したくないテンプレートのチェックを外すことで、ファイルを作成する際にリスト表示されるテンプレートを制限することができます。

  ファイル作成時、現在の作業でほとんど使わないテンプレートがリスト表示されることが防げます。

## 追加予定の機能

下記の機能の追加を予定しています。

* 英語版の作成

* **カテゴリ機能**
  
  テンプレートにカテゴリを設定することで、大量のテンプレートの整理が容易になります。
  ファイル作成時などのリスト表示にもカテゴリが適用され、リストの見た目にまとまりができます。

  カテゴリごとに表示/非表示の切り替え、テンプレートの一括削除などができます。

* **表示/非表示機能の充実**

  テンプレートのデフォルト非表示設定や、現在のワークスペースのみで表示されるテンプレートを作成する機能が実装される予定です。ワークスペース単位でのテンプレートの作成、利用がより充実します。

Display Language--Ja
