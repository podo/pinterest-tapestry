# Pinterest connectors for Tapestry

This repository contains third-party connectors that bring Pinterest content into
[Tapestry](https://tapestry.iconfactory.com/).

## Pinterest

`io.github.podo.pinterest.account` follows pins from one of your boards, all pins
you own, or a search across your account using the official Pinterest API v5.

### Install

1. Download `Pinterest.tapestry` from the latest release.
2. Open Tapestry and go to **Settings → Connectors → Add a Connector**.
3. Select the downloaded file and create a feed.

### Pinterest developer setup

1. [Register an app](https://developers.pinterest.com/docs/getting-started/connect-app/)
   at Pinterest for Developers.
2. Add `https://iconfactory.com/tapestry-oauth` as a redirect URI.
3. Request `boards:read`, `pins:read`, and `user_accounts:read`.
4. Enter your App ID and App secret when Tapestry prompts for API keys.
5. Authorize the connector with your Pinterest account.

### Feed modes

- **Board** — newest pins from one of your boards
- **All Pins** — every pin you own across boards
- **Search My Pins** — search within your own pins

Board mode accepts a board URL, `username/board-slug`, or numeric board ID.

### Development

Open the directory containing `io.github.podo.pinterest.account` as the
Connectors Folder in Tapestry Loom. Automated tests use Node.js 20 or newer:

```sh
npm test
npm run package
```

The build writes `dist/Pinterest.tapestry`.

GitHub Actions runs tests on every push and pull request. Changing `VERSION` on
`main` creates a matching GitHub release with the installable connector attached.

## Sources

- [Tapestry connector API](https://github.com/TheIconfactory/Tapestry/blob/main/Documentation/API.md)
- [Pinterest API v5](https://developers.pinterest.com/docs/api/v5/introduction/)

## License

MIT
