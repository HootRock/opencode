Actual before/after OpenTUI fixture captures for anomalyco/opencode#57059.

Same 100x30 terminal, 30 user/assistant pairs, tail mount budget, scrolled with Prompt 28 just above the viewport, then first previous-user-message command. Before: jumps to Prompt 11. After: Prompt 28.

Source base: f394d9d410bc6bb7cafcebfc5e3180a9b80ebed9. Frames were captured from createAppFixture running the real TUI, rendered to PNG with Consolas. SDK/provider requests were local fixtures; no live model calls.
