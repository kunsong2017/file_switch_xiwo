# file_switch_xiwo

本仓库是「题页」网页工具的源码维护入口，支持 PDF / Word 试卷按题导出 PowerPoint 和希沃白板导入版。

- 功能入口：`src/main.js`；文档读取：`src/document.js`；分题：`src/segment.js`。
- PowerPoint 导出：`src/export.js`；希沃导入版：`src/seewo.js`；原生 ENBX：`src/enbx.js` / `src/enbx-package.js`。
- 希沃导入版为 `.pptx`；原生 `.enbx` 必须生成包含 XML、资源关系及图片的实际课件包，不得只改扩展名。两者均整页图片。不得声称已通过未执行的希沃客户端验证。
- 答案与解析：数据在 `src/solutions.js`（纯函数，Node 可直接测），点击动画在 `src/reveal.js`（生成后向 slide XML 注入 `<p:timing>`）。希沃两种格式只能分页显示；同页点击只用于 PowerPoint 导出。不得声称已在真实 PowerPoint / WPS 客户端验证动画放映效果。
- `tests/solutions/` 是两份用户真卷的人工参考解答，改动分题或题号时同步核对；`npm run test:exams` 会导入它们并检查每页两次点击动画。
- ENBX 改动先运行 `npm test` 和 `npm run test:browser`，再运行 `npm run test:enbx`，用独立读取器检查浏览器下载的原生文件。
- 安装并构建：`npm ci` → `npm run assets` → `python3 scripts/download-languages.py` → `npm run build`。
- 单元测试：`npm test`；启动静态服务后运行 `npm run test:browser` 和 `npm run test:ocr`。
- 浏览器测试默认使用 `/usr/bin/google-chrome`，可通过 `CHROME_PATH` 指定其他 Chromium。`EXAM_TEST_URL` 指定测试服务地址。
- `public/pdf/`、`public/ocr/`、`public/licenses/` 从固定版本依赖生成，不提交；`dist/`、`node_modules/`、`test-results/` 也不提交。
- 用户要求仅凭 GitHub 网址即可下载使用：`offline/` 的 HTML、说明、授权及 `build.json` 必须提交到仓库，根目录 HTML 在 file:// 下自动转到该入口。源码 / 依赖 / 构建脚本改变后重建 `npm run build:offline`，用 `npm run check:offline` 核对后连同产物提交；不能只更新源码。独立 ZIP 默认输出到工程内 `offline/`，ZIP 文件不提交。
- `public/examples/` 的 PDF / DOCX 示例及 `tests/fixtures/` 为原创；`tests/初三数学期中综合复习2.pdf`、`tests/初三数学复习卷 6.pdf` 为用户提供的实际试卷。改动分题、配图或裁剪后运行 `npm run test:exams`，检查题号 1～27 / OCR 后 1～26、配图归属、题干及标注保留、页码排除及三种实际导出；离线测试也必须覆盖这两份真卷。
- 用户要求免安装离线包：`npm run build:offline` → `npm run package:offline`，解压后双击 `index.html`，不需要 Python / Node / 本地服务。所有运行资源内嵌，PDF 和 OCR 使用 Blob Worker。改动后运行 `npm run test:offline`，用真实 ZIP 解压后的 file:// 入口、断网模式验证。原 `scripts/package_delivery.py` / 启动脚本仅保留作旧版服务包兼容，并用 `npm run test:package` 回归。
- 用户试卷只在浏览器本地处理，不新增试卷上传或外部 OCR 请求。
- 用户于 2026-11-05 明确授权：本 GitHub 项目允许直接推送 `main`。推送前更新并核对远端基线，保持正常快进，不强推。该授权仅适用于 `kunsong2017/file_switch_xiwo`。
