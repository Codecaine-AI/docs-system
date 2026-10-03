import {test,expect} from 'bun:test';
import {embedDiagramFonts,matchWeight} from './svg-fonts';
const faces=(svg:string)=>[...svg.matchAll(/font-family:"([^"]+)";font-style:normal;font-weight:(\d+)/g)].map(m=>`${m[1]} ${m[2]}`);
test('embeds the bundled faces an SVG paints, by CSS font matching',()=>{
 const svg=embedDiagramFonts('<svg xmlns="http://www.w3.org/2000/svg"><text font-weight="620">A</text><text style="font-weight: 500">B</text></svg>');
 expect(faces(svg)).toEqual(['Inter 400','Inter 500','Inter 700']);
 expect(svg).toContain(':root{--seq-font-family:Inter, ui-sans-serif');
 expect(faces(embedDiagramFonts('<svg><text font-family="IBM Plex Mono" font-weight="700">x</text></svg>'))).toEqual(['Inter 400','Inter 700','IBM Plex Mono 400','IBM Plex Mono 600']);
 expect(matchWeight(450,[400,500,600])).toBe(500);
 expect(embedDiagramFonts('not svg')).toBe('not svg');
});
