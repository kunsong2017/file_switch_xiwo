# file_switch_xiwo
把试卷题目截图转成希沃课件


## 题页 · 试卷转 PPT / 希沃课件

在浏览器中打开 PDF / Word 试卷，按题目分割，每道题导出为一页；可以为每道题填写或导入答案与解析，导出时默认隐藏，放映时点击出现。支持 PowerPoint / WPS `.pptx`、希沃白板导入版 `.pptx` 和希沃原生 `.enbx`（试用）。试卷与 OCR 均在浏览器本地处理，无账号、无文档上传、无模型 API 密钥。

## 从 GitHub 下载后直接使用

1. 点击 [下载 main 分支 ZIP](https://github.com/kunsong2017/file_switch_xiwo/archive/refs/heads/main.zip)，或在仓库首页选择绿色 **Code → Download ZIP**。
2. 完整解压，进入 `file_switch_xiwo-main` 文件夹。
3. 双击根目录 `index.html`，会自动打开 `offline/index.html`；也可以直接进入 `offline` 文件夹双击其中的 `index.html`。使用 Edge / Chrome，无需安装 Python、Node.js，也无需构建或启动服务，断网可用。

`src/` 是源码，**`offline/index.html` 是由同一工程构建并随仓库提交的可运行版本**。`offline/licenses/` 保存授权文本，`offline/build.json` 记录源码及产物的 SHA256。更新运行代码时需同时重建并提交 `offline/`，CI 会在构建前检查两者是否同步。

## 使用

1. 上传 PDF 或 Word `.docx`；也可以拖入文件，或点「试用示例」。
2. 选择单栏 / 双栏版式，检查自动题号拆分。扫描 PDF 可点击「扫描件 OCR」。
3. 拖动选框移动，拖右下角缩放；也可以用「框选题目」新增选框。支持合并、拆分、排序、改标题、勾选及撤销。
4. （可选）点「答案与解析」逐题填写，或批量粘贴、导入导出的 JSON。
5. 在「导出格式」选择 PowerPoint、希沃导入版或希沃原生，再选 16:9 / 4:3、配色、题目标题、讲解留白和答案显示方式，生成并下载课件。

单栏 PDF 会按题号匹配集中排列的配图，包括题干与「第 N 题」配图位于不同页的情况；扫描件需先做 OCR。题干、选项和配图组合在同一页，原卷的「第 N 页，共 N 页」等页码在导出时去除。仍请在导出前检查自动识别结果。

标题可以在 PowerPoint / WPS 中编辑。**题干以图片保留，不能直接编辑图片中的文字。**

## 答案与解析

每题都有「答案」「解析」两个文字字段，可在左侧「当前题目」里填写，也可以在「答案与解析」里批量粘贴或导入 JSON（格式见 `tests/solutions/README.md`）。文件只在本页内存中，刷新即清空，可随时导出 JSON 备份。

导出设置提供三种方式：

- **不导出**：只生成题目页。
- **同页点击出现**：解析、答案放在题目下方但先隐藏，放映时每点一次出现一项。实现在 pptxgenjs 生成后向幻灯片写入标准的「单击时出现」时间轴（`<p:timing>` / `clickEffect`），适用于 PowerPoint / WPS。
- **每题后一页**：题目一页、解析一页，翻页即出现。三种导出格式通用，也是希沃导入版和希沃原生课件的唯一方式（它们是整页图片）。

`tests/solutions/` 放了两份用户真卷的参考解答，用于演示和回归。

## 希沃白板导出

选择「希沃白板」后下载的是 `课件名称-希沃导入版.pptx`，每道题一页。为减少字体、公式及绘图对象在导入时变化，每页（含题目标题、讲解留白和页码）合成为一张 1600×900 或 1200×900 的完整图片；现有文字不能直接编辑，导入后可在希沃内添加批注、板书与其他元素。

在希沃白板中选择「导入课件」并选中下载的 PPTX；也可以把文件拖入画布。[希沃官方导入说明](https://easinote.seewo.com/baike)确认支持 PPTX 兼容导入。

当前环境没有希沃白板客户端，已验证实际导出的 PPTX 页数、图片与标准办公软件打开结果；请先用示例在你使用的希沃版本检查导入效果。

### 希沃原生 ENBX（试用）

选择「希沃原生」，会生成 `课件名称-希沃原生课件.enbx`。这是含有 `Board.xml`、`Slides/Slide_N.xml`、资源关系、PNG 图片、元数据及缩略图的实际 ENBX 包，每道已勾选的题目对应一页。课件的比例、配色、标题和讲解留白与希沃导入版一致，整页以图片保留，可在希沃中添加批注及其他元素，图片中的文字不能直接编辑。

文件结构与静态类型契约参考 MIT 授权的 [OpenEnow.JS 原生样例](https://github.com/EZ118/OpenEnow.JS/tree/main/sample)，授权和来源在 `third_party/OpenEnow.JS/`。资源使用真实内容 MD5；XML 编码和声明方式与样例一致。原生页使用 720 高的逻辑坐标，16:9 / 4:3 分别配合 3200×1800 / 2400×1800 图片；图片尺寸与裁剪字段遵循原生样例，题目完整等比放入页面。

已完成 XML / 页序 / 资源校验，并用独立 OpenEnow.JS 读取器加载 PDF、Word 来源的原生课件。**这不等于已通过真实希沃白板客户端验收**，因此界面标记为试用；请先用你的希沃白板版本打开一份样例确认兼容性。

## 启动

**免安装离线包：完整解压后，双击 `index.html`，用 Edge 或 Chrome 打开即可。** 不需要 Python、Node.js、命令行或本地服务器；断网可用。PDF 字体、中英文 OCR 引擎、语言包、示例及应用程序都内嵌在约 17 MB 的 HTML 中。浏览器默认打开方式不正确时，右键文件选择「打开方式 → Microsoft Edge」。

发行包仅含可直接运行的 `index.html`、使用说明及第三方授权文本。不要在压缩软件内部打开，先解压。macOS / Linux 同样可用 Chrome 打开离线 HTML。

GitHub 的「Download ZIP」已包含 `offline/`，可直接按上面的步骤使用。只有修改源码、需要重建离线版时，才需执行以下开发步骤：

以下为开发构建环境，需要 Node.js 22、npm 和 Python 3.8+；使用者电脑不需要这些环境：

```sh
npm ci
npm run assets
python3 scripts/download-languages.py
npm run build:offline
npm run package:offline
```

独立免安装包输出到工程内的 `offline/题页-试卷转PPT-免安装离线版.zip`。ZIP 是可选的重新打包产物，不纳入 Git；GitHub 下载 ZIP 中已经包含可运行 HTML。提交前运行 `npm run check:offline` 检查源码与产物是否同步。

也可生成普通网页服务版本：

```sh
npm run build
python3 scripts/serve.py
```

浏览器打开 `http://localhost:5187`。同一网络访问可用 `python3 scripts/serve.py --bind 0.0.0.0`，然后使用服务器实际 IP。`dist/` 是普通静态站点，部署时需 HTTP / HTTPS；仓库下载后直接打开 HTML 会转到 `offline/index.html`。旧版 `启动题页.bat` / `.sh` 仅用于网页服务版本，免安装版不使用它们。

开发调试：`npm run dev -- --port 5187`。首次准备依赖和 OCR 语言包需要联网，构建后核心转换不依赖外部 CDN。

## 支持范围

- PDF：文字版自动拆分，扫描版可用本地中英文 OCR 或手动框选。支持常见数字题号以及单栏 / 双栏模式。
- Word：支持 `.docx`，包括嵌入图片、OMML 公式与常见自动编号。旧版 `.doc` 须先另存为 `.docx` 或 PDF。
- DOCX 通过浏览器排版渲染，并非 Microsoft Word 排版引擎。复杂浮动布局、特殊字体、分栏和公式需人工检查；精确保留原版时，推荐先在 Word 中导出 PDF。
- 同一题可以合并多个选框，包含跨页片段；一题一页时长题会整体缩小，可以拆成多题以便阅读。
- 一次导入一个文件，最多 60 MB / 60 页，并设有渲染内存限制。当前工作不持久保存，刷新会清空；更换文件仅在新文件成功读取后生效。
- 自动识别和 OCR 是辅助功能，不保证所有试卷格式都准确。生成前请确认选框包含完整题干、选项、配图及公式，避免漏题或带入下一题。

## 必须安装本地 Python 吗？

转换、OCR 和三种课件导出都在浏览器内运行，不调用 Python。访问已部署的网站不需要在使用者电脑安装 Python；`dist/` 可以放在普通静态 Web 服务器中。

新的免安装离线包可直接双击 HTML，所有运行资源在文件中，不需要任何本地服务。Python 仅在开发者下载语言包、生成测试夹具或运行旧版服务脚本时使用。

## 验证

```sh
npm test
npm run dev -- --port 5187
# 另一个终端；默认使用 /usr/bin/google-chrome，也可设置 CHROME_PATH
npm run test:browser
npm run test:enbx
npm run test:exams
npm run test:offline
```

单元测试覆盖题号、跨页、双栏和裁切边界；浏览器测试覆盖真实 PDF / DOCX、图片与公式、自动编号、长文档、框选、撤销、合并拆分、选中导出、16:9 / 4:3、移动端布局以及实际下载的 PPTX 页数与嵌入图片。原始原创示例在 `public/examples/`，重建示例：`python3 scripts/generate-examples.py`（需要 ReportLab、Pillow）。

`npm run test:exams` 使用用户提供的 `tests/初三数学期中综合复习2.pdf`（27 题）和 `tests/初三数学复习卷 6.pdf`（扫描件，OCR 后 26 题）。检查连续题号、人工标注的配图归属、关键题干 / 公式 / 字母标注保留及原卷页码排除，并实际导出三种格式；同时导入 `tests/solutions/` 的答案，验证同页点击出现的页数与每页两段点击动画，以及希沃两种格式的每题后一页页数。测试截图与课件保存在忽略的 `test-results/real-exams/`，不替代希沃客户端验收。`test:offline` 也覆盖这两份试卷的断网导入、OCR 与原生导出。

## 上游项目

采用 [PDF.js](https://github.com/mozilla/pdf.js)、[docx-preview](https://github.com/VolodymyrBaydalka/docxjs)、[MathJax](https://github.com/mathjax/MathJax-src)、[Tesseract.js](https://github.com/naptha/tesseract.js)、[html-to-image](https://github.com/bubkoo/html-to-image)、[PptxGenJS](https://github.com/gitbrent/PptxGenJS)、[Lucide](https://github.com/lucide-icons/lucide) 和 [OpenEnow.JS](https://github.com/EZ118/OpenEnow.JS)。语言包来自官方 [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast/tree/4.1.0)。依赖的授权文本随静态资源一并提供于 `/licenses/`。

源码维护在本仓库。运行时上传的试卷、生成的课件和本地测试输出不纳入版本控制。

## 工程维护与自动检查

使用 Node.js 22（见 `.nvmrc`）。仓库保存源码、固定版本依赖清单、测试样例和可运行的 `offline/`；PDF 字体、OCR 引擎、语言包及第三方授权文本由准备脚本生成。

GitHub Actions 配置位于 `.github/workflows/ci.yml`，包含干净安装、资源准备、单元测试、生产构建、浏览器导出及本地 OCR 测试，并上传静态站点产物。源码提交与网页发布相互独立。

本地网页回归：启动 `python3 scripts/serve.py` 后运行 `npm run test:browser` 和 `npm run test:ocr`。运行 `npm run check:offline` 检查随仓库交付的离线版本；`npm run test:offline` 测试真实 ZIP 解压后的 file:// 入口，覆盖 PDF、Word、三种导出及扫描 OCR，测试浏览器设为断网并检测 HTTP 请求。执行 `npm run package:offline` 生成工程内的独立免安装 ZIP。旧版完整工程服务包仍可用 `python3 scripts/package_delivery.py` 生成。
