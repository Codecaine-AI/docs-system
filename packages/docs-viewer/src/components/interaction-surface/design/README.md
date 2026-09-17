# Interaction Surface Approval

The user approved the current design on September 15, 2026. The canonical component reference is `docs/10-system-design/40-block-vocabulary/60-interaction-surface`, mirrored into the codecaine-docs skill references.

## Reuse

- Share State Shape typography, content colors, chips, mini headers, spacing, and thin separators. State Shape's blue identity remains specific to State Shape.
- Keep operations as individual cards, with Field and Type left, Signature right, and returned objects below inputs. Known objects show recursive fields and a concrete JSON example.
- Action headers are amber, Query green-teal, and Event violet. Each card has an explicit kind badge, restrained curved texture, and a softer matching return header.
- Describe constraints, defaults, null semantics, side effects, and ownership when they add information. Omit descriptions that restate names or types.
- Ground examples in actual source. A callback event payload is separate from a subscription's unsubscribe return value.

## Decision Authority

`approval.json` preserves the 16 saved tuning revisions, feedback, briefs, original events, explicit user approval, and scoped reuse notes. User requests remain distinct from the implementer's interpretations. Exact colors and the 48 percent return tint were implementation choices accepted with the final design. Earlier all-amber headers, blue Query styling, and the enclosing-card layout remain historical decisions.

The selected revision is `13c3f549-e558-4eec-b1bc-144d8a3d86ee`. Apply `d72f0fe6-cbdd-48a4-9b63-4dba3fb2c19a` preserves the real Kernel agent trace, backups, and verification. The earlier reverted Apply remains in Variator history.

## Native Contract

`returnShape: { fields: Field[], example?: string }` is optional. `returns` supplies the result name or legacy string type. Both actions clone nested fields, and `updateOperation` accepts `returnShape: null` to clear only the object shape. The descriptor rejects malformed fields; the agent projection includes returned fields and examples.

Header theme keys are `actionHeaderBg`, `actionHeaderInk`, `queryHeaderBg`, `queryHeaderInk`, `eventHeaderBg`, and `eventHeaderInk`. All support light/dark values. Their defaults preserve the approved appearance.

## Verification

The original Apply passed 40 exact screenshot and computed-style comparisons. The native integration passed 181 behavior/style checks and another 40 comparisons, plus tests of the actual Docs page. Retained evidence is in Variator's `.variator/operations-native-integration` and `.variator/operations-integrated-app` directories. `verification.json` records the final checks with this package.
