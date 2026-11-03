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

// Значення -> число або null (для порожніх, null і нечислових)
function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// NDJSON: кожен непорожній рядок - окремий JSON-об'єкт
function parseNdjson(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line));
}

function respond(res, status, body) {
  const text = JSON.stringify(body);
  const send = (code, payload) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(payload);
  };
  if (!output) {
    send(status, text);
    return;
  }
  fs.writeFile(output, text, (err) => {
    if (err) {
      send(500, JSON.stringify({ error: 'Помилка запису у вихідний файл' }));
    } else {
      send(status, text);
    }
  });
}

function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname !== '/') {
    respond(res, 404, { error: 'Маршрут не знайдено' });
    return;
  }

  const showAge = url.searchParams.get('age') === 'true';
  const onlySurvived = url.searchParams.get('survived') === 'true';

  fs.readFile(input, 'utf8', (err, text) => {
    if (err) {
      respond(res, 500, { error: 'Не вдалося прочитати файл даних' });
      return;
    }
    let rows;
    try {
      rows = parseNdjson(text);
    } catch (e) {
      respond(res, 500, { error: 'Файл даних пошкоджений' });
      return;
    }

    const result = rows
      .filter((row) => !onlySurvived || Number(row.Survived) === 1)
      .map((row) => {
        const item = { name: row.Name ?? null };
        if (showAge) item.age = toNumber(row.Age);
        item.ticket = row.Ticket === undefined || row.Ticket === null ? null : String(row.Ticket);
        return item;
      });

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
