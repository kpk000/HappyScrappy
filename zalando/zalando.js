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
import { capitalize } from "../utils/utils.js";

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
      logUpdate(pc.yellow("[+] Trying to signin..."));

      await page.waitForSelector("#login\\.email", { visible: true });
      await page.type("#login\\.email", ZALANDO_EMAIL);
      await page.type("#login\\.secret", ZALANDO_PASSWORD);
      await Promise.all([
        page.waitForNavigation(),
        page.click('button[data-testid="login_button"]'),
      ]);

      const cartButton = await page.$('a[data-testid="cart-link"]');
      if (!cartButton) {
        console.log(
          pc.red("[-] Login failed, check your credentials and try again.")
        );
        //login();
      }
      logUpdate(pc.green("[+] Logged in successfully"));

      await basketObserver();
    }
  } catch (error) {
    console.log(pc.red("[-] Error: ", error));
  }
}

async function basketObserver() {
  try {
    logUpdate(pc.yellow("[+] Going to cart..."));

    await page.setRequestInterception(true);
    page.on("request", (interceptedRequest) => {
      if (interceptedRequest.url().includes("/api/cart-gateway/carts")) {
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
    logUpdate(pc.yellow("[+] Watching Zalando cart"));

    await Promise.all([
      page.waitForNavigation(),
      page.click('a[data-testid="cart-link"]'),
    ]);
  } catch (error) {
    console.error(pc.red("[+] Element not found."), error);
  }
}

async function replicateRequestWithAxios(url, responseHeaders) {
  if (!responseHeaders["x-xsrf-token"]) return;
  logUpdate(pc.yellow("[+] Requesting zalando cart..."));
  try {
    const response = await axios({
      method: "POST", // Cambia esto según el método necesario
      url: url,
      headers: responseHeaders,
    });
    if (response.status === 429) {
      console.log(pc.red("[+] Rate limited, waiting..."));
      await new Promise((resolve) => setTimeout(resolve, 40000));
      return;
    }

    const data = response.data;
    if (data === null || typeof data !== "object") return;
    const newItems = parseData(data);
    await checkUpdates(newItems);
    logUpdate(pc.yellow("[+] Cart updated"));
  } catch (error) {
    console.error(pc.red("[+] Error replicating request."), error);
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
      oldItems = JSON.parse(data);

      if (Object.keys(oldItems).length === 0) {
        logUpdate(pc.blue("[+] First time running, saving cart..."));
        const jsonData = JSON.stringify(newItems, null, 2);

        await fs.writeFile(jsonPath, jsonData);
      }
    } catch (error) {
      console.error(pc.red("[+] Error reading JSON."), error);
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

async function checkForChanges(oldItem, newItem) {
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
  }
}

async function main() {
  try {
    await login();
    setInterval(async () => {
      await page.goto("https://www.zalando.es/myaccount/?", {
        waitUntil: "networkidle2",
      });
      await new Promise(function (resolve) {
        setTimeout(resolve, 6000);
      });
      await Promise.all([
        page.waitForNavigation(),
        page.click('a[data-testid="cart-link"]'),
      ]);
      await basketObserver(page);
    }, 60000);
  } catch (error) {
    console.log(pc.red("[-] Error in main: ", error));
  }
}
main();
