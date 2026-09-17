import {expect,test} from 'bun:test';
import {lintDocument} from '../../lint';
import {document,paragraph} from '../../lint/fixtures';
const doc=(steps:unknown[])=>document(paragraph('intro','Process example.'),{id:'outline',type:'process-outline',props:{steps},children:[]});
const failures=(steps:unknown[],phase:'draft'|'complete'='complete')=>lintDocument(doc(steps),{phase});
test('one process parent accepts ordered nested actions and leaf notes',()=>{
 expect(failures([{text:'Explore a component',steps:[{text:'Capture source'},{text:'Keep hashes',kind:'note'},{text:'Review',steps:[{text:'Choose a design'}]}]}]).blocking).toEqual([]);
});
test('separate phases, empty outlines, unnamed roots, notes and childless headings fail completion',()=>{
 for(const steps of [[],[{text:'Capture'},{text:'Review'}],[{text:'Process'}],[{text:' ',steps:[{text:'Act'}]}],[{text:'Note',kind:'note'}],[{text:'Process',steps:[{text:'Only a note',kind:'note'}]}]]) {
  const report=failures(steps);
  expect(report.blocking.map(f=>f.ruleId)).toContain('process-outline.single-parent');
  expect(report.blocking.find(f=>f.ruleId==='process-outline.single-parent')?.blockId).toBe('outline');
  expect(failures(steps,'draft').blocking).toEqual([]);
 }
});
test('repair clears the finding and unrelated blocks are ignored',()=>{
 const baseline=doc([{text:'Capture'},{text:'Review'}]);
 expect(lintDocument(doc([{text:'Explore',steps:[{text:'Capture'},{text:'Review'}]}]),{phase:'complete',baseline}).blocking).toEqual([]);
 expect(lintDocument(document(paragraph('intro','Ordinary prose.')),{phase:'complete'}).blocking).toEqual([]);
});
