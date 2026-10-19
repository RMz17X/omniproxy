// node_modules/@hono/node-server/dist/constants-BLSFu_RU.mjs
var X_ALREADY_SENT = "x-hono-already-sent";

// node_modules/@hono/node-server/dist/index.mjs
import { STATUS_CODES, ServerResponse, createServer } from "node:http";
import { Http2ServerRequest, constants } from "node:http2";
import { Readable } from "node:stream";

// node_modules/hono/dist/helper/websocket/index.js
var defineWebSocketHelper = (handler2) => {
  return (...args) => {
    if (typeof args[0] === "function") {
      const [createEvents, options] = args;
      return async function upgradeWebSocket2(c, next) {
        const result = await handler2(c, await createEvents(c), options);
        if (result) return result;
        await next();
      };
    } else {
      const [c, events, options] = args;
      return (async () => {
        const upgraded = await handler2(c, events, options);
        if (!upgraded) throw new Error("Failed to upgrade WebSocket");
        return upgraded;
      })();
    }
  };
};

// node_modules/@hono/node-server/dist/index.mjs
var RequestError = class extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "RequestError";
  }
};
var nonJoinedHeaders = /* @__PURE__ */ new Set([
  "age",
  "authorization",
  "content-length",
  "content-type",
  "etag",
  "expires",
  "from",
  "host",
  "if-modified-since",
  "if-unmodified-since",
  "last-modified",
  "location",
  "max-forwards",
  "proxy-authorization",
  "referer",
  "retry-after",
  "server",
  "user-agent"
]);
var validHeaderName = /^[!#$%&'*+\-.^_`|~\dA-Za-z]+$/;
var isHttpWhitespace = (code) => code === 9 || code === 10 || code === 13 || code === 32;
var normalizeHeaderValue = (value) => {
  if (!isHttpWhitespace(value.charCodeAt(0)) && !isHttpWhitespace(value.charCodeAt(value.length - 1))) return value;
  let start = 0;
  let end = value.length;
  while (start < end && isHttpWhitespace(value.charCodeAt(start))) start++;
  while (end > start && isHttpWhitespace(value.charCodeAt(end - 1))) end--;
  return value.slice(start, end);
};
var forbiddenHeaderValue = /[\0\r\n]/;
var GlobalHeaders = globalThis.Headers;
var materializeHeaders = (rawHeaders, HeadersCtor = GlobalHeaders) => {
  const headers = new HeadersCtor();
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const name = rawHeaders[i];
    if (!name.startsWith(":")) headers.append(name, rawHeaders[i + 1]);
  }
  return headers;
};
var RequestHeaders = class {
  #incoming;
  #rawHeaders;
  #headers;
  #invalidValue;
  constructor(incoming) {
    this.#incoming = incoming;
    if (incoming instanceof Http2ServerRequest) this.#rawHeaders = incoming.rawHeaders.slice();
  }
  get #lazyRawHeaders() {
    return this.#rawHeaders ??= this.#incoming.rawHeaders.slice();
  }
  get #native() {
    if (!this.#headers) {
      this.#headers = materializeHeaders(this.#lazyRawHeaders);
      this.#rawHeaders = void 0;
    }
    return this.#headers;
  }
  #normalizedName(name) {
    if (typeof name !== "string") return;
    if (!validHeaderName.test(name)) throw new TypeError(`Invalid header name: ${name}`);
    return name.toLowerCase();
  }
  #lookupHttp1(lowerName) {
    const headers = this.#incoming instanceof Http2ServerRequest ? void 0 : this.#incoming.headers;
    if (!headers || nonJoinedHeaders.has(lowerName) || lowerName === "set-cookie" || lowerName === "__proto__") return;
    if (!Object.hasOwn(headers, lowerName)) return null;
    const rawValue = headers[lowerName];
    if (typeof rawValue === "string") {
      const value = normalizeHeaderValue(rawValue);
      return forbiddenHeaderValue.test(value) ? void 0 : value;
    }
  }
  #lookup(rawHeaders, lowerName) {
    const separator = lowerName === "cookie" ? "; " : ", ";
    let value = null;
    for (let i = 0; i < rawHeaders.length; i += 2) {
      const rawName = rawHeaders[i];
      if (rawName.length === lowerName.length && rawName.toLowerCase() === lowerName) {
        const rawValue = normalizeHeaderValue(rawHeaders[i + 1]);
        if (forbiddenHeaderValue.test(rawValue)) {
          this.#invalidValue = true;
          return;
        }
        value = value === null ? rawValue : value + separator + rawValue;
      }
    }
    return value;
  }
  append(name, value) {
    this.#native.append(name, value);
  }
  delete(name) {
    this.#native.delete(name);
  }
  get(name) {
    const lowerName = this.#normalizedName(name);
    if (lowerName && !this.#headers && !this.#invalidValue) {
      const http1Value = this.#lookupHttp1(lowerName);
      if (http1Value !== void 0) return http1Value;
      const value = this.#lookup(this.#lazyRawHeaders, lowerName);
      if (value !== void 0) return value;
    }
    return this.#native.get(name);
  }
  has(name) {
    const lowerName = this.#normalizedName(name);
    if (lowerName && !this.#headers && !this.#invalidValue) {
      const http1Value = this.#lookupHttp1(lowerName);
      if (http1Value !== void 0) return http1Value !== null;
      const value = this.#lookup(this.#lazyRawHeaders, lowerName);
      if (value !== void 0) return value !== null;
    }
    return this.#native.has(name);
  }
  set(name, value) {
    this.#native.set(name, value);
  }
  getSetCookie() {
    return this.#native.getSetCookie();
  }
  keys() {
    return this.#native.keys();
  }
  values() {
    return this.#native.values();
  }
  entries() {
    return this.#native.entries();
  }
  forEach(callback, thisArg) {
    this.#native.forEach((value, key) => {
      callback.call(thisArg, value, key, this);
    });
  }
  [Symbol.iterator]() {
    return this.entries();
  }
};
Object.defineProperty(RequestHeaders.prototype, Symbol.for("nodejs.util.inspect.custom"), { value: function(depth, options, inspectFn) {
  return `Headers (lightweight) ${inspectFn(Object.fromEntries(this), {
    ...options,
    depth: depth == null ? null : depth - 1
  })}`;
} });
Object.setPrototypeOf(RequestHeaders.prototype, GlobalHeaders.prototype);
var newHeadersFromIncoming = (incoming) => globalThis.Headers === GlobalHeaders ? new RequestHeaders(incoming) : materializeHeaders(incoming.rawHeaders, globalThis.Headers);
var reValidRequestUrl = /^\/[!#$&-;=?-\[\]_a-z~]*$/;
var reDotSegment = /\/\.\.?(?:[/?#]|$)/;
var reValidHost = /^[a-z0-9._-]+(?::(?:[1-5]\d{3,4}|[6-9]\d{3}))?$/;
var buildUrl = (scheme, host, incomingUrl) => {
  const url = `${scheme}://${host}${incomingUrl}`;
  if (!reValidHost.test(host)) {
    const urlObj = new URL(url);
    if (urlObj.hostname.length !== host.length && urlObj.hostname !== (host.includes(":") ? host.replace(/:\d+$/, "") : host).toLowerCase()) throw new RequestError("Invalid host header");
    return urlObj.href;
  } else if (incomingUrl.length === 0) return url + "/";
  else {
    if (incomingUrl.charCodeAt(0) !== 47) throw new RequestError("Invalid URL");
    if (!reValidRequestUrl.test(incomingUrl) || reDotSegment.test(incomingUrl)) return new URL(url).href;
    return url;
  }
};
var toRequestError = (e) => {
  if (e instanceof RequestError) return e;
  return new RequestError(e.message, { cause: e });
};
var GlobalRequest = global.Request;
var Request$1 = class extends GlobalRequest {
  constructor(input, options) {
    if (typeof input === "object" && getRequestCache in input) {
      const hasReplacementBody = options !== void 0 && "body" in options && options.body != null;
      if (input[bodyConsumedDirectlyKey] && !hasReplacementBody) throw new TypeError("Cannot construct a Request with a Request object that has already been used.");
      input = input[getRequestCache]();
    }
    if (typeof options?.body?.getReader !== "undefined") options.duplex ??= "half";
    super(input, options);
  }
};
var wrapBodyStream = Symbol("wrapBodyStream");
var byteExactEncodings = /* @__PURE__ */ new Set([
  "latin1",
  "binary",
  "hex",
  "base64",
  "base64url"
]);
var isByteExactEncoding = (encoding) => encoding === null || byteExactEncodings.has(encoding);
var bodyBufferedBeforeDisconnectKey = Symbol("bodyBufferedBeforeDisconnect");
var bodyBufferedLengthBeforeDisconnectKey = Symbol("bodyBufferedLengthBeforeDisconnect");
var toBufferChunk = (chunk, encoding) => Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding ?? "utf8");
var isRecoverableDisconnectedIncoming = (incoming) => !(incoming instanceof Http2ServerRequest) && !!incoming.complete && !!incoming.readableAborted && typeof incoming.read === "function" && isByteExactEncoding(incoming.readableEncoding);
var recordBodyBufferedBeforeDisconnect = (incoming) => {
  if (incoming.readableDidRead || !isRecoverableDisconnectedIncoming(incoming)) return;
  const incomingWithRecovery = incoming;
  incomingWithRecovery[bodyBufferedLengthBeforeDisconnectKey] ??= incoming.readableLength;
};
var readBodyBufferedBeforeDisconnect = (incoming, chunks) => {
  if (incoming.readableDidRead && !chunks || !isRecoverableDisconnectedIncoming(incoming)) return;
  const incomingWithRecovery = incoming;
  if (incomingWithRecovery[bodyBufferedBeforeDisconnectKey] !== void 0) return incomingWithRecovery[bodyBufferedBeforeDisconnectKey];
  let result;
  const errored = incoming.errored;
  if (errored && errored.code !== "ECONNRESET") result = errored;
  else if (incomingWithRecovery[bodyBufferedLengthBeforeDisconnectKey] !== void 0 && incoming.readableLength !== incomingWithRecovery[bodyBufferedLengthBeforeDisconnectKey]) result = newBodyUnusableError();
  else {
    const bodyChunks = chunks ?? [];
    const chunk = incoming.read();
    if (chunk !== null) bodyChunks.push(toBufferChunk(chunk, incoming.readableEncoding));
    const buffer = bodyChunks.length === 1 ? bodyChunks[0] : Buffer.concat(bodyChunks);
    result = buffer;
    const contentLength = incoming.headers["content-length"];
    if (typeof contentLength === "string" && /^\d+$/.test(contentLength)) {
      const expectedLength = Number(contentLength);
      if (Number.isSafeInteger(expectedLength) && buffer.length !== expectedLength) result = newBodyUnusableError();
    }
  }
  incomingWithRecovery[bodyBufferedBeforeDisconnectKey] = result;
  return result;
};
var enqueueBufferedBody = (controller, buffered) => {
  if (buffered instanceof Error) {
    controller.error(buffered);
    return;
  }
  if (buffered.length > 0) controller.enqueue(buffered);
  controller.close();
};
var newRequestFromIncoming = (method, url, headers, incoming, abortController) => {
  const init = {
    method,
    headers,
    signal: abortController.signal
  };
  if (method === "TRACE") {
    init.method = "GET";
    const req = new Request$1(url, init);
    Object.defineProperty(req, "method", { get() {
      return "TRACE";
    } });
    return req;
  }
  if (!(method === "GET" || method === "HEAD")) if ("rawBody" in incoming && incoming.rawBody instanceof Buffer) init.body = new ReadableStream({ start(controller) {
    controller.enqueue(incoming.rawBody);
    controller.close();
  } });
  else if (incoming[wrapBodyStream]) {
    let reader;
    init.body = new ReadableStream({ async pull(controller) {
      try {
        if (!reader) {
          const buffered = readBodyBufferedBeforeDisconnect(incoming);
          if (buffered !== void 0) {
            enqueueBufferedBody(controller, buffered);
            return;
          }
        }
        reader ||= Readable.toWeb(incoming).getReader();
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    } });
  } else {
    const buffered = readBodyBufferedBeforeDisconnect(incoming);
    if (buffered !== void 0) init.body = new ReadableStream({ start(controller) {
      enqueueBufferedBody(controller, buffered);
    } });
    else init.body = Readable.toWeb(incoming);
  }
  return new Request$1(url, init);
};
var getRequestCache = Symbol("getRequestCache");
var requestCache = Symbol("requestCache");
var incomingKey = Symbol("incomingKey");
var urlKey = Symbol("urlKey");
var methodKey = Symbol("methodKey");
var headersKey = Symbol("headersKey");
var abortControllerKey = Symbol("abortControllerKey");
var getAbortController = Symbol("getAbortController");
var abortRequest = Symbol("abortRequest");
var bodyBufferKey = Symbol("bodyBuffer");
var bodyReadPromiseKey = Symbol("bodyReadPromise");
var bodyConsumedDirectlyKey = Symbol("bodyConsumedDirectly");
var bodyLockReaderKey = Symbol("bodyLockReader");
var abortReasonKey = Symbol("abortReason");
var newBodyUnusableError = () => {
  return /* @__PURE__ */ new TypeError("Body is unusable");
};
var rejectBodyUnusable = () => {
  return Promise.reject(newBodyUnusableError());
};
var textDecoder = new TextDecoder();
var consumeBodyDirectOnce = (request) => {
  if (request[bodyConsumedDirectlyKey]) return rejectBodyUnusable();
  request[bodyConsumedDirectlyKey] = true;
};
var toArrayBuffer = (buf) => {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};
var contentType = (request) => {
  return (request[headersKey] ||= newHeadersFromIncoming(request[incomingKey])).get("content-type") || "";
};
var methodTokenRegExp = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
var normalizeIncomingMethod = (method) => {
  if (typeof method !== "string" || method.length === 0) return "GET";
  switch (method) {
    case "DELETE":
    case "GET":
    case "HEAD":
    case "OPTIONS":
    case "PATCH":
    case "POST":
    case "PUT":
    case "QUERY":
      return method;
  }
  const upper = method.toUpperCase();
  switch (upper) {
    case "DELETE":
    case "GET":
    case "HEAD":
    case "OPTIONS":
    case "POST":
    case "PUT":
      return upper;
    default:
      return method;
  }
};
var validateDirectReadMethod = (method) => {
  if (!methodTokenRegExp.test(method)) return /* @__PURE__ */ new TypeError(`'${method}' is not a valid HTTP method.`);
  const normalized = method.toUpperCase();
  if (normalized === "CONNECT" || normalized === "TRACK" || normalized === "TRACE" && method !== "TRACE") return /* @__PURE__ */ new TypeError(`'${method}' HTTP method is unsupported.`);
};
var readBodyWithFastPath = (request, method, fromBuffer) => {
  if (request[bodyConsumedDirectlyKey]) return rejectBodyUnusable();
  const methodName = request.method;
  if (methodName === "GET" || methodName === "HEAD") return request[getRequestCache]()[method]();
  const methodValidationError = validateDirectReadMethod(methodName);
  if (methodValidationError) return Promise.reject(methodValidationError);
  if (request[requestCache]) {
    if (methodName !== "TRACE") return request[requestCache][method]();
  }
  const alreadyUsedError = consumeBodyDirectOnce(request);
  if (alreadyUsedError) return alreadyUsedError;
  const raw2 = readRawBodyIfAvailable(request);
  if (raw2) {
    const result = Promise.resolve(fromBuffer(raw2, request));
    request[bodyBufferKey] = void 0;
    return result;
  }
  return readBodyDirect(request).then((buf) => {
    const result = fromBuffer(buf, request);
    request[bodyBufferKey] = void 0;
    return result;
  });
};
var readRawBodyIfAvailable = (request) => {
  const incoming = request[incomingKey];
  if ("rawBody" in incoming && incoming.rawBody instanceof Buffer) return incoming.rawBody;
};
var normalizeAbortError = (request, incoming) => {
  if (incoming.errored) return incoming.errored;
  const reason = request[abortReasonKey];
  if (reason !== void 0) return reason instanceof Error ? reason : new Error(String(reason));
  return /* @__PURE__ */ new Error("Client connection prematurely closed.");
};
var readBodyDirect = (request) => {
  if (request[bodyBufferKey]) return Promise.resolve(request[bodyBufferKey]);
  if (request[bodyReadPromiseKey]) return request[bodyReadPromiseKey];
  const incoming = request[incomingKey];
  if (incoming.readableDidRead) return rejectBodyUnusable();
  const buffered = readBodyBufferedBeforeDisconnect(incoming);
  if (buffered !== void 0) {
    if (buffered instanceof Error) return Promise.reject(buffered);
    request[bodyBufferKey] = buffered;
    return Promise.resolve(buffered);
  }
  const promise = new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const recoverCompleteBodyAfterDisconnect = (error) => {
      const streamError = incoming.errored ?? error;
      if (!isRecoverableDisconnectedIncoming(incoming) || streamError && streamError.code !== "ECONNRESET") return false;
      finish(() => {
        const recovered = readBodyBufferedBeforeDisconnect(incoming, chunks);
        if (recovered instanceof Error) reject(recovered);
        else if (recovered === void 0) reject(error ?? normalizeAbortError(request, incoming));
        else {
          request[bodyBufferKey] = recovered;
          resolve(recovered);
        }
      });
      return true;
    };
    const onData = (chunk) => {
      chunks.push(toBufferChunk(chunk, incoming.readableEncoding));
    };
    const onEnd = () => {
      finish(() => {
        const buffer = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
        request[bodyBufferKey] = buffer;
        resolve(buffer);
      });
    };
    const onError = (error) => {
      if (recoverCompleteBodyAfterDisconnect(error)) return;
      finish(() => {
        reject(error);
      });
    };
    const onClose = () => {
      if (incoming.readableEnded) {
        onEnd();
        return;
      }
      if (recoverCompleteBodyAfterDisconnect()) return;
      finish(() => {
        reject(normalizeAbortError(request, incoming));
      });
    };
    const cleanup = () => {
      incoming.off("data", onData);
      incoming.off("end", onEnd);
      incoming.off("error", onError);
      incoming.off("close", onClose);
      request[bodyReadPromiseKey] = void 0;
    };
    incoming.on("data", onData);
    incoming.on("end", onEnd);
    incoming.on("error", onError);
    incoming.on("close", onClose);
    queueMicrotask(() => {
      if (settled) return;
      if (incoming.readableEnded) onEnd();
      else if (incoming.errored) onError(incoming.errored);
      else if (incoming.destroyed) onClose();
    });
  });
  request[bodyReadPromiseKey] = promise;
  return promise;
};
var requestPrototype = {
  get method() {
    return this[methodKey];
  },
  get url() {
    return this[urlKey];
  },
  get headers() {
    return this[headersKey] ||= newHeadersFromIncoming(this[incomingKey]);
  },
  [abortRequest](reason) {
    if (this[abortReasonKey] === void 0) this[abortReasonKey] = reason;
    const abortController = this[abortControllerKey];
    if (abortController && !abortController.signal.aborted) abortController.abort(reason);
  },
  [getAbortController]() {
    this[abortControllerKey] ||= new AbortController();
    if (this[abortReasonKey] !== void 0 && !this[abortControllerKey].signal.aborted) this[abortControllerKey].abort(this[abortReasonKey]);
    return this[abortControllerKey];
  },
  [getRequestCache]() {
    const abortController = this[getAbortController]();
    if (this[requestCache]) return this[requestCache];
    const method = this.method;
    if (this[bodyConsumedDirectlyKey] && !(method === "GET" || method === "HEAD")) {
      this[bodyBufferKey] = void 0;
      const init = {
        method: method === "TRACE" ? "GET" : method,
        headers: this.headers,
        signal: abortController.signal
      };
      if (method !== "TRACE") {
        init.body = new ReadableStream({ start(c) {
          c.close();
        } });
        init.duplex = "half";
      }
      const req = new Request$1(this[urlKey], init);
      if (method === "TRACE") Object.defineProperty(req, "method", { get() {
        return "TRACE";
      } });
      return this[requestCache] = req;
    }
    return this[requestCache] = newRequestFromIncoming(this.method, this[urlKey], this.headers, this[incomingKey], abortController);
  },
  get body() {
    if (!this[bodyConsumedDirectlyKey]) return this[getRequestCache]().body;
    const request = this[getRequestCache]();
    if (!this[bodyLockReaderKey] && request.body) this[bodyLockReaderKey] = request.body.getReader();
    return request.body;
  },
  get bodyUsed() {
    if (this[bodyConsumedDirectlyKey]) return true;
    if (this[requestCache]) return this[requestCache].bodyUsed;
    return false;
  }
};
Object.defineProperty(requestPrototype, "signal", { get() {
  return this[getAbortController]().signal;
} });
[
  "cache",
  "credentials",
  "destination",
  "integrity",
  "mode",
  "redirect",
  "referrer",
  "referrerPolicy",
  "keepalive"
].forEach((k) => {
  Object.defineProperty(requestPrototype, k, { get() {
    return this[getRequestCache]()[k];
  } });
});
["clone", "formData"].forEach((k) => {
  Object.defineProperty(requestPrototype, k, { value: function() {
    if (this[bodyConsumedDirectlyKey]) {
      if (k === "clone") throw newBodyUnusableError();
      return rejectBodyUnusable();
    }
    return this[getRequestCache]()[k]();
  } });
});
Object.defineProperty(requestPrototype, "text", { value: function() {
  return readBodyWithFastPath(this, "text", (buf) => textDecoder.decode(buf));
} });
Object.defineProperty(requestPrototype, "arrayBuffer", { value: function() {
  return readBodyWithFastPath(this, "arrayBuffer", (buf) => toArrayBuffer(buf));
} });
Object.defineProperty(requestPrototype, "blob", { value: function() {
  return readBodyWithFastPath(this, "blob", (buf, request) => {
    const type = contentType(request);
    const init = type ? { headers: { "content-type": type } } : void 0;
    return new Response(buf, init).blob();
  });
} });
Object.defineProperty(requestPrototype, "json", { value: function() {
  if (this[bodyConsumedDirectlyKey]) return rejectBodyUnusable();
  return this.text().then(JSON.parse);
} });
Object.defineProperty(requestPrototype, Symbol.for("nodejs.util.inspect.custom"), { value: function(depth, options, inspectFn) {
  return `Request (lightweight) ${inspectFn({
    method: this.method,
    url: this.url,
    headers: this.headers,
    nativeRequest: this[requestCache]
  }, {
    ...options,
    depth: depth == null ? null : depth - 1
  })}`;
} });
Object.setPrototypeOf(requestPrototype, Request$1.prototype);
var newRequest = (incoming, defaultHostname) => {
  const req = Object.create(requestPrototype);
  req[incomingKey] = incoming;
  req[methodKey] = normalizeIncomingMethod(incoming.method);
  const incomingUrl = incoming.url || "";
  if (incomingUrl[0] !== "/" && (incomingUrl.startsWith("http://") || incomingUrl.startsWith("https://"))) {
    if (incoming instanceof Http2ServerRequest) throw new RequestError("Absolute URL for :path is not allowed in HTTP/2");
    try {
      req[urlKey] = new URL(incomingUrl).href;
    } catch (e) {
      throw new RequestError("Invalid absolute URL", { cause: e });
    }
    return req;
  }
  const host = (incoming instanceof Http2ServerRequest ? incoming.authority : incoming.headers.host) || defaultHostname;
  if (!host) throw new RequestError("Missing host header");
  let scheme;
  if (incoming instanceof Http2ServerRequest) {
    scheme = incoming.scheme;
    if (!(scheme === "http" || scheme === "https")) throw new RequestError("Unsupported scheme");
  } else scheme = incoming.socket && incoming.socket.encrypted ? "https" : "http";
  try {
    req[urlKey] = buildUrl(scheme, host, incomingUrl);
  } catch (e) {
    if (e instanceof RequestError) throw e;
    else throw new RequestError("Invalid URL", { cause: e });
  }
  return req;
};
var defaultContentType = "text/plain; charset=UTF-8";
var responseCache = Symbol("responseCache");
var getResponseCache = Symbol("getResponseCache");
var cacheKey = Symbol("cache");
var GlobalResponse = global.Response;
var Response$1 = class Response$12 {
  #body;
  #init;
  [getResponseCache]() {
    const cache2 = this[cacheKey];
    const liveHeaders = cache2 && cache2[2] instanceof Headers ? cache2[2] : void 0;
    delete this[cacheKey];
    return this[responseCache] ||= new GlobalResponse(this.#body, liveHeaders ? {
      status: this.#init?.status,
      statusText: this.#init?.statusText,
      headers: liveHeaders
    } : this.#init);
  }
  constructor(body, init) {
    let headers;
    this.#body = body;
    if (init instanceof GlobalResponse) {
      const cachedGlobalResponse = init[responseCache];
      if (cachedGlobalResponse) {
        this.#init = cachedGlobalResponse;
        this[getResponseCache]();
        return;
      }
      this.#init = init instanceof Response$12 ? init.#init : init;
      headers = new Headers(init.headers);
    } else this.#init = init;
    if (body == null || typeof body === "string" || typeof body?.getReader !== "undefined" || body instanceof Blob || body instanceof Uint8Array) this[cacheKey] = [
      init?.status || 200,
      body ?? null,
      headers || init?.headers
    ];
  }
  get headers() {
    const cache2 = this[cacheKey];
    if (cache2) {
      if (!(cache2[2] instanceof Headers)) cache2[2] = new Headers(cache2[2] || (cache2[1] === null ? void 0 : { "content-type": defaultContentType }));
      return cache2[2];
    }
    return this[getResponseCache]().headers;
  }
  get status() {
    return this[cacheKey]?.[0] ?? this[getResponseCache]().status;
  }
  get ok() {
    const status = this.status;
    return status >= 200 && status < 300;
  }
};
[
  "body",
  "bodyUsed",
  "redirected",
  "statusText",
  "trailers",
  "type",
  "url"
].forEach((k) => {
  Object.defineProperty(Response$1.prototype, k, { get() {
    return this[getResponseCache]()[k];
  } });
});
[
  "arrayBuffer",
  "blob",
  "clone",
  "formData",
  "json",
  "text"
].forEach((k) => {
  Object.defineProperty(Response$1.prototype, k, { value: function() {
    return this[getResponseCache]()[k]();
  } });
});
Object.defineProperty(Response$1.prototype, Symbol.for("nodejs.util.inspect.custom"), { value: function(depth, options, inspectFn) {
  return `Response (lightweight) ${inspectFn({
    status: this.status,
    headers: this.headers,
    ok: this.ok,
    nativeResponse: this[responseCache]
  }, {
    ...options,
    depth: depth == null ? null : depth - 1
  })}`;
} });
Object.setPrototypeOf(Response$1, GlobalResponse);
Object.setPrototypeOf(Response$1.prototype, GlobalResponse.prototype);
var validRedirectUrl = /^https?:\/\/[!#-;=?-[\]_a-z~A-Z]+$/;
var parseRedirectUrl = (url) => {
  if (url instanceof URL) return url.href;
  if (validRedirectUrl.test(url)) return url;
  return new URL(url).href;
};
var validRedirectStatuses = /* @__PURE__ */ new Set([
  301,
  302,
  303,
  307,
  308
]);
Object.defineProperty(Response$1, "redirect", {
  value: function redirect(url, status = 302) {
    if (!validRedirectStatuses.has(status)) throw new RangeError("Invalid status code");
    return new Response$1(null, {
      status,
      headers: { location: parseRedirectUrl(url) }
    });
  },
  writable: true,
  configurable: true
});
Object.defineProperty(Response$1, "json", {
  value: function json(data, init) {
    const body = JSON.stringify(data);
    if (body === void 0) throw new TypeError("The data is not JSON serializable");
    const initHeaders = init?.headers;
    let headers;
    if (initHeaders) {
      headers = new Headers(initHeaders);
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
    } else headers = { "content-type": "application/json" };
    return new Response$1(body, {
      status: init?.status ?? 200,
      statusText: init?.statusText,
      headers
    });
  },
  writable: true,
  configurable: true
});
async function readWithoutBlocking(readPromise) {
  return Promise.race([readPromise, Promise.resolve().then(() => Promise.resolve(void 0))]);
}
function writeFromReadableStreamDefaultReader(reader, writable, currentReadPromise) {
  const cancel = (error) => {
    reader.cancel(error).catch(() => {
    });
  };
  writable.on("close", cancel);
  writable.on("error", cancel);
  (currentReadPromise ?? reader.read()).then(flow, handleStreamError);
  return reader.closed.finally(() => {
    writable.off("close", cancel);
    writable.off("error", cancel);
  });
  function handleStreamError(error) {
    if (error) writable.destroy(error);
  }
  function onDrain() {
    reader.read().then(flow, handleStreamError);
  }
  function flow({ done, value }) {
    try {
      if (done) writable.end();
      else if (!writable.write(value)) writable.once("drain", onDrain);
      else return reader.read().then(flow, handleStreamError);
    } catch (e) {
      handleStreamError(e);
    }
  }
}
function writeFromReadableStream(stream, writable) {
  if (stream.locked) throw new TypeError("ReadableStream is locked.");
  else if (writable.destroyed) return;
  return writeFromReadableStreamDefaultReader(stream.getReader(), writable);
}
var buildOutgoingHttpHeaders = (headers, defaultContentType2) => {
  const res = {};
  if (!(headers instanceof Headers)) headers = new Headers(headers ?? void 0);
  if (headers.has("set-cookie")) {
    const cookies = [];
    for (const [k, v] of headers) if (k === "set-cookie") cookies.push(v);
    else res[k] = v;
    if (cookies.length > 0) res["set-cookie"] = cookies;
  } else for (const [k, v] of headers) res[k] = v;
  if (defaultContentType2) res["content-type"] ??= defaultContentType2;
  return res;
};
var outgoingEnded = Symbol("outgoingEnded");
var incomingDraining = Symbol("incomingDraining");
var DRAIN_TIMEOUT_MS = 500;
var MAX_DRAIN_BYTES = 64 * 1024 * 1024;
var drainIncoming = (incoming) => {
  const incomingWithDrainState = incoming;
  if (incoming.destroyed || incomingWithDrainState[incomingDraining]) return;
  incomingWithDrainState[incomingDraining] = true;
  if (incoming instanceof Http2ServerRequest) {
    try {
      incoming.stream?.close?.(constants.NGHTTP2_NO_ERROR);
    } catch {
    }
    return;
  }
  let bytesRead = 0;
  const cleanup = () => {
    clearTimeout(timer);
    incoming.off("data", onData);
    incoming.off("end", cleanup);
    incoming.off("error", cleanup);
  };
  const forceClose = () => {
    cleanup();
    const socket = incoming.socket;
    if (socket && !socket.destroyed) {
      if (typeof socket.destroySoon === "function") socket.destroySoon();
      else if (typeof socket.destroy === "function") socket.destroy();
    }
  };
  const timer = setTimeout(forceClose, DRAIN_TIMEOUT_MS);
  timer.unref?.();
  const onData = (chunk) => {
    bytesRead += chunk.length;
    if (bytesRead > MAX_DRAIN_BYTES) forceClose();
  };
  incoming.on("data", onData);
  incoming.on("end", cleanup);
  incoming.on("error", cleanup);
  incoming.resume();
};
var makeCloseHandler = (req, incoming, outgoing, needsBodyCleanup) => () => {
  if (incoming.errored) {
    recordBodyBufferedBeforeDisconnect(incoming);
    req[abortRequest](incoming.errored.toString());
  } else if (!outgoing.writableFinished || incoming instanceof Http2ServerRequest && incoming.aborted) {
    recordBodyBufferedBeforeDisconnect(incoming);
    req[abortRequest]("Client connection prematurely closed.");
  }
  if (needsBodyCleanup && !incoming.readableEnded) setTimeout(() => {
    if (!incoming.readableEnded) setTimeout(() => {
      drainIncoming(incoming);
    });
  });
};
var isImmediateCacheableResponse = (res) => {
  if (!(cacheKey in res)) return false;
  const body = res[cacheKey][1];
  return body === null || typeof body === "string" || body instanceof Uint8Array;
};
var handleRequestError = () => new Response(null, { status: 400 });
var handleFetchError = (e) => new Response(null, { status: e instanceof Error && (e.name === "TimeoutError" || e.constructor.name === "TimeoutError") ? 504 : 500 });
var handleResponseError = (e, outgoing) => {
  const err2 = e instanceof Error ? e : new Error("unknown error", { cause: e });
  if (err2.code === "ERR_STREAM_PREMATURE_CLOSE") console.info("The user aborted a request.");
  else {
    console.error(e);
    if (!outgoing.headersSent) {
      if (outgoing instanceof ServerResponse) outgoing._contentLength = null;
      outgoing.writeHead(500, { "Content-Type": "text/plain" });
    }
    outgoing.end(`Error: ${err2.message}`);
    outgoing.destroy(err2);
  }
};
var flushHeaders = (outgoing) => {
  if ("flushHeaders" in outgoing && outgoing.writable) outgoing.flushHeaders();
};
var trySetContentLength = (outgoing, status, length) => {
  const http1 = outgoing;
  if (http1._contentLength === null && http1._hasBody && http1.useChunkedEncodingByDefault && !http1._removedContLen && status >= 200 && status !== 204 && status !== 304 && !outgoing.hasHeader("content-length") && !outgoing.hasHeader("transfer-encoding") && !outgoing.hasHeader("trailer")) {
    http1._contentLength = length;
    return true;
  }
  return false;
};
var writeDefaultHeaders = (outgoing, status, length) => {
  if (trySetContentLength(outgoing, status, length)) outgoing.writeHead(status, { "Content-Type": defaultContentType });
  else outgoing.writeHead(status, {
    "Content-Type": defaultContentType,
    "Content-Length": length
  });
};
var responseViaCache = async (res, outgoing) => {
  let [status, body, header] = res[cacheKey];
  if (!header) {
    if (body === null) {
      outgoing.writeHead(status);
      outgoing.end();
    } else if (typeof body === "string") {
      writeDefaultHeaders(outgoing, status, Buffer.byteLength(body));
      outgoing.end(body);
    } else if (body instanceof Uint8Array) {
      writeDefaultHeaders(outgoing, status, body.byteLength);
      outgoing.end(body);
    } else if (body instanceof Blob) {
      writeDefaultHeaders(outgoing, status, body.size);
      outgoing.end(new Uint8Array(await body.arrayBuffer()));
    } else {
      outgoing.writeHead(status, { "Content-Type": defaultContentType });
      flushHeaders(outgoing);
      await writeFromReadableStream(body, outgoing)?.catch((e) => handleResponseError(e, outgoing));
    }
    outgoing[outgoingEnded]?.();
    return;
  }
  let hasContentLength = false;
  let plainHeaders = false;
  let canAutoLength = true;
  if (header instanceof Headers) {
    hasContentLength = header.has("content-length");
    header = buildOutgoingHttpHeaders(header, body === null ? void 0 : defaultContentType);
  } else if (Array.isArray(header)) {
    const headerObj = new Headers(header);
    hasContentLength = headerObj.has("content-length");
    header = buildOutgoingHttpHeaders(headerObj, body === null ? void 0 : defaultContentType);
  } else {
    plainHeaders = true;
    for (const key in header) {
      if (key.length === 14 && key.toLowerCase() === "content-length") {
        hasContentLength = true;
        break;
      }
      if (key.length === 17 && key.toLowerCase() === "transfer-encoding" || key.length === 7 && key.toLowerCase() === "trailer") canAutoLength = false;
    }
  }
  if (!hasContentLength) {
    let length;
    if (typeof body === "string") length = Buffer.byteLength(body);
    else if (body instanceof Uint8Array) length = body.byteLength;
    else if (body instanceof Blob) length = body.size;
    if (length !== void 0 && (!plainHeaders || !canAutoLength || !trySetContentLength(outgoing, status, length))) {
      if (plainHeaders) header = { ...header };
      header["Content-Length"] = length;
    }
  }
  outgoing.writeHead(status, header);
  if (body == null) outgoing.end();
  else if (typeof body === "string" || body instanceof Uint8Array) outgoing.end(body);
  else if (body instanceof Blob) outgoing.end(new Uint8Array(await body.arrayBuffer()));
  else {
    flushHeaders(outgoing);
    await writeFromReadableStream(body, outgoing)?.catch((e) => handleResponseError(e, outgoing));
  }
  outgoing[outgoingEnded]?.();
};
var isPromise = (res) => typeof res.then === "function";
var responseViaResponseObject = async (res, outgoing, options = {}) => {
  if (isPromise(res)) if (options.errorHandler) try {
    res = await res;
  } catch (err2) {
    const errRes = await options.errorHandler(err2);
    if (!errRes) return;
    res = errRes;
  }
  else res = await res.catch(handleFetchError);
  if (cacheKey in res) return responseViaCache(res, outgoing);
  const resHeaderRecord = buildOutgoingHttpHeaders(res.headers, res.body === null ? void 0 : defaultContentType);
  if (res.body) {
    const reader = res.body.getReader();
    const values = [];
    let done = false;
    let currentReadPromise = void 0;
    if (resHeaderRecord["transfer-encoding"] !== "chunked") {
      let maxReadCount = 2;
      for (let i = 0; i < maxReadCount; i++) {
        currentReadPromise ||= reader.read();
        const chunk = await readWithoutBlocking(currentReadPromise).catch((e) => {
          console.error(e);
          done = true;
        });
        if (!chunk) {
          if (i === 1) {
            await new Promise((resolve) => setTimeout(resolve));
            maxReadCount = 3;
            continue;
          }
          break;
        }
        currentReadPromise = void 0;
        if (chunk.value) values.push(chunk.value);
        if (chunk.done) {
          done = true;
          break;
        }
      }
      if (done && !("content-length" in resHeaderRecord)) resHeaderRecord["content-length"] = values.reduce((acc, value) => acc + value.length, 0);
    }
    outgoing.writeHead(res.status, resHeaderRecord);
    values.forEach((value) => {
      outgoing.write(value);
    });
    if (done) outgoing.end();
    else {
      if (values.length === 0) flushHeaders(outgoing);
      await writeFromReadableStreamDefaultReader(reader, outgoing, currentReadPromise);
    }
  } else if (resHeaderRecord[X_ALREADY_SENT]) {
  } else {
    outgoing.writeHead(res.status, resHeaderRecord);
    outgoing.end();
  }
  outgoing[outgoingEnded]?.();
};
var getRequestListener = (fetchCallback, options = {}) => {
  const autoCleanupIncoming = options.autoCleanupIncoming ?? true;
  if (options.overrideGlobalObjects !== false && global.Request !== Request$1) {
    Object.defineProperty(global, "Request", { value: Request$1 });
    Object.defineProperty(global, "Response", { value: Response$1 });
  }
  return async (incoming, outgoing) => {
    let res, req;
    let needsBodyCleanup = false;
    let closeHandlerAttached = false;
    const ensureCloseHandler = () => {
      if (!req || closeHandlerAttached) return;
      closeHandlerAttached = true;
      outgoing.on("close", makeCloseHandler(req, incoming, outgoing, needsBodyCleanup));
    };
    try {
      req = newRequest(incoming, options.hostname);
      needsBodyCleanup = autoCleanupIncoming && !(incoming.method === "GET" || incoming.method === "HEAD");
      if (needsBodyCleanup) {
        incoming[wrapBodyStream] = true;
        if (incoming instanceof Http2ServerRequest) outgoing[outgoingEnded] = () => {
          if (!incoming.readableEnded) setTimeout(() => {
            if (!incoming.readableEnded) setTimeout(() => {
              incoming.destroy();
              outgoing.destroy();
            });
          });
        };
      }
      res = fetchCallback(req, {
        incoming,
        outgoing
      });
      if (!isPromise(res) && isImmediateCacheableResponse(res)) {
        if (needsBodyCleanup && !incoming.readableEnded) outgoing.once("finish", () => {
          if (!incoming.readableEnded) drainIncoming(incoming);
        });
        return responseViaCache(res, outgoing);
      }
      ensureCloseHandler();
    } catch (e) {
      if (!res) if (options.errorHandler) {
        ensureCloseHandler();
        res = await options.errorHandler(req ? e : toRequestError(e));
        if (!res) return;
      } else if (!req) res = handleRequestError();
      else res = handleFetchError(e);
      else return handleResponseError(e, outgoing);
    }
    try {
      return await responseViaResponseObject(res, outgoing, options);
    } catch (e) {
      return handleResponseError(e, outgoing);
    }
  };
};
var CloseEvent = globalThis.CloseEvent ?? class extends Event {
  #eventInitDict;
  constructor(type, eventInitDict = {}) {
    super(type, eventInitDict);
    this.#eventInitDict = eventInitDict;
  }
  get wasClean() {
    return this.#eventInitDict.wasClean ?? false;
  }
  get code() {
    return this.#eventInitDict.code ?? 0;
  }
  get reason() {
    return this.#eventInitDict.reason ?? "";
  }
};
var ErrorEvent = globalThis.ErrorEvent ?? class extends Event {
  #eventInitDict;
  constructor(type, eventInitDict = {}) {
    super(type, eventInitDict);
    this.#eventInitDict = eventInitDict;
  }
  get message() {
    return this.#eventInitDict.message ?? "";
  }
  get filename() {
    return this.#eventInitDict.filename ?? "";
  }
  get lineno() {
    return this.#eventInitDict.lineno ?? 0;
  }
  get colno() {
    return this.#eventInitDict.colno ?? 0;
  }
  get error() {
    return this.#eventInitDict.error ?? null;
  }
};
var generateConnectionSymbol = () => Symbol("connection");
var CONNECTION_SYMBOL_KEY = Symbol("CONNECTION_SYMBOL_KEY");
var WAIT_FOR_WEBSOCKET_SYMBOL = Symbol("WAIT_FOR_WEBSOCKET_SYMBOL");
var upgradeWebSocket = defineWebSocketHelper(async (c, events, options) => {
  if (c.req.header("upgrade")?.toLowerCase() !== "websocket") return;
  const env = c.env;
  const waitForWebSocket = env[WAIT_FOR_WEBSOCKET_SYMBOL];
  if (!waitForWebSocket || !env.incoming) return new Response(null, { status: 500 });
  const connectionSymbol = generateConnectionSymbol();
  env[CONNECTION_SYMBOL_KEY] = connectionSymbol;
  (async () => {
    let ws;
    try {
      ws = await waitForWebSocket(env.incoming, connectionSymbol);
    } catch {
      return;
    }
    const messagesReceivedInStarting = [];
    const bufferMessage = (data, isBinary) => {
      messagesReceivedInStarting.push([data, isBinary]);
    };
    ws.on("message", bufferMessage);
    const ctx = {
      binaryType: "arraybuffer",
      close(code, reason) {
        ws.close(code, reason);
      },
      protocol: ws.protocol,
      raw: ws,
      get readyState() {
        return ws.readyState;
      },
      send(source, opts) {
        ws.send(source, { compress: opts?.compress });
      },
      url: new URL(c.req.url)
    };
    try {
      events?.onOpen?.(new Event("open"), ctx);
    } catch (e) {
      (options?.onError ?? console.error)(e);
    }
    const handleMessage = (data, isBinary) => {
      const datas = Array.isArray(data) ? data : [data];
      for (const data2 of datas) try {
        events?.onMessage?.(new MessageEvent("message", { data: isBinary ? data2 instanceof ArrayBuffer ? data2 : data2.buffer.slice(data2.byteOffset, data2.byteOffset + data2.byteLength) : typeof data2 === "string" ? data2 : Buffer.from(data2).toString("utf-8") }), ctx);
      } catch (e) {
        (options?.onError ?? console.error)(e);
      }
    };
    ws.off("message", bufferMessage);
    for (const message of messagesReceivedInStarting) handleMessage(...message);
    ws.on("message", (data, isBinary) => {
      handleMessage(data, isBinary);
    });
    ws.on("close", (code, reason) => {
      try {
        events?.onClose?.(new CloseEvent("close", {
          code,
          reason: reason.toString()
        }), ctx);
      } catch (e) {
        (options?.onError ?? console.error)(e);
      }
    });
    ws.on("error", (error) => {
      try {
        events?.onError?.(new ErrorEvent("error", { error }), ctx);
      } catch (e) {
        (options?.onError ?? console.error)(e);
      }
    });
  })();
  return new Response();
});

// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = Symbol();

// node_modules/hono/dist/utils/buffer.js
var bufferToFormData = (arrayBuffer, contentType2) => {
  return new Response(arrayBuffer, { headers: { "Content-Type": contentType2.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase()) } }).formData();
};

// node_modules/hono/dist/utils/body.js
var MAX_NESTED_OBJECTS = 1e4;
var isRawRequest = (request) => "headers" in request;
var parseBody = async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const mediaType = (isRawRequest(request) ? request.headers : request.raw.headers).get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if (mediaType === "multipart/form-data" || mediaType === "application/x-www-form-urlencoded") return parseFormData(request, {
    all,
    dot
  });
  return {};
};
async function parseFormData(request, options) {
  if (!isRawRequest(request) && request.bodyCache.formData) return convertFormDataToBodyData(await request.bodyCache.formData, options);
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const arrayBuffer = await request.arrayBuffer();
  const formDataPromise = bufferToFormData(arrayBuffer, headers.get("Content-Type") || "");
  if (!isRawRequest(request)) request.bodyCache.formData = formDataPromise;
  const formData = await formDataPromise;
  if (formData) return convertFormDataToBodyData(formData, options);
  return {};
}
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  const nestingState = { count: 0 };
  formData.forEach((value, key) => {
    if (!(options.all || key.endsWith("[]"))) form[key] = value;
    else handleParsingAllValues(form, key, value);
  });
  if (options.dot) Object.entries(form).forEach(([key, value]) => {
    if (key.includes(".")) {
      handleParsingNestedValues(form, key, value, nestingState);
      delete form[key];
    }
  });
  return form;
}
var handleParsingAllValues = (form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) form[key].push(value);
    else form[key] = [form[key], value];
  } else if (!key.endsWith("[]")) form[key] = value;
  else form[key] = [value];
};
var handleParsingNestedValues = (form, key, value, state) => {
  if (/(?:^|\.)__proto__\./.test(key)) return;
  let nestedForm = form;
  const keys = key.split(".", 34);
  if (keys.length > 33) throwNestingLimitExceeded();
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) nestedForm[key2] = value;
    else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        if (state.count++ >= MAX_NESTED_OBJECTS) throwNestingLimitExceeded();
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
};
var throwNestingLimitExceeded = () => {
  throw new Error("Nesting limit exceeded");
};

// node_modules/hono/dist/utils/url.js
var splitPath = (path) => {
  const paths = path.split("/");
  if (paths[0] === "") paths.shift();
  return paths;
};
var splitRoutingPath = (routePath) => {
  const { groups, path } = extractGroupsFromPath(routePath);
  const paths = splitPath(path);
  return replaceGroupMarks(paths, groups);
};
var extractGroupsFromPath = (path) => {
  const groups = [];
  path = path.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return {
    groups,
    path
  };
};
var replaceGroupMarks = (paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) if (paths[j].includes(mark)) {
      paths[j] = paths[j].replace(mark, groups[i][1]);
      break;
    }
  }
  return paths;
};
var patternCache = {};
var getPattern = (label, next) => {
  if (label === "*") return "*";
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey2 = `${label}#${next}`;
    if (!patternCache[cacheKey2]) {
      if (match2[2]) patternCache[cacheKey2] = next && next[0] !== ":" && next[0] !== "*" ? [
        cacheKey2,
        match2[1],
        new RegExp(`^${match2[2]}(?=/${next})`)
      ] : [
        label,
        match2[1],
        new RegExp(`^${match2[2]}$`)
      ];
      else patternCache[cacheKey2] = [
        label,
        match2[1],
        true
      ];
    }
    return patternCache[cacheKey2];
  }
  return null;
};
var tryDecode = (str, decoder) => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
};
var tryDecodeURI = (str) => tryDecode(str, decodeURI);
var getPath = (request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path = url.slice(start, end);
      return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
    } else if (charCode === 63 || charCode === 35) break;
  }
  return url.slice(start, i);
};
var getPathNoStrict = (request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
};
var mergePath = (base, sub, ...rest) => {
  if (rest.length) sub = mergePath(sub, ...rest);
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
};
var checkOptionalParameter = (path) => {
  if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) return null;
  const segments = path.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) basePath += "/" + segment;
    else if (/\:/.test(segment)) {
      if (segment.charCodeAt(segment.length - 1) === 63) {
        if (results.length === 0 && basePath === "") results.push("/");
        else results.push(basePath);
        const optionalSegment = segment.slice(0, -1);
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else basePath += "/" + segment;
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
};
var tryDecodeURIComponent = (str) => str.indexOf("%") !== -1 ? tryDecode(str, decodeURIComponent_) : str;
var _decodeURI = (value) => {
  if (value.indexOf("+") !== -1) value = value.replace(/\+/g, " ");
  return tryDecodeURIComponent(value);
};
var _getQueryParam = (url, key, multiple) => {
  const hashIndex = url.indexOf("#", 8);
  if (hashIndex !== -1) url = url.slice(0, hashIndex);
  let encoded;
  if (!multiple && key && key.indexOf("%") === -1 && key.indexOf("+") === -1) {
    let keyIndex2 = url.indexOf("?", 8);
    if (keyIndex2 === -1) return;
    if (!url.startsWith(key, keyIndex2 + 1)) keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61) {
        const valueIndex = keyIndex2 + key.length + 2;
        const endIndex = url.indexOf("&", valueIndex);
        return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
      } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) return "";
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) return;
  }
  const results = /* @__PURE__ */ Object.create(null);
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) valueIndex = -1;
    let name = url.slice(keyIndex + 1, valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex);
    if (encoded) name = _decodeURI(name);
    keyIndex = nextKeyIndex;
    if (name === "") continue;
    let value;
    if (valueIndex === -1) value = "";
    else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) value = _decodeURI(value);
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) results[name] = [];
      results[name].push(value);
    } else results[name] ??= value;
  }
  return key ? results[key] : results;
};
var getQueryParam = _getQueryParam;
var getQueryParams = (url, key) => {
  return _getQueryParam(url, key, true);
};
var decodeURIComponent_ = decodeURIComponent;

// node_modules/hono/dist/request.js
var HonoRequest = class {
  /**
  * `.raw` can get the raw Request object.
  *
  * @see {@link https://hono.dev/docs/api/request#raw}
  *
  * @example
  * ```ts
  * // For Cloudflare Workers
  * app.post('/', async (c) => {
  *   const metadata = c.req.raw.cf?.hostMetadata?
  *   ...
  * })
  * ```
  */
  raw;
  #validatedData;
  #matchResult;
  routeIndex = 0;
  /**
  * `.path` can get the pathname of the request.
  *
  * @see {@link https://hono.dev/docs/api/request#path}
  *
  * @example
  * ```ts
  * app.get('/about/me', (c) => {
  *   const pathname = c.req.path // `/about/me`
  * })
  * ```
  */
  path;
  bodyCache = {};
  constructor(request, path = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path;
    this.#matchResult = matchResult;
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex]?.[1][key];
    const param = this.#getParamValue(paramKey);
    return param && tryDecodeURIComponent(param);
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex]?.[1] ?? {});
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) decoded[key] = tryDecodeURIComponent(value);
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) return this.raw.headers.get(name) ?? void 0;
    const headerData = /* @__PURE__ */ Object.create(null);
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return parseBody(this, options);
  }
  #cachedBody = (key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) return cachedBody;
    for (const anyCachedKey in bodyCache) return bodyCache[anyCachedKey].then((body) => {
      if (anyCachedKey === "json") body = JSON.stringify(body);
      const contentType2 = anyCachedKey === "formData" ? void 0 : raw2.headers.get("content-type");
      return new Response(body, { headers: contentType2 ? { "Content-Type": contentType2 } : void 0 })[key]();
    });
    return bodyCache[key] = raw2[key]();
  };
  /**
  * `.json()` can parse Request body of type `application/json`
  *
  * @see {@link https://hono.dev/docs/api/request#json}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.json()
  * })
  * ```
  */
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  /**
  * `.text()` can parse Request body of type `text/plain`
  *
  * @see {@link https://hono.dev/docs/api/request#text}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.text()
  * })
  * ```
  */
  text() {
    return this.#cachedBody("text");
  }
  /**
  * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
  *
  * @see {@link https://hono.dev/docs/api/request#arraybuffer}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.arrayBuffer()
  * })
  * ```
  */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
  * `.bytes()` parses the request body as a `Uint8Array`.
  *
  * @see {@link https://hono.dev/docs/api/request#bytes}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.bytes()
  * })
  * ```
  */
  bytes() {
    return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
  }
  /**
  * Parses the request body as a `Blob`.
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.blob();
  * });
  * ```
  * @see https://hono.dev/docs/api/request#blob
  */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
  * Parses the request body as `FormData`.
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.formData();
  * });
  * ```
  * @see https://hono.dev/docs/api/request#formdata
  */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
  * Adds validated data to the request.
  *
  * @param target - The target of the validation.
  * @param data - The validated data to add.
  */
  addValidatedData(target, data) {
    (this.#validatedData ??= {})[target] = data;
  }
  valid(target) {
    return this.#validatedData?.[target];
  }
  /**
  * `.url` can get the request url strings.
  *
  * @see {@link https://hono.dev/docs/api/request#url}
  *
  * @example
  * ```ts
  * app.get('/about/me', (c) => {
  *   const url = c.req.url // `http://localhost:8787/about/me`
  *   ...
  * })
  * ```
  */
  get url() {
    return this.raw.url;
  }
  /**
  * `.method` can get the method name of the request.
  *
  * @see {@link https://hono.dev/docs/api/request#method}
  *
  * @example
  * ```ts
  * app.get('/about/me', (c) => {
  *   const method = c.req.method // `GET`
  * })
  * ```
  */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
  * `.matchedRoutes` can return a matched route in the handler
  *
  * @deprecated
  *
  * Use matchedRoutes helper defined in "hono/route" instead.
  *
  * @see {@link https://hono.dev/docs/api/request#matchedroutes}
  *
  * @example
  * ```ts
  * app.use('*', async function logger(c, next) {
  *   await next()
  *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
  *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
  *     console.log(
  *       method,
  *       ' ',
  *       path,
  *       ' '.repeat(Math.max(10 - path.length, 0)),
  *       name,
  *       i === c.req.routeIndex ? '<- respond from here' : ''
  *     )
  *   })
  * })
  * ```
  */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
  * `.routePath` can retrieve the path registered within the handler
  *
  * @deprecated
  *
  * Use routePath helper defined in "hono/route" instead.
  *
  * @see {@link https://hono.dev/docs/api/request#routepath}
  *
  * @example
  * ```ts
  * app.get('/posts/:id', (c) => {
  *   return c.json({ path: c.req.routePath })
  * })
  * ```
  */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = (value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
};
var resolveCallback = async (str, phase, preserveCallbacks, context, buffer) => {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!(str instanceof Promise)) str = str.toString();
    if (str instanceof Promise) str = await str;
  }
  const callbacks = str.callbacks;
  if (!callbacks?.length) return Promise.resolve(str);
  if (buffer) buffer[0] += str;
  else buffer = [str];
  const resStr = Promise.all(callbacks.map((c) => c({
    phase,
    buffer,
    context
  }))).then((res) => Promise.all(res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer))).then(() => buffer[0]));
  if (preserveCallbacks) return raw(await resStr, callbacks);
  else return resStr;
};

// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = (contentType2, headers) => {
  return {
    "Content-Type": contentType2,
    ...headers
  };
};
var createResponseInstance = (body, init) => new Response(body, init);
var Context = class {
  #rawRequest;
  #req;
  /**
  * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
  *
  * @see {@link https://hono.dev/docs/api/context#env}
  *
  * @example
  * ```ts
  * // Environment object for Cloudflare Workers
  * app.get('*', async c => {
  *   const counter = c.env.COUNTER
  * })
  * ```
  */
  env = {};
  #var;
  finalized = false;
  /**
  * `.error` can get the error object from the middleware if the Handler throws an error.
  *
  * @see {@link https://hono.dev/docs/api/context#error}
  *
  * @example
  * ```ts
  * app.use('*', async (c, next) => {
  *   await next()
  *   if (c.error) {
  *     // do something...
  *   }
  * })
  * ```
  */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
  * Creates an instance of the Context class.
  *
  * @param req - The Request object.
  * @param options - Optional configuration options for the context.
  */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
  * `.req` is the instance of {@link HonoRequest}.
  */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
  * @see {@link https://hono.dev/docs/api/context#event}
  * The FetchEvent associated with the current request.
  *
  * @throws Will throw an error if the context does not have a FetchEvent.
  */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) return this.#executionCtx;
    else throw Error("This context has no FetchEvent");
  }
  /**
  * @see {@link https://hono.dev/docs/api/context#executionctx}
  * The ExecutionContext associated with the current request.
  *
  * @throws Will throw an error if the context does not have an ExecutionContext.
  */
  get executionCtx() {
    if (this.#executionCtx) return this.#executionCtx;
    else throw Error("This context has no ExecutionContext");
  }
  /**
  * @see {@link https://hono.dev/docs/api/context#res}
  * The Response object for the current request.
  */
  get res() {
    return this.#res ||= createResponseInstance(null, { headers: this.#preparedHeaders ??= new Headers() });
  }
  /**
  * Sets the Response object for the current request.
  *
  * @param _res - The Response object to set.
  */
  set res(_res) {
    if (this.#res && _res) {
      _res = createResponseInstance(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") continue;
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) _res.headers.append("set-cookie", cookie);
        } else _res.headers.set(k, v);
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
  * `.render()` can create a response within a layout.
  *
  * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
  *
  * @example
  * ```ts
  * app.get('/', (c) => {
  *   return c.render('Hello!')
  * })
  * ```
  */
  render = (...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  };
  /**
  * Sets the layout for the response.
  *
  * @param layout - The layout to set.
  * @returns The layout function.
  */
  setLayout = (layout) => this.#layout = layout;
  /**
  * Gets the current layout for the response.
  *
  * @returns The current layout function.
  */
  getLayout = () => this.#layout;
  /**
  * `.setRenderer()` can set the layout in the custom middleware.
  *
  * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
  *
  * @example
  * ```tsx
  * app.use('*', async (c, next) => {
  *   c.setRenderer((content) => {
  *     return c.html(
  *       <html>
  *         <body>
  *           <p>{content}</p>
  *         </body>
  *       </html>
  *     )
  *   })
  *   await next()
  * })
  * ```
  */
  setRenderer = (renderer) => {
    this.#renderer = renderer;
  };
  /**
  * `.header()` can set headers.
  *
  * @see {@link https://hono.dev/docs/api/context#header}
  *
  * @example
  * ```ts
  * app.get('/welcome', (c) => {
  *   // Set headers
  *   c.header('X-Message', 'Hello!')
  *   c.header('Content-Type', 'text/plain')
  *
  *   // Append multiple headers using the append option (e.g. Vary)
  *   c.header('Vary', 'Accept-Encoding', { append: true })
  *   c.header('Vary', 'User-Agent', { append: true })
  *
  *   return c.body('Thank you for coming')
  * })
  * ```
  */
  header = (name, value, options) => {
    if (this.finalized) this.#res = createResponseInstance(this.#res.body, this.#res);
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) headers.delete(name);
    else if (options?.append) headers.append(name, value);
    else headers.set(name, value);
  };
  status = (status) => {
    this.#status = status;
  };
  /**
  * `.set()` can set the value specified by the key.
  *
  * @see {@link https://hono.dev/docs/api/context#set-get}
  *
  * @example
  * ```ts
  * app.use('*', async (c, next) => {
  *   c.set('message', 'Hono is hot!!')
  *   await next()
  * })
  * ```
  */
  set = (key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  };
  /**
  * `.get()` can use the value specified by the key.
  *
  * @see {@link https://hono.dev/docs/api/context#set-get}
  *
  * @example
  * ```ts
  * app.get('/', (c) => {
  *   const message = c.get('message')
  *   return c.text(`The message is "${message}"`)
  * })
  * ```
  */
  get = (key) => {
    return this.#var ? this.#var.get(key) : void 0;
  };
  /**
  * `.var` can access the value of a variable.
  *
  * @see {@link https://hono.dev/docs/api/context#var}
  *
  * @example
  * ```ts
  * const result = c.var.client.oneMethod()
  * ```
  */
  get var() {
    if (!this.#var) return {};
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    let responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders;
    if (typeof arg === "object" && arg.headers) {
      responseHeaders ??= new Headers();
      for (const [key, value] of new Headers(arg.headers)) if (key === "set-cookie") responseHeaders.append(key, value);
      else responseHeaders.set(key, value);
    }
    if (headers) {
      if (!responseHeaders) {
        let count = 0;
        for (const k in headers) if (++count > 1 || typeof headers[k] !== "string") {
          responseHeaders = new Headers();
          break;
        }
      }
      if (responseHeaders) for (const k in headers) {
        const v = headers[k];
        if (typeof v === "string") responseHeaders.set(k, v);
        else {
          responseHeaders.delete(k);
          for (const v2 of v) responseHeaders.append(k, v2);
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return createResponseInstance(data, {
      status,
      headers: responseHeaders ?? headers
    });
  }
  newResponse = (...args) => this.#newResponse(...args);
  /**
  * `.body()` can return the HTTP response.
  * You can set headers with `.header()` and set HTTP status code with `.status`.
  * This can also be set in `.text()`, `.json()` and so on.
  *
  * @see {@link https://hono.dev/docs/api/context#body}
  *
  * @example
  * ```ts
  * app.get('/welcome', (c) => {
  *   // Set headers
  *   c.header('X-Message', 'Hello!')
  *   c.header('Content-Type', 'text/plain')
  *   // Set HTTP status code
  *   c.status(201)
  *
  *   // Return the response body
  *   return c.body('Thank you for coming')
  * })
  * ```
  */
  body = (data, arg, headers) => this.#newResponse(data, arg, headers);
  /**
  * `.text()` can render text as `Content-Type:text/plain`.
  *
  * @see {@link https://hono.dev/docs/api/context#text}
  *
  * @example
  * ```ts
  * app.get('/say', (c) => {
  *   return c.text('Hello!')
  * })
  * ```
  */
  text = (text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(text, arg, setDefaultContentType(TEXT_PLAIN, headers));
  };
  /**
  * `.json()` can render JSON as `Content-Type:application/json`.
  *
  * @see {@link https://hono.dev/docs/api/context#json}
  *
  * @example
  * ```ts
  * app.get('/api', (c) => {
  *   return c.json({ message: 'Hello!' })
  * })
  * ```
  */
  json = (object, arg, headers) => {
    return this.#newResponse(JSON.stringify(object), arg, setDefaultContentType("application/json", headers));
  };
  html = (html, arg, headers) => {
    const res = (html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers));
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  };
  /**
  * `.redirect()` can Redirect, default status code is 302.
  *
  * @see {@link https://hono.dev/docs/api/context#redirect}
  *
  * @example
  * ```ts
  * app.get('/redirect', (c) => {
  *   return c.redirect('/')
  * })
  * app.get('/redirect-permanently', (c) => {
  *   return c.redirect('/', 301)
  * })
  * ```
  */
  redirect = (location, status) => {
    const locationString = String(location);
    this.header("Location", !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString));
    return this.newResponse(null, status ?? 302);
  };
  /**
  * `.notFound()` can return the Not Found Response.
  *
  * @see {@link https://hono.dev/docs/api/context#notfound}
  *
  * @example
  * ```ts
  * app.get('/notfound', (c) => {
  *   return c.notFound()
  * })
  * ```
  */
  notFound = () => {
    this.#notFoundHandler ??= () => createResponseInstance();
    return this.#notFoundHandler(this);
  };
};

// node_modules/hono/dist/compose.js
var compose = (middleware, onError, onNotFound) => {
  return (context, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) throw new Error("next() called multiple times");
      index = i;
      let res;
      let isError = false;
      let handler2;
      if (middleware[i]) {
        handler2 = middleware[i][0][0];
        context.req.routeIndex = i;
      } else handler2 = i === middleware.length && next || void 0;
      if (handler2) try {
        res = await handler2(context, () => dispatch(i + 1));
      } catch (err2) {
        if (err2 instanceof Error && onError) {
          context.error = err2;
          res = await onError(err2, context);
          isError = true;
        } else throw err2;
      }
      else if (context.finalized === false && onNotFound) res = await onNotFound(context);
      if (res && (context.finalized === false || isError)) context.res = res;
      return context;
    }
  };
};

// node_modules/hono/dist/router.js
var METHODS = [
  "get",
  "post",
  "put",
  "delete",
  "options",
  "patch",
  "query"
];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
};

// node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// node_modules/hono/dist/hono-base.js
var notFoundHandler = (c) => {
  return c.text("404 Not Found", 404);
};
var errorHandler = (err2, c) => {
  if ("getResponse" in err2) {
    const res = err2.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err2);
  return c.text("Internal Server Error", 500);
};
var Hono = class Hono2 {
  get;
  post;
  put;
  delete;
  options;
  patch;
  query;
  all;
  on;
  use;
  router;
  getPath;
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    [...METHODS, "all"].forEach((method) => {
      this[method] = (args1, ...args) => {
        const methodName = method.toUpperCase();
        if (typeof args1 === "string") this.#path = args1;
        else this.#addRoute(methodName, this.#path, args1);
        args.forEach((handler2) => {
          this.#addRoute(methodName, this.#path, handler2);
        });
        return this;
      };
    });
    this.on = (method, path, ...handlers) => {
      for (const p of [path].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          const methodName = m.toUpperCase();
          for (const handler2 of handlers) this.#addRoute(methodName, this.#path, handler2);
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") this.#path = arg1;
      else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler2) => {
        this.#addRoute("ALL", this.#path, handler2);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new Hono2({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  errorHandler = errorHandler;
  /**
  * `.route()` allows grouping other Hono instance in routes.
  *
  * @see {@link https://hono.dev/docs/api/routing#grouping}
  *
  * @param {string} path - base Path
  * @param {Hono} app - other Hono instance
  * @returns {Hono} routed Hono instance
  *
  * @example
  * ```ts
  * const app = new Hono()
  * const app2 = new Hono()
  *
  * app2.get("/user", (c) => c.text("user"))
  * app.route("/api", app2) // GET /api/user
  * ```
  */
  route(path, app2) {
    const subApp = this.basePath(path);
    app2.routes.map((r) => {
      let handler2;
      if (app2.errorHandler === errorHandler) handler2 = r.handler;
      else {
        handler2 = async (c, next) => (await compose([], app2.errorHandler)(c, () => r.handler(c, next))).res;
        handler2[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler2, r.basePath);
    });
    return this;
  }
  /**
  * `.basePath()` allows base paths to be specified.
  *
  * @see {@link https://hono.dev/docs/api/routing#base-path}
  *
  * @param {string} path - base Path
  * @returns {Hono} changed Hono instance
  *
  * @example
  * ```ts
  * const api = new Hono().basePath('/api')
  * ```
  */
  basePath(path) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path);
    return subApp;
  }
  /**
  * `.onError()` handles an error and returns a customized Response.
  *
  * @see {@link https://hono.dev/docs/api/hono#error-handling}
  *
  * @param {ErrorHandler} handler - request Handler for error
  * @returns {Hono} changed Hono instance
  *
  * @example
  * ```ts
  * app.onError((err, c) => {
  *   console.error(`${err}`)
  *   return c.text('Custom Error Message', 500)
  * })
  * ```
  */
  onError = (handler2) => {
    this.errorHandler = handler2;
    return this;
  };
  /**
  * `.notFound()` allows you to customize a Not Found Response.
  *
  * @see {@link https://hono.dev/docs/api/hono#not-found}
  *
  * @param {NotFoundHandler} handler - request handler for not-found
  * @returns {Hono} changed Hono instance
  *
  * @example
  * ```ts
  * app.notFound((c) => {
  *   return c.text('Custom 404 Message', 404)
  * })
  * ```
  */
  notFound = (handler2) => {
    this.#notFoundHandler = handler2;
    return this;
  };
  /**
  * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
  *
  * @deprecated Use `mount()` from `hono/mount` instead. `.mount()` will be removed in v5.
  *
  * @see {@link https://hono.dev/docs/api/hono#mount}
  *
  * @param {string} path - base Path
  * @param {Function} applicationHandler - other Request Handler
  * @param {MountOptions} [options] - options of `.mount()`
  * @returns {Hono} mounted Hono instance
  *
  * @example
  * ```ts
  * import { Router as IttyRouter } from 'itty-router'
  * import { Hono } from 'hono'
  * // Create itty-router application
  * const ittyRouter = IttyRouter()
  * // GET /itty-router/hello
  * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
  *
  * const app = new Hono()
  * app.mount('/itty-router', ittyRouter.handle)
  * ```
  *
  * @example
  * ```ts
  * const app = new Hono()
  * // Send the request to another application without modification.
  * app.mount('/app', anotherApp, {
  *   replaceRequest: (req) => req,
  * })
  * ```
  */
  mount(path, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") optionHandler = options;
      else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) replaceRequest = (request) => request;
        else replaceRequest = options.replaceRequest;
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    replaceRequest ||= (() => {
      const mergedPath = mergePath(this._basePath, path);
      const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
      return (request) => {
        const url = new URL(request.url);
        url.pathname = this.getPath(request).slice(pathPrefixLength) || "/";
        return new Request(url, request);
      };
    })();
    const handler2 = async (c, next) => {
      const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
      if (res) return res;
      await next();
    };
    this.#addRoute("ALL", mergePath(path, "*"), handler2);
    return this;
  }
  #addRoute(method, path, handler2, baseRoutePath) {
    path = mergePath(this._basePath, path);
    const r = {
      basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
      path,
      method,
      handler: handler2
    };
    this.router.add(method, path, [handler2, r]);
    this.routes.push(r);
  }
  #handleError(err2, c) {
    if (err2 instanceof Error) return this.errorHandler(err2, c);
    throw err2;
  }
  #dispatch(request, executionCtx, env, method) {
    if (method === "HEAD") return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
    const path = this.getPath(request, { env });
    const matchResult = this.router.match(method, path);
    const c = new Context(request, {
      path,
      matchResult,
      env,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err2) {
        return this.#handleError(err2, c);
      }
      return res instanceof Promise ? res.then((resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))).catch((err2) => this.#handleError(err2, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context = await composed(c);
        if (!context.finalized) throw new Error("Context is not finalized. Did you forget to return a Response object or `await next()`?");
        return context.res;
      } catch (err2) {
        return this.#handleError(err2, c);
      }
    })();
  }
  /**
  * `.fetch()` will be entry point of your app.
  *
  * @see {@link https://hono.dev/docs/api/hono#fetch}
  *
  * @param {Request} request - request Object of request
  * @param {Env} env - env Object
  * @param {ExecutionContext} executionCtx - context of execution
  * @returns {Response | Promise<Response>} response of request
  *
  */
  fetch = (request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  };
  /**
  * `.request()` is a useful method for testing.
  * You can pass a URL or pathname to send a GET request.
  * app will return a Response object.
  * ```ts
  * test('GET /hello is ok', async () => {
  *   const res = await app.request('/hello')
  *   expect(res.status).toBe(200)
  * })
  * ```
  * @see https://hono.dev/docs/api/hono#request
  */
  request = (input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    input = input.toString();
    return this.fetch(new Request(/^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`, requestInit), Env, executionCtx);
  };
  /**
  * `.fire()` automatically adds a global fetch event listener.
  * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
  * @deprecated
  * Use `fire` from `hono/service-worker` instead.
  * ```ts
  * import { Hono } from 'hono'
  * import { fire } from 'hono/service-worker'
  *
  * const app = new Hono()
  * // ...
  * fire(app)
  * ```
  * @see https://hono.dev/docs/api/hono#fire
  * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
  * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
  */
  fire = () => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  };
};

// node_modules/hono/dist/router/utils.js
var createNullObject = () => /* @__PURE__ */ Object.create(null);

// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = (method2, path2) => {
    const matcher = matchers[method2] || matchers["ALL"];
    const staticMatch = matcher[2][path2];
    if (staticMatch) return staticMatch;
    const match3 = path2.match(matcher[0]);
    if (!match3) return [[], emptyParam];
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  };
  this.match = match2;
  return match2(method, path);
}

// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = Symbol();
var regExpMetaChars = /* @__PURE__ */ new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) return b.length === 1 ? a < b ? -1 : 1 : -1;
  if (b.length === 1) return 1;
  if (a === ".*" || a === "(?:|/.*)") return b === "(?:|/.*)" ? -1 : 1;
  else if (b === ".*" || b === "(?:|/.*)") return -1;
  if (a === "[^/]+") return 1;
  else if (b === "[^/]+") return -1;
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
var Node = class Node2 {
  #index;
  #varIndex;
  #children = createNullObject();
  insert(tokens, index, paramMap, context, isStatic) {
    let node = this;
    for (let i = 0, len = tokens.length; i < len; i++) {
      const token = tokens[i];
      const pattern = token.length === 1 ? token === "*" ? i === len - 1 ? [
        "",
        "",
        ".*"
      ] : [
        "",
        "",
        LABEL_REG_EXP_STR
      ] : null : token === "/*" ? [
        "",
        "",
        TAIL_WILDCARD_REG_EXP_STR
      ] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
      let nextNode;
      if (pattern) {
        const name = pattern[1];
        let regexpStr = pattern[2] || "[^/]+";
        if (name && pattern[2]) {
          if (regexpStr === ".*") throw PATH_ERROR;
          regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
          if (/\((?!\?:)/.test(regexpStr)) throw PATH_ERROR;
          if (regexpStr.length === 1 && regExpMetaChars.has(regexpStr)) throw PATH_ERROR;
        }
        nextNode = node.#children[regexpStr];
        if (!nextNode) {
          if (regexpStr !== ".*" && regexpStr !== "(?:|/.*)") {
            for (const k in node.#children) if ((regexpStr.length > 1 || k.length > 1) && k !== ".*" && k !== "(?:|/.*)") throw PATH_ERROR;
          }
          nextNode = node.#children[regexpStr] = new Node2();
        }
        if (name !== "") {
          nextNode.#varIndex ??= context.varIndex++;
          paramMap.push([name, nextNode.#varIndex]);
        }
      } else {
        nextNode = node.#children[token];
        if (!nextNode) {
          for (const k in node.#children) if (k.length > 1 && k !== ".*" && k !== "(?:|/.*)") throw PATH_ERROR;
          nextNode = node.#children[token] = new Node2();
        }
      }
      node = nextNode;
    }
    if (node.#index !== void 0) throw PATH_ERROR;
    node.#index = isStatic ? -1 : index;
  }
  buildRegExpStr() {
    const strList = Object.keys(this.#children).sort(compareKey).map((k) => {
      const c = this.#children[k];
      const childStr = c.buildRegExpStr();
      return childStr === "" ? "" : (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + childStr;
    }).filter(Boolean);
    if (typeof this.#index === "number" && this.#index !== -1) strList.unshift(`#${this.#index}`);
    if (strList.length === 0) return "";
    if (strList.length === 1) return strList[0];
    return "(?:" + strList.join("|") + ")";
  }
};

// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  #context = { varIndex: 0 };
  #root = new Node();
  #index = 0;
  paths = createNullObject();
  insert(path, isStatic) {
    if (isStatic) {
      this.#root.insert(path.split(""), 0, [], this.#context, true);
      return;
    }
    const paramAssoc = [];
    const groups = [];
    let markedPath = path;
    for (let i = 0; ; ) {
      let replaced = false;
      markedPath = markedPath.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) break;
    }
    const tokens = markedPath.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) if (tokens[j].indexOf(mark) !== -1) {
        tokens[j] = tokens[j].replace(mark, groups[i][1]);
        break;
      }
    }
    this.#root.insert(tokens, this.#index, paramAssoc, this.#context, false);
    this.paths[path] = [this.#index++, paramAssoc];
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") return [
      /^$/,
      [],
      []
    ];
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [
      new RegExp(`^${regexp}`),
      indexReplacementMap,
      paramReplacementMap
    ];
  }
};

// node_modules/hono/dist/router/reg-exp-router/router.js
var wildcardRegExpCache = createNullObject();
function buildWildcardRegExp(path) {
  return wildcardRegExpCache[path] ??= new RegExp(`^${path.replace(/\/:[^/{}]+(?:\{\[\^\/]\+})?(?=[/{]|$)|\/?\*$|([.\\+*[^\]$()?{}|])/g, (match2, metaChar) => metaChar ? `\\${metaChar}` : match2 === "/*" ? TAIL_WILDCARD_REG_EXP_STR : match2 === "*" ? ".*" : `/:${LABEL_REG_EXP_STR}`)}$`);
}
function findMiddleware(middleware, path) {
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) if (buildWildcardRegExp(k).test(path)) return [...middleware[k]];
}
var RegExpRouter = class {
  name = "RegExpRouter";
  #middleware;
  #routes;
  #tries;
  constructor() {
    this.#middleware = { ["ALL"]: createNullObject() };
    this.#routes = { ["ALL"]: createNullObject() };
    this.#tries = { ["ALL"]: new Trie() };
  }
  #insertPath(method, path) {
    try {
      this.#tries[method].insert(path, !/\*|\/:/.test(path));
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
  }
  add(method, path, handler2) {
    const middleware = this.#middleware;
    const routes = this.#routes;
    if (!middleware) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    if (!middleware[method]) {
      this.#tries[method] = new Trie();
      for (const handlerMap of [middleware, routes]) {
        handlerMap[method] = createNullObject();
        for (const p in handlerMap["ALL"]) {
          handlerMap[method][p] = [...handlerMap["ALL"][p]];
          this.#insertPath(method, p);
        }
      }
    }
    if (path === "/*") path = "*";
    const methods = method === "ALL" ? Object.keys(middleware) : [method];
    if (/\*$/.test(path)) {
      const re = buildWildcardRegExp(path);
      for (const m of methods) if (!middleware[m][path]) {
        this.#insertPath(m, path);
        middleware[m][path] = findMiddleware(middleware[m], path) || findMiddleware(middleware["ALL"], path) || [];
      }
      for (const handlerMap of [middleware, routes]) for (const m of methods) for (const p in handlerMap[m]) re.test(p) && handlerMap[m][p].push([handler2, path]);
      return;
    }
    const paths = checkOptionalParameter(path) || [path];
    for (const path2 of paths) for (const m of methods) {
      if (!routes[m][path2]) {
        this.#insertPath(m, path2);
        routes[m][path2] = findMiddleware(middleware[m], path2) || findMiddleware(middleware["ALL"], path2) || [];
      }
      routes[m][path2].push([handler2, path2]);
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = createNullObject();
    for (const method of Object.keys(this.#routes)) matchers[method] = this.#buildMatcher(method);
    this.#middleware = this.#routes = this.#tries = void 0;
    wildcardRegExpCache = createNullObject();
    return matchers;
  }
  #buildMatcher(method) {
    const middleware = this.#middleware[method];
    const routes = this.#routes[method];
    const trie = this.#tries[method];
    const staticMap = createNullObject();
    const handlerData = [];
    const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
    for (const r of [middleware, routes]) for (const path in r) {
      const handlers = r[path];
      const pathData = trie.paths[path];
      if (!pathData) {
        staticMap[path] = [handlers.map(([h]) => [h, createNullObject()]), emptyParam];
        continue;
      }
      handlerData[pathData[0]] = handlers.map(([h, handlerPath]) => [h, trie.paths[handlerPath][1].reduceRight((map, [key], i) => {
        map[key] = paramReplacementMap[pathData[1][i][1]];
        return map;
      }, createNullObject())]);
    }
    return [
      regexp,
      indexReplacementMap.map((i) => handlerData[i]),
      staticMap
    ];
  }
};

// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path, handler2) {
    if (!this.#routes) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    this.#routes.push([
      method,
      path,
      handler2
    ]);
  }
  match(method, path) {
    if (!this.#routes) throw new Error("Fatal error");
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) router.add(...routes[i2]);
        res = router.match(method, path);
      } catch (e) {
        if (e instanceof UnsupportedPathError) continue;
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) throw new Error("Fatal error");
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) throw new Error("No active router has been determined yet.");
    return this.#routers[0];
  }
};

// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = createNullObject();
var order = 0;
var Node3 = class Node4 {
  #methods = [];
  #children = createNullObject();
  #patterns = [];
  #pattern;
  #params = emptyParams;
  insert(method, path, handler2) {
    let curNode = this;
    const parts = splitRoutingPath(path);
    const possibleKeys = /* @__PURE__ */ new Set();
    let i = 0;
    for (const p of parts) {
      const nextP = parts[++i];
      const pattern = getPattern(p, nextP) || (nextP === void 0 && p && p.indexOf("*") === p.length - 1 ? p : null);
      const isParam = Array.isArray(pattern);
      const key = isParam ? pattern[0] : pattern || p;
      const child = curNode.#children[key] ||= new Node4();
      if (pattern && !child.#pattern) {
        child.#pattern = pattern;
        curNode.#patterns.push(child);
      }
      curNode = child;
      if (isParam) possibleKeys.add(pattern[1]);
    }
    curNode.#methods.push({ [method]: {
      handler: handler2,
      possibleKeys: [...possibleKeys],
      score: ++order
    } });
  }
  #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m["ALL"];
      if (handlerSet) {
        handlerSet.params = createNullObject();
        handlerSets.push(handlerSet);
        for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
          const key = handlerSet.possibleKeys[i2];
          handlerSet.params[key] = params?.[key] && !i2 ? params[key] : nodeParams[key] ?? params?.[key];
        }
      }
    }
  }
  search(method, path) {
    const handlerSets = [];
    this.#params = emptyParams;
    let curNodes = [this];
    const parts = splitPath(path);
    const curNodesQueue = [];
    const len = parts.length;
    let partOffsets = null;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
            this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
          } else tempNodes.push(nextNode);
        }
        for (const child of node.#patterns) {
          const pattern = child.#pattern;
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (typeof pattern === "string") {
            if (pattern === "*" || part.startsWith(pattern.slice(0, -1))) {
              this.#pushHandlerSets(handlerSets, child, method, node.#params);
              if (pattern === "*") {
                child.#params = params;
                tempNodes.push(child);
              }
            }
            continue;
          }
          const [, name, matcher] = pattern;
          if (!part && matcher === true) continue;
          if (matcher !== true) {
            if (!partOffsets) {
              partOffsets = [];
              let offset = path[0] === "/" ? 1 : 0;
              for (let p = 0; p < len; p++) {
                partOffsets[p] = offset;
                offset += parts[p].length + 1;
              }
            }
            const restPathString = path.slice(partOffsets[i]);
            const m = matcher.exec(restPathString);
            if (m) {
              params[name] = m[0];
              this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
              if (m[0].length === restPathString.length && child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, node.#params, params);
              for (const _ in child.#children) {
                child.#params = params;
                const componentCount = m[0].match(/\//g)?.length ?? 0;
                (curNodesQueue[componentCount] ||= []).push(child);
                break;
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            params[name] = part;
            if (isLast) {
              this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
              if (child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, params, node.#params);
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      const shifted = curNodesQueue.shift();
      curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
    }
    if (handlerSets[1]) handlerSets.sort((a, b) => {
      return a.score - b.score;
    });
    return [handlerSets.map(({ handler: handler2, params }) => [handler2, params])];
  }
};

// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  name = "TrieRouter";
  #node = new Node3();
  add(method, path, handler2) {
    for (const result of checkOptionalParameter(path) || [path]) this.#node.insert(method, result, handler2);
  }
  match(method, path) {
    return this.#node.search(method, path);
  }
};

// node_modules/hono/dist/hono.js
var Hono3 = class extends Hono {
  /**
  * Creates an instance of the Hono class.
  *
  * @param options - Optional configuration options for the Hono instance.
  */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({ routers: [new RegExpRouter(), new TrieRouter()] });
  }
};

// node_modules/hono/dist/middleware/cors/index.js
var cors = (options) => {
  const opts = {
    origin: "*",
    allowMethods: [
      "GET",
      "HEAD",
      "PUT",
      "POST",
      "DELETE",
      "PATCH",
      "QUERY"
    ],
    allowHeaders: [],
    exposeHeaders: [],
    ...options
  };
  const exposeHeadersStr = opts.exposeHeaders?.length ? opts.exposeHeaders.join(",") : void 0;
  const allowHeadersStr = opts.allowHeaders?.length ? opts.allowHeaders.join(",") : void 0;
  const findAllowOrigin = ((optsOrigin) => {
    if (typeof optsOrigin === "string") {
      if (optsOrigin === "*") return () => optsOrigin;
      else return (origin) => optsOrigin === origin ? origin : null;
    } else if (typeof optsOrigin === "function") return optsOrigin;
    else return (origin) => optsOrigin.includes(origin) ? origin : null;
  })(opts.origin);
  const findAllowMethods = ((optsAllowMethods) => {
    if (typeof optsAllowMethods === "function") return async (origin, c) => (await optsAllowMethods(origin, c)).join(",");
    else if (Array.isArray(optsAllowMethods)) {
      const methodsStr = optsAllowMethods.join(",");
      return () => methodsStr;
    } else return () => "";
  })(opts.allowMethods);
  return async function cors2(c, next) {
    function set(key, value) {
      c.res.headers.set(key, value);
    }
    const allowOrigin = await findAllowOrigin(c.req.header("origin") || "", c);
    if (allowOrigin) set("Access-Control-Allow-Origin", allowOrigin);
    if (opts.credentials) set("Access-Control-Allow-Credentials", "true");
    if (exposeHeadersStr) set("Access-Control-Expose-Headers", exposeHeadersStr);
    if (c.req.method === "OPTIONS") {
      if (opts.origin !== "*") c.res.headers.append("Vary", "Origin");
      if (opts.maxAge != null) set("Access-Control-Max-Age", opts.maxAge.toString());
      const allowMethods = await findAllowMethods(c.req.header("origin") || "", c);
      if (allowMethods) set("Access-Control-Allow-Methods", allowMethods);
      let headersStr = allowHeadersStr;
      if (!headersStr) {
        const requestHeaders = c.req.header("Access-Control-Request-Headers");
        if (requestHeaders) headersStr = requestHeaders.split(",").map((h) => h.trim()).join(",");
      }
      if (headersStr) {
        set("Access-Control-Allow-Headers", headersStr);
        c.res.headers.append("Vary", "Access-Control-Request-Headers");
      }
      c.res.headers.delete("Content-Length");
      c.res.headers.delete("Content-Type");
      return new Response(null, {
        headers: c.res.headers,
        status: 204,
        statusText: "No Content"
      });
    }
    await next();
    if (opts.origin !== "*") c.header("Vary", "Origin", { append: true });
  };
};

// src/config.ts
var num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};
var cfg = {
  /** upstream base, no trailing slash */
  upstream: process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com",
  /** per-key pacing: after a successful call the key sleeps this long.
   *  4000ms == 15 RPM, the Gemini free-tier ceiling per project. */
  rateWindowMs: num(process.env.KEY_RATE_WINDOW_MS, 4e3),
  /** cooldown applied on 429 / RESOURCE_EXHAUSTED */
  cooldownMs: num(process.env.KEY_COOLDOWN_MS, 6e4),
  /** cooldown applied on 5xx */
  serverErrCooldownMs: num(process.env.KEY_5XX_COOLDOWN_MS, 15e3),
  /** max key attempts per request before giving up */
  maxAttempts: num(process.env.MAX_ATTEMPTS, 6),
  /** how long to wait for a busy pool before 429-ing the client */
  maxWaitMs: num(process.env.MAX_WAIT_MS, 8e3),
  /** hard ceiling for one upstream attempt; also the client-disconnect bound */
  upstreamTimeoutMs: num(process.env.UPSTREAM_TIMEOUT_MS, 12e4),
  /** default model when the client omits one */
  defaultModel: process.env.DEFAULT_MODEL ?? "gemini-3.8-flash",
  defaultTtsModel: process.env.DEFAULT_TTS_MODEL ?? "gemini-3.8-flash-tts",
  defaultEmbedModel: process.env.DEFAULT_EMBED_MODEL ?? "text-embedding-004",
  defaultVoice: process.env.DEFAULT_VOICE ?? "Kore",
  adminToken: process.env.ADMIN_TOKEN ?? "",
  /** OpenAI-compatible bearer the clients present ("" = open) */
  clientToken: process.env.CLIENT_TOKEN ?? "",
  /** inject Google Search grounding when the client asks for "search" */
  searchModel: process.env.SEARCH_MODEL ?? "gemini-3.8-flash"
};
var VOICE_MAP = {
  alloy: "Kore",
  echo: "Puck",
  fable: "Charon",
  onyx: "Fenrir",
  nova: "Zephyr",
  shimmer: "Leda",
  ballad: "Aoede",
  coral: "Kore",
  sage: "Sulafat",
  verse: "Bright"
};

// src/pool.ts
import { createHash } from "node:crypto";

// src/log.ts
var LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
var threshold = LEVELS[process.env.LOG_LEVEL ?? "info"] ?? LEVELS.info;
var KEY_SHAPED = /AIza[0-9A-Za-z_-]{10,}|ya29\.[0-9A-Za-z._-]{10,}/g;
var scrub = (value) => {
  if (typeof value === "string") return value.replace(KEY_SHAPED, "[redacted]");
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = scrub(v);
    return out;
  }
  return value;
};
function log(level, event, fields = {}) {
  if (LEVELS[level] < threshold) return;
  const line = JSON.stringify({
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    level,
    event,
    ...scrub(fields)
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

// src/metrics.ts
var startedAt = Date.now();
var counters = {
  requests: 0,
  upstreamRequests: 0,
  rotations: 0,
  upstream429: 0,
  cooldowns: 0,
  invalidated: 0,
  poolExhausted: 0,
  upstream5xx: 0,
  networkErrors: 0,
  clientAborts: 0,
  redisDegraded: 0,
  embeddings: 0,
  toolCalls: 0
};

// src/pool.ts
var KV_URL = (process.env.UPSTASH_REDIS_REST_URL ?? "").replace(/\/+$/, "");
var KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
var USE_KV = Boolean(KV_URL && KV_TOKEN);
var IDX_KEY = "gkr:idx";
var DEAD_KEY = "gkr:idx:dead";
var KEY_PREFIX = "gkr:k:";
var CACHE_TTL_MS = Number(process.env.POOL_CACHE_TTL_MS ?? 250);
var BREAKER_MS = Number(process.env.REDIS_BREAKER_MS ?? 3e4);
var BREAKER_TRIP_AT = 2;
var local = /* @__PURE__ */ new Map();
var now = () => Date.now();
function maskKey(k) {
  if (k.length <= 4) return "*".repeat(k.length);
  if (k.length <= 12) return `${k.slice(0, 2)}\u2026${k.slice(-2)}`;
  return `${k.slice(0, 6)}\u2026${k.slice(-4)}`;
}
function keyId(k) {
  return createHash("sha256").update(k).digest("hex").slice(0, 12);
}
var encode = (s) => `f=${s.failures};u=${s.invalid ? 1 : 0};c=${s.cooldownUntil};l=${s.lastUsed};v=${s.invalidations}`;
var decode = (key, raw2) => {
  const out = {
    key,
    failures: 0,
    invalid: false,
    invalidations: 0,
    cooldownUntil: 0,
    lastUsed: 0
  };
  if (!raw2) return out;
  for (const part of raw2.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq);
    const v = part.slice(eq + 1);
    if (k === "f") out.failures = Number(v) || 0;
    else if (k === "u") out.invalid = v === "1";
    else if (k === "c") out.cooldownUntil = Number(v) || 0;
    else if (k === "l") out.lastUsed = Number(v) || 0;
    else if (k === "v") out.invalidations = Number(v) || 0;
  }
  return out;
};
function mergeInto(key, fromRedis) {
  const cur = local.get(key);
  if (!cur) {
    const fresh = fromRedis ?? decode(key, null);
    local.set(key, fresh);
    return fresh;
  }
  if (!fromRedis) return cur;
  cur.failures = Math.max(cur.failures, fromRedis.failures);
  cur.invalid = cur.invalid || fromRedis.invalid;
  cur.invalidations = Math.max(cur.invalidations, fromRedis.invalidations);
  cur.cooldownUntil = Math.max(cur.cooldownUntil, fromRedis.cooldownUntil);
  cur.lastUsed = Math.max(cur.lastUsed, fromRedis.lastUsed);
  return cur;
}
async function kvPipeline(commands) {
  const res = await fetch(`${KV_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(3e3)
  });
  if (!res.ok) throw new Error(`kv ${res.status}: ${await res.text()}`);
  const json2 = await res.json();
  if (!Array.isArray(json2)) throw new Error(`kv: ${json2.error ?? "malformed response"}`);
  return json2.map((entry) => {
    if (entry?.error) throw new Error(`kv: ${entry.error}`);
    return entry?.result ?? null;
  });
}
var breakerOpenUntil = 0;
var failStreak = 0;
var redisDegraded = () => USE_KV && breakerOpenUntil > now();
function kvOk() {
  failStreak = 0;
  if (breakerOpenUntil > 0) {
    log("info", "redis.recovered", {});
    breakerOpenUntil = 0;
  }
}
function kvFailed(err2) {
  failStreak++;
  if (failStreak >= BREAKER_TRIP_AT && breakerOpenUntil <= now()) {
    breakerOpenUntil = now() + BREAKER_MS;
    log("warn", "redis.degraded", {
      breakerMs: BREAKER_MS,
      error: err2 instanceof Error ? err2.message : String(err2)
    });
  }
}
var cacheAt = 0;
var cachedIndex = [];
var cachedFallback = false;
async function refresh(knowsIndex) {
  const index = await kvPipeline(
    knowsIndex ? [["SMEMBERS", IDX_KEY], ["MGET", ...cachedIndex.map((k) => KEY_PREFIX + k)]] : [["SMEMBERS", IDX_KEY]]
  );
  const members = index[0] ?? [];
  const values = index[1];
  let fetched = null;
  if (values && members.length === cachedIndex.length && members.every((k, i) => k === cachedIndex[i])) {
    fetched = values;
  } else if (members.length > 0) {
    const [vals] = await kvPipeline([["MGET", ...members.map((k) => KEY_PREFIX + k)]]);
    fetched = vals ?? null;
  }
  const seen = new Set(members);
  for (const [key] of local) if (!seen.has(key)) local.delete(key);
  members.forEach((key, i) => mergeInto(key, decode(key, fetched?.[i] ?? null)));
  cachedIndex = members;
  cacheAt = now();
  cachedFallback = false;
}
async function states() {
  if (!USE_KV) return [...local.values()];
  if (breakerOpenUntil > now()) return [...local.values()];
  if (cacheAt > 0 && now() - cacheAt < CACHE_TTL_MS) return [...local.values()];
  try {
    await refresh(cacheAt > 0 && cachedIndex.length > 0);
    kvOk();
  } catch (err2) {
    kvFailed(err2);
    if (!cachedFallback) {
      cachedFallback = true;
      counters.redisDegraded++;
      log("warn", "redis.read_failed", {
        servedFrom: "memory-mirror",
        keys: local.size,
        error: err2 instanceof Error ? err2.message : String(err2)
      });
    }
  }
  return [...local.values()];
}
async function persist(st, extra = []) {
  local.set(st.key, st);
  if (!USE_KV) return true;
  try {
    await kvPipeline([["SET", KEY_PREFIX + st.key, encode(st)], ...extra]);
    kvOk();
    return true;
  } catch (err2) {
    kvFailed(err2);
    return false;
  }
}
async function addKey(key) {
  const k = key.trim();
  if (!k) return false;
  const cur = local.get(k);
  if (cur && !cur.invalid) return false;
  const st = decode(k, null);
  local.set(k, st);
  if (!USE_KV) return true;
  try {
    await kvPipeline([
      ["SET", KEY_PREFIX + k, encode(st)],
      ["SADD", IDX_KEY, k],
      ["SREM", DEAD_KEY, k]
    ]);
    kvOk();
    cacheAt = 0;
    return true;
  } catch (err2) {
    kvFailed(err2);
    return true;
  }
}
async function removeKey(key) {
  const k = key.trim();
  const had = local.delete(k);
  if (!USE_KV) return had;
  try {
    await kvPipeline([
      ["DEL", KEY_PREFIX + k],
      ["SREM", IDX_KEY, k],
      ["SREM", DEAD_KEY, k]
    ]);
    kvOk();
    cacheAt = 0;
    return had;
  } catch (err2) {
    kvFailed(err2);
    return had;
  }
}
async function removeKeyById(id) {
  const all = await states();
  const hit = all.find((s) => keyId(s.key) === id);
  if (!hit) return false;
  return removeKey(hit.key);
}
async function rawKeyById(id) {
  const all = await states();
  const hit = all.find((s) => keyId(s.key) === id);
  return hit ? hit.key : null;
}
async function markHealthy(key) {
  const st = local.get(key) ?? decode(key, null);
  st.invalid = false;
  st.failures = 0;
  st.cooldownUntil = 0;
  st.lastUsed = now();
  await persist(st, [["SREM", DEAD_KEY, key]]);
}
async function listKeys() {
  const all = await states();
  const t = now();
  return all.map((s) => ({
    id: keyId(s.key),
    key: maskKey(s.key),
    failures: s.failures,
    invalidations: s.invalidations,
    cooldownLeftMs: Math.max(0, s.cooldownUntil - t),
    lastUsed: s.lastUsed,
    invalid: s.invalid,
    status: s.invalid ? "dead" : s.cooldownUntil > t ? "cooling" : "ready",
    cooldownUntil: s.cooldownUntil
  }));
}
async function snapshot() {
  const all = await states();
  const t = now();
  let ready = 0;
  let cooling = 0;
  let dead = 0;
  let soonest = Infinity;
  for (const s of all) {
    if (s.invalid) dead++;
    else if (s.cooldownUntil > t) {
      cooling++;
      soonest = Math.min(soonest, s.cooldownUntil - t);
    } else ready++;
  }
  return {
    total: all.length,
    ready,
    cooling,
    dead,
    soonestReadyMs: Number.isFinite(soonest) ? soonest : 0,
    storage: storageMode,
    degraded: redisDegraded()
  };
}
async function pick(exclude = /* @__PURE__ */ new Set()) {
  const all = (await states()).filter((s) => !s.invalid && !exclude.has(s.key));
  const t = now();
  const ready = all.filter((s) => s.cooldownUntil <= t);
  if (ready.length === 0) return null;
  ready.sort((a, b) => a.failures - b.failures || a.lastUsed - b.lastUsed);
  return ready[0];
}
async function markUsed(key) {
  const st = local.get(key);
  if (!st) return;
  st.lastUsed = now();
  await persist(st);
}
async function mark429(key, cooldownMs) {
  const st = local.get(key) ?? decode(key, null);
  st.failures += 1;
  st.invalidations += 1;
  st.cooldownUntil = now() + cooldownMs;
  st.invalid = false;
  counters.cooldowns++;
  await persist(st, [["SREM", DEAD_KEY, key]]);
}
async function markSoftError(key, cooldownMs) {
  const st = local.get(key) ?? decode(key, null);
  st.failures += 1;
  st.cooldownUntil = now() + cooldownMs;
  await persist(st);
}
async function markInvalid(key) {
  const st = local.get(key) ?? decode(key, null);
  st.invalid = true;
  st.invalidations += 1;
  st.failures = 999;
  st.cooldownUntil = Number.MAX_SAFE_INTEGER;
  counters.invalidated++;
  if (!USE_KV) {
    local.set(key, st);
    return true;
  }
  local.set(key, st);
  try {
    const [, claimed] = await kvPipeline([
      ["SET", KEY_PREFIX + key, encode(st)],
      ["SADD", DEAD_KEY, key]
    ]);
    kvOk();
    return claimed === 1;
  } catch (err2) {
    kvFailed(err2);
    return true;
  }
}
var storageMode = USE_KV ? "upstash-redis" : "memory";

// src/admin-ui.ts
var ADMIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Key rotator control</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230d1014'/%3E%3Cpath d='M9 20l5-9 4 6 5-3' stroke='%23e8a33d' stroke-width='2.6' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E">
<style>
  :root {
    --bg: #0d1014;
    --panel: #12161b;
    --panel-2: #171c22;
    --line: #242b34;
    --line-soft: #1c222a;
    --text: #e6eaf0;
    --muted: #8c96a5;
    --accent: #e8a33d;
    --ready: #57c98a;
    --cool: #e0b64a;
    --dead: #e8737b;
    --focus: #7fb4ff;
    --radius: 8px;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 28px 20px 64px; }

  header.top { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding-bottom: 14px; border-bottom: 1px solid var(--line); }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand h1 { font-size: 16px; font-weight: 650; margin: 0; letter-spacing: -0.01em; }
  .brand .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
  .brand .sub { font-size: 12px; color: var(--muted); }
  .top-right { display: flex; align-items: center; gap: 12px; font-size: 12px; color: var(--muted); }
  .top-right .mono { font-size: 12px; }

  h2.sec { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 600; margin: 26px 0 10px; }

  /* one-line health strip, not a card grid */
  .strip { display: flex; flex-wrap: wrap; align-items: center; gap: 0 18px; padding: 12px 0; border-bottom: 1px solid var(--line-soft); }
  .strip .kv { display: flex; align-items: baseline; gap: 6px; }
  .strip .kv b { font-size: 18px; font-weight: 650; font-variant-numeric: tabular-nums; }
  .strip .kv span { font-size: 12px; color: var(--muted); }
  .strip .kv.ready b { color: var(--ready); }
  .strip .kv.cooling b { color: var(--cool); }
  .strip .kv.dead b { color: var(--dead); }
  .strip .spacer { flex: 1; }
  .strip .meta { font-size: 12px; color: var(--muted); }

  .card { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px; }
  .card + .card { margin-top: 12px; }

  label.field { display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; }
  input[type=password], input[type=text], select, textarea {
    width: 100%;
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 11px 12px;
    font: inherit;
    font-size: 13.5px;
  }
  textarea { resize: vertical; min-height: 84px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; line-height: 1.6; }
  select { appearance: none; padding-right: 30px; background-image: linear-gradient(45deg, transparent 50%, var(--muted) 50%), linear-gradient(135deg, var(--muted) 50%, transparent 50%); background-position: calc(100% - 16px) 50%, calc(100% - 11px) 50%; background-size: 5px 5px, 5px 5px; background-repeat: no-repeat; cursor: pointer; }
  input[type=text] { min-height: 44px; }
  input:focus-visible, textarea:focus-visible, select:focus-visible, button:focus-visible, a:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
  input::placeholder, textarea::placeholder { color: #5f6875; }

  button {
    font: inherit;
    font-size: 13.5px;
    font-weight: 550;
    color: var(--text);
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    min-height: 44px;
    padding: 0 16px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 120ms ease, border-color 120ms ease;
  }
  button:hover:not(:disabled) { background: #1e242c; border-color: #333d49; }
  button:disabled { opacity: 0.45; cursor: not-allowed; }
  button.primary { background: var(--accent); border-color: var(--accent); color: #1a1206; font-weight: 650; }
  button.primary:hover:not(:disabled) { background: #f0b154; border-color: #f0b154; }
  button.small { min-height: 34px; padding: 0 11px; font-size: 12.5px; }
  button.danger { color: var(--dead); border-color: #3d272b; background: transparent; }
  button.danger:hover:not(:disabled) { background: #22161a; border-color: var(--dead); }

  .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; }
  .row > .grow { flex: 1 1 260px; min-width: 0; }

  .msg { border-radius: var(--radius); padding: 10px 12px; font-size: 13px; margin-top: 12px; display: none; border: 1px solid; }
  .msg.show { display: block; }
  .msg.ok { background: #101f18; border-color: #1f4c36; color: #b8f5d2; }
  .msg.err { background: #211416; border-color: #4a2b30; color: #ffc3c6; }
  .msg.info { background: #101a24; border-color: #1f3548; color: #c2e0ff; }

  /* table */
  .tablewrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  thead th {
    text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em;
    color: var(--muted); font-weight: 600; padding: 0 10px 9px; border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }
  thead th.right, tbody td.right { text-align: right; }
  tbody td { padding: 9px 10px; border-bottom: 1px solid var(--line-soft); vertical-align: middle; }
  tbody tr:last-child td { border-bottom: 0; }
  tbody tr { transition: background 120ms ease; }
  tbody tr:hover { background: #151a20; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .num { font-variant-numeric: tabular-nums; }
  td.actions { text-align: right; white-space: nowrap; }
  td.actions button + button { margin-left: 6px; }

  .badge { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 600; padding: 3px 8px; border-radius: 999px; border: 1px solid; }
  .badge::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .badge.ready { color: var(--ready); border-color: #1f4c36; background: #101f18; }
  .badge.cooling { color: var(--cool); border-color: #4d3d12; background: #221d0c; }
  .badge.dead { color: var(--dead); border-color: #4a2b30; background: #211416; }

  /* cooldown cell: number plus a thin drain bar, both functional */
  .cool { display: inline-flex; align-items: center; gap: 8px; justify-content: flex-end; }
  .cool .bar { width: 54px; height: 3px; border-radius: 2px; background: #232a33; overflow: hidden; }
  .cool .bar i { display: block; height: 100%; background: var(--cool); }

  .empty { padding: 30px 12px; text-align: center; color: var(--muted); font-size: 13.5px; }
  .empty b { display: block; color: var(--text); font-size: 14px; margin-bottom: 4px; font-weight: 600; }

  .skeleton { height: 11px; border-radius: 4px; background: linear-gradient(90deg, #1b2027, #262d37, #1b2027); background-size: 200% 100%; animation: sh 1.2s linear infinite; }
  @keyframes sh { from { background-position: 200% 0; } to { background-position: -200% 0; } }
  @media (prefers-reduced-motion: reduce) { .skeleton { animation: none; } tbody tr, button { transition: none; } }

  /* pagination */
  .pager { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; margin-top: 12px; font-size: 12.5px; color: var(--muted); }
  .pager:empty { display: none; }
  .pager .pages { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .pager .pages span { color: var(--muted); padding: 0 2px; }
  .pager button.small { min-width: 36px; padding: 0 9px; font-variant-numeric: tabular-nums; }
  .pager button.active { background: var(--accent); border-color: var(--accent); color: #1a1206; font-weight: 700; }

  .foot { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin-top: 14px; }
  .muted { color: var(--muted); font-size: 12px; }
  .check { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--muted); cursor: pointer; min-height: 44px; }
  .check input { width: 17px; height: 17px; accent-color: var(--accent); }

  .probe { font-size: 12px; color: var(--muted); }
  .probe.ok { color: var(--ready); }
  .probe.bad { color: var(--dead); }
  .probe.warn { color: var(--cool); }

  @media (max-width: 760px) {
    .wrap { padding: 20px 14px 56px; }
    thead { display: none; }
    tbody tr { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; padding: 12px 0; border-bottom: 1px solid var(--line-soft); }
    tbody td { border: 0; padding: 0; }
    tbody td::before { content: attr(data-l); display: block; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
    tbody td.key { grid-column: 1 / -1; margin-bottom: 4px; }
    tbody td.key::before { display: none; }
    tbody td.actions { grid-column: 1 / -1; text-align: left; margin-top: 8px; }
    tbody td.actions::before { display: none; }
    td.actions button { min-height: 40px; }
    .strip { gap: 0 14px; }
  }
</style>
</head>
<body>
<div class="wrap">

  <header class="top">
    <div class="brand">
      <span class="dot"></span>
      <div>
        <h1>Key rotator control</h1>
        <div class="sub">Pool health, key intake, live probe</div>
      </div>
    </div>
    <div class="top-right">
      <a href="/models" class="mono" style="color:var(--accent);text-decoration:none;min-height:32px;display:inline-flex;align-items:center">models &rarr;</a>
      <span id="storage" class="mono">storage: -</span>
      <span id="synced">-</span>
    </div>
  </header>

  <!-- auth -->
  <section id="authPanel" class="card" style="margin-top:18px">
    <label class="field" for="token">Admin token</label>
    <div class="row">
      <div class="grow">
        <input id="token" type="password" autocomplete="off" spellcheck="false" placeholder="ADMIN_TOKEN">
      </div>
      <button id="connect" class="primary" type="button">Connect</button>
    </div>
    <div id="authHint" class="msg err"></div>
    <p class="muted" style="margin:12px 0 0">The token stays in this browser. It is never sent anywhere except this deployment.</p>
  </section>

  <!-- health strip -->
  <section id="statsPanel" hidden>
    <div class="strip">
      <div class="kv"><b id="sTotal">0</b><span>keys</span></div>
      <div class="kv ready"><b id="sReady">0</b><span>ready</span></div>
      <div class="kv cooling"><b id="sCooling">0</b><span>cooling</span></div>
      <div class="kv dead"><b id="sDead">0</b><span>dead</span></div>
      <div class="spacer"></div>
      <div class="meta" id="nextReady">-</div>
    </div>
  </section>

  <!-- add -->
  <section id="addPanel" class="card" hidden>
    <h2 class="sec" style="margin-top:0">Add keys</h2>
    <label class="field" for="newKeys">One key per line, or separated by commas</label>
    <textarea id="newKeys" spellcheck="false" placeholder="AIzaSy...&#10;AIzaSy..."></textarea>
    <div class="row" style="margin-top:10px">
      <button id="addBtn" class="primary" type="button">Add to pool</button>
      <span id="addCount" class="muted"></span>
    </div>
    <div id="addMsg" class="msg"></div>
  </section>

  <!-- keys -->
  <section id="keysPanel" hidden>
    <h2 class="sec">Pool</h2>
    <div class="row" style="margin-bottom:10px">
      <button id="testAllBtn" type="button">Test all live keys</button>
      <span id="testAllNote" class="muted"></span>
    </div>
    <div class="row" style="margin-bottom:10px">
      <div class="grow">
        <input id="keyFilter" type="text" spellcheck="false" placeholder="Filter by key, id or status...">
      </div>
      <div>
        <select id="keySize" aria-label="Keys per page">
          <option value="10">10 / page</option>
          <option value="25" selected>25 / page</option>
          <option value="50">50 / page</option>
          <option value="100">100 / page</option>
        </select>
      </div>
    </div>
    <div id="keysBody" class="card tablewrap"><div class="empty">Loading pool...</div></div>
    <div id="keyPager" class="pager"></div>
    <div id="keyMsg" class="msg"></div>

    <div class="foot">
      <label class="check"><input id="auto" type="checkbox" checked> Auto refresh every 5s</label>
      <button id="forget" class="small" type="button">Forget token</button>
    </div>
  </section>

</div>

<script>
(function () {
  "use strict";
  var STORE = "gkr.admin.token";

  var el = {
    authPanel: document.getElementById("authPanel"),
    authHint: document.getElementById("authHint"),
    token: document.getElementById("token"),
    connect: document.getElementById("connect"),
    statsPanel: document.getElementById("statsPanel"),
    addPanel: document.getElementById("addPanel"),
    keysPanel: document.getElementById("keysPanel"),
    sTotal: document.getElementById("sTotal"),
    sReady: document.getElementById("sReady"),
    sCooling: document.getElementById("sCooling"),
    sDead: document.getElementById("sDead"),
    nextReady: document.getElementById("nextReady"),
    storage: document.getElementById("storage"),
    synced: document.getElementById("synced"),
    newKeys: document.getElementById("newKeys"),
    addBtn: document.getElementById("addBtn"),
    addCount: document.getElementById("addCount"),
    addMsg: document.getElementById("addMsg"),
    keysBody: document.getElementById("keysBody"),
    keyFilter: document.getElementById("keyFilter"),
    keySize: document.getElementById("keySize"),
    keyPager: document.getElementById("keyPager"),
    keyMsg: document.getElementById("keyMsg"),
    testAllBtn: document.getElementById("testAllBtn"),
    testAllNote: document.getElementById("testAllNote"),
    auto: document.getElementById("auto"),
    forget: document.getElementById("forget")
  };

  var state = { token: "", keys: [], busy: false, timer: null, tick: null, testing: {}, page: 1, size: 25, query: "" };

  function say(node, text, kind) {
    node.className = "msg " + (kind || "info");
    node.textContent = text;
    node.classList.add("show");
  }
  function hide(node) { node.classList.remove("show"); node.textContent = ""; }

  function api(path, opts) {
    opts = opts || {};
    var headers = { "authorization": "Bearer " + state.token };
    if (opts.body) headers["content-type"] = "application/json";
    return fetch(path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.text().then(function (raw) {
        var data = null;
        try { data = raw ? JSON.parse(raw) : null; } catch (e) { data = null; }
        if (!res.ok) {
          var err = new Error((data && data.error && data.error.message) || ("HTTP " + res.status));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function fmtAge(ms) {
    if (!ms) return "never";
    var d = Date.now() - ms;
    if (d < 0) d = 0;
    var s = Math.floor(d / 1000);
    if (s < 60) return s + "s ago";
    var m = Math.floor(s / 60);
    if (m < 60) return m + "m ago";
    var h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    return Math.floor(h / 24) + "d ago";
  }
  function fmtLeft(ms) {
    if (!ms || ms <= 0) return "0s";
    var s = Math.ceil(ms / 1000);
    if (s < 60) return s + "s";
    var m = Math.floor(s / 60), r = s % 60;
    if (m < 60) return r ? m + "m " + r + "s" : m + "m";
    var h = Math.floor(m / 60);
    return h + "h " + (m % 60) + "m";
  }

  function renderStats(pool) {
    el.sTotal.textContent = pool.total;
    el.sReady.textContent = pool.ready;
    el.sCooling.textContent = pool.cooling;
    el.sDead.textContent = pool.dead;
    el.storage.textContent = "storage: " + pool.storage + (pool.degraded ? " (degraded)" : "");
    el.synced.textContent = "synced " + new Date().toLocaleTimeString();
    el.nextReady.textContent = pool.cooling > 0
      ? "next key free in " + fmtLeft(pool.soonestReadyMs)
      : (pool.ready > 0 ? "all ready keys selectable" : "no key can serve right now");
  }

  function cell(label, cls) {
    var td = document.createElement("td");
    if (cls) td.className = cls;
    if (label) td.setAttribute("data-l", label);
    return td;
  }

  function probeClass(status) {
    if (status === "ok") return "ok";
    if (status === "rate_limited" || status === "zero_quota" || status === "server_error") return "warn";
    return "bad";
  }
  function probeText(res) {
    var label = res.status.replace(/_/g, " ");
    if (res.status === "ok") label = "serving";
    if (res.status === "rate_limited") label = "429, free in " + fmtLeft(res.retryAfterMs);
    return label + " (" + res.latencyMs + "ms)";
  }

  function renderKeys(keys) {
    state.keys = keys;
    drawTable();
  }

  /**
   * Draw one page of the pool. Pagination is client-side: the admin endpoint
   * already returns the whole pool in one request, so slicing here keeps the
   * 5s auto-refresh from re-fetching per page.
   */
  function drawTable() {
    var keys = state.keys;
    if (!keys.length) {
      el.keysBody.innerHTML = "";
      var box = document.createElement("div");
      box.className = "empty";
      var b = document.createElement("b");
      b.textContent = "Pool is empty";
      box.appendChild(b);
      box.appendChild(document.createTextNode("Add keys above, or set GEMINI_API_KEYS on the deployment."));
      el.keysBody.appendChild(box);
      return;
    }

    var filtered = keys.filter(function (k) {
      if (!state.query) return true;
      return (k.key + " " + k.id + " " + k.status).toLowerCase().indexOf(state.query) >= 0;
    });

    if (!filtered.length) {
      el.keysBody.innerHTML = "";
      var nbox = document.createElement("div");
      nbox.className = "empty";
      var nb = document.createElement("b");
      nb.textContent = "No key matches this filter";
      nbox.appendChild(nb);
      nbox.appendChild(document.createTextNode("Clear the filter box to see the whole pool."));
      el.keysBody.appendChild(nbox);
      renderPager(0, 1);
      return;
    }

    var pages = Math.max(1, Math.ceil(filtered.length / state.size));
    if (state.page > pages) state.page = pages;
    if (state.page < 1) state.page = 1;
    var start = (state.page - 1) * state.size;
    var slice = filtered.slice(start, start + state.size);

    var table = document.createElement("table");
    var thead = document.createElement("thead");
    thead.innerHTML = "<tr><th>Key</th><th>Status</th><th class='right'>Fails</th><th class='right'>Cooldown</th><th>Last used</th><th>Probe</th><th></th></tr>";
    table.appendChild(thead);
    var tbody = document.createElement("tbody");

    slice.forEach(function (k) {
      var tr = document.createElement("tr");
      tr.setAttribute("data-id", k.id);

      var cKey = cell("Key", "key");
      var code = document.createElement("span");
      code.className = "mono";
      code.textContent = k.key;
      code.title = "id " + k.id;
      cKey.appendChild(code);

      var cStatus = cell("Status");
      var badge = document.createElement("span");
      badge.className = "badge " + k.status;
      badge.textContent = k.status;
      cStatus.appendChild(badge);

      var cFail = cell("Fails", "right num");
      cFail.textContent = k.failures;

      var cCool = cell("Cooldown", "right");
      var wrapCool = document.createElement("span");
      wrapCool.className = "cool num";
      var left = document.createElement("span");
      left.className = "left";
      left.textContent = fmtLeft(k.cooldownLeftMs);
      var bar = document.createElement("span");
      bar.className = "bar";
      var fill = document.createElement("i");
      var totalCd = Math.max(k.cooldownLeftMs, 1);
      fill.style.width = k.cooldownLeftMs > 0 ? "100%" : "0%";
      bar.appendChild(fill);
      wrapCool.appendChild(left);
      wrapCool.appendChild(bar);
      cCool.appendChild(wrapCool);

      var cUsed = cell("Last used");
      cUsed.textContent = fmtAge(k.lastUsed);

      var cProbe = cell("Probe");
      var pv = document.createElement("span");
      pv.className = "probe";
      var known = state.testing[k.id];
      if (known) {
        pv.className = "probe " + probeClass(known.status);
        pv.textContent = probeText(known);
      } else {
        pv.textContent = "-";
      }
      cProbe.appendChild(pv);

      var cAct = cell(null, "actions");
      var testBtn = document.createElement("button");
      testBtn.type = "button";
      testBtn.className = "small";
      testBtn.textContent = "Test";
      testBtn.addEventListener("click", function () { testKey(k, testBtn, pv); });

      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "small danger";
      delBtn.textContent = "Remove";
      delBtn.addEventListener("click", function () { removeKey(k, delBtn); });

      cAct.appendChild(testBtn);
      cAct.appendChild(delBtn);

      tr.appendChild(cKey); tr.appendChild(cStatus); tr.appendChild(cFail);
      tr.appendChild(cCool); tr.appendChild(cUsed); tr.appendChild(cProbe); tr.appendChild(cAct);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    el.keysBody.innerHTML = "";
    el.keysBody.appendChild(table);
    renderPager(filtered.length, pages);
    startTicker();
  }

  /** Numbered pager with a sliding window; Prev/Next never wrap around. */
  function renderPager(total, pages) {
    el.keyPager.innerHTML = "";
    if (!total) return;

    var start = (state.page - 1) * state.size + 1;
    var end = Math.min(total, state.page * state.size);

    var info = document.createElement("span");
    info.textContent = "Showing " + start + "-" + end + " of " + total + " keys";
    el.keyPager.appendChild(info);

    var box = document.createElement("div");
    box.className = "pages";

    function mk(label, page, disabled, active) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "small" + (active ? " active" : "");
      b.textContent = label;
      b.disabled = Boolean(disabled);
      if (active) b.setAttribute("aria-current", "page");
      b.addEventListener("click", function () { state.page = page; drawTable(); });
      return b;
    }

    box.appendChild(mk("Prev", state.page - 1, state.page === 1, false));

    var win = 5;
    var from = Math.max(1, state.page - Math.floor(win / 2));
    var to = Math.min(pages, from + win - 1);
    from = Math.max(1, to - win + 1);

    if (from > 1) {
      box.appendChild(mk("1", 1, false, state.page === 1));
      if (from > 2) {
        var d = document.createElement("span");
        d.textContent = "\u2026";
        box.appendChild(d);
      }
    }
    for (var p = from; p <= to; p++) box.appendChild(mk(String(p), p, false, p === state.page));
    if (to < pages) {
      if (to < pages - 1) {
        var d2 = document.createElement("span");
        d2.textContent = "\u2026";
        box.appendChild(d2);
      }
      box.appendChild(mk(String(pages), pages, false, state.page === pages));
    }

    box.appendChild(mk("Next", state.page + 1, state.page === pages, false));
    el.keyPager.appendChild(box);
  }

  /**
   * Cooldown cells drain between polls. Recomputing from the last sync keeps
   * the display honest without extra requests.
   */
  function startTicker() {
    if (state.tick) return;
    state.tick = setInterval(function () {
      var rows = el.keysBody.querySelectorAll("tr[data-id]");
      for (var i = 0; i < rows.length; i++) {
        var id = rows[i].getAttribute("data-id");
        var k = state.keys.filter(function (x) { return x.id === id; })[0];
        if (!k || k.cooldownLeftMs <= 0) continue;
        var left = rows[i].querySelector(".cool .left");
        if (left) left.textContent = fmtLeft(k.cooldownLeftMs);
      }
    }, 1000);
  }

  function refresh() {
    if (!state.token || state.busy) return Promise.resolve();
    state.busy = true;
    return api("/admin/keys")
      .then(function (data) {
        renderStats(data.pool);
        renderKeys(data.keys || []);
        el.statsPanel.hidden = false;
        el.addPanel.hidden = false;
        el.keysPanel.hidden = false;
        el.authPanel.hidden = true;
      })
      .catch(function (err) {
        if (err.status === 401 || err.status === 403) {
          lock(err.message + " Re-enter the token.");
        } else {
          say(el.keyMsg, "Refresh failed: " + err.message, "err");
        }
      })
      .then(function () { state.busy = false; });
  }

  function lock(reason) {
    stopAuto();
    state.token = "";
    el.statsPanel.hidden = true;
    el.addPanel.hidden = true;
    el.keysPanel.hidden = true;
    el.authPanel.hidden = false;
    say(el.authHint, reason || "Token required.", "err");
  }

  function connect() {
    var t = el.token.value.trim();
    if (!t) { say(el.authHint, "Token is empty.", "err"); return; }
    state.token = t;
    el.connect.disabled = true;
    api("/admin/keys")
      .then(function (data) {
        try { localStorage.setItem(STORE, t); } catch (e) {}
        renderStats(data.pool);
        renderKeys(data.keys || []);
        el.statsPanel.hidden = false;
        el.addPanel.hidden = false;
        el.keysPanel.hidden = false;
        el.authPanel.hidden = true;
        hide(el.keyMsg);
        startAuto();
      })
      .catch(function (err) {
        state.token = "";
        say(el.authHint, "Connect failed: " + err.message, "err");
      })
      .then(function () { el.connect.disabled = false; });
  }

  function removeKey(k, btn) {
    if (!confirm("Remove key " + k.key + " from the pool? This cannot be undone.")) return;
    btn.disabled = true;
    api("/admin/keys", { method: "DELETE", body: { id: k.id } })
      .then(function (data) {
        say(el.keyMsg, "Removed " + k.key + ". Pool total " + data.pool.total + ".", "ok");
        delete state.testing[k.id];
        return refresh();
      })
      .catch(function (err) {
        btn.disabled = false;
        say(el.keyMsg, "Remove failed: " + err.message, "err");
      });
  }

  /**
   * Probe one key against Google. The server folds the verdict into the pool:
   * a serving key leaves cooldown, a 429 key re-enters it with the real wait,
   * a revoked key is retired.
   */
  function testKey(k, btn, node) {
    btn.disabled = true;
    btn.textContent = "Testing";
    node.className = "probe";
    node.textContent = "probing...";
    api("/admin/keys/test", { method: "POST", body: { id: k.id } })
      .then(function (data) {
        state.testing[k.id] = data.probe;
        node.className = "probe " + probeClass(data.probe.status);
        node.textContent = probeText(data.probe);
        var note = data.applied === "revived" ? " back in rotation"
          : data.applied === "cooling" ? " parked again"
          : data.applied === "retired" ? " retired from the pool" : "";
        say(el.keyMsg, k.key + ": " + data.probe.message + note, data.probe.status === "ok" ? "ok" : "info");
        return refresh();
      })
      .catch(function (err) {
        node.className = "probe bad";
        node.textContent = "probe failed";
        say(el.keyMsg, "Test failed: " + err.message, "err");
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = "Test";
      });
  }

  function testAll() {
    el.testAllBtn.disabled = true;
    var label = el.testAllBtn.textContent;
    el.testAllBtn.textContent = "Testing...";
    el.testAllNote.textContent = "one live call per key, 4 at a time";
    api("/admin/keys/test-all", { method: "POST" })
      .then(function (data) {
        (data.results || []).forEach(function (r) { state.testing[r.id] = r.probe; });
        var ok = (data.results || []).filter(function (r) { return r.probe.status === "ok"; }).length;
        say(el.keyMsg, "Probed " + data.tested + " keys, " + ok + " serving. Pool: " + data.pool.ready + " ready, " + data.pool.cooling + " cooling, " + data.pool.dead + " dead.", ok ? "ok" : "info");
        return refresh();
      })
      .catch(function (err) { say(el.keyMsg, "Test all failed: " + err.message, "err"); })
      .then(function () {
        el.testAllBtn.disabled = false;
        el.testAllBtn.textContent = label;
        el.testAllNote.textContent = "";
      });
  }

  function addKeys() {
    var raw = el.newKeys.value;
    var keys = raw.split(/[\\s,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!keys.length) { say(el.addMsg, "Nothing to add.", "err"); return; }
    el.addBtn.disabled = true;
    api("/admin/keys", { method: "POST", body: { keys: keys } })
      .then(function (data) {
        el.newKeys.value = "";
        el.addCount.textContent = "";
        say(el.addMsg, "Sent " + data.received + ", added " + data.added + ". Pool total " + data.pool.total + ".", data.added ? "ok" : "info");
        return refresh();
      })
      .catch(function (err) { say(el.addMsg, "Add failed: " + err.message, "err"); })
      .then(function () { el.addBtn.disabled = false; });
  }

  function startAuto() {
    stopAuto();
    if (!el.auto.checked) return;
    state.timer = setInterval(refresh, 5000);
  }
  function stopAuto() {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
  }

  el.connect.addEventListener("click", connect);
  el.token.addEventListener("keydown", function (e) { if (e.key === "Enter") connect(); });
  el.forget.addEventListener("click", function () {
    try { localStorage.removeItem(STORE); } catch (e) {}
    el.token.value = "";
    lock("Token cleared from this browser.");
  });
  el.auto.addEventListener("change", function () { if (el.auto.checked) startAuto(); else stopAuto(); });
  el.addBtn.addEventListener("click", addKeys);
  el.testAllBtn.addEventListener("click", testAll);
  var filterTimer = null;
  el.keyFilter.addEventListener("input", function () {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(function () {
      state.query = el.keyFilter.value.trim().toLowerCase();
      state.page = 1;
      drawTable();
    }, 140);
  });

  el.keySize.addEventListener("change", function () {
    state.size = Number(el.keySize.value) || 25;
    state.page = 1;
    drawTable();
  });

  el.newKeys.addEventListener("input", function () {
    var n = el.newKeys.value.split(/[\\s,]+/).filter(function (s) { return s.trim(); }).length;
    el.addCount.textContent = n ? n + " key" + (n === 1 ? "" : "s") + " detected" : "";
  });

  // Restore a previously stored token and try it silently.
  var saved = "";
  try { saved = localStorage.getItem(STORE) || ""; } catch (e) {}
  if (saved) { el.token.value = saved; connect(); }
})();
</script>
</body>
</html>`;

// src/models-ui.ts
var MODELS_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Models \xB7 key rotator</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%230e1116'/%3E%3Cpath d='M8 22V10h3l5 8 5-8h3v12h-2.6v-7.4L16.6 22h-1.2l-4.8-7.4V22z' fill='%2367e8a1'/%3E%3C/svg%3E">
<style>
:root{
  --bg:#0b0d11; --panel:#12161c; --panel-2:#161b22; --line:#232a33; --line-soft:#1b2129;
  --ink:#e6edf3; --muted:#8b98a5; --dim:#5f6b78;
  --ok:#67e8a1; --warn:#f0c04a; --bad:#f0705f; --cool:#68a8f0; --accent:#67e8a1;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent)}
.wrap{max-width:1240px;margin:0 auto;padding:22px 18px 64px}
header.top{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;border-bottom:1px solid var(--line);padding-bottom:14px}
h1{font-size:19px;margin:0;letter-spacing:-0.01em}
.sub{color:var(--muted);font-size:12.5px;margin-top:2px}
.top-right{display:flex;gap:12px;align-items:center;font-size:12px;color:var(--muted)}
.mono{font-family:var(--mono);font-size:12px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px}
label.field{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--dim);margin-bottom:6px}
input[type=password],input[type=text],select,textarea{width:100%;background:#0d1116;border:1px solid var(--line);color:var(--ink);border-radius:7px;padding:9px 11px;font:inherit;outline:none}
input:focus,select:focus{border-color:#3a4756;box-shadow:0 0 0 3px rgba(103,232,161,.09)}
button{background:var(--panel-2);color:var(--ink);border:1px solid var(--line);border-radius:7px;padding:9px 14px;font:inherit;cursor:pointer;transition:background 120ms ease,border-color 120ms ease}
button:hover:not(:disabled){background:#1d242c;border-color:#33404e}
button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
button:disabled{opacity:.5;cursor:not-allowed}
button.primary{background:var(--accent);color:#08130c;border-color:var(--accent);font-weight:600}
button.primary:hover:not(:disabled){background:#7defb3}
button.small{padding:5px 10px;font-size:12px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.grow{flex:1;min-width:200px}
.muted{color:var(--muted)}
.msg{display:none;margin-top:10px;padding:9px 12px;border-radius:7px;font-size:12.5px;border:1px solid transparent}
.msg.show{display:block}
.msg.err{background:rgba(240,112,95,.1);border-color:rgba(240,112,95,.35);color:#ffb3a8}
.msg.ok{background:rgba(103,232,161,.1);border-color:rgba(103,232,161,.32);color:#b9f7d4}
.msg.info{background:rgba(104,168,240,.1);border-color:rgba(104,168,240,.3);color:#b6d6fb}
.strip{display:flex;gap:0;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--panel);margin:18px 0}
.kv{padding:12px 18px;border-right:1px solid var(--line);min-width:96px}
.kv:last-child{border-right:0}
.kv b{display:block;font-size:19px;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.kv span{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--dim)}
.kv.ok b{color:var(--ok)} .kv.warn b{color:var(--warn)} .kv.bad b{color:var(--bad)} .kv.cool b{color:var(--cool)}
.spacer{flex:1;border:0}
.toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:16px 0 12px}
.toolbar .grow{min-width:180px}
.tablewrap{overflow-x:auto;padding:0}
table{width:100%;border-collapse:collapse;font-size:13px}
thead th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--dim);font-weight:600;padding:11px 12px;border-bottom:1px solid var(--line);white-space:nowrap;background:var(--panel)}
thead th.right{text-align:right}
tbody td{padding:10px 12px;border-bottom:1px solid var(--line-soft);vertical-align:middle}
tbody tr:last-child td{border-bottom:0}
tbody tr{transition:background 120ms ease}
tbody tr:hover{background:#151a20}
td.right{text-align:right;font-variant-numeric:tabular-nums}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10.5px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;border:1px solid transparent;white-space:nowrap}
.badge.free{background:rgba(103,232,161,.13);color:#8ff0bb;border-color:rgba(103,232,161,.3)}
.badge.paid{background:rgba(240,192,74,.12);color:#f3d489;border-color:rgba(240,192,74,.3)}
.badge.unknown{background:rgba(139,152,165,.12);color:#a9b5c1;border-color:rgba(139,152,165,.26)}
.tag{display:inline-block;padding:1px 7px;border-radius:5px;font-size:10.5px;background:#1a212a;color:var(--muted);border:1px solid var(--line);font-family:var(--mono)}
.mid{font-family:var(--mono);font-size:12.5px;color:var(--ink);word-break:break-all}
.dimtext{color:var(--dim);font-size:11.5px}
.probe{font-family:var(--mono);font-size:11.5px;white-space:nowrap}
.probe.ok{color:var(--ok)} .probe.warn{color:var(--warn)} .probe.bad{color:var(--bad)}
.pager{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:12px;font-size:12.5px;color:var(--muted)}
.pager .pages{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.pager button.small{min-width:34px;text-align:center}
.pager button.active{background:var(--accent);color:#08130c;border-color:var(--accent);font-weight:700}
.empty{padding:34px 18px;text-align:center;color:var(--muted)}
.empty b{display:block;color:var(--ink);margin-bottom:4px}
.foot{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:16px;font-size:12.5px;color:var(--muted)}
.check{display:flex;gap:8px;align-items:center;font-size:12.5px;color:var(--muted);cursor:pointer}
.skeleton{height:44px;background:linear-gradient(90deg,#141a21,#1b222b,#141a21);background-size:200% 100%;animation:sh 1.2s ease-in-out infinite;border-radius:6px;margin:6px 12px}
@keyframes sh{0%{background-position:200% 0}100%{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){.skeleton{animation:none}tbody tr,button{transition:none}}
@media (max-width:860px){
  .strip{flex-wrap:wrap}
  .kv{flex:1 1 45%;border-bottom:1px solid var(--line)}
  .kv:nth-child(2n){border-right:0}
  thead{display:none}
  tbody tr{display:grid;grid-template-columns:1fr auto;gap:2px 10px;padding:12px 4px;border-bottom:1px solid var(--line-soft)}
  tbody td{border:0;padding:0}
  tbody td::before{content:attr(data-l);display:block;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--dim);margin-top:4px}
  tbody td.mid{grid-column:1/-1}
  tbody td.mid::before{display:none}
  tbody td.act{grid-column:1/-1;text-align:left;margin-top:8px}
  tbody td.act::before{display:none}
}
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <div>
      <h1>Models</h1>
      <div class="sub">Live inventory from the Generative Language API, joined with published pricing</div>
    </div>
    <div class="top-right">
      <a href="/admin" class="mono">admin</a>
      <span id="asOf" class="mono">pricing: -</span>
      <span id="synced">-</span>
    </div>
  </header>

  <section id="authPanel" class="card" style="margin-top:18px">
    <label class="field" for="token">Admin token</label>
    <div class="row">
      <div class="grow"><input id="token" type="password" autocomplete="off" spellcheck="false" placeholder="ADMIN_TOKEN"></div>
      <button id="connect" class="primary" type="button">Connect</button>
    </div>
    <div id="authHint" class="msg err"></div>
    <p class="muted" style="margin:12px 0 0">The token stays in this browser and is only sent to this deployment.</p>
  </section>

  <section id="main" hidden>
    <div class="strip">
      <div class="kv ok"><b id="cTotal">0</b><span>models</span></div>
      <div class="kv ok"><b id="cFree">0</b><span>free tier</span></div>
      <div class="kv warn"><b id="cPaid">0</b><span>paid only</span></div>
      <div class="kv cool"><b id="cTested">0</b><span>tested</span></div>
      <div class="spacer"></div>
      <div class="kv" style="border-right:0"><b id="cTier">-</b><span>your tier</span></div>
    </div>

    <div class="card" style="padding:14px">
      <div class="row">
        <div style="min-width:210px">
          <label class="field" for="tier">Your plan</label>
          <select id="tier">
            <option value="free">Free tier (no billing)</option>
            <option value="paid">Pay-as-you-go (billing enabled)</option>
            <option value="pro">Google AI Pro / Ultra</option>
            <option value="any">Show everything</option>
          </select>
        </div>
        <div class="grow">
          <label class="field" for="q">Search</label>
          <input id="q" type="text" spellcheck="false" placeholder="gemini, tts, image, embedding...">
        </div>
        <div style="min-width:150px">
          <label class="field" for="kind">Capability</label>
          <select id="kind">
            <option value="">All</option>
            <option value="text">Text</option>
            <option value="tts">TTS</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="audio">Audio</option>
            <option value="live">Live</option>
            <option value="transcribe">Transcribe</option>
            <option value="embedding">Embedding</option>
            <option value="omni">Omni</option>
            <option value="robotics">Robotics</option>
          </select>
        </div>
        <div style="min-width:130px">
          <label class="field" for="size">Per page</label>
          <select id="size"><option>10</option><option selected>25</option><option>50</option><option>100</option></select>
        </div>
        <div style="align-self:flex-end">
          <button id="reload" type="button">Refresh live list</button>
        </div>
      </div>
      <div id="msg" class="msg"></div>
      <div id="tierNote" class="muted" style="margin-top:10px;font-size:12.5px"></div>
    </div>

    <div id="body" class="card tablewrap" style="margin-top:14px"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>
    <div id="pager" class="pager"></div>
    <div id="rowMsg" class="msg"></div>
  </section>
</div>

<script>
(function () {
  "use strict";
  var STORE = "gkr.admin.token";
  var el = {
    authPanel: document.getElementById("authPanel"),
    authHint: document.getElementById("authHint"),
    token: document.getElementById("token"),
    connect: document.getElementById("connect"),
    main: document.getElementById("main"),
    asOf: document.getElementById("asOf"),
    synced: document.getElementById("synced"),
    cTotal: document.getElementById("cTotal"),
    cFree: document.getElementById("cFree"),
    cPaid: document.getElementById("cPaid"),
    cTested: document.getElementById("cTested"),
    cTier: document.getElementById("cTier"),
    tier: document.getElementById("tier"),
    tierNote: document.getElementById("tierNote"),
    q: document.getElementById("q"),
    kind: document.getElementById("kind"),
    size: document.getElementById("size"),
    reload: document.getElementById("reload"),
    body: document.getElementById("body"),
    pager: document.getElementById("pager"),
    msg: document.getElementById("msg"),
    rowMsg: document.getElementById("rowMsg")
  };

  var state = {
    token: "", models: [], page: 1, size: 25, testing: {}, fetchedAt: 0
  };

  function say(node, text, kind) {
    node.className = "msg " + (kind || "info");
    node.textContent = text;
    node.classList.add("show");
  }
  function hide(node) { node.classList.remove("show"); node.textContent = ""; }

  function api(path, opts) {
    opts = opts || {};
    var headers = { "authorization": "Bearer " + state.token };
    if (opts.body) headers["content-type"] = "application/json";
    return fetch(path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.text().then(function (raw) {
        var data = null;
        try { data = raw ? JSON.parse(raw) : null; } catch (e) { data = null; }
        if (!res.ok) {
          var err = new Error((data && data.error && data.error.message) || ("HTTP " + res.status));
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function money(v) {
    if (v === null || v === undefined) return null;
    return "$" + (v >= 1 ? v.toFixed(2) : v.toFixed(3));
  }

  function tierMatches(m) {
    var tier = el.tier.value;
    if (tier === "any") return true;
    if (m.free === true) return true;
    if (m.free === false) return tier !== "free";
    return true;
  }

  function visible() {
    var q = el.q.value.trim().toLowerCase();
    var kind = el.kind.value;
    return state.models.filter(function (m) {
      if (kind && m.kind !== kind) return false;
      if (!tierMatches(m)) return false;
      if (!q) return true;
      return (m.id + " " + m.displayName + " " + m.description).toLowerCase().indexOf(q) >= 0;
    });
  }

  function stats() {
    el.cTotal.textContent = state.models.length;
    el.cFree.textContent = state.models.filter(function (m) { return m.free === true; }).length;
    el.cPaid.textContent = state.models.filter(function (m) { return m.free === false; }).length;
    el.cTested.textContent = Object.keys(state.testing).length;
  }

  function badgeFor(m) {
    var b = document.createElement("span");
    if (m.free === true) { b.className = "badge free"; b.textContent = "free tier"; }
    else if (m.free === false) { b.className = "badge paid"; b.textContent = "paid only"; }
    else { b.className = "badge unknown"; b.textContent = "unlisted"; }
    b.title = m.freeLabel;
    return b;
  }

  function cell(label, cls) {
    var td = document.createElement("td");
    if (cls) td.className = cls;
    if (label) td.setAttribute("data-l", label);
    return td;
  }

  function probeText(r) {
    if (!r) return "-";
    if (r.status === "ok") return "ok " + r.latencyMs + "ms";
    if (r.status === "unsupported") return "n/a";
    return r.status.replace(/_/g, " ") + " " + r.httpStatus;
  }
  function probeClass(r) {
    if (!r) return "";
    if (r.status === "ok") return "ok";
    if (r.status === "rate_limited" || r.status === "zero_quota") return "warn";
    return "bad";
  }

  function render() {
    var rows = visible();
    var pages = Math.max(1, Math.ceil(rows.length / state.size));
    if (state.page > pages) state.page = pages;
    if (state.page < 1) state.page = 1;
    var start = (state.page - 1) * state.size;
    var slice = rows.slice(start, start + state.size);

    stats();

    if (!rows.length) {
      el.body.innerHTML = "";
      var box = document.createElement("div");
      box.className = "empty";
      var b = document.createElement("b");
      b.textContent = "No model matches these filters";
      box.appendChild(b);
      box.appendChild(document.createTextNode("Clear the search box or switch your plan to Show everything."));
      el.body.appendChild(box);
      renderPager(0, 1);
      return;
    }

    var table = document.createElement("table");
    var thead = document.createElement("thead");
    thead.innerHTML = "<tr><th>Model</th><th>Tier</th><th class='right'>Input /1M</th><th class='right'>Output /1M</th><th class='right'>Ctx</th><th>Test</th><th></th></tr>";
    table.appendChild(thead);
    var tbody = document.createElement("tbody");

    slice.forEach(function (m) {
      var tr = document.createElement("tr");

      var cId = cell(null, "mid");
      cId.textContent = m.id;
      var sub = document.createElement("div");
      sub.className = "dimtext";
      var bits = [m.displayName];
      if (m.kind && m.kind !== "text") bits.push(m.kind);
      if (m.methods && m.methods.length) bits.push(m.methods.join("/"));
      sub.textContent = bits.join(" \xB7 ");
      cId.appendChild(sub);

      var cTier = cell("Tier");
      cTier.appendChild(badgeFor(m));

      var cIn = cell("Input /1M", "right");
      var inV = money(m.inUsd);
      if (inV) { cIn.textContent = inV; }
      else if (m.inRaw) { cIn.innerHTML = "<span class='dimtext'>unit</span>"; }
      else { cIn.innerHTML = "<span class='dimtext'>-</span>"; }
      if (m.inRaw) cIn.title = m.inRaw;

      var cOut = cell("Output /1M", "right");
      var outV = money(m.outUsd);
      if (outV) { cOut.textContent = outV; }
      else if (m.outRaw) { cOut.innerHTML = "<span class='dimtext'>unit</span>"; }
      else { cOut.innerHTML = "<span class='dimtext'>-</span>"; }
      if (m.outRaw) cOut.title = m.outRaw;

      var cCtx = cell("Ctx", "right");
      if (m.inputTokenLimit) {
        cCtx.textContent = (m.inputTokenLimit >= 1000 ? Math.round(m.inputTokenLimit / 1000) + "k" : String(m.inputTokenLimit));
      } else { cCtx.innerHTML = "<span class='dimtext'>-</span>"; }

      var cProbe = cell("Test");
      var pv = document.createElement("span");
      var known = state.testing[m.id];
      pv.className = "probe " + probeClass(known);
      pv.textContent = probeText(known);
      if (known && known.message) pv.title = known.message;
      cProbe.appendChild(pv);

      var cAct = cell(null, "act");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "small";
      btn.textContent = "Test model";
      btn.addEventListener("click", function () { testModel(m, btn, pv); });
      cAct.appendChild(btn);

      tr.appendChild(cId); tr.appendChild(cTier); tr.appendChild(cIn); tr.appendChild(cOut);
      tr.appendChild(cCtx); tr.appendChild(cProbe); tr.appendChild(cAct);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    el.body.innerHTML = "";
    el.body.appendChild(table);
    renderPager(rows.length, pages);
  }

  function renderPager(total, pages) {
    el.pager.innerHTML = "";
    if (!total) return;
    var start = (state.page - 1) * state.size + 1;
    var end = Math.min(total, state.page * state.size);

    var info = document.createElement("span");
    info.textContent = "Showing " + start + "-" + end + " of " + total;
    el.pager.appendChild(info);

    var box = document.createElement("div");
    box.className = "pages";

    function mk(label, page, disabled, active) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "small" + (active ? " active" : "");
      b.textContent = label;
      b.disabled = Boolean(disabled);
      if (active) b.setAttribute("aria-current", "page");
      b.addEventListener("click", function () { state.page = page; render(); });
      return b;
    }

    box.appendChild(mk("Prev", state.page - 1, state.page === 1, false));

    var windowSize = 5;
    var from = Math.max(1, state.page - Math.floor(windowSize / 2));
    var to = Math.min(pages, from + windowSize - 1);
    from = Math.max(1, to - windowSize + 1);
    if (from > 1) {
      box.appendChild(mk("1", 1, false, state.page === 1));
      if (from > 2) { var dots = document.createElement("span"); dots.textContent = "\u2026"; box.appendChild(dots); }
    }
    for (var p = from; p <= to; p++) box.appendChild(mk(String(p), p, false, p === state.page));
    if (to < pages) {
      if (to < pages - 1) { var d2 = document.createElement("span"); d2.textContent = "\u2026"; box.appendChild(d2); }
      box.appendChild(mk(String(pages), pages, false, state.page === pages));
    }

    box.appendChild(mk("Next", state.page + 1, state.page === pages, false));
    el.pager.appendChild(box);
  }

  function load(force) {
    el.reload.disabled = true;
    say(el.msg, force ? "Re-querying the live model list..." : "Loading live model list...", "info");
    var url = "/admin/models" + (force ? "?refresh=1" : "");
    api(url).then(function (data) {
      state.models = data.models || [];
      state.fetchedAt = Date.now();
      el.asOf.textContent = "pricing: " + (data.pricing && data.pricing.asOf ? data.pricing.asOf : "-");
      el.synced.textContent = "synced " + new Date().toLocaleTimeString();
      var live = data.source || "upstream";
      say(el.msg, state.models.length + " models from " + live + (data.cached ? " (cached)" : ""), "ok");
      setTimeout(function () { hide(el.msg); }, 4000);
      el.main.hidden = false;
      el.authPanel.hidden = true;
      render();
    }).catch(function (err) {
      if (err.status === 401) { lock("Token rejected. Enter the admin token."); return; }
      say(el.msg, "Could not load models: " + err.message, "err");
      el.main.hidden = false;
      el.body.innerHTML = "";
      var box = document.createElement("div");
      box.className = "empty";
      box.innerHTML = "<b>Live list unavailable</b>";
      box.appendChild(document.createTextNode("The pool has no key that can answer the model list right now. Add or revive a key in /admin."));
      el.body.appendChild(box);
    }).then(function () { el.reload.disabled = false; });
  }

  function lock(reason) {
    state.token = "";
    try { localStorage.removeItem(STORE); } catch (e) {}
    el.authPanel.hidden = false;
    el.main.hidden = true;
    el.token.value = "";
    if (reason) say(el.authHint, reason, "err");
    el.token.focus();
  }

  function connect() {
    var token = el.token.value.trim();
    if (!token) { say(el.authHint, "Enter the admin token.", "err"); return; }
    state.token = token;
    el.connect.disabled = true;
    hide(el.authHint);
    api("/admin/models").then(function () {
      try { localStorage.setItem(STORE, token); } catch (e) {}
      el.main.hidden = false;
      el.authPanel.hidden = true;
      load(false);
    }).catch(function (err) {
      if (err.status === 401) say(el.authHint, "Token rejected.", "err");
      else say(el.authHint, "Connection failed: " + err.message, "err");
    }).then(function () { el.connect.disabled = false; });
  }

  function testModel(m, btn, node) {
    btn.disabled = true;
    node.className = "probe";
    node.textContent = "testing...";
    say(el.rowMsg, "Calling " + m.id + " with a pooled key...", "info");
    api("/admin/models/test", { method: "POST", body: { model: m.id } }).then(function (data) {
      var r = data.result;
      state.testing[m.id] = r;
      node.className = "probe " + probeClass(r);
      node.textContent = probeText(r);
      node.title = r.message || "";
      if (r.status === "ok") {
        say(el.rowMsg, m.id + " served in " + r.latencyMs + "ms: " + (r.reply || "(empty reply)"), "ok");
      } else {
        say(el.rowMsg, m.id + " -> " + r.status + " (HTTP " + r.httpStatus + "): " + r.message, r.status === "rate_limited" ? "info" : "err");
      }
      stats();
    }).catch(function (err) {
      node.className = "probe bad";
      node.textContent = "error";
      say(el.rowMsg, "Test failed: " + err.message, "err");
      if (err.status === 401) lock("Token rejected.");
    }).then(function () { btn.disabled = false; });
  }

  el.token.addEventListener("keydown", function (e) { if (e.key === "Enter") connect(); });
  el.connect.addEventListener("click", connect);
  el.reload.addEventListener("click", function () { load(true); });

  el.size.addEventListener("change", function () {
    state.size = Number(el.size.value) || 25;
    state.page = 1;
    render();
  });

  var debounce = null;
  el.q.addEventListener("input", function () {
    clearTimeout(debounce);
    debounce = setTimeout(function () { state.page = 1; render(); }, 140);
  });

  el.kind.addEventListener("change", function () { state.page = 1; render(); });

  el.tier.addEventListener("change", function () {
    var t = el.tier.value;
    try { localStorage.setItem("gkr.tier", t); } catch (e) {}
    var label = { free: "Free tier", paid: "Pay-as-you-go", pro: "Google AI Pro/Ultra", any: "All models" }[t];
    el.cTier.textContent = label;
    if (t === "free") el.tierNote.textContent = "Models marked paid only need billing enabled on the Google Cloud project behind the key.";
    else if (t === "pro") el.tierNote.textContent = "AI Pro/Ultra quotas apply inside the Google AI Studio / Gemini app, not to raw API keys. API keys bill through Cloud.";
    else if (t === "paid") el.tierNote.textContent = "Paid tier prices below are per 1M tokens in USD, from Google's published table.";
    else el.tierNote.textContent = "Showing every model Google returns, regardless of billing.";
    state.page = 1;
    render();
  });

  var saved = null;
  try { saved = localStorage.getItem(STORE); } catch (e) {}
  var savedTier = null;
  try { savedTier = localStorage.getItem("gkr.tier"); } catch (e) {}
  if (savedTier) el.tier.value = savedTier;
  if (saved) {
    state.token = saved;
    el.token.value = saved;
    api("/admin/models").then(function () {
      el.main.hidden = false;
      el.authPanel.hidden = true;
      load(false);
    }).catch(function () { lock("Saved token is no longer valid."); });
  } else {
    el.token.focus();
  }
  el.tier.dispatchEvent(new Event("change"));
})();
</script>
</body>
</html>`;

// src/models-catalog.ts
var PRICING_AS_OF = "2026-10-19";
var CATALOG = [
  { "id": "gemini-4-argon", "name": "Gemini 4 Argon", "kind": "text", "free": false, "freeLabel": "Not available", "inUsd": 2, "outUsd": 10, "inRaw": "$2.00 through November 30, 2026. | $4.00 starting December 1, 2026.", "outRaw": "$10.00 through November 30, 2026. | $20.00 starting December 1, 2026." },
  { "id": "gemini-3.8-flash", "name": "Gemini 3.8 Flash", "kind": "text", "free": true, "freeLabel": "Free of charge", "inUsd": 0.75, "outUsd": 3.75, "inRaw": "$0.75 through December 31, 2026. | $1.50 starting January 1, 2027.", "outRaw": "$3.75 through December 31, 2026. | $7.50 starting January 1, 2027." },
  { "id": "gemini-3.6-flash", "name": "Gemini 3.6 Flash", "kind": "text", "free": true, "freeLabel": "Free of charge", "inUsd": 0.75, "outUsd": 3.75, "inRaw": "$0.75 through December 31, 2026. | $1.50 starting January 1, 2027.", "outRaw": "$3.75 through December 31, 2026. | $7.50 starting January 1, 2027." },
  { "id": "gemini-3.8-live", "name": "Gemini 3.8 Live, Gemini 3.8 Live Extended Thinking, and Gemini 3.1 Flash Live Preview", "kind": "live", "free": true, "freeLabel": "Free of charge", "inUsd": 0.75, "outUsd": 4.5, "inRaw": "$0.75 (text) | $3.00 or $0.005/min (audio) | $1.00 or $0.002/min (image/video)", "outRaw": "$4.50 (text) | $12.00 or $0.018/min (audio)" },
  { "id": "gemini-3.5-live-translate-preview", "name": "Gemini 3.5 Live Translate", "kind": "live", "free": true, "freeLabel": "Free of charge", "inUsd": 3.5, "outUsd": 21, "inRaw": "$3.50 or $0.0053/min* (audio)", "outRaw": "$21.00 or $0.0315/min* (audio)" },
  { "id": "gemini-3.5-transcribe-live", "name": "Gemini 3.5 Transcribe Live", "kind": "live", "free": true, "freeLabel": "Free of charge", "inUsd": 3.5, "outUsd": 21, "inRaw": "$3.50 or $0.005/min* (audio)", "outRaw": "$21.00 or $0.004/min* (text)" },
  { "id": "gemini-3.5-transcribe", "name": "Gemini 3.5 Transcribe", "kind": "transcribe", "free": true, "freeLabel": "Free of charge", "inUsd": 2, "outUsd": 12, "inRaw": "$2.00 or $0.003/min* (audio)", "outRaw": "$12.00 or $0.002/min* (text)" },
  { "id": "gemini-3.5-flash-lite", "name": "Gemini 3.5 Flash-Lite", "kind": "text", "free": true, "freeLabel": "Free of charge", "inUsd": 0.3, "outUsd": 2.5, "inRaw": "$0.30 (text / image / video / audio)", "outRaw": "$2.50" },
  { "id": "gemini-3.1-flash-lite", "name": "Gemini 3.1 Flash-Lite", "kind": "text", "free": true, "freeLabel": "Free of charge", "inUsd": 0.25, "outUsd": 1.5, "inRaw": "$0.25 (text / image / video) | $0.50 (audio)", "outRaw": "$1.50" },
  { "id": "gemini-omni-1.1-flash", "name": "Gemini Omni Flash", "kind": "omni", "free": false, "freeLabel": "Not available", "inUsd": 1.5, "outUsd": 9, "inRaw": "$1.50 (text / image / video / audio)", "outRaw": "$9.00 (text) | $17.50 (video)*" },
  { "id": "gemini-omni-flash-preview", "name": "Gemini Omni Flash Preview", "kind": "omni", "free": false, "freeLabel": "Not available", "inUsd": 1.5, "outUsd": 9, "inRaw": "$1.50 (text / image / video / audio)", "outRaw": "$9.00 (text) | $17.50 (video)*" },
  { "id": "gemini-3.1-pro-preview", "name": "Gemini 3.1 Pro Preview", "kind": "text", "free": false, "freeLabel": "Not available", "inUsd": 2, "outUsd": 12, "inRaw": "$2.00, prompts 200k tokens", "outRaw": "$12.00, prompts 200k" },
  { "id": "gemini-nano-banana-2.1", "name": "Gemini Nano Banana 2.1 \u{1F34C}", "kind": "text", "free": false, "freeLabel": "Not available", "inUsd": 1.5, "outUsd": 7.5, "inRaw": "$1.50 (text/image/video)", "outRaw": "$7.50 (text and thinking) | $30.00 (images) | Equivalent to $0.0336 per 1K image*, | $0.0504 per 2K image*, | and $0.113 per 4K image*." },
  { "id": "gemini-3.1-flash-image", "name": "Gemini 3.1 Flash Image (Nano Banana 2) \u{1F34C}", "kind": "image", "free": false, "freeLabel": "Not available", "inUsd": 0.5, "outUsd": 3, "inRaw": "$0.50 (text/image)", "outRaw": "$3 (text and thinking) | $60.00 (images) | Equivalent to $0.045 per 0.5K image* | $0.067 per 1K image*, $0.101 per 2K image*, and $0.151 per 4K image*." },
  { "id": "gemini-3.1-flash-lite-image", "name": "Gemini 3.1 Flash Lite Image (Nano Banana 2 Lite) \u{1F34C}", "kind": "image", "free": false, "freeLabel": "Not available", "inUsd": 0.25, "outUsd": 1.5, "inRaw": "$0.25 (text/image/video)", "outRaw": "$1.50 (text and thinking) | $30.00 (images) | Equivalent to $0.0336 per 1K resolution image*" },
  { "id": "gemini-3.8-flash-tts", "name": "Gemini 3.8 Flash TTS", "kind": "tts", "free": true, "freeLabel": "Free of charge", "inUsd": 0.5, "outUsd": 9, "inRaw": "$0.50 (text) through December 31, 2026. | $1.00 (text) starting January 1, 2027.", "outRaw": "$9.00 (audio) through December 31, 2026. | $18.00 (audio) starting January 1, 2027. | Equivalent to $0.00225 per 10s audio* through December 31, 2026. | Equivalent to $0.0045 per 10s audio* starting January 1, 2027." },
  { "id": "gemini-3.8-flash-lite-tts", "name": "Gemini 3.8 Flash-Lite TTS", "kind": "tts", "free": true, "freeLabel": "Free of charge", "inUsd": 0.5, "outUsd": 6, "inRaw": "$0.50 (text) through December 31, 2026. | $1.00 (text) starting January 1, 2027.", "outRaw": "$6.00 (audio) through December 31, 2026. | $12.00 (audio) starting January 1, 2027. | Equivalent to $0.0015 per 10s audio* through December 31, 2026. | Equivalent to $0.003 per 10s audio* starting January 1, 2027." },
  { "id": "gemini-3.1-flash-tts-preview", "name": "Gemini 3.1 Flash TTS Preview", "kind": "tts", "free": true, "freeLabel": "Free of charge", "inUsd": 1, "outUsd": 20, "inRaw": "$1.00 (text)", "outRaw": "$20.00 (audio)" },
  { "id": "gemini-3-flash-preview", "name": "Gemini 3 Flash Preview", "kind": "text", "free": true, "freeLabel": "Free of charge", "inUsd": 0.5, "outUsd": 3, "inRaw": "$0.50 (text / image / video) | $1.00 (audio)", "outRaw": "$3.00" },
  { "id": "gemini-3-pro-image", "name": "Gemini 3 Pro Image (Nano Banana Pro) \u{1F34C}", "kind": "image", "free": false, "freeLabel": "Not available", "inUsd": 2, "outUsd": 12, "inRaw": "$2.00 (text/image), | equivalent to $0.0011 per image*", "outRaw": "$12.00 (text and thinking) | $120.00 (images) | Equivalent to $0.134 per 1K/2K image** | and $0.24 per 4K image**" },
  { "id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro", "kind": "text", "free": true, "freeLabel": "Free of charge", "inUsd": 1.25, "outUsd": 10, "inRaw": "$1.25, prompts 200k tokens", "outRaw": "$10.00, prompts 200k" },
  { "id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash", "kind": "text", "free": true, "freeLabel": "Free of charge", "inUsd": 0.3, "outUsd": 2.5, "inRaw": "$0.30 (text / image / video) | $1.00 (audio)", "outRaw": "$2.50" },
  { "id": "gemini-2.5-flash-lite", "name": "Gemini 2.5 Flash-Lite", "kind": "text", "free": true, "freeLabel": "Free of charge", "inUsd": 0.1, "outUsd": 0.4, "inRaw": "$0.10 (text / image / video) | $0.30 (audio)", "outRaw": "$0.40" },
  { "id": "gemini-2.5-flash-native-audio", "name": "Gemini 2.5 Flash Native Audio (Live API)", "kind": "text", "free": true, "freeLabel": "Free of charge", "inUsd": 0.5, "outUsd": 2, "inRaw": "$0.50 (text) | $3.00 (audio / video)", "outRaw": "$2.00 (text) | $12.00 (audio)" },
  { "id": "gemini-2.5-flash-image", "name": "Gemini 2.5 Flash Image (Nano Banana) \u{1F34C}", "kind": "image", "free": false, "freeLabel": "Not available", "inUsd": 0.3, "outUsd": 0.039, "inRaw": "$0.30 (text / image)", "outRaw": "$0.039 per image*" },
  { "id": "gemini-2.5-flash-preview-tts", "name": "Gemini 2.5 Flash Preview TTS", "kind": "tts", "free": true, "freeLabel": "Free of charge", "inUsd": 0.5, "outUsd": 10, "inRaw": "$0.50 (text)", "outRaw": "$10.00 (audio)" },
  { "id": "gemini-2.5-pro-preview-tts", "name": "Gemini 2.5 Pro Preview TTS", "kind": "tts", "free": false, "freeLabel": "Not available", "inUsd": 1, "outUsd": 20, "inRaw": "$1.00 (text)", "outRaw": "$20.00 (audio)" },
  { "id": "veo-3.1", "name": "Veo 3.1", "kind": "video", "free": null, "freeLabel": "unknown", "inUsd": null, "outUsd": null, "inRaw": "", "outRaw": "" },
  { "id": "lyria-3-5", "name": "Lyria 3.5", "kind": "audio", "free": null, "freeLabel": "unknown", "inUsd": null, "outUsd": null, "inRaw": "", "outRaw": "" },
  { "id": "lyria-3", "name": "Lyria 3", "kind": "audio", "free": null, "freeLabel": "unknown", "inUsd": null, "outUsd": null, "inRaw": "", "outRaw": "" },
  { "id": "gemini-embedding-2", "name": "Gemini Embedding 2", "kind": "embedding", "free": null, "freeLabel": "unknown", "inUsd": null, "outUsd": null, "inRaw": "", "outRaw": "" },
  { "id": "gemini-robotics-er-2", "name": "Gemini Robotics ER 2 Preview", "kind": "robotics", "free": true, "freeLabel": "Free of charge", "inUsd": 1, "outUsd": 5, "inRaw": "$1.00 (text / image / video / audio) through December 31, 2026. | $2.00 (text / image / video / audio) starting January 1, 2027.", "outRaw": "$5.00 through December 31, 2026. | $10.00 starting January 1, 2027." },
  { "id": "gemini-robotics-er-2-streaming", "name": "Gemini Robotics ER 2 Streaming Preview", "kind": "robotics", "free": true, "freeLabel": "Free of charge", "inUsd": 1, "outUsd": 5, "inRaw": "$1.00 (text / image / video / audio) through December 31, 2026. | $2.00 (text / image / video / audio) starting January 1, 2027.", "outRaw": "$5.00 through December 31, 2026. | $10.00 starting January 1, 2027." }
];
var BY_ID = new Map(CATALOG.map((m) => [m.id, m]));
function catalogFor(id) {
  return BY_ID.get(id.replace(/^models\//, "")) ?? null;
}

// src/upstream.ts
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function parseRetryAfter(res, body) {
  const h = res.headers.get("retry-after");
  if (h) {
    const secs = Number(h);
    if (Number.isFinite(secs) && secs > 0) return secs * 1e3;
    const date = Date.parse(h);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  const m = /(?:retry|reset|try again)[^0-9]{0,20}(\d+(?:\.\d+)?)\s*(ms|s|sec|seconds)/i.exec(body);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) return m[2] === "ms" ? n : n * 1e3;
  }
  return null;
}
function isQuotaText(body) {
  return /RESOURCE_EXHAUSTED|quota|rate.?limit|exceeded/i.test(body);
}
function isInvalidKeyText(body) {
  return /API_KEY_INVALID|API key not valid|API key expired|invalid.?api.?key/i.test(body);
}
function isZeroQuota(body) {
  if (/requests?\s*per\s*minute|per_minute|\b1\/min\b|RequestsPerMinute/i.test(body)) {
    return false;
  }
  return /"quota_limit_value"\s*:\s*"?0"?/.test(body) || /quota_limit_value[:=]\s*0\b/.test(body);
}
function headersFor(src, key) {
  const h = new Headers();
  for (const [name, value] of src.entries()) {
    const n = name.toLowerCase();
    if (n === "host" || n === "content-length" || n === "connection") continue;
    if (n === "x-goog-api-key" || n === "authorization") continue;
    if (n === "accept-encoding") continue;
    h.set(name, value);
  }
  if (key.startsWith("ya29.") || key.startsWith("Bearer ")) {
    h.set("authorization", key.startsWith("Bearer ") ? key : `Bearer ${key}`);
  } else {
    h.set("x-goog-api-key", key);
  }
  return h;
}
function urlWithoutKey(raw2) {
  const u = new URL(raw2);
  u.searchParams.delete("key");
  return u.toString();
}
function attemptSignal(client, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return client ? AbortSignal.any([client, timeout]) : timeout;
}
async function execute(url, init, path, signal) {
  const tried = /* @__PURE__ */ new Set();
  const deadline = Date.now() + cfg.maxWaitMs;
  let attempts = 0;
  let rotated = false;
  if (signal?.aborted) return aborted();
  for (; ; ) {
    let st = await pick(tried);
    while (!st) {
      const snap = await snapshot();
      if (snap.total === 0) {
        counters.poolExhausted++;
        return {
          response: jsonError(503, "no_api_keys", "The key pool is empty."),
          key: "",
          attempts,
          rotated
        };
      }
      const wait = Math.max(120, Math.min(snap.soonestReadyMs || 500, 2e3));
      if (Date.now() + wait > deadline || signal?.aborted) {
        counters.poolExhausted++;
        log("warn", "pool.exhausted", {
          path,
          total: snap.total,
          cooling: snap.cooling,
          dead: snap.dead,
          soonestReadyMs: snap.soonestReadyMs
        });
        return {
          response: jsonError(
            429,
            "pool_exhausted",
            `All ${snap.total} key${snap.total === 1 ? "" : "s"} are rate limited. Retry in ${Math.ceil(snap.soonestReadyMs / 1e3)}s.`
          ),
          key: "",
          attempts,
          rotated
        };
      }
      await sleep(wait);
      st = await pick(tried);
    }
    if (attempts > 0) {
      rotated = true;
      counters.rotations++;
    }
    if (attempts >= cfg.maxAttempts) {
      counters.poolExhausted++;
      return {
        response: jsonError(429, "max_attempts", "Every key attempt failed."),
        key: st.key,
        attempts,
        rotated
      };
    }
    attempts++;
    tried.add(st.key);
    const headers = headersFor(new Headers(init.headers), st.key);
    const target = urlWithoutKey(url);
    let res;
    counters.upstreamRequests++;
    try {
      res = await fetch(target, {
        // Carry the caller's body (and `duplex` for streamed bodies) through
        // unchanged; only the credential headers are swapped.
        ...init,
        headers,
        // Never follow redirects into a different credential scope.
        redirect: "manual",
        signal: attemptSignal(signal, cfg.upstreamTimeoutMs)
      });
    } catch (err2) {
      if (signal?.aborted) {
        counters.clientAborts++;
        log("warn", "client.aborted", { path, attempt: attempts, key: st.key });
        return aborted();
      }
      counters.networkErrors++;
      await markSoftError(st.key, cfg.serverErrCooldownMs);
      log("warn", "upstream.network_error", {
        path,
        key: st.key,
        attempt: attempts,
        error: err2 instanceof Error ? err2.message : String(err2)
      });
      if (attempts >= cfg.maxAttempts) throw err2;
      continue;
    }
    await markUsed(st.key);
    const status = res.status;
    if (status === 429) {
      counters.upstream429++;
      const body = await safeText(res);
      if (isZeroQuota(body)) {
        const claimed = await markInvalid(st.key);
        log("warn", "key.zero_quota", { path, key: st.key, first: claimed });
        if (attempts >= cfg.maxAttempts) return { response: rebuild(res, body), key: st.key, attempts, rotated };
        continue;
      }
      const cd = parseRetryAfter(res, body) ?? cfg.cooldownMs;
      await mark429(st.key, Math.max(cfg.cooldownMs, cd));
      log("info", "key.cooldown", { path, key: st.key, status, cooldownMs: Math.max(cfg.cooldownMs, cd) });
      if (attempts >= cfg.maxAttempts) return { response: rebuild(res, body), key: st.key, attempts, rotated };
      continue;
    }
    if (status === 401 || status === 403) {
      const body = await safeText(res);
      if (isInvalidKeyText(body) || status === 401) {
        const claimed = await markInvalid(st.key);
        log("warn", "key.invalid", { path, key: st.key, status, first: claimed });
      } else if (isQuotaText(body)) {
        counters.upstream429++;
        if (isZeroQuota(body)) {
          const claimed = await markInvalid(st.key);
          log("warn", "key.zero_quota", { path, key: st.key, first: claimed });
          if (attempts >= cfg.maxAttempts) return { response: rebuild(res, body), key: st.key, attempts, rotated };
          continue;
        }
        const cd = parseRetryAfter(res, body) ?? cfg.cooldownMs;
        await mark429(st.key, Math.max(cfg.cooldownMs, cd));
        log("info", "key.cooldown", { path, key: st.key, status, cooldownMs: Math.max(cfg.cooldownMs, cd) });
      } else {
        return { response: rebuild(res, body), key: st.key, attempts, rotated };
      }
      if (attempts >= cfg.maxAttempts) return { response: rebuild(res, body), key: st.key, attempts, rotated };
      continue;
    }
    if (status === 400) {
      const body = await safeText(res);
      if (isInvalidKeyText(body)) {
        const claimed = await markInvalid(st.key);
        log("warn", "key.invalid", { path, key: st.key, status, first: claimed });
        if (attempts >= cfg.maxAttempts) return { response: rebuild(res, body), key: st.key, attempts, rotated };
        continue;
      }
      return { response: rebuild(res, body), key: st.key, attempts, rotated };
    }
    if (status >= 500) {
      counters.upstream5xx++;
      const body = await safeText(res);
      await markSoftError(st.key, cfg.serverErrCooldownMs);
      log("warn", "key.soft_error", { path, key: st.key, status, attempt: attempts });
      if (attempts >= cfg.maxAttempts) return { response: rebuild(res, body), key: st.key, attempts, rotated };
      continue;
    }
    return { response: res, key: st.key, attempts, rotated };
  }
}
function aborted() {
  return {
    response: new Response(null, { status: 499 }),
    key: "",
    attempts: 0,
    rotated: false
  };
}
async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
function rebuild(res, body) {
  const h = new Headers(res.headers);
  h.delete("content-encoding");
  h.delete("content-length");
  h.delete("transfer-encoding");
  return new Response(body, { status: res.status, headers: h });
}
function jsonError(status, code, message) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json" }
  });
}

// src/models.ts
var CACHE_MS = Number(process.env.MODELS_CACHE_MS ?? 3e5);
var TIMEOUT_MS = Number(process.env.MODELS_TIMEOUT_MS ?? 1e4);
var cache = null;
function kindOf(id, methods) {
  const c = catalogFor(id);
  if (c) return c.kind;
  const m = id.toLowerCase();
  if (m.includes("embedding")) return "embedding";
  if (m.includes("tts")) return "tts";
  if (m.includes("image") || m.includes("imagen") || m.includes("banana")) return "image";
  if (m.includes("veo")) return "video";
  if (m.includes("lyria")) return "audio";
  if (m.includes("live")) return "live";
  if (m.includes("transcribe")) return "transcribe";
  if (methods.some((x) => /predict|generateVideo/i.test(x))) return "video";
  if (methods.some((x) => /embedContent|embedText/i.test(x))) return "embedding";
  return "text";
}
async function candidateKeys(limit = 6) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (let i = 0; i < limit; i++) {
    const st = await pick(seen);
    if (!st) break;
    seen.add(st.key);
    out.push(st.key);
  }
  return out;
}
async function fetchWithKey(key) {
  const url = `${cfg.upstream.replace(/\/$/, "")}/v1beta/models?pageSize=1000`;
  return fetch(url, {
    method: "GET",
    headers: { "x-goog-api-key": key },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
}
async function listLiveModels(force = false) {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) {
    return { models: cache.models, source: cache.source, cached: true };
  }
  const keys = await candidateKeys();
  if (!keys.length) {
    const err2 = new Error("Pool has no selectable key, cannot query the model list.");
    err2.code = "empty_pool";
    throw err2;
  }
  let lastErr = "";
  for (const key of keys) {
    let res;
    try {
      res = await fetchWithKey(key);
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      continue;
    }
    const body = await res.text().catch(() => "");
    if (!res.ok) {
      lastErr = `HTTP ${res.status}: ${body.slice(0, 180)}`;
      log("warn", "models.list_key_failed", { status: res.status, zeroQuota: isZeroQuota(body) });
      continue;
    }
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      lastErr = "Upstream returned non-JSON model list.";
      continue;
    }
    const models2 = (payload.models ?? []).map((raw2) => {
      const full = String(raw2.name ?? "");
      const id = full.replace(/^models\//, "");
      const methods = Array.isArray(raw2.supportedGenerationMethods) ? raw2.supportedGenerationMethods : [];
      const cat = catalogFor(id);
      return {
        id,
        name: full,
        displayName: String(raw2.displayName ?? id),
        description: String(raw2.description ?? ""),
        version: String(raw2.version ?? ""),
        methods,
        inputTokenLimit: typeof raw2.inputTokenLimit === "number" ? raw2.inputTokenLimit : null,
        outputTokenLimit: typeof raw2.outputTokenLimit === "number" ? raw2.outputTokenLimit : null,
        kind: kindOf(id, methods),
        free: cat?.free ?? null,
        freeLabel: cat?.freeLabel ?? "not published",
        inUsd: cat?.inUsd ?? null,
        outUsd: cat?.outUsd ?? null,
        inRaw: cat?.inRaw ?? "",
        outRaw: cat?.outRaw ?? ""
      };
    });
    models2.sort((a, b) => a.id.localeCompare(b.id));
    cache = { at: Date.now(), models: models2, source: "generativelanguage.googleapis.com" };
    return { models: models2, source: cache.source, cached: false };
  }
  if (cache) return { models: cache.models, source: cache.source + " (stale)", cached: true };
  throw new Error(lastErr || "Could not list models with any pooled key.");
}
async function testModel(modelId, rawKey) {
  const id = modelId.replace(/^models\//, "").trim();
  let key = rawKey?.trim() ?? "";
  const pooled = !key;
  if (!key) {
    const st = await pick();
    if (!st) {
      return { id, status: "error", httpStatus: 0, latencyMs: 0, reply: "", message: "No selectable key in the pool.", pooled: true };
    }
    key = st.key;
  }
  const url = `${cfg.upstream.replace(/\/$/, "")}/v1beta/models/${encodeURIComponent(id)}:generateContent`;
  const started = Date.now();
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Reply with exactly: OK" }] }],
        generationConfig: { maxOutputTokens: 64, temperature: 0 }
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch (e) {
    return { id, status: "error", httpStatus: 0, latencyMs: Date.now() - started, reply: "", message: e instanceof Error ? e.message : String(e), pooled };
  }
  const latencyMs = Date.now() - started;
  const body = await res.text().catch(() => "");
  let parsed = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = null;
  }
  const errMsg = (() => {
    const e = parsed?.error ?? {};
    return e.message ?? body.replace(/\s+/g, " ").slice(0, 220);
  })();
  if (res.ok) {
    const cands = parsed?.candidates ?? [];
    const text = (cands[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    return { id, status: "ok", httpStatus: res.status, latencyMs, reply: text.slice(0, 200), message: "serving", pooled };
  }
  if (res.status === 404) {
    return { id, status: "unsupported", httpStatus: 404, latencyMs, reply: "", message: errMsg || "model not available to this key", pooled };
  }
  if (res.status === 429) {
    return { id, status: isZeroQuota(body) ? "zero_quota" : "rate_limited", httpStatus: 429, latencyMs, reply: "", message: errMsg || "rate limited", pooled };
  }
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    return { id, status: "invalid", httpStatus: res.status, latencyMs, reply: "", message: errMsg || "key rejected", pooled };
  }
  return { id, status: "error", httpStatus: res.status, latencyMs, reply: "", message: errMsg || `HTTP ${res.status}`, pooled };
}
function pricingMeta() {
  return { asOf: PRICING_AS_OF, entries: CATALOG.length };
}

// src/probe.ts
var TIMEOUT_MS2 = Number(process.env.PROBE_TIMEOUT_MS ?? 8e3);
var MAX_TOKENS = 64;
function messageOf(body) {
  try {
    const parsed = JSON.parse(body);
    const msg = parsed.error?.message ?? parsed.error?.status ?? "";
    if (msg) return msg.slice(0, 220);
  } catch {
  }
  return body.replace(/\s+/g, " ").trim().slice(0, 220);
}
var FALLBACK_MODELS = (process.env.PROBE_FALLBACK_MODELS ?? "").split(",").map((s) => s.trim()).filter(Boolean).concat(["gemini-3.8-flash", "gemini-3.5-flash", "gemini-2.5-flash"]);
function isModelUnavailable(body) {
  return /no longer available to new users|is not found for API version|not supported for generateContent|does not support generateContent|MODEL_NOT_FOUND|is not supported/i.test(
    body
  );
}
async function probeKey(rawKey, model) {
  const chain = [model ?? cfg.defaultModel, ...FALLBACK_MODELS].filter(
    (m, i, all) => Boolean(m) && all.indexOf(m) === i
  );
  let last = null;
  for (const candidate of chain) {
    const res = await probeOnce(rawKey, candidate);
    if (res.status !== "unexpected" || res.httpStatus !== 404) return res;
    if (!isModelUnavailable(res.message)) return res;
    last = res;
  }
  return last ?? {
    status: "unexpected",
    httpStatus: 0,
    latencyMs: 0,
    retryAfterMs: 0,
    message: "no probe model was accepted"
  };
}
async function probeOnce(rawKey, model) {
  const url = `${cfg.upstream.replace(/\/$/, "")}/v1beta/models/${model}:generateContent`;
  const started = Date.now();
  const signal = AbortSignal.timeout(TIMEOUT_MS2);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": rawKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "ping" }] }],
        generationConfig: { maxOutputTokens: MAX_TOKENS, temperature: 0 }
      }),
      redirect: "manual",
      signal
    });
  } catch (err2) {
    return {
      status: "network_error",
      httpStatus: 0,
      latencyMs: Date.now() - started,
      retryAfterMs: 0,
      message: err2 instanceof Error ? err2.message : String(err2)
    };
  }
  const latencyMs = Date.now() - started;
  const body = await res.text().catch(() => "");
  const status = res.status;
  if (status >= 200 && status < 300) {
    return { status: "ok", httpStatus: status, latencyMs, retryAfterMs: 0, message: "serving" };
  }
  if (status === 429) {
    if (isZeroQuota(body)) {
      return {
        status: "zero_quota",
        httpStatus: status,
        latencyMs,
        retryAfterMs: 0,
        message: messageOf(body) || "project quota is 0"
      };
    }
    return {
      status: "rate_limited",
      httpStatus: status,
      latencyMs,
      retryAfterMs: parseRetryAfter(res, body) ?? cfg.cooldownMs,
      message: messageOf(body) || "rate limited"
    };
  }
  if (status === 401 || status === 403 || status === 400) {
    if (isInvalidKeyText(body) || /reported as leaked/i.test(body) || status === 401) {
      return {
        status: "invalid",
        httpStatus: status,
        latencyMs,
        retryAfterMs: 0,
        message: messageOf(body) || "key rejected"
      };
    }
    if (isZeroQuota(body)) {
      return {
        status: "zero_quota",
        httpStatus: status,
        latencyMs,
        retryAfterMs: 0,
        message: messageOf(body) || "project quota is 0"
      };
    }
    if (status === 400 && /API key not valid|API_KEY_INVALID/i.test(body)) {
      return {
        status: "invalid",
        httpStatus: status,
        latencyMs,
        retryAfterMs: 0,
        message: messageOf(body)
      };
    }
    return {
      status: "unexpected",
      httpStatus: status,
      latencyMs,
      retryAfterMs: 0,
      message: messageOf(body) || `HTTP ${status}`
    };
  }
  if (status >= 500) {
    return {
      status: "server_error",
      httpStatus: status,
      latencyMs,
      retryAfterMs: 0,
      message: messageOf(body) || `HTTP ${status}`
    };
  }
  return {
    status: "unexpected",
    httpStatus: status,
    latencyMs,
    retryAfterMs: 0,
    message: messageOf(body) || `HTTP ${status}`
  };
}

// src/gemini.ts
var UP = cfg.upstream.replace(/\/$/, "");
function geminiPassthrough(req, path) {
  const url = new URL(req.url);
  const upstreamUrl = `${UP}${path}${url.search}`;
  return execute(
    upstreamUrl,
    {
      method: req.method,
      headers: req.headers,
      body: req.method === "GET" || req.method === "HEAD" ? void 0 : req.body,
      // @ts-expect-error Bun needs half-duplex for streaming bodies
      duplex: "half"
    },
    path,
    req.signal
  ).then((r) => withMeta(r.response, r));
}
function withMeta(res, meta) {
  const h = new Headers(res.headers);
  h.set("x-gkr-attempts", String(meta.attempts));
  h.set("x-gkr-rotated", meta.rotated ? "1" : "0");
  return new Response(res.body, { status: res.status, headers: h });
}
async function speech(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body must be JSON.");
  }
  const text = (body.input ?? "").trim();
  if (!text) return badRequest("`input` is required.");
  const model = body.model && body.model.startsWith("gemini") ? body.model : cfg.defaultTtsModel;
  const voice = VOICE_MAP[(body.voice ?? "").toLowerCase()] ?? body.voice ?? cfg.defaultVoice;
  const fmt = (body.response_format ?? "wav").toLowerCase();
  const payload = {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
    }
  };
  const path = `/v1beta/models/${model}:generateContent`;
  const result = await execute(
    `${UP}${path}`,
    {
      method: "POST",
      headers: new Headers({
        "content-type": "application/json",
        accept: "application/json"
      }),
      body: JSON.stringify(payload)
    },
    path,
    req.signal
  );
  if (result.response.status === 499) {
    return new Response(null, { status: 499 });
  }
  if (!result.response.ok) return result.response;
  let json2;
  try {
    json2 = await result.response.json();
  } catch {
    return new Response("Upstream returned non-JSON audio response.", { status: 502 });
  }
  const part = json2.candidates?.[0]?.content?.parts?.find((p) => p?.inlineData?.data);
  const b64 = part?.inlineData?.data;
  if (!b64) {
    return Response.json(
      { error: { code: "no_audio", message: "Upstream returned no audio part." } },
      { status: 502 }
    );
  }
  const mime = part?.inlineData?.mimeType ?? "audio/L16;rate=24000";
  const pcm = Buffer.from(b64, "base64");
  const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24e3);
  if (fmt === "pcm") {
    return new Response(new Uint8Array(pcm), {
      headers: {
        "content-type": "audio/L16",
        "x-gkr-attempts": String(result.attempts)
      }
    });
  }
  const wav = pcmToWav(pcm, rate, 1, 16);
  return new Response(new Uint8Array(wav), {
    headers: {
      "content-type": "audio/wav",
      "content-length": String(wav.byteLength),
      "x-gkr-attempts": String(result.attempts),
      "x-gkr-rotated": result.rotated ? "1" : "0",
      "x-gkr-voice": voice
    }
  });
}
function pcmToWav(pcm, rate, channels, bits) {
  const blockAlign = channels * bits / 8;
  const byteRate = rate * blockAlign;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bits, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
function badRequest(message) {
  return Response.json({ error: { code: "bad_request", message } }, { status: 400 });
}

// src/openai.ts
var UP2 = cfg.upstream.replace(/\/$/, "");
var partText = (p) => "text" in p && typeof p.text === "string" ? p.text : "";
var textOf = (c) => {
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) return "";
  return c.map(partText).filter(Boolean).join("\n");
};
function toGeminiSchema(node) {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (!node || typeof node !== "object") return node;
  const src = node;
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    if (k === "$schema" || k === "additionalProperties" || k === "strict" || k === "title") continue;
    if (k === "type" && typeof v === "string") {
      out.type = v.toUpperCase();
      continue;
    }
    if (k === "properties" && v && typeof v === "object" && !Array.isArray(v)) {
      const props = {};
      for (const [pk, pv] of Object.entries(v)) props[pk] = toGeminiSchema(pv);
      out.properties = props;
      continue;
    }
    out[k] = toGeminiSchema(v);
  }
  return out;
}
function toolDeclarations(tools) {
  const decls = [];
  for (const t of tools ?? []) {
    if (t?.type !== "function" || !t.function?.name) continue;
    const d = { name: t.function.name };
    if (t.function.description) d.description = t.function.description;
    if (t.function.parameters) d.parameters = toGeminiSchema(t.function.parameters);
    decls.push(d);
  }
  return decls;
}
function imagePart(url) {
  if (!url) return null;
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
  if (m) {
    const mime = m[1] || "application/octet-stream";
    const data = m[2] ? m[3] : Buffer.from(decodeURIComponent(m[3])).toString("base64");
    return { inlineData: { mimeType: mime, data } };
  }
  if (/^https?:|^gs:|^files\//.test(url)) {
    const ext = /\.(png|jpe?g|webp|heic|heif|gif|bmp)(?:\?|$)/i.exec(url)?.[1];
    const mime = ext ? `image/${ext.toLowerCase().replace("jpg", "jpeg")}` : "application/octet-stream";
    return { fileData: { mimeType: mime, fileUri: url } };
  }
  return null;
}
function partsOf(c) {
  if (typeof c === "string") return c ? [{ text: c }] : [];
  if (!Array.isArray(c)) return [];
  const parts = [];
  for (const p of c) {
    const t = partText(p);
    if (t) parts.push({ text: t });
    else if (p?.type === "image_url") {
      const part = imagePart(p.image_url?.url ?? "");
      if (part) parts.push(part);
    }
  }
  return parts;
}
function jsonArgs(raw2) {
  if (!raw2) return {};
  try {
    const v = JSON.parse(raw2);
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
function toGemini(body) {
  const msgs = body.messages ?? [];
  const systemParts = [];
  const contents = [];
  const callNames = /* @__PURE__ */ new Map();
  for (const m of msgs) {
    if (m.role === "system") {
      const text = textOf(m.content);
      if (text) systemParts.push({ text });
      continue;
    }
    if (m.role === "assistant") {
      const parts2 = partsOf(m.content);
      for (const call of m.tool_calls ?? []) {
        const name = call.function?.name ?? "";
        if (!name) continue;
        if (call.id) callNames.set(call.id, name);
        parts2.push({ functionCall: { name, args: jsonArgs(call.function?.arguments) } });
      }
      if (parts2.length) contents.push({ role: "model", parts: parts2 });
      continue;
    }
    if (m.role === "tool") {
      const name = callNames.get(m.tool_call_id ?? "") ?? m.name ?? "tool";
      const text = textOf(m.content);
      let response;
      try {
        const v = JSON.parse(text);
        response = v && typeof v === "object" && !Array.isArray(v) ? v : { result: v };
      } catch {
        response = { result: text };
      }
      contents.push({ role: "user", parts: [{ functionResponse: { name, response } }] });
      continue;
    }
    const parts = partsOf(m.content);
    if (parts.length) contents.push({ role: "user", parts });
  }
  const wantsSearch = Boolean(body.web_search ?? body.search);
  const model = body.model && body.model.startsWith("gemini") ? body.model : wantsSearch ? cfg.searchModel : cfg.defaultModel;
  const gen = {};
  if (typeof body.temperature === "number") gen.temperature = body.temperature;
  if (typeof body.top_p === "number") gen.topP = body.top_p;
  const maxTokens = body.max_completion_tokens ?? body.max_tokens;
  if (typeof maxTokens === "number") gen.maxOutputTokens = maxTokens;
  if (body.stop) gen.stopSequences = Array.isArray(body.stop) ? body.stop : [body.stop];
  if (body.response_format?.type === "json_object") gen.responseMimeType = "application/json";
  const decls = toolDeclarations(body.tools);
  const tools = [];
  if (decls.length) tools.push({ functionDeclarations: decls });
  if (wantsSearch) tools.push({ google_search: {} });
  const payload = { contents };
  if (systemParts.length) payload.systemInstruction = { parts: systemParts };
  if (Object.keys(gen).length) payload.generationConfig = gen;
  if (tools.length) payload.tools = tools;
  return { model, payload, wantsSearch };
}
var newCallId = () => `call_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
function parseCandidate(cand) {
  const parts = cand?.content?.parts ?? [];
  let text = "";
  const toolCalls = [];
  for (const p of parts) {
    if (typeof p.text === "string") text += p.text;
    else if (p.functionCall?.name) {
      toolCalls.push({
        id: newCallId(),
        name: String(p.functionCall.name),
        args: JSON.stringify(p.functionCall.args ?? {})
      });
    }
  }
  if (toolCalls.length) counters.toolCalls += toolCalls.length;
  return { text, grounding: cand?.groundingMetadata ?? null, toolCalls };
}
var metaHeaders = (attempts, rotated) => ({
  "x-gkr-attempts": String(attempts),
  "x-gkr-rotated": rotated ? "1" : "0"
});
async function chatCompletions(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return err(400, "invalid_request_error", "Body must be JSON.");
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return err(400, "invalid_request_error", "`messages` must be a non-empty array.");
  }
  const { model, payload, wantsSearch } = toGemini(body);
  const stream = Boolean(body.stream);
  const method = stream ? "streamGenerateContent" : "generateContent";
  const search = stream ? "?alt=sse" : "";
  const url = `${UP2}/v1beta/models/${model}:${method}${search}`;
  const result = await execute(
    url,
    {
      method: "POST",
      headers: new Headers({
        "content-type": "application/json",
        accept: stream ? "text/event-stream" : "application/json"
      }),
      body: JSON.stringify(payload),
      // @ts-expect-error Bun streaming body
      duplex: "half"
    },
    `/v1beta/models/${model}:${method}`,
    req.signal
  );
  if (result.response.status === 499) return err(499, "client_closed_request", "Client disconnected.");
  if (!result.response.ok) return result.response;
  const id = `chatcmpl-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const created = Math.floor(Date.now() / 1e3);
  if (!stream) {
    let json2;
    try {
      json2 = await result.response.json();
    } catch {
      return err(502, "upstream_error", "Upstream returned non-JSON.");
    }
    const cand = json2.candidates?.[0];
    const { text, grounding, toolCalls } = parseCandidate(cand);
    const usage = json2.usageMetadata ?? {};
    const message = {
      role: "assistant",
      content: text || (toolCalls.length ? null : "")
    };
    if (toolCalls.length) {
      message.tool_calls = toolCalls.map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.name, arguments: c.args }
      }));
    }
    return Response.json(
      {
        id,
        object: "chat.completion",
        created,
        model,
        choices: [
          {
            index: 0,
            message,
            finish_reason: toolCalls.length ? "tool_calls" : mapFinish(cand?.finishReason)
          }
        ],
        usage: {
          prompt_tokens: usage.promptTokenCount ?? 0,
          completion_tokens: usage.candidatesTokenCount ?? 0,
          total_tokens: usage.totalTokenCount ?? 0
        },
        ...wantsSearch && grounding ? { grounding } : {}
      },
      { headers: metaHeaders(result.attempts, result.rotated) }
    );
  }
  const encoder = new TextEncoder();
  const upstream = result.response.body;
  if (!upstream) return err(502, "upstream_error", "Upstream returned no stream.");
  const readable = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}

`));
      send({
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }]
      });
      const reader = upstream.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let finish = null;
      const toolCalls = [];
      try {
        for (; ; ) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const frames = buf.split("\n\n");
          buf = frames.pop() ?? "";
          for (const frame of frames) {
            const line = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            const raw2 = line.slice(5).trim();
            if (!raw2 || raw2 === "[DONE]") continue;
            let json2;
            try {
              json2 = JSON.parse(raw2);
            } catch {
              continue;
            }
            const cand = json2.candidates?.[0];
            const { text, toolCalls: calls } = parseCandidate(cand);
            const fr = cand?.finishReason;
            if (fr) finish = mapFinish(fr);
            if (text) {
              send({
                id,
                object: "chat.completion.chunk",
                created,
                model,
                choices: [{ index: 0, delta: { content: text }, finish_reason: null }]
              });
            }
            for (const c of calls) {
              const index = toolCalls.length;
              toolCalls.push(c);
              send({
                id,
                object: "chat.completion.chunk",
                created,
                model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        {
                          index,
                          id: c.id,
                          type: "function",
                          function: { name: c.name, arguments: c.args }
                        }
                      ]
                    },
                    finish_reason: null
                  }
                ]
              });
            }
          }
        }
        send({
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: toolCalls.length ? "tool_calls" : finish ?? "stop"
            }
          ]
        });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (e) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: { message: String(e) } })}

`)
        );
      } finally {
        controller.close();
        reader.releaseLock();
      }
    },
    cancel(reason) {
      return upstream.cancel(reason);
    }
  });
  return new Response(readable, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      ...metaHeaders(result.attempts, result.rotated)
    }
  });
}
function mapFinish(reason) {
  switch (reason) {
    case "MAX_TOKENS":
      return "length";
    case "SAFETY":
    case "PROHIBITED_CONTENT":
      return "content_filter";
    default:
      return "stop";
  }
}
function models() {
  const list = [
    cfg.defaultModel,
    cfg.searchModel,
    cfg.defaultTtsModel,
    cfg.defaultEmbedModel,
    "gemini-2.5-pro",
    "gemini-2.0-flash"
  ];
  return Response.json({
    object: "list",
    data: [...new Set(list)].map((id) => ({
      id,
      object: "model",
      created: 17e8,
      owned_by: "google"
    }))
  });
}
function err(status, type, message) {
  return Response.json({ error: { type, message } }, { status });
}

// src/app.ts
var app = new Hono3();
app.use("*", cors());
var bearer = (h) => {
  if (!h) return "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : h.trim();
};
app.use("/v1/*", async (c, next) => {
  if (!cfg.clientToken) return next();
  const presented = bearer(c.req.header("authorization")) || c.req.header("x-api-key") || "";
  if (presented !== cfg.clientToken) {
    return c.json({ error: { type: "auth_error", message: "Invalid API key." } }, 401);
  }
  return next();
});
app.use("/admin/*", async (c, next) => {
  if (new URL(c.req.url).pathname === "/admin") return next();
  if (!cfg.adminToken) {
    return c.json({ error: { message: "Admin disabled: ADMIN_TOKEN is not set." } }, 403);
  }
  const presented = bearer(c.req.header("authorization")) || c.req.header("x-admin-token") || "";
  if (presented !== cfg.adminToken) {
    return c.json({ error: { message: "Unauthorized." } }, 401);
  }
  return next();
});
app.get("/", async (c) => {
  const snap = await snapshot();
  return c.json({
    ok: true,
    service: "gemini-key-rotator",
    storage: storageMode,
    pool: snap,
    defaults: {
      model: cfg.defaultModel,
      tts: cfg.defaultTtsModel,
      voice: cfg.defaultVoice,
      search: cfg.searchModel
    }
  });
});
app.get("/health", async (c) => {
  const snap = await snapshot();
  return c.json({ ok: snap.ready > 0, pool: snap }, snap.ready > 0 ? 200 : 503);
});
app.post("/v1/chat/completions", (c) => chatCompletions(c.req.raw));
app.post("/v1/audio/speech", (c) => speech(c.req.raw));
app.get("/v1/models", () => models());
app.all("/v1beta/models/*", (c) => geminiPassthrough(c.req.raw, new URL(c.req.url).pathname));
app.get("/admin", (c) => c.html(ADMIN_HTML));
app.get("/models", (c) => c.html(MODELS_HTML));
app.get("/admin/models", async (c) => {
  const force = new URL(c.req.url).searchParams.get("refresh") === "1";
  try {
    const { models: models2, source, cached } = await listLiveModels(force);
    return c.json({
      ok: true,
      count: models2.length,
      models: models2,
      source,
      cached,
      pricing: pricingMeta()
    });
  } catch (err2) {
    const message = err2 instanceof Error ? err2.message : String(err2);
    const status = err2.code === "empty_pool" ? 503 : 502;
    return c.json({ error: { message } }, status);
  }
});
app.post("/admin/models/test", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Body must be JSON." } }, 400);
  }
  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!model) return c.json({ error: { message: "`model` is required." } }, 400);
  const result = await testModel(model, typeof body.key === "string" ? body.key : void 0);
  return c.json({ ok: true, model, result });
});
app.get("/admin/keys", async (c) => {
  const [keys, snap] = await Promise.all([listKeys(), snapshot()]);
  return c.json({ pool: snap, keys });
});
app.post("/admin/keys", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Body must be JSON." } }, 400);
  }
  const incoming = [];
  if (typeof body.key === "string") incoming.push(body.key);
  if (typeof body.keys === "string") incoming.push(...body.keys.split(/[\s,]+/));
  if (Array.isArray(body.keys)) incoming.push(...body.keys);
  const clean = [...new Set(incoming.map((k) => String(k).trim()).filter(Boolean))];
  if (clean.length === 0) return c.json({ error: { message: "No keys supplied." } }, 400);
  const ids = [];
  let added = 0;
  for (const k of clean) {
    if (await addKey(k)) {
      added++;
      ids.push(keyId(k));
    }
  }
  return c.json({ ok: true, received: clean.length, added, ids, pool: await snapshot() });
});
app.delete("/admin/keys", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Body must be JSON." } }, 400);
  }
  if (typeof body.id === "string" && body.id) {
    const removed = await removeKeyById(body.id);
    if (!removed) return c.json({ error: { message: "No key with that id." } }, 404);
    return c.json({ ok: true, pool: await snapshot() });
  }
  if (typeof body.key !== "string" || !body.key) {
    return c.json({ error: { message: "`id` or `key` is required." } }, 400);
  }
  await removeKey(body.key);
  return c.json({ ok: true, pool: await snapshot() });
});
app.post("/admin/keys/test", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Body must be JSON." } }, 400);
  }
  let raw2 = "";
  let id = typeof body.id === "string" ? body.id : "";
  if (id) {
    const resolved = await rawKeyById(id);
    if (!resolved) return c.json({ error: { message: "No key with that id." } }, 404);
    raw2 = resolved;
  } else if (typeof body.key === "string" && body.key.trim()) {
    raw2 = body.key.trim();
    id = keyId(raw2);
  } else {
    return c.json({ error: { message: "`id` or `key` is required." } }, 400);
  }
  const model = typeof body.model === "string" && body.model ? body.model : void 0;
  const result = await probeKey(raw2, model);
  const held = id ? Boolean(await rawKeyById(id)) : false;
  let applied = "none";
  if (held) {
    if (result.status === "ok") {
      await markHealthy(raw2);
      applied = "revived";
    } else if (result.status === "rate_limited") {
      await mark429(raw2, Math.max(cfg.cooldownMs, result.retryAfterMs));
      applied = "cooling";
    } else if (result.status === "zero_quota" || result.status === "invalid") {
      await markInvalid(raw2);
      applied = "retired";
    } else if (result.status === "server_error") {
      await mark429(raw2, cfg.serverErrCooldownMs);
      applied = "cooling";
    }
  }
  return c.json({ ok: true, id, applied, probe: result, pool: await snapshot() });
});
app.post("/admin/keys/test-all", async (c) => {
  const keys = await listKeys();
  const target = keys.filter((k) => k.status !== "dead");
  const limit = 4;
  const results = [];
  let cursor = 0;
  const worker = async () => {
    for (; ; ) {
      const i = cursor++;
      if (i >= target.length) return;
      const k = target[i];
      const raw2 = await rawKeyById(k.id);
      if (!raw2) continue;
      const probe = await probeKey(raw2);
      let applied = "none";
      if (probe.status === "ok") {
        await markHealthy(raw2);
        applied = "revived";
      } else if (probe.status === "rate_limited") {
        await mark429(raw2, Math.max(cfg.cooldownMs, probe.retryAfterMs));
        applied = "cooling";
      } else if (probe.status === "zero_quota" || probe.status === "invalid") {
        await markInvalid(raw2);
        applied = "retired";
      } else if (probe.status === "server_error") {
        await mark429(raw2, cfg.serverErrCooldownMs);
        applied = "cooling";
      }
      results.push({ id: k.id, key: k.key, probe, applied });
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, target.length) }, worker));
  return c.json({ ok: true, tested: results.length, results, pool: await snapshot() });
});
app.notFound(
  (c) => c.json({ error: { message: `No route for ${c.req.method} ${new URL(c.req.url).pathname}` } }, 404)
);
app.onError((e, c) => {
  console.error("[gkr] unhandled:", e);
  return c.json({ error: { message: e.message } }, 500);
});
var app_default = app;

// serverless/index.ts
var seed = (process.env.GEMINI_API_KEYS ?? "").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
var hydrated = null;
function hydrate() {
  if (!hydrated) {
    hydrated = (async () => {
      for (const k of seed) await addKey(k);
      console.log(`[gkr] cold-start seeded ${seed.length} keys storage=${storageMode}`);
    })();
  }
  return hydrated;
}
var listener = getRequestListener(app_default.fetch);
async function handler(req, res) {
  await hydrate();
  return listener(req, res);
}
export {
  handler as default
};
