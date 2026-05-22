import { pbkdf2Sync, randomBytes } from "node:crypto";
import { stdin as input, stdout as output } from "node:process";

const passwordArg = process.argv[2];

async function readHiddenPassword(prompt) {
  output.write(prompt);
  input.setRawMode?.(true);
  input.resume();
  input.setEncoding("utf8");

  let value = "";
  for await (const chunk of input) {
    const char = String(chunk);
    if (char === "\r" || char === "\n" || char === "\u0004") break;
    if (char === "\u0003") process.exit(130);
    if (char === "\b" || char === "\u007f") {
      value = value.slice(0, -1);
      continue;
    }
    value += char;
  }

  input.setRawMode?.(false);
  output.write("\n");
  return value;
}

const password = passwordArg || (await readHiddenPassword("Password to hash: "));

if (!password || password.length < 12) {
  console.error("Use a password with at least 12 characters.");
  process.exit(1);
}

const iterations = 310000;
const salt = randomBytes(16).toString("base64url");
const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("base64url");

console.log(`pbkdf2-sha256$${iterations}$${salt}$${hash}`);
