#!/bin/sh
# The driver's --worktree-setup for a docs-system target, run once in the builder's worktree with HILL_CLIMB_APP (the
# docs-system checkout inside a Core checkout) and HILL_CLIMB_RUN set. The sealed builder reaches nothing outside the
# worktree, so this copies and never links out. It makes the worktree stand in for Core:
#   - node_modules: Core's hoisted install, copied with its relative links, so @codecaine-ai/text-measure
#     (../../canvas/packages/text-measure) and the other workspace links resolve inside the worktree;
#   - canvas, sequence, annotations, design-system: the sibling repos those links reach, copied without .git;
#   - docs-system -> . : a link inside the worktree, so ../../docs-system/packages/* reaches the builder's own packages;
#   - each nested node_modules under packages/.
# Each name it adds goes in .git/info/exclude, so no builder commit holds it. It uses only POSIX sh, cp and tar.
set -eu
core=$(cd "$HILL_CLIMB_APP/.." && pwd)
[ -d "$core/node_modules/@codecaine-ai" ] || { echo "No Core install at $core/node_modules. Run bun install in Core first." >&2; exit 1; }
added="node_modules docs-system"
rm -rf node_modules
cp -R "$core/node_modules" node_modules
for repo in canvas sequence annotations design-system; do
  rm -rf "$repo"
  mkdir "$repo"
  (cd "$core/$repo" && tar -c --exclude=./.git -f - .) | (cd "$repo" && tar -x -f -)
  added="$added $repo"
done
ln -sfn . docs-system
for d in "$HILL_CLIMB_APP"/packages/*/node_modules; do
  [ -d "$d" ] || continue
  rel=${d#"$HILL_CLIMB_APP"/}
  rm -rf "$rel"
  cp -R "$d" "$rel"
  added="$added $rel"
done
for name in $added; do grep -qxF "/$name" .git/info/exclude 2>/dev/null || echo "/$name" >> .git/info/exclude; done
echo "worktree-setup: copied $added"
