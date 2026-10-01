# Setup instructions for an agent

These steps set up simple-github-readme-stats for the user you are working with. Use the `gh` CLI for everything. Go step by step and stop to ask the user when a step says so.

Rules:

- Never print, echo, log or store the user's personal access token, and don't ask the user to paste it into the chat. The user sets it themselves (step 4).
- Never commit `.env` or any file that contains a token.
- Keep the user's choices about organizations private if they ask for that (step 5).

## 1. Check gh

```sh
gh auth status
```

If `gh` isn't logged in, ask the user to run `! gh auth login`. If the active token lacks the `gist` scope, ask them to run `! gh auth refresh -s gist`.

Get the login and use it as `<user>` from here on:

```sh
gh api user -q .login
```

## 2. Fork and clone

```sh
gh repo fork kboshold/simple-github-readme-stats --clone
cd simple-github-readme-stats
gh repo set-default <user>/simple-github-readme-stats
```

If the fork already exists, `gh` says so and clones it anyway. If a local clone already exists, `cd` into it and run `git pull` instead. The fork is `<user>/simple-github-readme-stats`, written `<fork>` below. After a fork `gh` targets the upstream repo by default. `set-default` points it at the fork, and the commands below also pass `-R <fork>` to be safe.

The fork is public. Anything in `stats.config.ts` can be seen by anyone.

## 3. Create the Gist

```sh
echo "placeholder" | gh gist create -f placeholder.md -d "GitHub stats cards" -
```

This creates a secret Gist. The command prints its URL. The last path segment is the Gist ID, written `<gistId>` below.

## 4. Token

The workflow needs a personal access token (classic) from the user. Fine-grained tokens and the `gh` token are not enough. Ask the user to:

1. Open <https://github.com/settings/tokens/new?scopes=read:user,repo,read:org,gist&description=readme-stats>. The scopes are already ticked. Pick an expiry date.
2. If an organization they want counted uses SAML SSO, open "Configure SSO" next to the new token and authorize it for that organization.
3. Store it as a secret on the fork by running this in their own terminal (or with the `!` prefix in Claude Code). It prompts for the value without showing it:

   ```sh
   gh secret set STATS_TOKEN -R <fork>
   ```

Wait until the user confirms. Check that the secret exists:

```sh
gh secret list -R <fork>
```

## 5. Organizations and excluded repos

Ask the user:

- Which organizations should count toward stars and languages? Only repos they can read are included.
- Should those organization names be visible in the public fork? If yes, put them in `orgs` in `stats.config.ts`. If no, store them as a comma-separated secret:

  ```sh
  gh secret set STATS_ORGS -R <fork> --body "org-one,org-two"
  ```

- Any repos to leave out? Same choice: `excludeRepos` in the config (public) or the `STATS_EXCLUDE_REPOS` secret as comma-separated `owner/name` entries (private).

Config values and secrets are merged, so both can be used.

## 6. Edit the config

Edit `stats.config.ts`. Set `username` to `<user>`, `gist.id` to `<gistId>`, and `orgs`/`excludeRepos` from step 5 (or `[]`). Leave the other options alone unless the user asks. The fields are described in `README.md` under Configuration.

```sh
git add stats.config.ts
git commit -m "chore: configure stats for <user>"
git push
```

## 7. Run the workflow

GitHub turns off workflows on new forks. Turn the update workflow on and start it:

```sh
gh workflow enable update.yml -R <fork>
gh workflow run update.yml -R <fork>
```

Find the run and wait for it:

```sh
gh run list -R <fork> --workflow update.yml -L 1
gh run watch <runId> -R <fork> --exit-status
```

If `enable` fails because Actions are off for the fork, ask the user to open `https://github.com/<fork>/actions` and click the button to enable workflows, then try again.

If the run fails, show the user the failing step with `gh run view <runId> -R <fork> --log-failed`. Common causes:

- `error[TOKEN_MISSING]` or `error[TOKEN_UNAUTHORIZED]`: the `STATS_TOKEN` secret is missing, wrong or expired.
- `error[CONFIG_INVALID]`: fix the listed fields in `stats.config.ts`.

## 8. Check the cards

Each of these should return HTTP 200 with an SVG:

```sh
for f in stats-dark stats-light top-langs-dark top-langs-light; do
  curl -sI "https://gist.githubusercontent.com/<user>/<gistId>/raw/$f.svg" | head -1
done
```

The placeholder file can be removed now:

```sh
gh gist edit <gistId> --remove placeholder.md
```

## 9. Embed

Show the user this snippet with `<user>` and `<gistId>` filled in:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://gist.githubusercontent.com/<user>/<gistId>/raw/stats-dark.svg">
  <img width="49%" alt="GitHub stats for '<user>'" src="https://gist.githubusercontent.com/<user>/<gistId>/raw/stats-light.svg">
</picture>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://gist.githubusercontent.com/<user>/<gistId>/raw/top-langs-dark.svg">
  <img width="49%" alt="Top languages for '<user>'" src="https://gist.githubusercontent.com/<user>/<gistId>/raw/top-langs-light.svg">
</picture>
```

Offer to add it to the user's profile README in the repo `<user>/<user>`. If they agree, clone that repo (create it with `gh repo create <user> --public --add-readme` if it doesn't exist), add the snippet where they want it, then commit and push.

From now on the workflow runs every three hours and updates the Gist.
