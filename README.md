# file_switch_xiwo
把试卷题目截图转成希沃课件


## 题页 · 试卷转 PPT / 希沃课件

在浏览器中打开 PDF / Word 试卷，按题目分割，每道题导出为一页。支持 PowerPoint / WPS `.pptx`、希沃白板导入版 `.pptx` 和希沃原生 `.enbx`（试用）。试卷与 OCR 均在浏览器本地处理，无账号、无文档上传、无模型 API 密钥。

## 使用

1. 上传 PDF 或 Word `.docx`；也可以拖入文件，或点「试用示例」。
2. 选择单栏 / 双栏版式，检查自动题号拆分。扫描 PDF 可点击「扫描件 OCR」。
3. 拖动选框移动，拖右下角缩放；也可以用「框选题目」新增选框。支持合并、拆分、排序、改标题、勾选及撤销。
4. 在「导出格式」选择 PowerPoint、希沃导入版或希沃原生，再选 16:9 / 4:3、配色、题目标题和讲解留白，生成并下载课件。

标题可以在 PowerPoint / WPS 中编辑。**题干以图片保留，不能直接编辑图片中的文字。**

## 希沃白板导出

选择「希沃白板」后下载的是 `课件名称-希沃导入版.pptx`，每道题一页。为减少字体、公式及绘图对象在导入时变化，每页（含题目标题、讲解留白和页码）合成为一张 1600×900 或 1200×900 的完整图片；现有文字不能直接编辑，导入后可在希沃内添加批注、板书与其他元素。

在希沃白板中选择「导入课件」并选中下载的 PPTX；也可以把文件拖入画布。[希沃官方导入说明](https://easinote.seewo.com/baike)确认支持 PPTX 兼容导入。

当前环境没有希沃白板客户端，已验证实际导出的 PPTX 页数、图片与标准办公软件打开结果；请先用示例在你使用的希沃版本检查导入效果。

### 希沃原生 ENBX（试用）

选择「希沃原生」，会生成 `课件名称-希沃原生课件.enbx`。这是含有 `Board.xml`、`Slides/Slide_N.xml`、资源关系、PNG 图片、元数据及缩略图的实际 ENBX 包，每道已勾选的题目对应一页。课件的比例、配色、标题和讲解留白与希沃导入版一致，整页以图片保留，可在希沃中添加批注及其他元素，图片中的文字不能直接编辑。

文件结构与静态类型契约参考 MIT 授权的 [OpenEnow.JS 原生样例](https://github.com/EZ118/OpenEnow.JS/tree/main/sample)，授权和来源在 `third_party/OpenEnow.JS/`。资源使用真实内容 MD5；XML 编码和声明方式与样例一致。

已完成 XML / 页序 / 资源校验，并用独立 OpenEnow.JS 读取器加载 PDF、Word 来源的原生课件。**这不等于已通过真实希沃白板客户端验收**，因此界面标记为试用；请先用你的希沃白板版本打开一份样例确认兼容性。

## 启动

**免安装离线包：完整解压后，双击 `index.html`，用 Edge 或 Chrome 打开即可。** 不需要 Python、Node.js、命令行或本地服务器；断网可用。PDF 字体、中英文 OCR 引擎、语言包、示例及应用程序都内嵌在约 17 MB 的 HTML 中。浏览器默认打开方式不正确时，右键文件选择「打开方式 → Microsoft Edge」。

发行包仅含可直接运行的 `index.html`、使用说明及第三方授权文本。不要在压缩软件内部打开，先解压。macOS / Linux 同样可用 Chrome 打开离线 HTML。

GitHub 的「Download ZIP」是源码包，根目录 `index.html` 是开发入口，并非免安装版。开发者可按下方步骤构建，生成 `offline/index.html` 和免安装 ZIP：

以下为开发构建环境，需要 Node.js 22、npm 和 Python 3.8+；使用者电脑不需要这些环境：

```sh
npm ci
npm run assets
python3 scripts/download-languages.py
npm run build:offline
npm run package:offline
```

也可生成普通网页服务版本：

```sh
npm run build
python3 scripts/serve.py
```

浏览器打开 `http://localhost:5187`。同一网络访问可用 `python3 scripts/serve.py --bind 0.0.0.0`，然后使用服务器实际 IP。`dist/` 是普通静态站点，需 HTTP / HTTPS；可双击的版本是 `offline/index.html`。旧版 `启动题页.bat` / `.sh` 仅用于网页服务版本，免安装版不使用它们。

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
npm run test:offline
```

单元测试覆盖题号、跨页、双栏和裁切边界；浏览器测试覆盖真实 PDF / DOCX、图片与公式、自动编号、长文档、框选、撤销、合并拆分、选中导出、16:9 / 4:3、移动端布局以及实际下载的 PPTX 页数与嵌入图片。原始原创示例在 `public/examples/`，重建示例：`python3 scripts/generate-examples.py`（需要 ReportLab、Pillow）。

## 上游项目

采用 [PDF.js](https://github.com/mozilla/pdf.js)、[docx-preview](https://github.com/VolodymyrBaydalka/docxjs)、[MathJax](https://github.com/mathjax/MathJax-src)、[Tesseract.js](https://github.com/naptha/tesseract.js)、[html-to-image](https://github.com/bubkoo/html-to-image)、[PptxGenJS](https://github.com/gitbrent/PptxGenJS)、[Lucide](https://github.com/lucide-icons/lucide) 和 [OpenEnow.JS](https://github.com/EZ118/OpenEnow.JS)。语言包来自官方 [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast/tree/4.1.0)。依赖的授权文本随静态资源一并提供于 `/licenses/`。

源码维护在本仓库。运行时上传的试卷、生成的课件和本地测试输出不纳入版本控制。

## 工程维护与自动检查

使用 Node.js 22（见 `.nvmrc`）。仓库仅保存源码、固定版本依赖清单和原创测试样例；PDF 字体、OCR 引擎、语言包及第三方授权文本由准备脚本生成。

GitHub Actions 配置位于 `.github/workflows/ci.yml`，包含干净安装、资源准备、单元测试、生产构建、浏览器导出及本地 OCR 测试，并上传静态站点产物。源码提交与网页发布相互独立。

本地网页回归：启动 `python3 scripts/serve.py` 后运行 `npm run test:browser` 和 `npm run test:ocr`。免安装版构建后运行 `npm run test:offline`，测试真实 ZIP 解压后的 file:// 入口，覆盖 PDF、Word、三种导出及扫描 OCR；测试浏览器设为断网，检测 HTTP 请求。执行 `npm run package:offline` 生成免安装 ZIP。旧版完整工程服务包仍可用 `python3 scripts/package_delivery.py` 生成。
