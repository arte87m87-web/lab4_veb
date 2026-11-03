import http from 'node:http';
import fs from 'node:fs';
import { Command } from 'commander';

const program = new Command();

// -h за замовчуванням зайнятий довідкою, тому переносимо довідку лише на --help
program
  .helpOption('--help', 'показати довідку')
  .requiredOption('-i, --input <path>', 'шлях до файлу даних')
  .requiredOption('-h, --host <address>', 'адреса сервера')
  .requiredOption('-p, --port <number>', 'порт сервера')
  .option('-o, --output <path>', 'файл для запису останньої відповіді');

program.parse();
const { input, host, port, output } = program.opts();

// NDJSON: кожен непорожній рядок - окремий JSON-об'єкт
function parseNdjson(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line));
}

function respond(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname !== '/') {
    respond(res, 404, { error: 'Маршрут не знайдено' });
    return;
  }

  fs.readFile(input, 'utf8', (err, text) => {
    if (err) {
      respond(res, 500, { error: 'Не вдалося прочитати файл даних' });
      return;
    }
    const rows = parseNdjson(text);
    const result = rows.map((row) => ({
      name: row.Name ?? null,
      ticket: row.Ticket ?? null,
    }));
    respond(res, 200, result);
  });
}

// Перевірка існування файлу через колбек-API
fs.access(input, fs.constants.F_OK, (err) => {
  if (err) {
    console.error('Cannot find input file');
    process.exit(1);
  }
  const server = http.createServer(handler);
  server.listen(Number(port), host, () => {
    console.log(`Сервер запущено: http://${host}:${port}`);
  });
});
