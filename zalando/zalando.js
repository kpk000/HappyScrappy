#!/usr/bin/env node
import puppeteer from "puppeteer-extra";
import { config } from "dotenv";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
puppeteer.use(StealthPlugin());
import pc from "picocolors";
import fs from "node:fs/promises";
import logUpdate from "log-update";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sendZlndoMessageTelegram } from "../utils/telegramBot.mjs";
import axios from "axios";
import { capitalize, isValidJSON } from "../utils/utils.js";
import { log } from "node:console";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.resolve(__dirname, "../.env") });
const jsonPath = path.resolve(__dirname, "cart.json");
const { ZALANDO_EMAIL, ZALANDO_PASSWORD } = process.env;
const browser = await puppeteer.launch({
  headless: true,
  slowMo: 10,

  args: ["--start-maximized"],
});
const page = await browser.newPage();

async function login() {
  try {
    await page.goto("https://www.zalando.es/hombre-home/", {
      waitUntil: "domcontentloaded",
    });
    const element = await page.$('button[data-testid="user-account-icon"]', {
      timeout: 10000,
    });
    if (element) {
      await page.waitForSelector('button[data-testid="user-account-icon"]', {
        visible: true,
      });
      await Promise.all([
        page.waitForNavigation(),
        page.click('button[data-testid="user-account-icon"]'),
      ]);
      logUpdate(pc.yellow("[+] Trying to signin to Zalando..."));

      await page.waitForSelector("#login\\.email", { visible: true });
      await page.type("#login\\.email", ZALANDO_EMAIL);
      await page.type("#login\\.secret", ZALANDO_PASSWORD);
      await Promise.all([
        page.waitForNavigation(),
        page.click('button[data-testid="login_button"]'),
      ]);

      const cartButton = await page.$('a[data-testid="cart-link"]', {
        timeout: 30000,
      });
      if (!cartButton) {
        console.log(
          pc.red("[-] Login failed, check your credentials and try again.")
        );
        //login();
      }
      logUpdate(pc.green("[+] Logged in Zalando successfully"));

      await basketObserver();
    }
  } catch (error) {
    console.log(pc.red("[-] Error: ", error));
  }
}

async function basketObserver() {
  try {
    if (targetIntercepted) return;

    logUpdate(pc.yellow("[+] Going to Zalando's cart..."));

    await page.setRequestInterception(true);
    page.on("request", (interceptedRequest) => {
      if (
        interceptedRequest.url().includes("/api/cart-gateway/carts") &&
        !targetIntercepted
      ) {
        if (interceptedRequest.headers()["x-xsrf-token"]) {
          replicateRequestWithAxios(
            interceptedRequest.url(),
            interceptedRequest.headers()
          );
        }
      }
      if (!interceptedRequest.isInterceptResolutionHandled()) {
        interceptedRequest.continue();
      }

      return;
    });
    logUpdate(pc.yellow("[+] Watching Zalando's cart"));

    await Promise.all([
      page.waitForNavigation(),
      page.click('a[data-testid="cart-link"]'),
    ]);
  } catch (error) {
    console.error(pc.red("[+] Element not found."), error);
  }
}

let targetIntercepted = false;

async function replicateRequestWithAxios(url, responseHeaders) {
  if (targetIntercepted) return;
  if (!responseHeaders["x-xsrf-token"]) return;
  logUpdate(pc.yellow("[+] Requesting Zalando's cart..."));
  try {
    const response = await axios({
      method: "POST", // Cambia esto según el método necesario
      url: url,
      headers: responseHeaders,
    });

    const data = response.data;
    if (data === null || typeof data !== "object" || !data.id) {
      console.log(
        pc.red("[+] Bad response from Zalando's cart...Trying again.")
      );
      return;
    }
    targetIntercepted = true;

    logUpdate(pc.green("[+] Zalando's cart received"));
    const newItems = parseData(data);
    await checkUpdates(newItems);
    logUpdate(pc.yellow("[+] Zalando's cart updated"));
  } catch (error) {
    console.error(
      pc.red("[-] Error replicating request."),
      error?.response?.status
    );
    if (error?.response && error?.response?.status === 429) {
      console.log(
        pc.yellow("[-] Rate limit exceeded, waiting for retry-after header")
      ); //DEBUG
      if (error.response.headers["retry-after"]) {
        const retryAfterSeconds = parseInt(
          error.response.headers["retry-after"]
        );
        const message = `Rate limit exceeded, waiting for ${retryAfterSeconds} seconds`;
        logUpdate(pc.blue(message));

        await new Promise((resolve) =>
          setTimeout(resolve, retryAfterSeconds * 1000)
        );
        return;
      }
    } else if (
      error?.response &&
      (error?.response?.status === 401 || error?.response?.status === 403)
    ) {
      console.log(pc.red("[-] Unauthorized, logging in again"));
      await login();
    }
  }
}

function parseData(data) {
  let items = [];

  data.groups?.forEach((group) => {
    group.articles.forEach((article, index) => {
      const articulo = {
        id: article.item_ids[0],
        name: article.name.trim(),
        price: article.price.amount,
        badge: article.price.currency,
        stock: article.available,
        img: article.image_url,
        available: article.available,
        link: article.shop_url,
      };
      items.push(articulo);
    });
  });

  data.out_of_stock_articles?.forEach((article) => {
    const articulo = {
      id: article.item_ids,
      name: article.name.trim(),
      price: article.price.amount,
      badge: article.price.currency,
      stock: article.available,
      img: article.image_url,
      available: article.available,
      link: article.shop_url,
    };
    items.push(articulo);
  });

  data.unavailable_articles?.forEach((article, index) => {
    const articulo = {
      id: article.item_ids[index],
      name: article.name.trim(),
      price: article.price.amount,
      badge: article.price.currency,
      stock: article.available,
      img: article.image_url,
      available: article.available,
      link: article.shop_url,
    };
    items.push(articulo);
  });
  let uniqueItems = {};

  items.forEach((obj) => {
    uniqueItems[obj.id] = obj;
  });

  return uniqueItems;
}

async function checkUpdates(newItems) {
  try {
    let oldItems = {};
    try {
      const data = await fs.readFile(jsonPath, "utf-8");
      oldItems = await JSON.parse(data);

      if (Object.keys(oldItems).length === 0) {
        logUpdate(pc.blue("[+] First time running, saving Zalando's cart..."));
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
    await fs.writeFile(jsonPath, JSON.stringify(newItems, null, 2));
  } catch (error) {
    console.error(pc.red("[+] Error verifying changes"), error);
  }
}

let messageSent = false;
async function checkForChanges(oldItem, newItem) {
  if (messageSent) return;
  const oldItemKeys = Object.keys(oldItem);
  const newItemKeys = Object.keys(newItem);
  const relevantKeys = ["stock", "price"];
  let messages = [];
  oldItemKeys.forEach((key) => {
    if (oldItem[key] !== newItem[key] && relevantKeys.includes(key)) {
      console.log(pc.green(`[+] ${oldItem.name} : "${key}" has changed`));
      messages.push(`<u><b>ZALANDO CART</b></u>\n${capitalize(
        key
      )} of <a href="${
        "https://www.zalando.es/" + newItem.link
      }">${newItem.name.substring(
        0,
        30
      )}...</a> has changed.\n\n- Old ${key}: ${oldItem[key]}${
        key == "price" ? " " + newItem.badge : ""
      }\n- New ${key}: ${newItem[key]} ${
        key == "price" ? " " + newItem.badge : ""
      }\n
      `);
    }
  });

  for (let i = 0; i < messages.length; i++) {
    await sendZlndoMessageTelegram(messages[i], newItem.img);
    messageSent = true;
  }
}

async function scheduleNextRun() {
  await login();
  await next();
  async function next() {
    targetIntercepted = false;
    messageSent = false;
    await page.click('a[href="/myaccount/"]');
    await new Promise(function (resolve) {
      setTimeout(resolve, 6000);
    });

    await basketObserver(page);
    setTimeout(next, 60000 * 2);
  }
}
scheduleNextRun();
