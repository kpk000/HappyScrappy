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
  .help()
  .alias("help", "h")
  .parse();

function runScraper(scraperName) {
  console.log(pc.green(`[+] Running scraper ${scraperName}`));
  const scraper = spawn("node", [scraperName], { stdio: "inherit" });

  scraper.on("close", (code) => {
    console.log(pc.red(`[-] Scraper ${scraperName} exited with code ${code}`));
  });
  scraper.on("error", (err) => {
    console.log(pc.red(`[-] Error running scraper ${scraperName}: ${err}`));
  });
}

if (argv.amazon) {
  runScraper(amazonPath);
}
if (argv.zalando) {
  runScraper(zalandoPath);
}

if (!argv.amazon && !argv.zalando) {
  console.log(
    pc.red("[-] Nothing to do. Please specify a scraper to run, see --help.")
  );
}
