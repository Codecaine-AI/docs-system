# Callout Design

The approved Callout uses a tone-colored icon and title header, subtle curved texture, a faint bottom edge, and a plain body. It supports info, decision, risk, warning, and success.

`approval.json` retains the exact user approval, revision lineage, scoped decisions, Apply trace references, and verification. The original and prior rounds remain in Variator. Native authoring guidance and all five examples live in the Callout block catalog.

`editor-integration.json` records the user clarification that this styling applies in every viewing mode. The normal editor delegates to the same Callout renderer and gives ProseMirror ownership of the editable body. This supersedes the earlier read-renderer-only scope in the original approval archive.
