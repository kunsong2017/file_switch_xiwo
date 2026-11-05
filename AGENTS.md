# file_switch_xiwo

本仓库是「题页」网页工具的源码维护入口，支持 PDF / Word 试卷按题导出 PowerPoint 和希沃白板导入版。

- 功能入口：`src/main.js`；文档读取：`src/document.js`；分题：`src/segment.js`。
- PowerPoint 导出：`src/export.js`；希沃导入版：`src/seewo.js`。
- 希沃导入版实际格式为 `.pptx`，整页是图片；不得把扩展名改成 `.enbx` 或声称已通过未执行的希沃客户端验证。
- 安装并构建：`npm ci` → `npm run assets` → `python3 scripts/download-languages.py` → `npm run build`。
- 单元测试：`npm test`；启动静态服务后运行 `npm run test:browser` 和 `npm run test:ocr`。
- 浏览器测试默认使用 `/usr/bin/google-chrome`，可通过 `CHROME_PATH` 指定其他 Chromium。`EXAM_TEST_URL` 指定测试服务地址。
- `public/pdf/`、`public/ocr/`、`public/licenses/` 从固定版本依赖生成，不提交；`dist/`、`node_modules/`、`test-results/` 也不提交。
- PDF / DOCX 样例与测试夹具为原创，应保留以支持回归测试。
- 用户试卷只在浏览器本地处理，不新增试卷上传或外部 OCR 请求。
- 用户于 2026-11-05 明确授权：本 GitHub 项目允许直接推送 `main`。推送前更新并核对远端基线，保持正常快进，不强推。该授权仅适用于 `kunsong2017/file_switch_xiwo`。
