import nlp from "compromise";
const s = ["The file has changed since the block was rendered by the viewer.", "Run the audit command, then open the page.", "It is running the backlinks index rebuild job queue now.", "The agent surface renders a markdown projection.", "Stage a proposal for review."];
for (const t of s) {
  const d = nlp(t);
  console.log(t);
  console.log(" terms:", d.terms().json().map((x:any)=>x.text+"/"+x.terms[0].tags.join("|")).join("  "));
  console.log(" verbs:", JSON.stringify(d.verbs().json().map((v:any)=>v.verb?.grammar ?? v.verb)));
}
