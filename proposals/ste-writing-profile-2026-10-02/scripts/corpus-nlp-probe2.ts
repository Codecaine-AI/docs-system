import nlp from "compromise";
for (const t of ["Code blocks hold source text, either a real listing.", "Block props, atom text, and references travel as typed JSON payloads.", "Run tests before you commit.", "Index pages with Xlit.", "Insert a field under the parent.", "Prefer Xlit for semantic labels.", "Link docs with typed reference spans.", "Render the page with Xlit.", "Stage proposals for review.", "Use Xlit, Xlit, and Xlit for this."]) {
  const terms = nlp(t).json()[0].terms;
  console.log(t, "=>", terms.slice(0,4).map((x:any)=>x.text+"/"+x.tags.join("|")+"["+x.pre+"|"+x.post+"]").join("  "));
}
