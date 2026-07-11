# cf-npm-private-registry

A self-hosted npm registry for private packages that runs entirely on Cloudflare Workers, with D1 for metadata and R2 for tarballs.

**The goal: let you host scoped private npm packages without paying.** npm charges per user per month for private packages. This registry runs comfortably inside Cloudflare's free tier (Workers, D1, and R2 all have generous free quotas, and R2 has no egress fees), so a small team can publish and install private packages for free.

## What you get

- A real npm registry: `npm install`, `npm publish`, `npm view`, `npm deprecate`, `npm dist-tag`, and `npm unpublish` all work against it.
- A password-protected web UI to create packages and manage tokens. The password check uses Cloudflare's built-in constant-time comparison (`crypto.subtle.timingSafeEqual`).
- Per-package access tokens with three permission levels: read only (install), write only (publish), or read and write. Each package can have as many tokens as you like, and every token is scoped to exactly one package.
- Tokens are stored as SHA-256 hashes and shown exactly once at creation.
- No proxying of the public registry by default. Requests for packages you do not host return 404 unless you opt in (see [Proxying the public registry](#proxying-the-public-registry)).

## How it works

Package names must be scoped (`@yourscope/yourpackage`). That is what makes the "no proxy" setup work: your projects keep installing everything else from the public npm registry, and only requests for your scope go to this one.

- **Workers** serve both the npm protocol endpoints and the admin UI (an Astro + Vue app).
- **D1** stores packages, versions, dist-tags, and token hashes.
- **R2** stores the package tarballs.

## Deploy

You need a Cloudflare account (the free plan is fine) and `node >= 22`.

```sh
git clone https://github.com/Calvin-LL/cf-npm-private-registry.git
cd cf-npm-private-registry
npm install
npx wrangler login
```

1. Create the D1 database and copy the printed `database_id` into `wrangler.jsonc` (replace `REPLACE_WITH_YOUR_D1_DATABASE_ID`):

   ```sh
   npx wrangler d1 create npm-registry
   ```

2. Create the R2 bucket:

   ```sh
   npx wrangler r2 bucket create npm-registry-tarballs
   ```

3. Create the tables:

   ```sh
   npx wrangler d1 migrations apply npm-registry --remote
   ```

4. Set the admin password for the web UI:

   ```sh
   npx wrangler secret put ADMIN_PASSWORD
   ```

5. Build and deploy:

   ```sh
   npm run build
   npx wrangler deploy
   ```

Open the printed `*.workers.dev` URL (or put a custom domain in front of it) and log in with your admin password.

## Usage

### 1. Create a package and a token in the UI

Log in, create a package like `@yourscope/yourpackage`, then generate tokens for it on the package page:

- a **read** token for machines that install it,
- a **write** token for CI that publishes it,
- or a **read and write** token for local development.

The token value is shown once. Copy it immediately.

### 2. Point npm at your registry for your scope

Add two lines to the `.npmrc` of any project that uses the package (next to its `package.json`, or in `~/.npmrc` for your whole machine):

```ini
@yourscope:registry=https://your-registry.workers.dev/
//your-registry.workers.dev/:_authToken=cfnpm_your_token_here
```

The first line tells npm to fetch everything under `@yourscope` from your registry; all other packages still come from the public npm registry. The second line attaches your token to every request npm makes to that host. The package page in the UI shows this snippet prefilled for you.

For CI, keep the token out of the repo by referencing an environment variable instead:

```ini
@yourscope:registry=https://your-registry.workers.dev/
//your-registry.workers.dev/:_authToken=${NPM_TOKEN}
```

### 3. Install

```sh
npm install @yourscope/yourpackage
```

pnpm, yarn, and bun read the same `.npmrc` settings and work too.

### 4. Publish

In the repo of the package itself, with a write token in its `.npmrc`:

```sh
npm publish
```

Note that the package must first be created in the UI: tokens belong to packages, so there is nothing to authenticate against before it exists. Version conflicts are rejected (you cannot overwrite an already-published version), and `npm publish --tag beta`, `npm deprecate`, `npm dist-tag`, and `npm unpublish` behave like they do on the public registry.

## Proxying the public registry

By default this registry only answers for the packages it hosts; anything else gets a 404. That is intentional, because the recommended per-scope `.npmrc` setup never sends other requests here anyway.

If you want to point npm at this registry for **everything** (a single `registry=` line instead of a scoped one), enable upstream proxying by setting the `PROXY_UPSTREAM` variable to `"true"` in `wrangler.jsonc` (or in the Cloudflare dashboard) and redeploying:

```jsonc
"vars": {
  "PROXY_UPSTREAM": "true",
  "UPSTREAM_REGISTRY": "https://registry.npmjs.org"
}
```

Requests for unknown packages (and npm audit calls) are then forwarded to `UPSTREAM_REGISTRY` without your credentials. Your private packages are still served locally and still require tokens.

## Security notes

- The admin password is compared in constant time using `crypto.subtle.timingSafeEqual`, and UI sessions are signed HMAC cookies derived from it. Changing the password invalidates all sessions.
- Registry tokens are random 256-bit values, stored only as SHA-256 hashes. The UI shows a short prefix so you can tell tokens apart later.
- A token only ever grants access to the single package it was created for, limited to the read or write permissions you picked.
- Everything (packuments and tarballs included) requires a token; nothing about your private packages is publicly readable.

## Local development

```sh
npm install
cp .dev.vars.example .dev.vars   # set ADMIN_PASSWORD
npx wrangler d1 migrations apply npm-registry --local
npm run dev                      # UI + registry on http://localhost:4321
```

`npm run build && npm run preview` runs the built worker in workerd, which is closest to production. Useful scripts: `npm run check` (typecheck), `npm run format` (prettier).

## Limits worth knowing

- Workers request bodies are capped at 100 MB on the free plan, and the tarball is base64-encoded inside the publish request, so packages up to roughly 75 MB publish fine. The public npm registry itself rejects anything over about 256 MB.
- D1 and R2 free quotas (5 GB database storage, 10 GB object storage, and generous daily read/write allowances) are far beyond what a small team's private packages need.
- `npm login` against this registry is intentionally unsupported; create tokens in the UI instead.

## License

MIT
