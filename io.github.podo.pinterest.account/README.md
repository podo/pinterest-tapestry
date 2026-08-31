Follow your Pinterest boards and pins in Tapestry.

Choose **Board**, **All Pins**, or **Search My Pins**. Board mode reads the
newest pins from one of your boards. All Pins includes every pin you own across
boards. Search My Pins searches pins in your account.

For **Board**, enter a board URL, `username/board-slug`, or a numeric board ID.
Leave **Board** blank only when using All Pins or Search My Pins. For **Search
My Pins**, enter a query in the search field.

## Pinterest developer setup

1. [Register an app](https://developers.pinterest.com/docs/getting-started/connect-app/)
   at Pinterest for Developers.
2. Add `https://iconfactory.com/tapestry-oauth` as a redirect URI.
3. Request `boards:read`, `pins:read`, and `user_accounts:read` scopes.
4. Enter your App ID and App secret when Tapestry prompts for API keys during
   feed setup.
5. Authorize the connector with your Pinterest account.

Tapestry stores OAuth tokens in the device keychain. Pinterest API access may
require app review before production use outside the sandbox.

Feed loading is incremental and bounded so a large board history is not crawled
at startup.
