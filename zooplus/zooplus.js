#!/usr/bin/env node

import puppeteer from "puppeteer-extra";
import { config } from "dotenv";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
puppeteer.use(StealthPlugin());
import pc from "picocolors";
import fs from "node:fs/promises";
import logUpdate from "log-update";
import path, { parse } from "node:path";
import { fileURLToPath } from "node:url";
import { sendZooMessageTelegram } from "../utils/telegramBot.mjs";
import axios from "axios";
import { capitalize } from "../utils/utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.resolve(__dirname, "../.env") });
const jsonPath = path.resolve(__dirname, "cart.json");
const { ZOOPLUS_EMAIL, ZOOPLUS_PASSWORD } = process.env;
const browser = await puppeteer.launch({
  headless: true,
  slowMo: 10,
  executablePath: "/usr/bin/chromium-browser", //Delete this in Windows OS

  args: ["--start-maximized"],
});

const page = await browser.newPage();

async function login() {
  try {
    await page.goto("https://www.zooplus.es/", {
      waitUntil: "networkidle0",
    });
    const element = await page.$("#onetrust-accept-btn-handler", {
      timeout: 1000,
    });
    if (element) {
      await page.click("#onetrust-accept-btn-handler");
    }
    await page.waitForSelector('a[href="/account"]', { visible: true });
    await Promise.all([
      page.waitForNavigation(),
      page.click('a[href="/account"]'),
    ]);
    logUpdate(pc.yellow("[+] Trying to signin to zooplus..."));
    await page.waitForSelector("#username", { visible: true });
    await page.type("#username", ZOOPLUS_EMAIL);
    await page.type("#password", ZOOPLUS_PASSWORD);
    await Promise.all([
      page.click("#login-btn"),
      page.waitForNavigation("networkidle0"),
    ]);

    const errorFound = await page.$(".form-message-text", { timeout: 10000 });
    const errorMs = await page.$("#usernameErrorMessage", { timeout: 10000 });

    if (errorFound || errorMs) {
      logUpdate(
        pc.red(
          "[-] Error loging in zooplus.es, check your credentials and try again."
        )
      );
      browser.close();
      process.exit(1);
    }

    await basketObserver();
  } catch (e) {
    logUpdate(pc.red("[-] Error loging in zooplus.es"));
    console.log(e);
  }
}

async function basketObserver() {
  try {
    logUpdate(pc.yellow("[+] Going to Zooplus's cart..."));

    await page.setRequestInterception(true);
    page.on("request", (interceptedRequest) => {
      if (
        interceptedRequest.url().includes("/checkout/app/api/state/v1/get") &&
        !targetedIntercepted
      ) {
        replicateRequestWithAxios(
          interceptedRequest.url(),
          interceptedRequest.headers()
        );
      }
      if (!interceptedRequest.isInterceptResolutionHandled()) {
        interceptedRequest.continue();
      }

      return;
    });
    await page.waitForSelector('a[href="/checkout/overview"]', {
      visible: true,
    });
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0" }),
      page.click('a[href="/checkout/overview"]'),
    ]);
  } catch (e) {
    logUpdate(pc.red("[-] Error navigating to Zooplus's cart"));
    console.log(e);
  }
}
let targetedIntercepted = false;

async function replicateRequestWithAxios(url, responseHeaders) {
  logUpdate(pc.yellow("[+] Requesting Zooplus's cart..."));
  try {
    const response = await axios({
      method: "GET", // Cambia esto según el método necesario
      url: url,
      headers: responseHeaders,
    });
    if (response.status !== 200) {
      logUpdate(pc.red("[+] Error in request, trying again ..."));
      return;
    }

    const data = response.data;
    if (data === null || typeof data !== "object" || !data?.cart?.articles)
      return;
    logUpdate(pc.blue("[+] Zooplus's cart received"));
    targetedIntercepted = true;

    const newItems = await parseData(data);
    await checkUpdates(newItems);
    logUpdate(pc.yellow("[+] Zooplus's cart updated"));
  } catch (error) {
    //Vlidate 503
    if (error.response.status === 503) {
      logUpdate(pc.red("[+] Error 503, trying again..."));
      return;
    } else {
      console.error(pc.red("[+] Error replicating request."), error);
    }
  } finally {
    targetedIntercepted = false;
  }
}

async function parseData(data) {
  const products = data.cart.articles;
  const parsedItems = products.map((item) => {
    return {
      id: item.shop_id,
      title: item.name,

      stock: item.maxQuantity,
      price: item.price,
      formattedPrice: item.formattedPrice,
      img: item.pictureUrl,
      link: "https://www.zooplus.es" + item.productLink,
    };
  });

  let uniqueItems = {};

  parsedItems.forEach((obj) => {
    uniqueItems[obj.id] = obj;
  });
  return uniqueItems;
}

async function checkUpdates(newItems) {
  try {
    let oldItems = {};
    try {
      const data = await fs.readFile(jsonPath, "utf-8");
      oldItems = JSON.parse(data);

      if (Object.keys(oldItems).length === 0) {
        //logUpdate(pc.blue("[+] First time running, saving Zooplus's cart..."));
        const jsonData = JSON.stringify(newItems, null, 2);

        await fs.writeFile(jsonPath, jsonData);
      }
    } catch (error) {
      if (
        !error instanceof SyntaxError &&
        !error.message.includes("Unexpected end of JSON input")
      ) {
        console.error(pc.red("[+] Error reading JSON."), error);
      }
    }

    const newItemsKeys = Object.keys(newItems);
    const oldItemsKeys = Object.keys(oldItems);
    newItemsKeys.forEach((key) => {
      if (oldItemsKeys.includes(key)) {
        checkForChanges(oldItems[key], newItems[key]);
      }
    });
  } catch (error) {
    console.error(pc.red("[+] Error verifying changes"), error);
  } finally {
    await fs.writeFile(jsonPath, JSON.stringify(newItems, null, 2));
  }
}

async function checkForChanges(oldItem, newItem) {
  const oldItemKeys = Object.keys(oldItem);
  const newItemKeys = Object.keys(newItem);
  const relevantKeys = ["stock", "price"];
  let messages = [];
  oldItemKeys.forEach((key) => {
    if (oldItem[key] !== newItem[key] && relevantKeys.includes(key)) {
      console.log(pc.green(`[+] ${oldItem.title} : "${key}" has changed`));
      messages.push(
        `<u><b>ZOOPLUS CART</b></u>\n${capitalize(key)} of <a href="${
          newItem.link
        }">${newItem.title.substring(
          0,
          30
        )}...</a> has changed.\n\n- Old ${key}:${
          key == "price" ? " " + oldItem.formattedPrice : " " + oldItem[key]
        }\n- New ${key}:${
          key == "price" ? " " + newItem.formattedPrice : " " + newItem[key]
        }\n`
      );
    }
  });
  for (let i = 0; i < messages.length; i++) {
    await sendZooMessageTelegram(messages[i], newItem.img);
  }
}

async function scheduleNextRun() {
  await login();
  next();
  async function next() {
    logUpdate(pc.yellow("[+] Restarting Zooplus's cart..."));
    await page.goto("https://www.zooplus.es/account/overview", {
      waitUntil: "networkidle0",
    });
    await new Promise(function (resolve) {
      setTimeout(resolve, 15000);
    });
    await basketObserver(page);
    setTimeout(next, 10000);
  }
}
scheduleNextRun();
