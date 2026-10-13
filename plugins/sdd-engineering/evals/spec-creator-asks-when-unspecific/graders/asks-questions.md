---
type: llm
---

The request given to the spec-writing agent was deliberately vague ("make our checkout better").

PASS if the final reply asks between 2 and 4 short clarifying questions (for example what "better" means, which part of
checkout, what decision this serves) and stops, ideally offering a likeliest-reading default, WITHOUT producing a spec.

FAIL if it writes or outlines a full spec, invents requirements, or asks more than ~5 questions.
