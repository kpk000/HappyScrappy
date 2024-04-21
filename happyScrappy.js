#!/usr/bin/env node
import path from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { spawn } from "child_process";
import { fileURLToPath } from "node:url";
import pc from "picocolors";

// Scrappers paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const amazonPath = path.resolve(__dirname, "amazon", "amazon.js");
const zalandoPath = path.resolve(__dirname, "zalando", "zalando.js");
const zooplusPath = path.resolve(__dirname, "zooplus", "zooplus.js");

const argv = yargs(hideBin(process.argv))
  .option("amazon", {
    alias: "amz",
    type: "boolean",
    description: "Execute the Amazon scraper",
    default: false,
  })
  .option("zalando", {
    alias: "zaln",
    type: "boolean",
    description: "Execute the Zalando scraper",
    default: false,
  })
  .option("zooplus", {
    alias: "zoo",
    type: "boolean",
    description: "Execute the Zooplus scraper",
    default: false,
  })
  .help()
  .alias("help", "h")
  .parse();

let subprocesses = [];

function terminateAll(reason) {
  console.log(pc.red(`[-] Terminating all processes due to: ${reason}`));
  subprocesses.forEach((proc) => {
    if (!proc.killed) {
      proc.kill("SIGTERM");
    }
  });
  // Ensure the main process exits with an error code
  process.exit(1);
}

function runScraper(scraperName, scraperPath) {
  console.log(pc.green(`[+] Running scraper ${scraperName}`));
  const scraper = spawn("node", [scraperPath], { stdio: "inherit" });

  scraper.on("close", (code) => {
    console.log(pc.red(`[-] Scraper ${scraperName} exited with code ${code}`));
    if (code !== 0) {
      terminateAll(`${scraperName} exited with code ${code}`);
    }
  });

  scraper.on("error", (err) => {
    console.log(pc.red(`[-] Error running scraper ${scraperName}: ${err}`));
    terminateAll(`Error in ${scraperName}`);
  });

  subprocesses.push(scraper);
}

if (argv.amazon) {
  runScraper("Amazon", amazonPath);
}
if (argv.zalando) {
  runScraper("Zalando", zalandoPath);
}
if (argv.zooplus) {
  runScraper("Zooplus", zooplusPath);
}

if (!argv.amazon && !argv.zalando && !argv.zooplus) {
  console.log(
    pc.red("[-] Nothing to do. Please specify a scraper to run, see --help.")
  );
}
