An agent meets the same document as rendered markdown and writes through typed operations. 

This page states the read contract and the write contract.

## Reading

```bash
docs render 10-system-design/10-doc-standards/10-structure
docs grep "depth ladder"
```
> **L1 (Render):** Prints the doc as stable markdown — title, then body.
> **L2 (Grep):** Searches every doc as its rendered text, not its bytes.

- The render is part of the contract: every doc's markdown is pinned byte-for-byte by golden tests.

- Structure is greppable

  - Headings, labeled callouts, and reference names are all plain text in the render.

## Writing

- Writes are typed operations addressed by block id — never text patches. The mutation model defines them.

- Hash preconditions and draft locks keep concurrent writers off each other.

- Every save is validated before anything persists; an invalid write is rejected whole, and the file is untouched.

## Why

- **Agents live in text**

  - Plain markdown through plain commands

    - No special tooling between the agent and the docs, and nothing to learn beyond the shell.

- **Typed writes cannot corrupt**

  - An operation is validated against the schema before it lands.

  - A text patch could break the state in ways a reader only finds later; a rejected op breaks nothing.
