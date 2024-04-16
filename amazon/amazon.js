import puppeteer from "puppeteer-extra";
import { config } from "dotenv";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
puppeteer.use(StealthPlugin());
import pc from "picocolors";
import fs from "node:fs/promises";
import logUpdate from "log-update";
import { log } from "node:console";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonPath = path.resolve(__dirname, "basket.json");

config();
const { AMAZON_EMAIL, AMAZON_PASSWORD } = process.env;
const browser = await puppeteer.launch({
  headless: false,
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
        asin: item.getAttribute("data-asin"),
        stock: item.getAttribute("data-outofstock"),
        price: item.getAttribute("data-price"),
        img: item.querySelector(".sc-product-image").src,
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
          `[+] Basket updated ${Math.abs(
            oldItemsKeys.length - newItemsKeys.length
          )}`
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
    if (oldItem[key] !== newItem[key]) {
      logUpdate(pc.yellow(`[+] ${oldItem.asin} : ${oldItem[key]} has changed`));
      if (key === "price") {
        notifyPriceChange(oldItem, newItem);
      }
    }
  });
}

function notifyPriceChange(oldItem, newItem) {
  const oldPrice = oldItem.price;
  const newPrice = newItem.price;
  if (oldPrice > newPrice) {
    console.log(
      pc.green(`[+] Price of ${oldItem.asin} has decreased\n
    Old Price: ${oldPrice}\n
    New Price: ${newPrice}`)
    );
  } else {
    console.log(pc.red(`[-] Price of ${oldItem.asin} has increased`));
  }
}

async function main() {
  await login();
  setInterval(async () => {
    await page.reload({ waitUntil: "networkidle0" });
    await basketObserver(page);
  }, 10000);
}
main();
