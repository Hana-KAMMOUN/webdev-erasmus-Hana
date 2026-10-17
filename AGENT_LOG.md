# Agent log

One entry per agent session, newest at the bottom. Be honest: what went wrong is the useful part.

<!-- Copy this block for each session:

## YYYY-MM-DD · <short title>
- Goal:
- Delegated:
- Checkpoints:
- Went wrong:
- Changed by hand:

-->

## 2026-10-16 · MCP tool test with precise description
- Goal: Test whether Gemini CLI can automatically select and use the `find_lecture` MCP tool with its original precise description.
- Delegated: Asked Gemini: `What does lecture 7 cover?` without mentioning the tool name.
- Checkpoints: Verified `/mcp` showed `my-project` as Ready with 2 tools. Gemini selected `find_lecture`, made 1 successful tool call, and the session showed a 100% success rate.
- Went wrong: No MCP error occurred during this session.
- Changed by hand: No server logic was changed. I only recorded the result and the session statistics.

## 2026-10-16 · MCP description experiment
- Goal: Test whether changing only the description of the `find_lecture` tool affects Gemini's tool selection.
- Delegated: Changed the `find_lecture` description to a more generic one, then asked Gemini the exact same question: `What does lecture 7 cover?`
- Checkpoints: Gemini still selected `find_lecture`, made 1 successful tool call, and the session showed a 100% success rate.
- Went wrong: No MCP error occurred. The change in description did not affect the tool selected for this question.
- Changed by hand: I temporarily changed only the `find_lecture` description for the experiment, then restored the original precise description after the test.