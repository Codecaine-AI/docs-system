/**
 * Source chip labels for one component tree. A chip shows the shortest tail of
 * its file path that no other file in the same block shares, then the line:
 * three different `index.tsx` files read `RouterShell/index.tsx:37`,
 * `AppShell/index.tsx:50` and `Sidebar/index.tsx:39`, and a file whose name is
 * unique in the block keeps only its name, `editor.tsx:157`. The full path
 * stays the chip's tooltip.
 */
export type SourceLabel = { dir: string; base: string };

const splitLine = (source: string) => {
  const match = /^(.*?)(:\d+(?:[-:]\d+)*)?$/.exec(source);
  return { file: match?.[1] ?? source, line: match?.[2] ?? "" };
};

export function sourceLabels(sources: readonly string[]): Map<string, SourceLabel> {
  const files = [...new Set(sources.map((source) => splitLine(source).file))];
  const segments = new Map(files.map((file) => [file, file.split("/")]));
  const tail = (file: string, count: number) => segments.get(file)!.slice(-count).join("/");
  const shortest = new Map<string, string>();
  for (const file of files) {
    const parts = segments.get(file)!;
    let count = 1;
    while (count < parts.length && files.some((other) => other !== file && tail(other, count) === tail(file, count))) count++;
    shortest.set(file, tail(file, count));
  }
  const labels = new Map<string, SourceLabel>();
  for (const source of sources) {
    const { file, line } = splitLine(source);
    const shown = shortest.get(file)!;
    labels.set(source, { dir: file.slice(0, file.length - shown.length), base: shown + line });
  }
  return labels;
}
