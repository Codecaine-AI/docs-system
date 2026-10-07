export type PdfDiagramProps = { title?: string; svg: string };

export function PdfDiagram({ title, svg }: PdfDiagramProps) {
    return <figure>{title && <figcaption>{title}</figcaption>}
      <div className="pdf-diagram" dangerouslySetInnerHTML={{ __html: svg }} />
    </figure>;
}
