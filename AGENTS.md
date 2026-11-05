# file_switch_xiwo

本仓库是「题页」网页工具的源码维护入口，支持 PDF / Word 试卷按题导出 PowerPoint 和希沃白板导入版。

- 功能入口：`src/main.js`；文档读取：`src/document.js`；分题：`src/segment.js`。
- PowerPoint 导出：`src/export.js`；希沃导入版：`src/seewo.js`；原生 ENBX：`src/enbx.js` / `src/enbx-package.js`。
- 希沃导入版为 `.pptx`；原生 `.enbx` 必须生成包含 XML、资源关系及图片的实际课件包，不得只改扩展名。两者均整页图片。不得声称已通过未执行的希沃客户端验证。
- ENBX 改动先运行 `npm test` 和 `npm run test:browser`，再运行 `npm run test:enbx`，用独立读取器检查浏览器下载的原生文件。
- 安装并构建：`npm ci` → `npm run assets` → `python3 scripts/download-languages.py` → `npm run build`。
- 单元测试：`npm test`；启动静态服务后运行 `npm run test:browser` 和 `npm run test:ocr`。
- 浏览器测试默认使用 `/usr/bin/google-chrome`，可通过 `CHROME_PATH` 指定其他 Chromium。`EXAM_TEST_URL` 指定测试服务地址。
- `public/pdf/`、`public/ocr/`、`public/licenses/` 从固定版本依赖生成，不提交；`dist/`、`node_modules/`、`test-results/` 也不提交。
- PDF / DOCX 样例与测试夹具为原创，应保留以支持回归测试。
- 用户要求免安装离线包：`npm run build:offline` → `npm run package:offline`，解压后双击 `index.html`，不需要 Python / Node / 本地服务。所有运行资源内嵌，PDF 和 OCR 使用 Blob Worker。改动后运行 `npm run test:offline`，用真实 ZIP 解压后的 file:// 入口、断网模式验证。原 `scripts/package_delivery.py` / 启动脚本仅保留作旧版服务包兼容，并用 `npm run test:package` 回归。
- 用户试卷只在浏览器本地处理，不新增试卷上传或外部 OCR 请求。
- 用户于 2026-11-05 明确授权：本 GitHub 项目允许直接推送 `main`。推送前更新并核对远端基线，保持正常快进，不强推。该授权仅适用于 `kunsong2017/file_switch_xiwo`。
