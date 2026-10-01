# Contributing

Thanks for wanting to help. This is a small library, so the process is light.

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

```bash
git clone https://github.com/chubas/schrodinger.git
cd schrodinger
npm install        # also builds dist/ (the `prepare` script)
npm test
```

Node 18 or later for development (the tooling needs it). The built package runs on older Node too; `npm run check:runtime` tests the built `dist/` on whichever Node you run it with, and CI runs it on 18, 20, 22 and 24.

The library is plain ES2020 with one runtime dependency. Please don't use newer runtime APIs or syntax in `src/` without a reason (check `npm run check:runtime` on an old Node), and keep the type declarations readable by TypeScript 4.5 (`CHECK_TS_VERSIONS="4.5 5.9" npm run check:package`).

## Everyday commands

| Command | What it does |
|---|---|
| `npm test` | unit tests (jest) |
| `npm run build` | builds `dist/` (ESM, CJS, types, browser bundles) |
| `npm run lint` / `npm run lint:fix` | eslint + prettier check / fix |
| `npm run stress-test` | 1000 seeds on the isometric tileset; `--help` lists options |
| `npm run check:package` | packs the library and uses the tarball as a consumer would |
| `npm run check:runtime` | smoke-tests the built `dist/` on the Node you're running |

Formatting is prettier's (`.prettierrc`); `npm run lint:fix` does it for you.

## Changing the engine

The engine is verified more strictly than ordinary code, because a change that looks harmless can alter which solution a given seed produces, or break the undo machinery in a way only rare backtracking paths reveal. `stress-test/` exists for that:

1. Before you start, on a clean checkout of the branch you're branching from, record baselines: `npm run stress-test:record`. (Baselines are local and git-ignored. They are fingerprints of every step of every run, so they are specific to the code that produced them.)
2. Make your change.
3. `npm run stress-test:compare` re-runs the same seeds and reports any seed whose run differs.

A pure refactor or optimization should report **no** differences. A deliberate behavior change (a new search strategy, say) will report some; explain in the pull request which seeds changed and why that is expected, and re-record the baselines. `docs/how-it-works.md` describes what the stress test checks.

The stress test also validates every solution independently of the engine, and `--check-invariants` recomputes the propagation state from scratch after every step. CI runs smaller versions of both.

## Pull requests

- Keep them focused; say what changed and why.
- Add a test for new behavior. A type-level test (see `tests/Types.test.ts`) is the right kind for API types.
- Update the README or `docs/` if behavior or API changes, and add a line to `CHANGELOG.md`.
- `npm run lint` and `npm test` must pass.

## Reporting bugs

Runs are deterministic once seeded, so the most useful report is the smallest tiles, grid, options and `seed` that show the problem. The issue template asks for exactly that.

## License

The project is licensed under the [LGPL-2.1](LICENSE). By contributing you agree that your contributions are licensed under the same terms.

## Releasing

For maintainers:

1. Make sure `main` is green in CI and `npm run check:package` passes locally.
2. Move the entries under the changelog's top heading to a new version heading with today's date, and set `version` in `package.json` (`npm version <patch|minor|major> --no-git-tag-version`).
3. Commit, then tag: `git tag v<version>` and `git push --tags`.
4. `npm publish` (the `prepare` and `prepublishOnly` scripts build the package and run the tests first).
5. Update the pinned version in the README's CDN snippet to the new release.

The browser builds are served automatically by jsDelivr and unpkg from the published package.
