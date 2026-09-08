import "dotenv/config";
import readline from "node:readline";
import { securityConfig } from "../src/security/config";
import { SecurityStore } from "../src/security/store";
import { hashPassword } from "../src/security/passwords";
async function prompt(label: string, hidden = false): Promise<string> {
  if (!process.stdin.isTTY)
    throw new Error("An interactive terminal is required");
  process.stdout.write(label);
  if (!hidden) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return new Promise((resolve) =>
      rl.question("", (answer) => {
        rl.close();
        resolve(answer);
      }),
    );
  }
  return new Promise((resolve, reject) => {
    let value = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const done = () => {
      process.stdin.setRawMode(false);
      process.stdin.removeListener("data", handler);
      process.stdin.pause();
      process.stdout.write("\n");
    };
    const handler = (data: Buffer) => {
      for (const char of data.toString()) {
        if (char === "\u0003") {
          done();
          reject(new Error("Cancelled"));
          return;
        }
        if (char === "\r" || char === "\n") {
          done();
          resolve(value);
          return;
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else if (char >= " ") value += char;
      }
    };
    process.stdin.on("data", handler);
  });
}
async function main() {
  const store = new SecurityStore(securityConfig().database);
  try {
    if (store.get("SELECT id FROM accounts LIMIT 1"))
      throw new Error("Bootstrap refused: accounts already exist");
    const username = (await prompt("Username: ")).trim().toLowerCase(),
      email = (await prompt("Email: ")).trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,128}$/.test(username) || !/^\S+@\S+\.\S+$/.test(email))
      throw new Error("Invalid account identity");
    const password = await prompt(
      "Password (15–128 characters, hidden): ",
      true,
    );
    if (password !== (await prompt("Confirm password (hidden): ", true)))
      throw new Error("Passwords do not match");
    const hash = await hashPassword(password);
    store.transaction(() => {
      if (store.get("SELECT id FROM accounts LIMIT 1"))
        throw new Error("Bootstrap refused");
      const a = store.create(
        { username, email, role: "super-admin", scopes: ["*"] },
        hash,
      );
      store.audit(a.id, "admin.bootstrap", a.id);
    });
    process.stdout.write(
      "Super Admin created. Sign in through the HTTPS Admin URL.\n",
    );
  } finally {
    store.db.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
