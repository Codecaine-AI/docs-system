<goal>
- Integrate corpus-owned writing guidance and vertically organized authoring lints through Docs Writer, Docs Lab, and CLI audit.
</goal>
<context_refresh>
- Read objectives/docs-authoring-lints/current_state.md and context/*.md.
</context_refresh>
<working_strategy>
- Astra agents own model rules, server/editor integration, writer integration, corpus guidance, and read-only boundary review. Root owns CLI, coordination, and final verification.
- Share one pure lint API. Tie every rule to corpus guidance. Preserve external Canvas and Sequence ownership.
</working_strategy>
<success_metrics>
- Both agent edit paths return actionable diagnostics; completion gates reject newly introduced required findings without committing invalid content.
- Draft edits remain possible. Existing issues do not block unrelated updates.
- Corpus rules render into both agents; CLI reports the same rules.
</success_metrics>
<non_goals>
- Do not deprecate global skills, rewrite the whole corpus, change external component lint engines, commit, or deploy.
</non_goals>
<completion_criteria>
- Focused rule and integration tests pass; typechecks and relevant broader checks run with baseline failures identified.
- Documentation references resolve; objective state records implementation, validation, and limitations.
</completion_criteria>
