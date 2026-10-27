To plan your game, Claude needs a way to pay. Two ways:

**Elo Pros credits, nothing to paste.** Sign in with GitHub at https://elopros.com/login.html (the account that owns this repo), add credits at https://elopros.com/dev-console.html#credits, then close this issue and reopen it. Claude is charged by the token, from your balance.

**Your own Claude usage.** A plan costs about as much as a long chat.

1. Get one of these:
   - an API key from https://console.anthropic.com (Settings > API keys), or
   - if you have a Claude plan (Pro or Max): install Claude Code and run `claude setup-token`, which prints a token.
2. In this repo: **Settings > Secrets and variables > Actions > New repository secret**. Name it `ANTHROPIC_API_KEY` for an API key, or `CLAUDE_CODE_OAUTH_TOKEN` for the token, and paste it in.
3. Let Actions open pull requests: **Settings > Actions > General > Workflow permissions**, tick "Allow GitHub Actions to create and approve pull requests", and Save.
4. Close this issue and reopen it. The plan starts again.

No key? The dev console on Elo Pros (https://elopros.com/dev-console.html, "Plan it") asks the same questions and writes the same three files for you to commit, with no key and no sign-in.
