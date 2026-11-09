import {test} from 'node:test';
import assert from 'node:assert/strict';
import {solutionPagePlans,exportPageCount} from '../src/solution-layout.js';
test('长解析自动续页，多行答案和尾部文字均完整保留',()=>{
  const q={included:true,analysis:'这是需要完整保留的几何推导。'.repeat(250)+'END_OF_ANALYSIS',answer:'FIRST_LINE\nSECOND_LINE\nTHIRD_LINE'};
  for(const ratio of ['16:9','4:3']) {
    const plans=solutionPagePlans(q,{ratio,headings:true});assert.ok(plans.length>1);
    const text=kind=>plans.flatMap(p=>p.blocks.filter(b=>b.kind===kind).flatMap(b=>b.lines)).join('');
    assert.equal(text('analysis'),q.analysis);
    assert.equal(text('answer'),q.answer.replaceAll('\n',''));
    assert.ok(plans.every(p=>p.blocks.every(b=>b.y+b.h<=850 && b.lines.length*b.lineHeight+58<=b.h+.01)));
    assert.equal(exportPageCount([q],{ratio,headings:true,format:'seewo',solutions:'reveal'}),1+plans.length);
    assert.equal(exportPageCount([q],{ratio,headings:true,format:'enbx',solutions:'paged'}),1+plans.length);
    assert.equal(exportPageCount([q],{ratio,headings:true,format:'pptx',solutions:'reveal'}),1);
  }
});
