import {mathjax} from 'mathjax-full/js/mathjax.js';
import {MathML} from 'mathjax-full/js/input/mathml.js';
import {SVG} from 'mathjax-full/js/output/svg.js';
import {liteAdaptor} from 'mathjax-full/js/adaptors/liteAdaptor.js';
import {RegisterHTMLHandler} from 'mathjax-full/js/handlers/html.js';

// SVG formula glyphs survive foreignObject/canvas capture, including browsers
// without native MathML. The renderer and fonts run locally; no external CDN.
export function renderFormulas(root) {
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const document = mathjax.document('', {InputJax: new MathML(), OutputJax: new SVG({fontCache: 'none'})});
  for (const formula of Array.from(root.querySelectorAll('math'))) {
    // docx-preview represents OMML text runs as <ms>, which normally adds
    // quotation marks. OMML runs are not quoted MathML string literals.
    formula.querySelectorAll('ms').forEach(run => {
      run.setAttribute('lquote', '');
      run.setAttribute('rquote', '');
    });
    const result = document.convert(formula.outerHTML, {display: formula.getAttribute('display') === 'block'});
    const wrapper = window.document.createElement('span');
    wrapper.innerHTML = adaptor.outerHTML(result);
    formula.replaceWith(wrapper);
  }
}
