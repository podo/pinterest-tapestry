const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repositoryRoot = path.resolve(__dirname, "..");
const connectorDir = path.join(repositoryRoot, "io.github.podo.pinterest.account");

test("plugin-config.json parses and includes OAuth settings", () => {
  const config = JSON.parse(fs.readFileSync(path.join(connectorDir, "plugin-config.json"), "utf8"));
  assert.equal(config.id, "io.github.podo.pinterest.account");
  assert.equal(config.site, "https://api.pinterest.com");
  assert.equal(config.oauth_authorize, "https://www.pinterest.com/oauth/");
  assert.equal(config.oauth_token, "https://api.pinterest.com/v5/oauth/token");
  assert.equal(config.oauth_basic_auth, true);
  assert.equal(config.oauth_http_redirect, true);
  assert.equal(config.needs_api_keys, true);
  assert.match(config.oauth_scope, /boards:read/);
  assert.match(config.oauth_scope, /pins:read/);
});

test("ui-config.json exposes feed, board, and search inputs", () => {
  const ui = JSON.parse(fs.readFileSync(path.join(connectorDir, "ui-config.json"), "utf8"));
  const names = ui.inputs.map((input) => input.name);
  assert.deepEqual(names, ["source", "target", "search_query", "show_description", "batch_size"]);
  const source = ui.inputs.find((input) => input.name === "source");
  assert.match(source.choices, /Board/);
  assert.match(source.choices, /All Pins/);
  assert.match(source.choices, /Search My Pins/);
});
