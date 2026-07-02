import process from "node:process";

export function readStdin(): Promise<string> {
  return new Promise((resolvePrompt, reject) => {
    let content = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => {
      content += chunk;
    });
    process.stdin.once("end", () => resolvePrompt(content));
    process.stdin.once("error", reject);
    process.stdin.resume();
  });
}
