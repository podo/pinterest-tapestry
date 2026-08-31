const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repositoryRoot = path.resolve(__dirname, "..");
const connectorPath = path.join(repositoryRoot, "io.github.podo.pinterest.account", "plugin.js");
const source = fs.readFileSync(connectorPath, "utf8");
const userAccountFixture = fixture("user-account.json");
const boardsFixture = fixture("boards.json");
const boardPinsFixture = fixture("board-pins.json");

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8"));
}

async function flushTasks() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function runLoad(harness) {
  return new Promise((resolve, reject) => {
    const collected = [];
    harness.context.processError = reject;
    harness.context.processResults = (value, isComplete) => {
      if (Array.isArray(value) && value.length > 0) collected.push(...value);
      if (isComplete === true) resolve(collected);
    };
    harness.context.load();
  });
}

function createHarness(options = {}) {
  const storage = new Map();
  const requests = [];
  let resolveVerification;
  let resolveResults;
  let rejectOperation;
  const emitted = [];

  const verification = new Promise((resolve, reject) => {
    resolveVerification = resolve;
    rejectOperation = reject;
  });
  const results = new Promise((resolve, reject) => {
    resolveResults = resolve;
    rejectOperation = reject;
  });

  const context = {
    site: "https://api.pinterest.com",
    source: options.source || "Board",
    target: options.target || "designpinner/material-studies",
    search_query: options.search_query || "",
    show_description: options.show_description === undefined ? "on" : options.show_description,
    batch_size: options.batch_size || "50",
    console,
    URL,
    Item: {
      createWithUriDate(uri, date) {
        return { _kind: "Item", uri, date, attachments: null, author: null, body: null };
      }
    },
    Identity: {
      createWithName(name) {
        return { _kind: "Identity", name };
      }
    },
    MediaAttachment: {
      createWithUrl(url) {
        return { _kind: "MediaAttachment", url };
      }
    },
    LinkAttachment: {
      createWithUrl(url) {
        return { _kind: "LinkAttachment", url };
      }
    },
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      if (value == null) storage.delete(key);
      else storage.set(key, value);
    },
    sendRequest(url) {
      requests.push({ url });
      if (options.requestError) return Promise.reject(options.requestError);

      let body = "";
      let status = 200;
      if (url.includes("/v5/user_account")) {
        body = JSON.stringify(userAccountFixture);
      } else if (url.includes("/v5/boards?")) {
        body = JSON.stringify(boardsFixture);
      } else if (url.includes("/v5/boards/") && url.includes("/pins")) {
        body = JSON.stringify(options.pinsResponse || boardPinsFixture);
      } else if (url.includes("/v5/pins?")) {
        body = JSON.stringify(options.pinsResponse || boardPinsFixture);
      } else if (url.includes("/v5/search/pins")) {
        body = JSON.stringify(options.pinsResponse || boardPinsFixture);
      } else {
        body = "{}";
      }

      return Promise.resolve(JSON.stringify({ status, headers: {}, body }));
    },
    processVerification(value) {
      resolveVerification(value);
    },
    processResults(value, isComplete) {
      if (value instanceof Array && value.length > 0) emitted.push(...value);
      if (isComplete === true) resolveResults(emitted.slice());
    },
    processError(error) {
      rejectOperation(error);
    }
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: connectorPath });
  return { context, requests, storage, verification, results, emitted };
}

test("parses board URLs, slugs, and numeric IDs", () => {
  const { context } = createHarness();
  assert.equal(context.parseBoardTarget("549755885175").boardId, "549755885175");
  const fromUrl = context.parseBoardTarget("https://www.pinterest.com/designpinner/material-studies/");
  assert.equal(fromUrl.username, "designpinner");
  assert.equal(fromUrl.slug, "material-studies");
  const fromSlug = context.parseBoardTarget("designpinner/material-studies");
  assert.equal(fromSlug.username, "designpinner");
  assert.equal(fromSlug.slug, "material-studies");
});

test("verify resolves a board feed and caches the board id", async () => {
  const harness = createHarness();
  harness.context.verify();
  const verification = await harness.verification;
  assert.equal(verification.displayName, "Material Studies · Pinterest");
  assert.equal(verification.icon, "https://i.pinimg.com/400x300/board-cover.jpg");
  assert.equal(harness.storage.get("pinterest-account-v1:board-id"), "549755885175");
  assert.match(harness.requests[0].url, /\/v5\/user_account$/);
  assert.match(harness.requests[1].url, /\/v5\/boards\?/);
});

test("load maps pins to media-first items with descriptions and links", async () => {
  const harness = createHarness();
  const items = await runLoad(harness);
  assert.equal(items.length, 2);
  assert.match(items[0].uri, /813744226420795884/);
  assert.equal(items[0].attachments.length, 2);
  assert.equal(items[0].attachments[0].url, "https://i.pinimg.com/1200x/pin-main.jpg");
  assert.equal(items[0].attachments[1].url, "https://example.com/source");
  assert.match(items[0].body, /Joinery inspiration/);
  assert.equal(items[0].author.username, "@designpinner");
});

test("load stops at the incremental cutoff on later refreshes", async () => {
  const harness = createHarness();
  const configKey = "pinterest-account-v1:state:Board:designpinner/material-studies::newest";
  harness.storage.set(configKey, String(new Date("2026-08-28T09:00:00Z").getTime()));
  harness.storage.set("pinterest-account-v1:board-id", "549755885175");
  const items = await runLoad(harness);
  assert.equal(items.length, 1);
  assert.match(items[0].uri, /813744226420795884/);
});

test("verify requires a search query for Search My Pins", async () => {
  const harness = createHarness({ source: "Search My Pins", search_query: "" });
  const error = await new Promise((resolve) => {
    harness.context.processError = resolve;
    harness.context.verify();
  });
  assert.match(String(error), /search query/i);
});
