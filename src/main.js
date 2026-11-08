import './style.css';
import {createIcons, FileText, Upload, Download, ArrowRight, ArrowUpRight, Plus, X, Check, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Scissors, Layers, ScanLine, MousePointer2, Undo2, Trash2, ZoomIn, ZoomOut, CircleHelp, ShieldCheck, Monitor, Settings2, BookOpen, Presentation, Sparkles, RotateCcw, Columns2, Crop, CircleCheck} from 'lucide';
import {readDocument, recognizePages} from './document.js';
import {segmentPages, normalizeCrop, splitQuestion, clamp} from './segment.js';
import {composeQuestion, exportPPTX, themes} from './export.js';
import {parseSolutionsText, parseSolutionsJSON, applySolutions, buildSolutionExport, solutionStats, hasSolution} from './solutions.js';
import {answerProviders, providerById, solveQuestion} from './answer.js';
import {resourceURL} from './offline.js';

const app = document.getElementById('app');
const iconSet = {FileText, Upload, Download, ArrowRight, ArrowUpRight, Plus, X, Check, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Scissors, Layers, ScanLine, MousePointer2, Undo2, Trash2, ZoomIn, ZoomOut, CircleHelp, ShieldCheck, Monitor, Settings2, BookOpen, Presentation, Sparkles, RotateCcw, Columns2, Crop, CircleCheck};
const icon = name => `<i data-lucide="${name}"></i>`;
const esc = str => String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state = {file: null, pages: [], questions: [], page: 0, selected: null, columns: 1, mode: 'select', zoom: 100, busy: false, progress: 0, message: '', modal: null, history: [], notice: '', options: {title: '', format: 'pptx', theme: 'clean', ratio: '16:9', headings: true, blankSpace: false, solutions: 'none'}, auto: {preset: 'zhipu', base: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4v-flash', key: '', proxy: 'http://127.0.0.1:5199/api/answer'}};
let toastTimer;
let drag = null;
const cache = new Map();
const selectedQuestion = () => state.questions.find(q => q.id === state.selected);
const chosen = () => state.questions.filter(q => q.included);
const uid = () => globalThis.crypto?.randomUUID?.() || `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 4500);
}
function snapshot() {
  state.history.push(JSON.stringify(state.questions));
  if (state.history.length > 25) state.history.shift();
}
function progress(message, fraction) {
  state.message = message;
  state.progress = fraction;
  const label = document.querySelector('#progress-label');
  const bar = document.querySelector('#progress-bar');
  if (label) label.textContent = message;
  if (bar) bar.style.width = `${Math.round(fraction * 100)}%`;
}
function imageFor(q, width = 700) {
  const key = JSON.stringify(q.segments) + width;
  if (!cache.has(key)) {
    if (cache.size > 100) cache.clear();
    cache.set(key, composeQuestion(q, state.pages, width).toDataURL('image/jpeg', 0.9));
  }
  return cache.get(key);
}

function sidebar() {
  return `<aside class="sidebar">
    <a class="brand" href="/" aria-label="题页首页"><span class="brand-mark">${icon('presentation')}</span><span>题页<small>PAPER TO SLIDES</small></span></a>
    <div class="nav-label">我的备课空间</div>
    <button class="nav-item active" data-action="home">${icon('layers')}<span>试卷转 PPT</span><span class="nav-dot"></span></button>
    <div class="sidebar-context"><div class="context-rule"></div><span>少一点重复操作<br>多一点课堂灵感</span><div class="tiny-slide"><span>Q<span>01</span></span><i></i><i></i><i class="short"></i><b>↗</b></div></div>
    <div class="sidebar-bottom"><div class="local-note">${icon('shield-check')}<div>文件只在本机处理<small>无需登录 · 不上传试卷</small></div></div><button class="help-link" data-action="help" aria-label="使用说明">${icon('circle-help')}<span class="help-label">使用说明</span><span>↗</span></button><span class="version">题页 / 为每一堂课准备</span></div>
  </aside>`;
}
function header() {
  return `<header class="topbar"><div class="breadcrumb">我的工具<span>/</span><strong>试卷转 PPT</strong></div><div class="topbar-right"><span class="status-pill"><i></i>浏览器本地处理</span><button class="icon-button" data-action="help" aria-label="使用说明">${icon('circle-help')}</button></div></header>`;
}
function steps() {
  return `<div class="steps"><span class="${state.file ? 'done' : 'current'}"><b>${state.file ? icon('check') : '1'}</b>导入试卷</span><i></i><span class="${state.file ? 'current' : ''}"><b>2</b>校对题目</span><i></i><span><b>3</b>导出课件</span></div>`;
}
function emptyState() {
  return `<section class="welcome"><div class="eyebrow"><span></span>把备课时间，留给更重要的事</div><h1>一份试卷，<span>一题一页。</span></h1><p class="hero-description">导入 PDF 或 Word，拆分题目，生成课堂上的下一页。<br>图片、公式和选项，跟着题目一起走。</p>${steps()}
    <div class="welcome-grid"><div class="upload-card" id="drop-zone"><div class="upload-illustration"><div class="illus-back"></div><div class="illus-paper"><span class="file-label">EXAM</span><i></i><i></i><i></i><b>+</b></div><span class="floating-type">${icon('file-text')} PDF / DOCX</span></div><h2>把试卷拖到这里</h2><p>或者从电脑中选择文件开始</p><button class="button primary upload-main" data-action="upload">${icon('upload')}选择试卷文件${icon('arrow-right')}</button><div class="upload-details"><span>PDF</span><span>Word .docx</span><i></i>最大 60 MB · 最多 60 页</div><div class="upload-bottom">${icon('shield-check')}文件不会上传到服务器</div></div>
    <div class="intro-preview"><div class="intro-preview-label"><span>YOUR NEXT LESSON</span><b>课件原来可以这么简单</b></div><div class="preview-stack"><div class="stack-back"></div><div class="stack-mid"></div><div class="sample-slide"><div class="sample-slide-top"><span>数学 · 课堂练习</span><b>01 / 06</b></div><h3>第 1 题</h3><p>已知函数 f(x) = x² − 2x + 3，<br>则 f(x) 的最小值是（　）。</p><div class="sample-options"><span>A. 1</span><span>B. 2</span><span>C. 3</span><span>D. 4</span></div><div class="sample-graph"><svg viewBox="0 0 120 80" aria-label="抛物线示意"><path d="M10 64H112M38 76V6" fill="none" stroke="#bdc5b9"/><path d="M20 18Q62 108 104 18" fill="none" stroke="#7b955d" stroke-width="2"/><circle cx="62" cy="63" r="3" fill="#7b955d"/></svg></div><div class="sample-slide-footer"><span>一起思考，一起发现。</span><i></i></div></div></div><div class="example-action"><div><b>还没有准备好试卷？</b><span>用示例试卷，体验完整转换流程</span></div><button class="button secondary" data-action="demo">试用示例${icon('arrow-up-right')}</button></div></div></div>
    <div class="feature-row"><div><span class="feature-icon">${icon('scan-line')}</span><section><b>按题号自动拆分</b><p>支持单栏、双栏和扫描件 OCR</p></section><small>01</small></div><div><span class="feature-icon">${icon('crop')}</span><section><b>边预览，边调整</b><p>框选、合并、排序，题目由你把关</p></section><small>02</small></div><div><span class="feature-icon">${icon('presentation')}</span><section><b>导出 PPTX / 希沃课件</b><p>一题一页，支持 PowerPoint / WPS / 希沃</p></section><small>03</small></div></div>
    <footer class="page-footer"><span>少一点复制粘贴，多一点从容备课。</span><span>PDF / WORD <span class="footer-arrow">→</span> POWERPOINT / SEEWO</span></footer></section>`;
}
function pagePicker() {
  return `<div class="page-picker"><div class="panel-heading"><b>原始试卷</b><span>${state.pages.length} 页</span></div><div class="page-thumbs">${state.pages.map((page, i) => `<button class="page-thumb ${i === state.page ? 'selected' : ''}" data-action="page" data-index="${i}" aria-label="查看第 ${i + 1} 页"><div><img src="${page.url}" alt="试卷第 ${i + 1} 页" loading="lazy"/><span>${i + 1}</span></div><small>第 ${i + 1} 页</small></button>`).join('')}</div></div>`;
}
function paperView() {
  const page = state.pages[state.page];
  const overlays = state.questions.flatMap((q, qi) => q.segments.map((segment, si) => ({q, qi, segment, si}))).filter(x => x.segment.page === state.page);
  return `<section class="paper-area"><div class="paper-toolbar"><div class="segmented"><button class="${state.mode === 'select' ? 'active' : ''}" data-action="mode" data-value="select">${icon('mouse-pointer-2')}选择</button><button class="${state.mode === 'crop' ? 'active' : ''}" data-action="mode" data-value="crop">${icon('crop')}框选题目</button></div><div class="paper-tools"><button class="icon-button" data-action="undo" aria-label="撤销" title="撤销 Ctrl+Z" ${!state.history.length ? 'disabled' : ''}>${icon('undo-2')}</button><span class="tool-divider"></span><button class="icon-button" data-action="zoom-out" aria-label="缩小">${icon('zoom-out')}</button><span>${state.zoom}%</span><button class="icon-button" data-action="zoom-in" aria-label="放大">${icon('zoom-in')}</button></div></div><div class="paper-scroll"><div class="paper-holder" style="width:${state.zoom}%"><div id="paper" class="paper ${state.mode === 'crop' ? 'crop-mode' : ''}" style="aspect-ratio:${page.width}/${page.height}"><img class="paper-image" src="${page.url}" alt="试卷第 ${state.page + 1} 页，框选可添加题目" draggable="false"/>${overlays.map(({q, qi, segment: s, si}) => `<div class="crop-overlay ${q.id === state.selected ? 'is-selected' : ''} ${!q.included ? 'excluded' : ''}" data-qid="${esc(q.id)}" data-segment="${si}" style="left:${s.x * 100}%;top:${s.y * 100}%;width:${s.w * 100}%;height:${s.h * 100}%" tabindex="0" role="button" aria-label="选择${esc(q.title)}"><span class="crop-label">${qi + 1} · ${esc(q.title)}</span>${q.id === state.selected ? '<span class="resize-handle" data-resize="true"></span>' : ''}</div>`).join('')}<div id="drawing-box"></div></div></div></div><div class="paper-footer"><span>${state.mode === 'crop' ? '在原卷上拖出矩形，将框内内容添加为一道题' : '点选题目可预览 · 拖动选框可移动 · 拖右下角可缩放'}</span><div><button class="icon-button" data-action="prev-page" ${!state.page ? 'disabled' : ''} aria-label="上一页">${icon('chevron-left')}</button><span>${state.page + 1} / ${state.pages.length}</span><button class="icon-button" data-action="next-page" ${state.page >= state.pages.length - 1 ? 'disabled' : ''} aria-label="下一页">${icon('chevron-right')}</button></div></div></section>`;
}
function questionPanel() {
  const q = selectedQuestion();
  const theme = themes[state.options.theme];
  return `<aside class="question-panel"><div class="panel-heading"><b>题目清单 <span class="count-badge">${state.questions.length}</span></b><button class="text-button" data-action="all">${chosen().length === state.questions.length && state.questions.length ? '取消全选' : '全部选中'}</button></div><div class="question-list">${state.questions.length ? state.questions.map((item, i) => `<div class="question-card ${item.id === state.selected ? 'selected' : ''}" data-action="select" data-id="${esc(item.id)}"><label class="checkbox" title="是否导出这道题"><input type="checkbox" data-field="include" data-id="${esc(item.id)}" ${item.included ? 'checked' : ''} aria-label="导出${esc(item.title)}"/><span></span></label><div class="question-card-text"><b>${esc(item.title)}${hasSolution(item) ? '<span class="solution-badge" title="已填写答案与解析">答</span>' : ''}</b><p>${esc(item.text || '手动框选的题目')}</p><small>第 ${[...new Set(item.segments.map(s => s.page + 1))].join('、')} 页${item.segments.length > 1 ? ' · 多片段' : ''}</small></div><span class="question-index">${String(i + 1).padStart(2, '0')}</span></div>`).join('') : `<div class="no-questions">${icon('scan-line')}<b>还没有拆出题目</b><p>可以启用 OCR 识别扫描件，<br>或点击「框选题目」手动添加。</p><button class="button secondary" data-action="mode" data-value="crop">${icon('plus')}框选第一题</button></div>`}</div>${q ? `<div class="selection-editor"><div class="selection-title"><span>当前题目</span><div><button class="icon-button" data-action="up" aria-label="上移题目" title="上移">${icon('chevron-up')}</button><button class="icon-button" data-action="down" aria-label="下移题目" title="下移">${icon('chevron-down')}</button><button class="icon-button danger" data-action="delete" aria-label="删除题目" title="删除">${icon('trash-2')}</button></div></div><input class="title-input" aria-label="题目标题" data-field="question-title" value="${esc(q.title)}" maxlength="80"/><div class="mini-preview ${state.options.ratio === '4:3' ? 'ratio-standard' : ''}" style="background:#${theme.background};color:#${theme.ink}">${state.options.headings ? `<b>${esc(q.title)}</b>` : ''}<img src="${imageFor(q)}" alt="当前题目的课件预览" style="max-height:${state.options.blankSpace ? '48%' : '73%'}"/>${state.options.blankSpace ? '<span class="preview-blank">思考与板书 ─────────</span>' : ''}<small>课件预览</small></div><div class="edit-actions"><button data-action="merge" ${state.questions.indexOf(q) === state.questions.length - 1 ? 'disabled' : ''}>${icon('layers')}合并下一题</button><button data-action="split">${icon('scissors')}从中间拆分</button></div><details class="crop-details"><summary>精确调整选框 <span>百分比</span></summary>${q.segments.map((s, i) => `<div class="segment-editor"><small>片段 ${i + 1} · 原卷第 ${s.page + 1} 页</small><div>${[['x','左'],['y','上'],['w','宽'],['h','高']].map(([key, label]) => `<label>${label}<input type="number" min="0" max="100" step="0.1" value="${(s[key] * 100).toFixed(1)}" data-field="crop" data-key="${key}" data-index="${i}" aria-label="片段${i + 1}${label}"/></label>`).join('')}</div></div>`).join('')}</details><details class="solution-editor" ${hasSolution(q) ? '' : 'open'}><summary>答案与解析 <span>${hasSolution(q) ? '已填写' : '未填写'}</span></summary><label>答案<textarea data-field="question-answer" rows="2" placeholder="例如：D，或 x₁=1，x₂=-5">${esc(q.answer)}</textarea></label><label>解析<textarea data-field="question-analysis" rows="6" placeholder="解题步骤、关键思路、易错点……">${esc(q.analysis)}</textarea></label><p class="solution-tip">导出时默认隐藏；可在「课件设置 → 答案与解析」选择每题后一页或同页点击出现。</p></details></div>` : ''}<div class="question-panel-bottom"><span>已选择 <b>${chosen().length}</b> 道题</span><button class="button primary" data-action="settings" ${!chosen().length ? 'disabled' : ''}>课件设置${icon('arrow-right')}</button></div></aside>`;
}
function workspace() {
  return `<section class="workspace"><div class="workspace-heading"><div><span class="eyebrow small">从原卷到课件，只差一步校对</span><h1>${esc(state.file.name)}<span class="file-type">${esc(state.file.name.split('.').pop().toUpperCase())}</span></h1><p>自动拆分后，请确认选框包含完整题干、图片与选项。</p></div><div class="workspace-heading-actions"><button class="button secondary" data-action="upload">${icon('upload')}更换试卷</button><button class="button primary" data-action="settings" ${!chosen().length ? 'disabled' : ''}>${icon('download')}导出课件<span>${chosen().length}</span></button></div></div><div class="workspace-status"><div><span class="success-dot"></span>已读取 ${state.pages.length} 页<span class="dot-separator">·</span>拆分出 ${state.questions.length} 道题<span class="needs-check">请校对</span></div><div class="detection-tools"><label>原卷版式<select data-field="columns" aria-label="原卷版式"><option value="1" ${state.columns === 1 ? 'selected' : ''}>单栏试卷</option><option value="2" ${state.columns === 2 ? 'selected' : ''}>双栏试卷</option></select></label><button class="text-button" data-action="resplit">${icon('rotate-ccw')}重新拆分</button><button class="text-button" data-action="ocr">${icon('scan-line')}扫描件 OCR</button><button class="text-button" data-action="answers">${icon('book-open')}答案与解析</button><button class="text-button" data-action="auto">${icon('sparkles')}自动解答</button></div></div>${state.notice ? `<div class="notice">${icon('circle-help')}<span>${esc(state.notice)}</span><button class="icon-button" data-action="dismiss" aria-label="关闭提示">${icon('x')}</button></div>` : ''}<div class="editor-grid">${pagePicker()}${paperView()}${questionPanel()}</div></section>`;
}
function settingsModal() {
  const options = state.options;
  const seewo = options.format === 'seewo';
  const enbx = options.format === 'enbx';
  const pictureMode = seewo || enbx;
  const stats = solutionStats(chosen());
  const solutionPages = options.solutions === 'none' ? 0 : chosen().filter(hasSolution).length;
  const totalPages = chosen().length + solutionPages;
  const solutionHint = !stats.answer && !stats.analysis
    ? '还没有填写答案与解析。请在左侧「当前题目」中填写，或点「答案与解析」批量导入。'
    : pictureMode && options.solutions === 'reveal'
      ? '希沃导入版 / 原生课件是整页图片，将按「每题后一页」导出：题目一页、解析一页，翻页即出现。'
      : options.solutions === 'reveal'
        ? '解析、答案先隐藏，放映时点击依次出现；PowerPoint / WPS 支持。'
        : options.solutions === 'paged'
          ? '每题后面追加一页解析与答案，所有格式通用，翻页即出现。'
          : '答案与解析不会导出，只生成题目页。';
  return `<div class="modal-backdrop"><section class="modal export-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-heading"><div><span class="eyebrow small">READY FOR YOUR CLASS</span><h2 id="modal-title">最后一步，准备上课。</h2></div><button class="icon-button" data-action="close" aria-label="关闭">${icon('x')}</button></div><div class="export-layout"><div class="export-form"><label class="form-label">课件名称<input data-field="export-title" value="${esc(options.title)}" maxlength="100" placeholder="例如：七年级数学课堂练习"/></label><fieldset class="format-fieldset"><legend>导出格式</legend><div class="format-options"><button class="${options.format === 'pptx' ? 'selected' : ''}" data-action="format" data-value="pptx"><b>PowerPoint</b><small>.pptx · PowerPoint / WPS</small></button><button class="${seewo ? 'selected' : ''}" data-action="format" data-value="seewo"><b>希沃导入版</b><small>.pptx · 导入希沃</small></button><button class="${enbx ? 'selected' : ''}" data-action="format" data-value="enbx"><b>希沃原生 <em>试用</em></b><small>.enbx · 原生课件</small></button></div><p class="format-tip">${enbx ? '下载 .enbx 后用希沃白板 5 打开。原生格式为试用功能，请先核对你的版本兼容性。' : seewo ? '下载后，在希沃白板选择「导入课件」，或将文件拖入画布。' : '标准 PPTX，也可以通过希沃白板的「导入课件」打开。'}</p></fieldset><fieldset><legend>页面比例</legend><div class="ratio-options"><button class="${options.ratio === '16:9' ? 'selected' : ''}" data-action="ratio" data-value="16:9"><span class="ratio-icon wide"></span><b>16:9</b><small>宽屏 · 推荐</small></button><button class="${options.ratio === '4:3' ? 'selected' : ''}" data-action="ratio" data-value="4:3"><span class="ratio-icon standard"></span><b>4:3</b><small>传统投影</small></button></div></fieldset><fieldset><legend>课件风格</legend><div class="theme-options">${Object.entries(themes).map(([key, t]) => `<button class="${options.theme === key ? 'selected' : ''}" data-action="theme" data-value="${key}"><span style="background:#${t.background};color:#${t.ink};border-color:#${t.accent}">Aa ${options.theme === key ? icon('check') : ''}</span><small>${t.name}</small></button>`).join('')}</div></fieldset><label class="toggle-row"><div><b>显示题目标题</b><small>${pictureMode ? '将题号标题显示在页面顶部' : '标题在 PPT 中可编辑'}</small></div><input type="checkbox" data-field="headings" ${options.headings ? 'checked' : ''}/><span class="toggle"></span></label><label class="toggle-row"><div><b>留出讲解区域</b><small>每页底部预留思考与板书空间</small></div><input type="checkbox" data-field="blankSpace" ${options.blankSpace ? 'checked' : ''}/><span class="toggle"></span></label><fieldset><legend>答案与解析</legend><div class="solution-options"><button class="${options.solutions === 'none' ? 'selected' : ''}" data-action="solutions" data-value="none"><b>不导出</b><small>只生成题目页</small></button><button class="${options.solutions === 'reveal' ? 'selected' : ''}" data-action="solutions" data-value="reveal"><b>同页点击出现</b><small>PowerPoint / WPS</small></button><button class="${options.solutions === 'paged' ? 'selected' : ''}" data-action="solutions" data-value="paged"><b>每题后一页</b><small>三种格式通用</small></button></div><p class="format-tip">${solutionHint}</p><p class="solution-summary">已填写 ${stats.answer} 题答案 · ${stats.analysis} 题解析 · 本课件共 ${totalPages} 页</p></fieldset></div><div class="export-summary"><span class="export-icon">${icon('presentation')}</span><b>${totalPages}<small>页课堂课件</small></b><p>每道题，拥有自己的一页${solutionPages ? '；解析按设置出现' : ''}。</p><div class="export-summary-detail"><span>试卷页数<strong>${state.pages.length} 页</strong></span><span>导出题目<strong>${chosen().length} 题</strong></span><span>解析页<strong>${solutionPages} 页</strong></span><span>页面比例<strong>${options.ratio}</strong></span><span>文件格式<strong>${enbx ? '.enbx' : '.pptx'}</strong></span></div><div class="export-note">${icon('circle-check')}${enbx ? '希沃白板 5 · 原生 ENBX（试用）' : seewo ? '适用于希沃白板导入' : '支持 PowerPoint 和 WPS'}<br><span>${pictureMode ? '页面按图片保留，可在希沃内添加批注、板书与其他元素。' : '题干以图片保留，方便保留原有排版；复杂 Word 排版请先校对。'}</span></div></div></div><div class="modal-footer"><span>${pictureMode ? '整页以图片保留，文字不可直接编辑' : '题干以图片保留，文字不可直接编辑'}</span><button class="button primary" data-action="export">${icon('download')}${enbx ? '生成并下载 ENBX' : seewo ? '生成并下载希沃课件' : '生成并下载 PPT'}</button></div></section></div>`;
}
function helpModal() {
  return `<div class="modal-backdrop"><section class="modal help-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-heading"><h2 id="modal-title">从试卷，到每一页课堂</h2><button class="icon-button" data-action="close" aria-label="关闭">${icon('x')}</button></div><ol class="help-steps"><li><b>导入 PDF 或 Word</b><p>支持文字 PDF、扫描 PDF、Word .docx。旧版 .doc 请先另存为 .docx。一次最多 60 MB、60 页。</p></li><li><b>确认题目的拆分</b><p>支持「1.」「1、」「第1题」等题号。双栏试卷请切换版式。扫描件点击 OCR，或使用框选模式手动添加题目。</p></li><li><b>调整选框与题目顺序</b><p>选中后拖动选框移动，拖右下角缩放。跨页题目可以用「合并下一题」，多余部分可以拆分或删除。工具栏支持撤销。</p></li><li><b>选择风格并下载课件</b><p>每道已勾选的题目生成一页。支持 PowerPoint、希沃导入版 PPTX 和希沃原生 ENBX（试用）。PowerPoint 标题可编辑；两种希沃模式均整页以图片保留，可以在希沃内添加批注与板书。长题可能缩得较小，可拆分改善可读性。</p></li></ol><div class="help-note">需要讲解答案时，先在「答案与解析」里逐题填写或批量粘贴（也可以导入导出的 JSON）。导出设置可选「同页点击出现」（PowerPoint / WPS：解析、答案放完后点击依次出现）或「每题后一页」（三种格式通用）。答案只在本页内存中，不上传。刷新页面会清空，请及时导出 JSON 备份。</div><div class="help-note">所有试卷处理都在浏览器本地完成，不上传试卷。刷新页面会清空当前工作，请及时导出。DOCX 的复杂浮动排版、特殊字体或公式可能与 Word 不同，建议先转成 PDF 以保留原样。</div><div class="example-downloads"><a href="/examples/数学示例试卷.pdf" download>下载示例 PDF ↗</a><a href="/examples/数学示例试卷.docx" download>下载示例 Word ↗</a></div><button class="button primary" data-action="close">开始备课${icon('arrow-right')}</button></section></div>`;
}
function answersModal() {
  const stats = solutionStats(state.questions);
  return `<div class="modal-backdrop"><section class="modal answers-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-heading"><div><span class="eyebrow small">ANSWER & EXPLANATION</span><h2 id="modal-title">把答案与解析放进课件</h2></div><button class="icon-button" data-action="close" aria-label="关闭">${icon('x')}</button></div><p class="answers-intro">答案与解析只保存在本页内存中，不上传、不联网。导入后可在左侧逐题修改；导出时默认隐藏，按设置点击出现。刷新页面会清空，请及时导出 JSON 备份。</p><div class="answers-stats"><span>共 <b>${stats.total}</b> 题</span><span>已填答案 <b>${stats.answer}</b></span><span>已填解析 <b>${stats.analysis}</b></span></div><label class="form-label">批量粘贴<textarea id="answers-text" rows="9" placeholder="1. 答案：D&#10;解析：因为……&#10;&#10;2. 答案：x₁=1，x₂=-5&#10;解析：……"></textarea></label><details class="answers-format"><summary>支持的粘贴格式</summary><pre>1. 答案：D
解析：因为……

2. 答案：x₁=1，x₂=-5
解析：……

第 3 题 答案：4√3
解析：……</pre><p>题号与试卷拆分出的题号对应；没有题号时按题目顺序匹配。</p></details><div class="answers-actions"><button class="button secondary" data-action="answers-json">${icon('upload')}导入 JSON</button><button class="button secondary" data-action="answers-template">${icon('download')}导出当前答案</button><button class="button primary" data-action="apply-answers">${icon('check')}导入粘贴内容</button></div></section></div>`;
}
function autoModal() {
  const auto = state.auto;
  const provider = providerById(auto.preset);
  const pending = chosen().filter(q => !(q.answer || '').trim()).length;
  const via = auto.preset === 'custom' ? (auto.via || 'direct') : provider.via;
  return `<div class="modal-backdrop"><section class="modal answers-modal auto-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-heading"><div><span class="eyebrow small">AUTO SOLVE</span><h2 id="modal-title">让模型先做一遍</h2></div><button class="icon-button" data-action="close" aria-label="关闭">${icon('x')}</button></div><p class="answers-intro">开始后，每道未填写答案的题目截图会发送到你选择的模型服务。自动解答是可选功能；不使用时试卷仍只在本地处理。结果会写回每题，仍可人工修改。</p><div class="answers-stats"><span>待解答 <b>${pending}</b> 题</span><span>共 <b>${chosen().length}</b> 题</span></div><fieldset><legend>模型服务</legend><div class="solution-options">${answerProviders.map(p => `<button class="${auto.preset === p.id ? 'selected' : ''}" data-action="auto-provider" data-value="${p.id}"><b>${p.name}</b><small>${p.via === 'proxy' ? '需本地转发' : '浏览器直连'}</small></button>`).join('')}</div><p class="format-tip">${esc(provider.note)}</p></fieldset><label class="form-label">接口地址<input data-field="auto-base" value="${esc(auto.base)}" placeholder="https://…/chat/completions"/></label><label class="form-label">模型名称<input data-field="auto-model" value="${esc(auto.model)}" placeholder="glm-4v-flash / qwen-vl-plus"/></label><label class="form-label">API Key<input type="password" data-field="auto-key" value="${esc(auto.key)}" placeholder="只保存在本页内存，刷新即清空" autocomplete="off"/></label>${auto.preset === 'custom' ? `<label class="form-label">连接方式<select data-field="auto-via"><option value="direct" ${via === 'direct' ? 'selected' : ''}>浏览器直连</option><option value="proxy" ${via === 'proxy' ? 'selected' : ''}>经本地转发</option></select></label>` : ''}${via === 'proxy' ? `<label class="form-label">转发地址<input data-field="auto-proxy" value="${esc(auto.proxy)}" placeholder="http://127.0.0.1:5199/api/answer"/></label><p class="format-tip">先在项目目录运行 <code>npm run answer:proxy</code> 并保持窗口开启；它只转发请求，不在本地运行模型。</p>` : ''}<details class="answers-format"><summary>免费模型与 Key</summary><p>智谱 glm-4v-flash 是免费模型，注册开放平台后可创建 API Key，但不允许浏览器跨域，需本地转发。通义千问 VL 开通百炼后有免费额度，浏览器可直接调用。Key 只保存在本页内存。</p></details><div class="answers-actions"><button class="button secondary" data-action="close">取消</button><button class="button primary" data-action="auto-solve" ${!pending ? 'disabled' : ''}>${icon('sparkles')}开始自动解答</button></div></section></div>`;
}
function render() {
  const paperScroll = document.querySelector('.paper-scroll')?.scrollTop || 0;
  const listScroll = document.querySelector('.question-list')?.scrollTop || 0;
  app.innerHTML = `<div class="app-shell">${sidebar()}<main>${header()}${state.file ? workspace() : emptyState()}</main></div><input id="file-input" type="file" accept=".pdf,.docx,.doc" hidden/><input id="answers-input" type="file" accept=".json,.txt,application/json,text/plain" hidden/>${state.modal === 'settings' ? settingsModal() : state.modal === 'help' ? helpModal() : state.modal === 'answers' ? answersModal() : state.modal === 'auto' ? autoModal() : ''}${state.busy ? `<div class="busy-overlay" role="alert" aria-busy="true"><div class="busy-card"><span class="busy-spinner"></span><h3 id="progress-label">${esc(state.message)}</h3><p>文件在本机处理，请稍等片刻</p><div class="progress-track"><div id="progress-bar" style="width:${state.progress * 100}%"></div></div></div></div>` : ''}`;
  app.querySelectorAll('a[href^="/examples/"]').forEach(link => {
    const source = link.getAttribute('href');
    link.href = resourceURL(source);
    link.download = source.split('/').pop();
  });
  createIcons({icons: iconSet});
  const paper = document.querySelector('.paper-scroll');
  if (paper) paper.scrollTop = paperScroll;
  const list = document.querySelector('.question-list');
  if (list) list.scrollTop = listScroll;
  const answers = document.getElementById('answers-text');
  if (answers && state.answerDraft) answers.value = state.answerDraft;
}

async function importFile(file) {
  if (!file || state.busy) return;
  state.busy = true;
  state.message = '正在打开试卷…';
  state.progress = 0;
  render();
  let newPages;
  try {
    newPages = await readDocument(file, progress);
    progress('正在按题号拆分…', 0.93);
    const qs = segmentPages(newPages, state.columns);
    // Replace the current document only after the entire new import succeeds.
    state.pages.forEach(p => {p.canvas.width = 0; p.canvas.height = 0;});
    cache.clear();
    Object.assign(state, {file: {name: file.name, size: file.size}, pages: newPages, questions: qs, page: 0, selected: qs[0]?.id || null, history: [], zoom: 100, modal: null, mode: 'select'});
    state.options.title = file.name.replace(/\.[^.]+$/, '');
    const hasText = newPages.some(p => p.lines.length > 5);
    state.notice = !hasText ? '这可能是扫描版试卷。点击「扫描件 OCR」识别题号，或用「框选题目」添加；题目以原图保留。' : !qs.length ? '没有识别出常见题号。可以用「框选题目」手动添加，或调整单栏 / 双栏设置。' : file.name.toLowerCase().endsWith('.docx') ? 'Word 已按浏览器排版渲染，请检查图片、公式和分页；需要精确保留 Word 原版时，建议先导出 PDF。' : '';
    toast(qs.length ? `已拆出 ${qs.length} 道题，请校对选框后导出` : '试卷已打开，可以开始框选题目');
  } catch (e) {
    console.error(e);
    newPages?.forEach(p => {p.canvas.width = 0;});
    toast(e.message || '文件读取失败，请确认文件完整，或转换为 PDF 后重试。');
  } finally {
    state.busy = false;
    render();
  }
}
async function loadDemo() {
  try {
    const response = await fetch(resourceURL('/examples/数学示例试卷.pdf', 'application/pdf'));
    if (!response.ok) throw new Error('示例文件加载失败');
    await importFile(new File([await response.blob()], '数学示例试卷.pdf', {type: 'application/pdf'}));
  } catch (e) {toast(e.message);}
}
function resplit() {
  snapshot();
  state.questions = segmentPages(state.pages, state.columns);
  state.selected = state.questions[0]?.id || null;
  render();
  toast(`已重新拆分为 ${state.questions.length} 道题，原有手动修改可撤销恢复`);
}
async function runOCR() {
  if (state.busy) return;
  state.busy = true;
  state.message = '正在准备本地 OCR 引擎…';
  state.progress = 0;
  render();
  // Retain text, graphics and content bounds if recognition fails midway.
  const originalPages = state.pages.map(p => ({...p}));
  try {
    await recognizePages(state.pages, progress);
    cache.clear();
    snapshot();
    state.questions = segmentPages(state.pages, state.columns);
    state.selected = state.questions[0]?.id || null;
    state.notice = 'OCR 用于识别题号，导出仍使用试卷原图。请校对拆分，特别是模糊、倾斜和多栏试卷；原有手动拆分可撤销恢复。';
    toast(`OCR 完成，拆分出 ${state.questions.length} 道题`);
  } catch (e) {
    state.pages.forEach((p, i) => Object.assign(p,originalPages[i]));
    console.error(e);
    toast('OCR 未能完成。可以直接框选题目，或稍后重新识别。');
  } finally {state.busy = false; render();}
}
function applyAnswerText(text) {
  const entries = parseSolutionsText(text);
  if (!entries.length) {toast('没有识别到「题号 + 答案 / 解析」，请按示例格式粘贴'); return;}
  snapshot();
  const applied = applySolutions(state.questions, entries);
  if (!applied) {toast('答案中的题号与当前试卷不匹配'); return;}
  if (state.options.solutions === 'none') state.options.solutions = 'reveal';
  state.modal = null;
  state.answerDraft = '';
  render();
  toast(`已导入 ${applied} 题的答案与解析`);
}
async function readAnswersFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const entries = file.name.toLowerCase().endsWith('.json') ? parseSolutionsJSON(text) : parseSolutionsText(text);
    if (!entries.length) throw new Error('文件里没有可用的答案或解析');
    snapshot();
    const applied = applySolutions(state.questions, entries);
    if (!applied) throw new Error('答案中的题号与当前试卷不匹配');
    if (state.options.solutions === 'none') state.options.solutions = 'reveal';
    state.modal = null;
    state.answerDraft = '';
    render();
    toast(`已导入 ${applied} 题的答案与解析`);
  } catch (e) {console.error(e); toast(e.message || '答案文件读取失败，请确认是导出的 JSON 或文本格式');}
}
function downloadAnswers() {
  const data = buildSolutionExport(state.questions, state.options.title || '');
  if (!data.questions.length) {toast('还没有填写答案或解析'); return;}
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
  const name = (state.options.title || '试卷').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${name}-答案与解析.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  toast(`已导出 ${data.questions.length} 题的答案与解析`);
}
async function runAutoSolve() {
  const preset = providerById(state.auto.preset);
  const provider = {base: state.auto.base, model: state.auto.model, via: state.auto.preset === 'custom' ? (state.auto.via || 'direct') : preset.via};
  const queue = chosen().filter(q => !(q.answer || '').trim());
  if (!queue.length) {toast('没有需要解答的题目'); return;}
  if (!provider.base || !provider.model) {toast('请填写接口地址和模型名称'); return;}
  if (!state.auto.key && state.auto.preset !== 'custom') {toast('请填写 API Key'); return;}
  snapshot();
  state.modal = null;
  state.busy = true;
  state.message = '正在自动解答…';
  state.progress = 0;
  render();
  let done = 0;
  try {
    for (const q of queue) {
      progress(`自动解答 · 第 ${done + 1} / ${queue.length} 题 · ${q.title}`, done / queue.length);
      const canvas = composeQuestion(q, state.pages, 1400);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      canvas.width = 0;
      const result = await solveQuestion({provider, dataUrl, apiKey: state.auto.key, proxyUrl: state.auto.proxy});
      q.answer = result.answer;
      q.analysis = result.analysis;
      done++;
      render();
    }
    if (state.options.solutions === 'none') state.options.solutions = 'reveal';
    toast(`已自动解答 ${done} 题，请逐题核对`);
  } catch (error) {
    console.error(error);
    toast(`自动解答中断（已完成 ${done} 题）：${error.message || error}`);
  } finally {
    state.busy = false;
    render();
  }
}
async function download() {
  if (!chosen().length || state.busy) return;
  state.busy = true;
  state.message = '正在准备课件…';
  state.progress = 0;
  render();
  try {
    if (state.options.format === 'enbx') {
      const {exportENBX} = await import('./enbx.js');
      await exportENBX(state.questions, state.pages, state.options, progress);
    } else if (state.options.format === 'seewo') {
      const {exportSeewoPPTX} = await import('./seewo.js');
      await exportSeewoPPTX(state.questions, state.pages, state.options, progress);
    } else {
      await exportPPTX(state.questions, state.pages, state.options, progress);
    }
    state.modal = null;
    toast(`已生成 ${chosen().length} 页${state.options.format === 'enbx' ? '希沃原生课件' : state.options.format === 'seewo' ? '希沃导入课件' : ' PPT'}，请在浏览器下载列表中查看`);
  } catch (e) {console.error(e); toast(e.message || '生成失败，请减少题目数量后重试。');}
  finally {state.busy = false; render();}
}

app.addEventListener('click', event => {
  if (event.target.closest('input, select, label')) return;
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled || state.busy) return;
  const action = button.dataset.action;
  const q = selectedQuestion();
  const index = state.questions.indexOf(q);
  switch (action) {
    case 'home': if (!state.file) return; state.page = 0; render(); return;
    case 'upload': document.getElementById('file-input').click(); return;
    case 'demo': loadDemo(); return;
    case 'help': state.modal = 'help'; break;
    case 'close': state.modal = null; break;
    case 'settings': state.modal = 'settings'; break;
    case 'export': download(); return;
    case 'dismiss': state.notice = ''; break;
    case 'page': state.page = Number(button.dataset.index); break;
    case 'prev-page': state.page = Math.max(0, state.page - 1); break;
    case 'next-page': state.page = Math.min(state.pages.length - 1, state.page + 1); break;
    case 'mode': state.mode = button.dataset.value; break;
    case 'zoom-in': state.zoom = Math.min(180, state.zoom + 10); break;
    case 'zoom-out': state.zoom = Math.max(60, state.zoom - 10); break;
    case 'select': state.selected = button.dataset.id; state.page = selectedQuestion().segments[0].page; break;
    case 'resplit': resplit(); return;
    case 'ocr': runOCR(); return;
    case 'answers': state.modal = 'answers'; break;
    case 'auto': state.modal = 'auto'; break;
    case 'auto-provider': {const provider = providerById(button.dataset.value); state.auto.preset = provider.id; state.auto.base = provider.base; state.auto.model = provider.model; state.auto.via = provider.via;} break;
    case 'auto-solve': runAutoSolve(); return;
    case 'apply-answers': applyAnswerText(document.getElementById('answers-text')?.value || ''); return;
    case 'answers-json': document.getElementById('answers-input').click(); return;
    case 'answers-template': downloadAnswers(); return;
    case 'solutions': state.options.solutions = button.dataset.value; break;
    case 'undo': if (state.history.length) {state.questions = JSON.parse(state.history.pop()); state.selected = state.questions[0]?.id || null;} break;
    case 'all': {snapshot(); const include = chosen().length !== state.questions.length; state.questions.forEach(item => item.included = include); break;}
    case 'delete': if (q) {snapshot(); state.questions.splice(index, 1); state.selected = state.questions[Math.min(index, state.questions.length - 1)]?.id || null;} break;
    case 'up': case 'down': {const other = index + (action === 'up' ? -1 : 1); if (q && other >= 0 && other < state.questions.length) {snapshot(); [state.questions[index], state.questions[other]] = [state.questions[other], state.questions[index]];} break;}
    case 'merge': if (q && index < state.questions.length - 1) {snapshot(); q.segments.push(...state.questions[index + 1].segments); q.text += ` ${state.questions[index + 1].text || ''}`; state.questions.splice(index + 1, 1); toast('已合并，多个片段将出现在同一页 PPT');} break;
    case 'split': if (q) {snapshot(); const [first, second] = splitQuestion(q); q.segments = first; state.questions.splice(index + 1, 0, {...q, id: uid(), title: `${q.title}（续）`, segments: second, answer: '', analysis: ''}); toast('已从中间拆分，可拖动选框进一步调整');} break;
    case 'format': state.options.format = button.dataset.value; break;
    case 'theme': state.options.theme = button.dataset.value; break;
    case 'ratio': state.options.ratio = button.dataset.value; break;
    default: return;
  }
  render();
  if (action === 'select') {
    const overlay = document.querySelector('.crop-overlay.is-selected');
    const scroll = document.querySelector('.paper-scroll');
    if (overlay && scroll) scroll.scrollTop = Math.max(0, overlay.offsetTop - scroll.clientHeight * 0.2);
  } else if (['page', 'prev-page', 'next-page'].includes(action)) {
    document.querySelector('.paper-scroll').scrollTop = 0;
  }
});

app.addEventListener('change', event => {
  const el = event.target;
  if (el.id === 'file-input') {importFile(el.files[0]); return;}
  if (el.id === 'answers-input') {readAnswersFile(el.files[0]); el.value = ''; return;}
  if (state.busy) return;
  const q = selectedQuestion();
  switch (el.dataset.field) {
    case 'columns': state.columns = Number(el.value); resplit(); return;
    case 'include': snapshot(); state.questions.find(item => item.id === el.dataset.id).included = el.checked; break;
    case 'question-title': if (q) {snapshot(); q.title = el.value.trim() || '未命名题目';} break;
    case 'export-title': state.options.title = el.value.trim() || state.file.name.replace(/\.[^.]+$/, ''); return;
    case 'auto-via': state.auto.via = el.value; break;
    case 'headings': case 'blankSpace': state.options[el.dataset.field] = el.checked; break;
    case 'crop': if (q) {snapshot(); const i = Number(el.dataset.index); q.segments[i] = normalizeCrop({...q.segments[i], [el.dataset.key]: Number(el.value) / 100});} break;
    default: return;
  }
  render();
});
// Keep the export name current without re-rendering while typing.
app.addEventListener('input', event => {
  const field = event.target.dataset.field;
  if (field === 'export-title') {state.options.title = event.target.value; return;}
  if (field === 'question-answer' || field === 'question-analysis') {
    const q = selectedQuestion();
    if (q) q[field === 'question-answer' ? 'answer' : 'analysis'] = event.target.value;
    return;
  }
  if (field === 'auto-base' || field === 'auto-model' || field === 'auto-key' || field === 'auto-proxy') {
    state.auto[field.slice(5)] = event.target.value;
    return;
  }
  if (event.target.id === 'answers-text') state.answerDraft = event.target.value;
});
app.addEventListener('dragover', event => {event.preventDefault(); if (!state.busy) document.getElementById('drop-zone')?.classList.add('drag-over');});
app.addEventListener('dragleave', event => {if (!event.relatedTarget || !app.contains(event.relatedTarget)) document.getElementById('drop-zone')?.classList.remove('drag-over');});
app.addEventListener('drop', event => {event.preventDefault(); document.getElementById('drop-zone')?.classList.remove('drag-over'); if (!state.busy) importFile(event.dataTransfer.files[0]);});

app.addEventListener('pointerdown', event => {
  const paper = event.target.closest('#paper');
  if (!paper || state.busy || event.button !== 0) return;
  const rect = paper.getBoundingClientRect();
  const point = {x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1)};
  const overlay = event.target.closest('.crop-overlay');
  if (state.mode === 'crop') drag = {type: 'new', start: point, end: point, rect, paper};
  else if (overlay) {
    const q = state.questions.find(item => item.id === overlay.dataset.qid);
    state.selected = q.id;
    const si = Number(overlay.dataset.segment);
    drag = {type: event.target.closest('[data-resize]') ? 'resize' : 'move', q, si, start: point, original: {...q.segments[si]}, end: point, rect, paper, overlay};
  } else return;
  paper.setPointerCapture(event.pointerId);
  event.preventDefault();
});
app.addEventListener('pointermove', event => {
  if (!drag) return;
  const d = drag;
  const p = {x: clamp((event.clientX - d.rect.left) / d.rect.width, 0, 1), y: clamp((event.clientY - d.rect.top) / d.rect.height, 0, 1)};
  d.end = p;
  let box;
  if (d.type === 'new') {
    box = {x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y), w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y)};
    const el = d.paper.querySelector('#drawing-box');
    el.style.display = 'block';
    Object.assign(el.style, {left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%`});
  } else {
    box = d.type === 'move' ? {...d.original, x: clamp(d.original.x + p.x - d.start.x, 0, 1 - d.original.w), y: clamp(d.original.y + p.y - d.start.y, 0, 1 - d.original.h)} : normalizeCrop({...d.original, w: p.x - d.original.x, h: p.y - d.original.y});
    d.updated = box;
    Object.assign(d.overlay.style, {left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%`});
  }
});
app.addEventListener('pointerup', finishDrag);
app.addEventListener('pointercancel', () => {drag = null; render();});
function finishDrag() {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.type === 'new') {
    const w = Math.abs(d.end.x - d.start.x), h = Math.abs(d.end.y - d.start.y);
    if (w > 0.025 && h > 0.01) {
      snapshot();
      const q = {id: uid(), title: `第 ${state.questions.length + 1} 题`, text: '', included: true, answer: '', analysis: '', segments: [{page: state.page, x: Math.min(d.start.x, d.end.x), y: Math.min(d.start.y, d.end.y), w, h}]};
      state.questions.push(q);
      state.selected = q.id;
      state.mode = 'select';
      toast('题目已添加，可调整标题与导出顺序');
    }
  } else if (d.updated) {snapshot(); d.q.segments[d.si] = d.updated;}
  render();
}
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !state.busy) {state.modal = null; render();}
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.target.closest('input,textarea') && !state.busy) {
    event.preventDefault();
    if (state.history.length) {state.questions = JSON.parse(state.history.pop()); state.selected = state.questions[0]?.id || null; render();}
  }
  if (event.key === 'Tab' && state.modal) {
    const focusable = Array.from(document.querySelectorAll('.modal button:not(:disabled), .modal input, .modal a[href]'));
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last?.focus();}
    if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first?.focus();}
  }
});
window.addEventListener('beforeunload', event => {if (state.file) {event.preventDefault(); event.returnValue = '';}});
render();
