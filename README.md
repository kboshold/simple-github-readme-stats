# simple-github-readme-stats

A GitHub Actions workflow that renders your GitHub stats and top languages as SVG cards and uploads them to a Gist every hour. Your profile README loads the images straight from the Gist, so no server is needed.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://gist.githubusercontent.com/kboshold/ab2d9bf8ae29c3f61f892b67fb3282a2/raw/stats-dark.svg">
  <img width="49%" alt="GitHub stats for 'kboshold'" src="https://gist.githubusercontent.com/kboshold/ab2d9bf8ae29c3f61f892b67fb3282a2/raw/stats-light.svg">
</picture>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://gist.githubusercontent.com/kboshold/ab2d9bf8ae29c3f61f892b67fb3282a2/raw/top-langs-dark.svg">
  <img width="49%" alt="Top languages for 'kboshold'" src="https://gist.githubusercontent.com/kboshold/ab2d9bf8ae29c3f61f892b67fb3282a2/raw/top-langs-light.svg">
</picture>

The cards follow the look of [github-readme-stats](https://github.com/anuraghazra/github-readme-stats), with a rank ring and a short load animation. Because the token belongs to you, private repositories and private contributions are counted too.

## How it works

The workflow `.github/workflows/update.yml` runs at minute 17 of every hour, and you can also start it by hand. It runs three steps:

1. `pnpm data:fetch` asks the GitHub GraphQL API for your totals and languages and writes them to `.cache/data.json`.
2. `pnpm svg:render` turns that file into one SVG per card and theme in `dist/`: `stats-dark.svg`, `stats-light.svg`, `top-langs-dark.svg` and `top-langs-light.svg`.
3. `pnpm gist:push` compares `dist/` with the Gist and uploads only the files that changed. Other files in the Gist are left alone.

A last step runs `gh workflow enable update.yml` with the workflow's own token. GitHub turns off scheduled workflows after 60 days without repository activity, and this keeps the schedule alive.

`pnpm build` runs the fetch and render steps locally.

## Setup

1. Fork this repository.
2. Create a secret Gist at <https://gist.github.com>. Add any placeholder file, since a Gist can't be empty. Copy the Gist ID from the URL (the hex string after your user name).
3. Create a personal access token (classic) at <https://github.com/settings/tokens> with these scopes: `read:user`, `repo`, `read:org`, `gist`. See [Token scopes](#token-scopes).
4. If an organization you want counted uses SAML SSO, open the token's "Configure SSO" menu and authorize it for that organization.
5. In your fork, open Settings > Secrets and variables > Actions and add the token as the repository secret `STATS_TOKEN`. Optionally add `STATS_ORGS` and `STATS_EXCLUDE_REPOS` (see [Privacy](#privacy)).
6. Edit `stats.config.ts`: set `username` and `gist.id`, and add `orgs` or theme and card options if you want them. See [Configuration](#configuration).
7. Open the Actions tab, enable workflows for the fork if GitHub asks, then run "Update stats" with "Run workflow".
8. Add the [embed snippet](#embed) to your profile README, using your user name and Gist ID.

The placeholder file from step 2 stays in the Gist. You can delete it once the SVGs are there.

## Configuration

`stats.config.ts` exports the config through `defineConfig`. Only `username` and `gist.id` are required:

```ts
import { defineConfig } from "./src/config/index.ts";

export default defineConfig({
  username: "your-login",
  gist: { id: "your-gist-id" },
  cards: {
    topLangs: { hide: ["html", "css"] },
  },
});
```

Invalid values stop every command with `error[CONFIG_INVALID]` and a list of the bad fields.

### Config

| Field | Type | Default | Description |
| ----- | ---- | ------- | ----------- |
| `username` | string | required | GitHub login the cards are made for |
| `orgs` | string[] | `[]` | Organization logins whose repositories count for stars and languages. Merged with `STATS_ORGS` |
| `excludeRepos` | string[] | `[]` | `owner/name` entries left out of stars and languages. Merged with `STATS_EXCLUDE_REPOS` |
| `commitsWindow` | `"all"` or `"year"` | `"all"` | Count commits over the whole account lifetime or the last 365 days |
| `gist.id` | string | required | ID of the target Gist, 20 to 32 hex characters |
| `themes` | record of `Theme` | `{ dark: mocha, light: latte }` | One SVG set per entry. The key is the file name suffix and must match `^[a-z0-9-]+$` |
| `cards.stats` | `StatsCardOptions` | see below | Stats card |
| `cards.topLangs` | `TopLangsCardOptions` | see below | Top languages card |

### Theme

All colors are hex without `#`. `background` may have 8 digits for transparency; the other fields also accept 6 or 8 digits.

| Field | Used for | `dark` (Catppuccin Mocha) | `light` (Catppuccin Latte) |
| ----- | -------- | ------------------------- | -------------------------- |
| `title` | Card title | `cba6f7` | `8839ef` |
| `icon` | Stat icons | `89b4fa` | `1e66f5` |
| `text` | Labels, values, language names, rank letter | `cdd6f4` | `4c4f69` |
| `ring` | Rank ring | `89b4fa` | `1e66f5` |
| `border` | Card border | `45475a` | `bcc0cc` |
| `background` | Card background | `1e1e2e00` | `1e1e2e00` |

If you set `themes`, it replaces the defaults. List every theme you want rendered, for example `themes: { dark: { ... } }` renders only `stats-dark.svg` and `top-langs-dark.svg`.

### StatsCardOptions

| Field | Type | Default | Description |
| ----- | ---- | ------- | ----------- |
| `enabled` | boolean | `true` | Render this card |
| `width` | number | `437` | Width in px, 300 to 600. At least 420 while the rank ring is shown |
| `height` | number | unset | Minimum height in px, 150 to 400. The card is at least this tall; content stays at the top |
| `showIcons` | boolean | `true` | Show icons before the labels |
| `hide` | array of `"stars"`, `"commits"`, `"prs"`, `"issues"`, `"contributedTo"` | `[]` | Rows to hide |
| `hideRank` | boolean | `false` | Hide the rank ring |
| `title` | string | `<name>'s GitHub Stats` | Card title, used as is. The default uses your display name, or your login if no name is set |

### TopLangsCardOptions

| Field | Type | Default | Description |
| ----- | ---- | ------- | ----------- |
| `enabled` | boolean | `true` | Render this card |
| `width` | number | `320` | Width in px, 300 to 600. The second language column moves right as the card gets wider |
| `height` | number | unset | Minimum height in px, 150 to 400. The card is at least this tall; content stays at the top |
| `count` | number | `8` | Number of languages shown, 1 to 20 |
| `hide` | string[] | `[]` | Language names to drop, case-insensitive |
| `title` | string | `Most Used Languages` | Card title |

## Token scopes

Use one personal access token (classic), created by the user the cards are for.

| Scope | Needed for |
| ----- | ---------- |
| `read:user` | Profile and contribution data |
| `repo` | Stars, languages and contributions from private repositories |
| `read:org` | Repositories of organizations you are a member of |
| `gist` | Updating the Gist |

Where the token is read:

| Where | Variable | Source |
| ----- | -------- | ------ |
| Workflow | `GH_TOKEN` | Repository secret `STATS_TOKEN` |
| Local | `GH_TOKEN` | `.env` (gitignored, see `.env.example`) |

Only `data:fetch`, `gist:push` and the preview's refresh button use the token. `svg:render` does not.

Use the same classic token locally and in the workflow. Other tokens, such as the one from `gh auth token`, can be blocked from organization data by organization policy and then give different commit and review numbers.

`repo` grants write access to all your repositories. Keep the token only in the Actions secret and your local `.env`, and give it an expiry date you will remember.

## Embed

Add this to your profile README and replace `{username}` and `{gistId}`:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://gist.githubusercontent.com/{username}/{gistId}/raw/stats-dark.svg">
  <img width="49%" alt="GitHub stats for '{username}'" src="https://gist.githubusercontent.com/{username}/{gistId}/raw/stats-light.svg">
</picture>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://gist.githubusercontent.com/{username}/{gistId}/raw/top-langs-dark.svg">
  <img width="49%" alt="Top languages for '{username}'" src="https://gist.githubusercontent.com/{username}/{gistId}/raw/top-langs-light.svg">
</picture>
```

Each card takes 49% of the row. Give both cards the same `width` and `height` in the config so they line up, for example `width: 437` and `height: 195` on `cards.topLangs` to match the default stats card. A height of 195 fits up to 8 languages. With a higher `count` the top languages card grows taller, so set `cards.stats.height` to the same height.

The URL pattern for any file is `https://gist.githubusercontent.com/{username}/{gistId}/raw/{file}`. Leaving out the revision in the URL always serves the latest version.

## Local preview

Requires Node 24 and pnpm.

```sh
pnpm install
cp .env.example .env   # then set GH_TOKEN
pnpm dev               # or: zaps up
```

Open <http://localhost:5173>. The page shows every card in every theme. Reloading replays the animations, and edits to templates, themes or `stats.config.ts` show up without a new API request.

On first start the server fetches data if `.cache/data.json` is missing and a token is set. Without a token it uses the committed sample data in `fixtures/data.json`. The "Refresh data" button fetches fresh data from GitHub.

Other commands:

| Command | What it does |
| ------- | ------------ |
| `pnpm data:fetch` | Fetch data into `.cache/data.json` |
| `pnpm svg:render` | Render `dist/*.svg`. `--data fixtures/data.json` renders from the sample data |
| `pnpm gist:push --dry-run` | List the files that would change in the Gist, without uploading |
| `pnpm check`, `pnpm typecheck`, `pnpm test` | Biome, TypeScript and Vitest |

## Privacy

- Repository and organization names are never written to `.cache/data.json`, `dist/`, the logs or the Gist. Only totals and language sums are stored.
- `orgs` and `excludeRepos` in `stats.config.ts` are public in your fork. Organization logins you don't want to show go into the `STATS_ORGS` secret instead, as a comma-separated list. Private repositories to leave out go into `STATS_EXCLUDE_REPOS` as comma-separated `owner/name` entries. Both are merged with the config values. Locally, put them in `.env`.
- The totals still show roughly how much private work you do. That is on purpose. Check that you are fine with it before you publish the cards.
- The workflow has no `pull_request` trigger, so code from other people's pull requests never runs with your token.

## Limits

- The commit total is an estimate. GitHub doesn't report private commits on their own; they are mixed with private pull requests, issues and reviews. The tool subtracts what it can identify, so the result depends on what the token can see. A classic token with organization access sees more private commits directly and gets closer to the real number.
- Cards can be up to about one hour old, plus up to 5 minutes of caching on the Gist raw host. GitHub may also start scheduled runs several minutes late.
- Every repository of an organization in `orgs` or `STATS_ORGS` that your token can read counts for stars and languages, even ones you never touched. Forks are left out of languages but count for stars. Use `excludeRepos` to drop repositories.
- When the token expires, runs fail with `error[TOKEN_UNAUTHORIZED]` and the cards stop updating. Create a new token and update `STATS_TOKEN`.
- Text width is not measured exactly. Very long display names or language names can overflow the card.

## Manual check after setup

- [ ] Run "Update stats" from the Actions tab and wait for a green run.
- [ ] Open the four raw URLs (`stats-dark.svg`, `stats-light.svg`, `top-langs-dark.svg`, `top-langs-light.svg`) in a browser. Each shows a card and plays its animation.
- [ ] Open your profile README in light mode and in dark mode. Each mode shows the matching cards.
- [ ] Run the workflow again. The push step prints `up to date` if nothing changed.
