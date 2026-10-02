import {expect,test} from 'bun:test';
import {Value} from '@sinclair/typebox/value';
import {InteractionSurfaceState,readInteractionSurfaceOperations} from '../state';
import {addOperation,updateOperation,removeOperation,interactionSurfaceAgentView} from '../index';
import {checkParams} from '../../define';
import type {DocBlock} from '../../../doc-schema';
const shape={fields:[{name:'source',type:'object',fields:[{name:'path',type:'string'}]}],example:'{"source":{"path":"src/a.ts"}}'};
const block=():DocBlock=>({id:'surface',type:'interaction-surface',props:{operations:[{name:'prepare',returns:'Prepared',returnShape:structuredClone(shape)}]},children:[]});
test('native return shapes are recursive and closed; legacy returns remain valid',()=>{
 expect(Value.Check(InteractionSurfaceState,block().props)).toBe(true);
 for(const returnShape of [{fields:[{name:'x',extra:1}]},{fields:[],extra:1},{fields:[],example:1}])expect(Value.Check(InteractionSurfaceState,{operations:[{name:'x',returnShape}]})).toBe(false);
 expect(Value.Check(InteractionSurfaceState,{operations:[{name:'x',returns:'void'},{name:'y',returnShape:{fields:[],example:'{}'}}]})).toBe(true);
});
test('read and all mutations preserve return fields without sharing source references',()=>{
 const source=block();const read=readInteractionSurfaceOperations(source);read[0]!.returnShape!.fields[0]!.fields![0]!.name='changed';expect(source.props).toEqual(block().props);
 for(const [action,args] of [[addOperation,{name:'status',kind:'query',returnShape:shape}],[updateOperation,{name:'prepare',patch:{description:'Only after capture'}}],[removeOperation,{name:'other'}]] as const){
  const current=block();(current.props.operations as any[]).push({name:'other'});expect(checkParams(action,args)).toEqual([]);if (!("apply" in action)) throw Error("Expected local action");const result=action.apply(current,args as any);expect(result.ok).toBe(true);if(!result.ok)continue;
  expect((result.props.operations as any[])[0].returnShape).toEqual(shape);
  (result.props.operations as any[])[0].returnShape.fields[0].name='changed';expect((current.props.operations as any[])[0].returnShape).toEqual(shape);
 }
});
test('update replaces or clears the returned shape independently of return type',()=>{
 for(const returnShape of [{fields:[],example:'{}'},null]){const args={name:'prepare',patch:{returnShape}};expect(checkParams(updateOperation,args)).toEqual([]);if (!("apply" in updateOperation)) throw Error("Expected local action");const result=updateOperation.apply(block(),args);expect(result.ok).toBe(true);if(result.ok){const op=(result.props.operations as any[])[0];expect(op.returnShape).toEqual(returnShape??undefined);expect(op.returns).toBe('Prepared');}}
});
test('agent projection retains return fields and example',()=>{
 const text=interactionSurfaceAgentView(block(),{listDepth:0,listIndex:0});expect(text).toContain('Returns Prepared:');expect(text).toContain('path: string');expect(text).toContain(shape.example);
});

test('an authored example call is optional text: validated, read, set and cleared by the typed actions, and projected',()=>{
 const call='prepare({\n  path: "src/a.ts",\n})';
 expect(Value.Check(InteractionSurfaceState,{operations:[{name:'x',exampleCall:call}]})).toBe(true);
 expect(Value.Check(InteractionSurfaceState,{operations:[{name:'x',exampleCall:1}]})).toBe(false);
 const withCall:DocBlock={id:'s',type:'interaction-surface',props:{operations:[{name:'prepare',exampleCall:call},{name:'bad',exampleCall:7}]},children:[]};
 expect(readInteractionSurfaceOperations(withCall).map(op=>op.exampleCall)).toEqual([call,undefined]);
 if (!("apply" in addOperation)) throw Error("Expected local action");
 const added=addOperation.apply(block(),{name:'status',exampleCall:'status()'} as any);expect(added.ok).toBe(true);if(added.ok)expect((added.props.operations as any[])[1].exampleCall).toBe('status()');
 for(const exampleCall of [call,null]){const args={name:'prepare',patch:{exampleCall}};expect(checkParams(updateOperation,args)).toEqual([]);if (!("apply" in updateOperation)) throw Error("Expected local action");const result=updateOperation.apply(block(),args);expect(result.ok).toBe(true);if(result.ok)expect((result.props.operations as any[])[0].exampleCall).toBe(exampleCall??undefined);}
 expect(checkParams(updateOperation,{name:'prepare',patch:{exampleCall:''}})).not.toEqual([]);
 const text=interactionSurfaceAgentView(withCall,{listDepth:0,listIndex:0})!;
 expect(text).toContain('prepare()\n  Example call:\n    prepare({\n      path: "src/a.ts",\n    })');
});
