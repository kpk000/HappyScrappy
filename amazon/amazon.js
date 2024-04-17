import puppeteer from "puppeteer-extra";
import { config } from "dotenv";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
puppeteer.use(StealthPlugin());
import pc from "picocolors";
import fs from "node:fs/promises";
import logUpdate from "log-update";
import { log } from "node:console";
import path, { parse } from "node:path";
import { fileURLToPath } from "node:url";
import { sendAmzMessageTelegram } from "./bot.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.resolve(__dirname, "../.env") });
const jsonPath = path.resolve(__dirname, "basket.json");

const { AMAZON_EMAIL, AMAZON_PASSWORD } = process.env;
const browser = await puppeteer.launch({
  headless: true,
  slowMo: 10,

  args: ["--start-maximized"],
});

const page = await browser.newPage();

async function login() {
  await page.goto("https://www.amazon.es/", { waitUntil: "domcontentloaded" });
  const element = await page.$("#nav-link-accountList");
  if (element) {
    await page.waitForSelector("#nav-link-accountList", { visible: true });
    await page.click("#nav-link-accountList");
    logUpdate(pc.yellow("[+] Trying to signin..."));

    await page.waitForSelector("#ap_email", { visible: true });
    await page.type("#ap_email", AMAZON_EMAIL);
    await page.click("#continue");
    await page.waitForSelector("#ap_password", { visible: true });
    await page.type("#ap_password", AMAZON_PASSWORD);
    await page.waitForSelector("#signInSubmit", { visible: true });
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      page.click("#signInSubmit"),
    ]);
    logUpdate(pc.yellow("[+] Logging in..."));
    const errorLogin = await page.$("#auth-error-message-box");
    if (errorLogin) {
      console.log(
        pc.red("[-] Login failed, check your credentials and try again.")
      );
      browser.close();
      process.exit(1);
    } else {
      logUpdate(pc.green("[+] Logged in successfully"));
      await page.waitForSelector("#nav-cart", { visible: true });
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded" }),
        page.click("#nav-cart"),
      ]);

      logUpdate(pc.green("[+] Navigating to basket"));
      basketObserver();
    }
  } else {
    logUpdate(pc.red("[-] Redirect found, trying again..."));
    login();
  }
}

async function basketObserver() {
  logUpdate(pc.yellow("[+] Observing basket"));
  const items = await page.evaluate(() => {
    const basketItems = document.querySelectorAll('[data-itemtype="active"]');
    const wishlist = document.querySelectorAll('[data-itemtype="saved"]');
    const totalItems = [...basketItems, ...wishlist];
    const parsedItems = totalItems.map((item) => {
      return {
        title:
          item.querySelector(".sc-product-title").textContent.trim() || null,
        asin: item.getAttribute("data-asin"),
        stock: item.getAttribute("data-outofstock"),
        price: item.getAttribute("data-price"),
        img: item.querySelector(".sc-product-image").src,
        badge: JSON.parse(item.getAttribute("data-subtotal"))["subtotal"][
          "code"
        ],
      };
    });

    const productMap = parsedItems.reduce((acc, product) => {
      acc[product.asin] = product;
      return acc;
    }, {});
    return productMap;
  });
  await evaluateItems(items);
}

async function evaluateItems(newItems) {
  try {
    const data = await fs.readFile(jsonPath, "utf-8");
    const oldItems = JSON.parse(data);
    if (Object.keys(oldItems).length === 0) {
      logUpdate(pc.green("[+] First time running, saving basket..."));
      await fs.writeFile(jsonPath, JSON.stringify(newItems, null, 2));
      return;
    }

    const newItemsKeys = Object.keys(newItems);
    const oldItemsKeys = Object.keys(oldItems);
    newItemsKeys.forEach((key) => {
      if (oldItemsKeys.includes(key)) {
        checkForChanges(oldItems[key], newItems[key]);
      }
    });
    await fs.writeFile(jsonPath, JSON.stringify(newItems, null, 2));
    if (newItemsKeys.length !== oldItemsKeys.length) {
      logUpdate(
        pc.green(
          `[+] Basket updated, ${Math.abs(
            oldItemsKeys.length - newItemsKeys.length
          )} items removed or added`
        )
      );
    }
  } catch (err) {
    console.log(pc.red("[-] Error reading file"));
    browser.close();
    console.log(err);
    process.exit(1);
  }
}

function checkForChanges(oldItem, newItem) {
  const oldItemKeys = Object.keys(oldItem);
  const newItemKeys = Object.keys(newItem);
  oldItemKeys.forEach((key) => {
    if (!oldItem[key] === newItem[key]) {
      logUpdate(pc.blue(`[+] ${oldItem.asin} : "${key}" has changed`));
      if (key === "price") {
        notifyPriceChange(oldItem, newItem);
      }
    }
  });
}

async function notifyPriceChange(oldItem, newItem) {
  const oldPrice = parseFloat(oldItem.price);
  const newPrice = parseFloat(newItem.price);
  const badge = newItem.badge;
  const message = `<b>AMAZON</b>\nPrice of <i>${oldItem.title?.substring(
    0,
    15
  )}...</i> has ${
    oldPrice > newPrice ? "decreased" : "increased"
  }\n- Old Price: ${oldPrice} ${badge}\n- New Price: ${newPrice} ${badge}`;

  let res;

  res = await sendAmzMessageTelegram(message, newItem.img);

  if (res) {
    logUpdate(
      pc.green(
        `[+] Price of item "${newItem.asin}" has change, notification sent`
      )
    );
  } else {
    logUpdate(
      pc.red(`[-] Error sending notification for item "${newItem.asin}"`)
    );
  }
}

async function main() {
  await login();
  setInterval(async () => {
    await page.reload({ waitUntil: "networkidle0" });
    await basketObserver(page);
  }, 20000);
}
main();
