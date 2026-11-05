# file_switch_xiwo
把试卷题目截图转成希沃课件


## 题页 · 试卷转 PPT / 希沃课件

在浏览器中打开 PDF / Word 试卷，按题目分割，每道题导出为一页 `.pptx`。支持 PowerPoint / WPS 和希沃白板导入版。试卷与 OCR 均在浏览器本地处理，无账号、无文档上传、无模型 API 密钥。

## 使用

1. 上传 PDF 或 Word `.docx`；也可以拖入文件，或点「试用示例」。
2. 选择单栏 / 双栏版式，检查自动题号拆分。扫描 PDF 可点击「扫描件 OCR」。
3. 拖动选框移动，拖右下角缩放；也可以用「框选题目」新增选框。支持合并、拆分、排序、改标题、勾选及撤销。
4. 在「导出格式」选择 PowerPoint 或希沃白板，再选 16:9 / 4:3、配色、题目标题和讲解留白，生成并下载课件。

标题可以在 PowerPoint / WPS 中编辑。**题干以图片保留，不能直接编辑图片中的文字。**

## 希沃白板导出

选择「希沃白板」后下载的是 `课件名称-希沃导入版.pptx`，每道题一页。为减少字体、公式及绘图对象在导入时变化，每页（含题目标题、讲解留白和页码）合成为一张 1600×900 或 1200×900 的完整图片；现有文字不能直接编辑，导入后可在希沃内添加批注、板书与其他元素。

在希沃白板中选择「导入课件」并选中下载的 PPTX；也可以把文件拖入画布。[希沃官方导入说明](https://easinote.seewo.com/baike)确认支持 PPTX 兼容导入。本功能提供标准 PPTX，不生成 `.enbx`；如需保存为希沃原生课件，可导入后在希沃中另存。

当前环境没有希沃白板客户端，已验证实际导出的 PPTX 页数、图片与标准办公软件打开结果；请先用示例在你使用的希沃版本检查导入效果。

## 启动

需要 Node.js 20+、npm，以及 Python 3（静态网页服务）。

交付包已带 `dist/`，直接运行 `python3 scripts/serve.py` 即可，不需要安装 Node.js。下面的完整步骤仅用于从源码重建。

```sh
npm ci
npm run assets
python3 scripts/download-languages.py
npm run build
python3 scripts/serve.py
```

浏览器打开 `http://localhost:5187`。同一网络访问可用 `python3 scripts/serve.py --bind 0.0.0.0`，然后使用服务器实际 IP。`dist/` 是完整静态站点，也可以部署在 HTTPS 静态托管服务；部署根目录须为 `dist/`。不要直接双击 HTML，PDF / OCR Worker 需要 HTTP 服务。

开发调试：`npm run dev -- --port 5187`。首次准备依赖和 OCR 语言包需要联网，构建后核心转换不依赖外部 CDN。

## 支持范围

- PDF：文字版自动拆分，扫描版可用本地中英文 OCR 或手动框选。支持常见数字题号以及单栏 / 双栏模式。
- Word：支持 `.docx`，包括嵌入图片、OMML 公式与常见自动编号。旧版 `.doc` 须先另存为 `.docx` 或 PDF。
- DOCX 通过浏览器排版渲染，并非 Microsoft Word 排版引擎。复杂浮动布局、特殊字体、分栏和公式需人工检查；精确保留原版时，推荐先在 Word 中导出 PDF。
- 同一题可以合并多个选框，包含跨页片段；一题一页时长题会整体缩小，可以拆成多题以便阅读。
- 一次导入一个文件，最多 60 MB / 60 页，并设有渲染内存限制。当前工作不持久保存，刷新会清空；更换文件仅在新文件成功读取后生效。
- 自动识别和 OCR 是辅助功能，不保证所有试卷格式都准确。生成前请确认选框包含完整题干、选项、配图及公式，避免漏题或带入下一题。

## 验证

```sh
npm test
npm run dev -- --port 5187
# 另一个终端；默认使用 /usr/bin/google-chrome，也可设置 CHROME_PATH
npm run test:browser
```

单元测试覆盖题号、跨页、双栏和裁切边界；浏览器测试覆盖真实 PDF / DOCX、图片与公式、自动编号、长文档、框选、撤销、合并拆分、选中导出、16:9 / 4:3、移动端布局以及实际下载的 PPTX 页数与嵌入图片。原始原创示例在 `public/examples/`，重建示例：`python3 scripts/generate-examples.py`（需要 ReportLab、Pillow）。

## 上游项目

采用 [PDF.js](https://github.com/mozilla/pdf.js)、[docx-preview](https://github.com/VolodymyrBaydalka/docxjs)、[MathJax](https://github.com/mathjax/MathJax-src)、[Tesseract.js](https://github.com/naptha/tesseract.js)、[html-to-image](https://github.com/bubkoo/html-to-image)、[PptxGenJS](https://github.com/gitbrent/PptxGenJS) 和 [Lucide](https://github.com/lucide-icons/lucide)。语言包来自官方 [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast/tree/4.1.0)。依赖的授权文本随静态资源一并提供于 `/licenses/`。

源码维护在本仓库。运行时上传的试卷、生成的课件和本地测试输出不纳入版本控制。

## 工程维护与自动检查

使用 Node.js 22（见 `.nvmrc`）。仓库仅保存源码、固定版本依赖清单和原创测试样例；PDF 字体、OCR 引擎、语言包及第三方授权文本由准备脚本生成。

GitHub Actions 配置位于 `.github/workflows/ci.yml`，包含干净安装、资源准备、单元测试、生产构建、浏览器导出及本地 OCR 测试，并上传静态站点产物。源码提交与网页发布相互独立。

本地完整回归：启动 `python3 scripts/serve.py` 后运行 `npm run test:browser` 和 `npm run test:ocr`。需要交付完整离线静态包时，构建后运行 `python3 scripts/package_delivery.py`。
