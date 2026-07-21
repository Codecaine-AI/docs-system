# Intro

The most powerful ability of our species is the ability to transfer of knowledge from one mind to another

- This allowing so the next mind is able to pick up where the previous left off.

Every leap in that technology shortened the distance between minds. 

- Spoken / Physical language

  - Transmission of knowledge from person to person

    - 1 to 1 knowledge transfer

    - Don't eat this berry, it kill you

- Written language 

  - Mass transmission capability

    - 1 to many possiblility

    - Knowledge can outlive the author

      - IE, don't need to tell everyone not to eat the berry

- Diagrams

  - 1 to many

  - Conveys an idea

  - Cross languages

- The Internet 

  - Near free access to all the information around the world

  - New forms of media allowed for various flavors of 1 to many and many to many distribution

- AI 

  - Gives us the ability to sift through the mountains of information

# The Issue

In the age of AI, the ideas we need to represent are rapidly gaining in complexity

- Before a system could be service that needs to balance users and such

- Now everything is becoming and massively complex autonomous distributed system

Simple mermaid diagrams and hacky flowcharts done in Excalibur no longer fit the bill required to do these massive projects.

Further, as AI integrates to greater and greater capacities in our workflows, it can introduce slop and drift that we need to be able to fight against. 

We need to be able to clearly represent ideas about what the system is designed to do so that the AI will follow our desired intent. 

# The Gap

In the physical disciplines, the knowledge is written down.

- A car ships with a repair manual that can walk a stranger from symptom to torque spec. 

- A building leaves drawings detailed enough to renovate it a century later. 

- etc

Software does not have this

- Most software is API reference

- You are lucky if there is a single diagram in the docs

There were two excuses

- The pace of change of code was near impossible to keep the docs up to date

  - Many people working on project, the intent drifts

  - Everyone needs to know how to use the docs tools 

- The tools were never built for it

  - Most diagramming and docs tools are half baked as it wasn't a huge priority given the above

Agents ended both. 

- Agents can easily upkeep the docs as you make changes

- Tooling can now be easily made as what was once a whole product, has turned into a side project

# Why we Need This

2 major shifts have happened with the advent of AI

1. One builder is now able to (and should be) working on multiple projects at a time

2. The projects you work on have meaningfully scaled in complexity

They can carry the upkeep — and they raised the stakes, because one builder now runs several projects at once, each with the complexity that used to take a team. 

Comprehensive documentation has become a non negotiatable.

## Trust is the point

Agents will continue to write more and more code. 

That only scales on trust.

Trust does not come from reviewing diffs faster.

Trust comes from knowing that the outputted code will match the initial intent you gave to the system. 

The underpinning idea here is our current documentation pieces do not actually fully capture our design and intent, and thus agents fail to be effective

- It is not their fault though as they are provided inferior intent

- Written down, that turns autonomy from drift into expansion — the system builds on your design decisions instead of guessing past them.

Slop is what intent transfer looks like when it fails. 

- An agent that cannot find the why fills the gap with plausible guesses, and plausible guesses compound. 

- The fix is not a stricter reviewer at the end of the pipeline; it is a sharper definition at the top. 

- Defining the identity of the software

  - Exactly, durably, in a form both kinds of readers consume well — is the work this system is built for.

---

# The Conviction

The docs are the durable artifact. The code is the current projection. 

When they disagree, the right question is not which file is newer — it is where the intent is most clearly preserved.

When a better model arrives next year, hand it Foundation and System Design and you should get a better implementation back, with nothing lost in the handoff. 

That is the bet: intent outlives any one projection.

References: 

- [Specs are the New Code](https://www.youtube.com/watch?v=8rABwKRsec4) (Sean Grove)

- [Advanced Context Engineering for Coding Agents](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents) (Dex Horthy).
