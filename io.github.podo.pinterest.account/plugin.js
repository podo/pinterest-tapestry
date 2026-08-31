const API_VERSION = "v5";
const PINTEREST_WEB = "https://www.pinterest.com";
const PINTEREST_ICON = "https://www.pinterest.com/favicon.ico";
const STATE_PREFIX = "pinterest-account-v1:state:";
const BOARD_ID_KEY = "pinterest-account-v1:board-id";
const ACCOUNT_KEY = "pinterest-account-v1:account";
const MAX_BACKFILL_PAGES = 6;

function stringValue(value) {
  return value == null ? "" : String(value);
}

function nonEmpty(value) {
  const text = stringValue(value).trim();
  return text.length > 0 ? text : null;
}

function apiBase() {
  const base = stringValue(typeof site === "undefined" ? "https://api.pinterest.com" : site).replace(/\/$/, "");
  return `${base}/${API_VERSION}`;
}

function configuration() {
  return {
    source: normalizeSource(typeof source === "undefined" ? null : source),
    target: stringValue(typeof target === "undefined" ? "" : target).trim(),
    searchQuery: stringValue(typeof search_query === "undefined" ? "" : search_query).trim(),
    showDescription: typeof show_description === "undefined" || show_description === "on",
    batchSize: batchSizeValue()
  };
}

function batchSizeValue() {
  const parsed = Number.parseInt(stringValue(typeof batch_size === "undefined" ? "50" : batch_size), 10);
  if (parsed === 25 || parsed === 50 || parsed === 100) return parsed;
  return 50;
}

function stateKey(config) {
  return `${STATE_PREFIX}${config.source}:${config.target.toLowerCase()}:${config.searchQuery.toLowerCase()}`;
}

function apiRequest(path, method, parameters, extraHeaders) {
  const url = path.startsWith("http")
    ? path
    : `${apiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  return sendRequest(url, method || "GET", parameters, extraHeaders || null, true)
    .then(parseApiResponse)
    .catch((error) => {
      throw normalizeApiError(error);
    });
}

function parseApiResponse(text) {
  if (text == null) return null;
  let envelope;
  try {
    envelope = typeof text === "string" ? JSON.parse(text) : text;
  } catch (_) {
    throw new Error("Pinterest returned an unreadable response.");
  }

  if (envelope != null && typeof envelope.status === "number" && Object.prototype.hasOwnProperty.call(envelope, "body")) {
    if (envelope.status === 401 || envelope.status === 403) {
      const error = new Error("Pinterest authorization failed or expired. Reconnect the feed in Tapestry settings.");
      error.authorization = true;
      throw error;
    }
    if (envelope.status < 200 || envelope.status >= 300) {
      throw new Error(errorMessageFromBody(envelope.body, `Pinterest request failed (${envelope.status}).`));
    }
    if (!envelope.body) return {};
    try {
      return JSON.parse(envelope.body);
    } catch (_) {
      return envelope.body;
    }
  }

  if (envelope != null && envelope.code != null && envelope.message != null) {
    throw new Error(String(envelope.message));
  }

  return envelope;
}

function errorMessageFromBody(body, fallback) {
  if (typeof body !== "string" || body.length === 0) return fallback;
  try {
    const payload = JSON.parse(body);
    if (payload != null && typeof payload === "object") {
      if (nonEmpty(payload.message)) return String(payload.message);
      if (nonEmpty(payload.error && payload.error.message)) return String(payload.error.message);
      if (nonEmpty(payload.error)) return String(payload.error);
    }
  } catch (_) {
    // Keep the generic message when an error body is not JSON.
  }
  return fallback;
}

function normalizeApiError(error) {
  if (error == null) return new Error("Pinterest request failed.");
  if (typeof error === "string") return new Error(error);
  if (error.message) return error;
  return new Error("Pinterest request failed.");
}

function normalizeSource(value) {
  const normalized = stringValue(value).trim().toLowerCase();
  if (normalized === "board") return "Board";
  if (normalized === "all pins" || normalized === "all") return "All Pins";
  if (normalized === "search my pins" || normalized === "search") return "Search My Pins";
  throw new Error("Choose Board, All Pins, or Search My Pins.");
}

function slugifyBoardName(name) {
  return stringValue(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseBoardTarget(value) {
  const trimmed = stringValue(value).trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    return { boardId: trimmed };
  }

  const urlMatch = trimmed.match(/pinterest\.com\/([^/?#]+)\/([^/?#]+)/i);
  if (urlMatch) {
    return {
      username: decodeURIComponent(urlMatch[1]).toLowerCase(),
      slug: decodeURIComponent(urlMatch[2]).toLowerCase()
    };
  }

  const parts = trimmed.split("/").filter((part) => part.length > 0);
  if (parts.length >= 2) {
    return {
      username: parts[0].toLowerCase(),
      slug: parts.slice(1).join("-").toLowerCase()
    };
  }

  return { slug: trimmed.toLowerCase() };
}

function boardMatchesTarget(board, target) {
  if (target.boardId != null) return String(board.id) === String(target.boardId);
  const boardSlug = slugifyBoardName(board.name);
  if (target.slug != null && boardSlug === target.slug) return true;
  if (target.slug != null && boardSlug.includes(target.slug)) return true;
  return false;
}

function listBoardsPage(bookmark) {
  let path = `/boards?page_size=250`;
  if (nonEmpty(bookmark)) path += `&bookmark=${encodeURIComponent(bookmark)}`;
  return apiRequest(path);
}

function resolveBoard(targetValue) {
  const target = parseBoardTarget(targetValue);
  if (target == null) {
    return Promise.reject(new Error("Enter a board URL, username/board-slug, or board ID."));
  }

  function search(bookmark) {
    return listBoardsPage(bookmark).then((payload) => {
      const items = payload && payload.items instanceof Array ? payload.items : [];
      for (const board of items) {
        if (boardMatchesTarget(board, target)) return board;
      }
      if (nonEmpty(payload.bookmark)) return search(payload.bookmark);
      throw new Error("Could not find that board in your Pinterest account.");
    });
  }

  return search(null);
}

function readStoredAccount() {
  const stored = getItem(ACCOUNT_KEY);
  if (!nonEmpty(stored)) return null;
  try {
    return JSON.parse(stored);
  } catch (_) {
    return null;
  }
}

function storeAccount(account) {
  if (account == null) return;
  setItem(ACCOUNT_KEY, JSON.stringify({
    username: account.username || null,
    profile_image: account.profile_image || null
  }));
}

function readNewest(config) {
  const stored = getItem(stateKey(config) + ":newest");
  if (!nonEmpty(stored)) return null;
  const millis = Number.parseInt(stored, 10);
  if (Number.isNaN(millis)) return null;
  return new Date(millis);
}

function storeNewest(config, date) {
  if (date == null) return;
  setItem(stateKey(config) + ":newest", String(date.getTime()));
}

function verify() {
  let config;
  try {
    config = configuration();
    if (config.source === "Board" && !nonEmpty(config.target)) {
      throw new Error("Enter a board URL, username/board-slug, or board ID.");
    }
    if (config.source === "Search My Pins" && !nonEmpty(config.searchQuery)) {
      throw new Error("Enter a search query for Search My Pins.");
    }
  } catch (error) {
    processError(error);
    return;
  }

  apiRequest("/user_account")
    .then((account) => {
      storeAccount(account);
      if (config.source === "Board") {
        return resolveBoard(config.target).then((board) => {
          setItem(BOARD_ID_KEY, String(board.id));
          const icon = boardCoverUrl(board) || account.profile_image || PINTEREST_ICON;
          processVerification({
            displayName: `${board.name} · Pinterest`,
            icon
          });
        });
      }

      setItem(BOARD_ID_KEY, null);
      const displayName = nonEmpty(account.username)
        ? `@${account.username} · Pinterest`
        : "Pinterest";
      processVerification({
        displayName,
        icon: account.profile_image || PINTEREST_ICON
      });
    })
    .catch(processError);
}

function load() {
  let config;
  try {
    config = configuration();
    if (config.source === "Board" && !nonEmpty(config.target) && !nonEmpty(getItem(BOARD_ID_KEY))) {
      throw new Error("Enter a board URL, username/board-slug, or board ID.");
    }
    if (config.source === "Search My Pins" && !nonEmpty(config.searchQuery)) {
      throw new Error("Enter a search query for Search My Pins.");
    }
  } catch (error) {
    processError(error);
    return;
  }

  loadPins(config)
    .then((state) => {
      if (state.emitted === false) processResults([], false);
      processResults([], true);
    })
    .catch(processError);
}

function loadPins(config) {
  const cutoff = readNewest(config);
  const state = { emitted: false, itemCount: 0, newestDate: null, seen: {} };
  return loadPinPage(config, cutoff, state, null, 1).then(() => {
    if (state.newestDate != null) storeNewest(config, state.newestDate);
    return state;
  });
}

function loadPinPage(config, cutoff, state, bookmark, page) {
  if (state.itemCount >= config.batchSize || page > MAX_BACKFILL_PAGES) {
    return Promise.resolve();
  }

  return pinsEndpoint(config, bookmark, config.batchSize)
    .then((payload) => {
      const items = payload && payload.items instanceof Array ? payload.items : [];
      const results = [];
      let stop = false;

      for (const pin of items) {
        const date = pinDate(pin);
        if (cutoff != null && date != null && date <= cutoff) {
          stop = true;
          continue;
        }
        if (date != null && (state.newestDate == null || date > state.newestDate)) {
          state.newestDate = date;
        }

        const item = itemFromPin(pin, config);
        if (item == null) continue;
        const identity = stringValue(item.uri);
        if (state.seen[identity]) continue;
        state.seen[identity] = true;
        results.push(item);
        state.itemCount += 1;
        if (state.itemCount >= config.batchSize) break;
      }

      if (results.length > 0) {
        processResults(results, false);
        state.emitted = true;
      }

      if (stop || state.itemCount >= config.batchSize || page >= MAX_BACKFILL_PAGES) {
        return null;
      }
      if (!nonEmpty(payload.bookmark)) return null;
      return loadPinPage(config, cutoff, state, payload.bookmark, page + 1);
    });
}

function pinsEndpoint(config, bookmark, pageSize) {
  const size = Math.min(pageSize, 100);
  let path;

  if (config.source === "Board") {
    const boardId = nonEmpty(getItem(BOARD_ID_KEY));
    if (!boardId) {
      return resolveBoard(config.target).then((board) => {
        setItem(BOARD_ID_KEY, String(board.id));
        return pinsEndpoint(config, bookmark, pageSize);
      });
    }
    path = `/boards/${encodeURIComponent(boardId)}/pins?page_size=${size}`;
  } else if (config.source === "Search My Pins") {
    path = `/search/pins?query=${encodeURIComponent(config.searchQuery)}&page_size=${size}`;
  } else {
    path = `/pins?page_size=${size}`;
  }

  if (nonEmpty(bookmark)) path += `&bookmark=${encodeURIComponent(bookmark)}`;
  return apiRequest(path);
}

function pinDate(pin) {
  if (pin == null || !nonEmpty(pin.created_at)) return null;
  const date = new Date(pin.created_at);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pinUri(pin) {
  if (pin == null || !nonEmpty(pin.id)) return PINTEREST_WEB;
  return `${PINTEREST_WEB}/pin/${encodeURIComponent(String(pin.id))}/`;
}

function itemFromPin(pin, config) {
  if (pin == null || !nonEmpty(pin.id)) return null;
  const date = pinDate(pin);
  if (date == null) return null;

  const item = Item.createWithUriDate(pinUri(pin), date);
  const author = identityFromPin(pin);
  if (author != null) item.author = author;

  const attachments = mediaAttachmentsForPin(pin);
  if (attachments.length > 0) item.attachments = attachments;

  if (config.showDescription) {
    const body = pinBody(pin);
    if (nonEmpty(body)) item.body = body;
  }

  const outbound = nonEmpty(pin.link);
  if (outbound != null && typeof LinkAttachment !== "undefined") {
    const link = LinkAttachment.createWithUrl(outbound);
    if (nonEmpty(pin.title)) link.title = String(pin.title);
    link.siteName = safeHostname(outbound);
    if (!item.attachments) item.attachments = [];
    item.attachments.push(link);
  }

  return item;
}

function identityFromPin(pin) {
  const owner = pin.board_owner;
  const username = owner && nonEmpty(owner.username)
    ? String(owner.username)
    : (readStoredAccount() && readStoredAccount().username) || null;
  const name = owner && nonEmpty(owner.username) ? `@${owner.username}` : "Pinterest";
  const identity = Identity.createWithName(name);
  if (username != null) identity.username = `@${username}`;
  identity.uri = username != null ? `${PINTEREST_WEB}/${encodeURIComponent(username)}/` : PINTEREST_WEB;
  const avatar = (owner && nonEmpty(owner.profile_image)) || (readStoredAccount() && readStoredAccount().profile_image);
  if (avatar) identity.avatar = avatar;
  return identity;
}

function pinBody(pin) {
  const parts = [];
  if (nonEmpty(pin.title)) parts.push(`<p><strong>${escapeHtml(pin.title)}</strong></p>`);
  if (nonEmpty(pin.description)) parts.push(`<p>${escapeHtml(pin.description).replace(/\r?\n/g, "<br>")}</p>`);
  if (nonEmpty(pin.alt_text)) parts.push(`<p>${escapeHtml(pin.alt_text)}</p>`);
  return parts.join("");
}

function mediaAttachmentsForPin(pin) {
  if (pin == null || pin.media == null || typeof MediaAttachment === "undefined") return [];
  const media = pin.media;
  const type = stringValue(media.media_type).toLowerCase();
  const attachments = [];

  if (type === "image" || type === "video") {
    const image = bestImage(media.images) || (nonEmpty(media.cover_image_url) ? { url: media.cover_image_url } : null);
    const attachment = imageAttachment(image);
    if (attachment != null) attachments.push(attachment);
  } else if (type === "multiple_images" || type === "multiple_mixed") {
    const items = media.items instanceof Array ? media.items : [];
    for (const entry of items) {
      const image = entry && (bestImage(entry.images) || (nonEmpty(entry.cover_image_url) ? { url: entry.cover_image_url } : null));
      const attachment = imageAttachment(image);
      if (attachment != null) attachments.push(attachment);
    }
  } else if (type === "multiple_videos") {
    const items = media.items instanceof Array ? media.items : [];
    for (const entry of items) {
      const image = entry && (bestImage(entry.images) || (nonEmpty(entry.cover_image_url) ? { url: entry.cover_image_url } : null));
      const attachment = imageAttachment(image);
      if (attachment != null) attachments.push(attachment);
    }
  }

  return attachments;
}

function imageAttachment(image) {
  if (image == null || !nonEmpty(image.url)) return null;
  const attachment = MediaAttachment.createWithUrl(String(image.url));
  attachment.mimeType = "image/jpeg";
  if (image.width != null && image.height != null) {
    attachment.aspectSize = { width: Number(image.width), height: Number(image.height) };
  }
  return attachment;
}

function bestImage(images) {
  if (images == null || typeof images !== "object") return null;
  const order = ["1200x", "600x", "400x300", "150x150"];
  for (const key of order) {
    if (images[key] != null && nonEmpty(images[key].url)) return images[key];
  }
  const keys = Object.keys(images);
  for (const key of keys) {
    if (images[key] != null && nonEmpty(images[key].url)) return images[key];
  }
  return null;
}

function boardCoverUrl(board) {
  if (board == null || board.media == null) return null;
  if (nonEmpty(board.media.image_cover_url)) return String(board.media.image_cover_url);
  const thumbnails = board.media.pin_thumbnail_urls;
  if (thumbnails instanceof Array && thumbnails.length > 0 && nonEmpty(thumbnails[0])) {
    return String(thumbnails[0]);
  }
  return null;
}

function safeHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (_) {
    return null;
  }
}

function escapeHtml(value) {
  return stringValue(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
