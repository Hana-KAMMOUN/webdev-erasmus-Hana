# Usage

One row per agent session. In Gemini CLI, type `/stats` before you quit and copy the input and output tokens. Copilot shows credits instead of tokens: write those in the credits column. The free tier charges nothing, so record what the session **would cost at the provider's published list price**, and note once below the table which price list you used. Leave the cost empty for rows that only show credits.

| Date | Tool | Input tokens | Output tokens | Credits (if no tokens) | List-price cost |
|---|---|---|---|---|---|
| 2026-10-17 | Gemini CLI — gemini-3.5-flash-lite | 37283 | 61 | N/A | ~$0.011337 |
| 2026-10-17 | Gemini CLI — gemini-3.5-flash-lite | 25221 | 55 | N/A | ~$0.007704 |
| 2026-10-28 | Gemini CLI — gemini-3.5-flash-lite | 25905 | 97 | N/A | ~$0.008014 |
| 2026-10-28 | Gemini CLI — gemini-3.5-flash-lite | 287710 | 7728 | N/A | ~$0.105633 |
| 2026-10-30 | Gemini CLI — gemini-3.5-flash-lite | 1278800 | 12829 | N/A | ~$0.415712 |
| 2026-10-31 | Gemini CLI — gemini-3.5-flash-lite | 2424043 | 41058 | N/A | ~$0.829858 |
| 2026-11-01 | Gemini CLI — gemini-3.5-flash-lite | 4515312 | 22515 | N/A | ~$1.410881 |

Session 2026-10-28: the CLI also reported 10,147 cache-read tokens.

*List-price estimation method:* Hypothetical token-only estimates use the Google Gemini Developer API Standard paid-tier rates for gemini-3.5-flash-lite, consulted on 2026-11-03: USD 0.30 per million input tokens and USD 2.50 per million output tokens. Formula: (input tokens × 0.30 + output tokens × 2.50) / 1,000,000. These estimates do not apply cache discounts and exclude separately billed tools and cache storage. They are not actual charges. Source: https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite
