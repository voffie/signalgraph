import { createServer } from "node:http";

const protocolHeader = (process.env.PROTOCOL_HEADER ??= "x-forwarded-proto").toLowerCase();

const handlerUrl = new URL("../build/handler.js", import.meta.url).href;
const { handler } = await import(handlerUrl);

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 4300);

const server = createServer((req, res) => {
  req.headers[protocolHeader] ??= "http";

  handler(req, res, () => {
    res.statusCode = 404;
    res.end();
  });
});

server.listen(port, host);

let closing = false;
const shutdown = () => {
  if (closing) return;
  closing = true;
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  setTimeout(() => server.closeAllConnections(), 3000).unref();
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
