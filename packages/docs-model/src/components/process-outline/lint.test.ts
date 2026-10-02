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
const titleCase=(steps:unknown[])=>failures(steps).findings.filter(f=>f.ruleId==='process-outline.phase-title-case');
test('Title Case root and phases pass while substeps stay sentence case',()=>{
 expect(titleCase([{text:'Run Mode',steps:[{text:'Drain the Epoch With Workers',steps:[{text:'spawn workers through the kernel'}]},{text:'Finish the Epoch',steps:[{text:'Run the full build'}]}]}])).toEqual([]);
});
test('sentence case phase warns at its exact step with the Title Case suggestion',()=>{
 const found=titleCase([{text:'Run Mode',steps:[{text:'Get Candidates',steps:[{text:'Exclude locked work'}]},{text:'Drain the epoch with workers',steps:[{text:'Spawn workers'}]}]}]);
 expect(found).toHaveLength(1);
 expect(found[0]).toMatchObject({blockId:'outline',field:'props.steps[0].steps[1].text',severity:'warning',evidence:'Drain the epoch with workers'});
 expect(found[0]!.message).toBe('Phase is not in Title Case: epoch, with, workers.');
 expect(found[0]!.suggestion).toStartWith('Use "Drain the Epoch With Workers".');
 expect(failures([{text:'Run Mode',steps:[{text:'Drain the epoch',steps:[{text:'Spawn'}]}]}]).blocking).toEqual([]);
});
test('a sentence case root title warns as the process title',()=>{
 const found=titleCase([{text:'Run mode',steps:[{text:'Spawn workers'}]}]);
 expect(found.map(f=>[f.field,f.message,f.suggestion.split('.')[0]])).toEqual([['props.steps[0].text','Process title is not in Title Case: mode.','Use "Run Mode"']]);
});
test('minor words, code spans, acronyms and identifiers keep their case',()=>{
 expect(titleCase([{text:'Run Mode',steps:[{text:'Call `spawn agent` via the API in v2',steps:[{text:'act'}]},{text:'Read config.json With parseOutline',steps:[{text:'act'}]}]}])).toEqual([]);
 const [found]=titleCase([{text:'Run Mode',steps:[{text:'hand `the worker` off to the kernel up',steps:[{text:'act'}]}]}]);
 expect(found!.suggestion).toStartWith('Use "Hand `the worker` Off to the Kernel Up".');
});
test('notes, leaf first-level steps and deeper steps are ignored',()=>{
 expect(titleCase([{text:'Run Mode',steps:[{text:'spawn one worker'},{text:'workers produce evidence',kind:'note'},{text:'Finish the Epoch',steps:[{text:'run the full build',steps:[{text:'move every item'}]}]}]}])).toEqual([]);
});
