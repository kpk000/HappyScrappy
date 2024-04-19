# Happy Scrappy 

![Logo](./assets/logo.png)


## Description
- HappyScrappy actively monitors your online shopping carts, updating in real-time. It notifies you whenever there are changes in key product attributes such as "stock" and "price."

## Working platforms:
- **Amazon**: Monitors your *Amazon Cart* and *Amazon Saved For Later* section, if the price of any product changes, it notifys you via the *Notification Platforms*.
<img src="./assets/amazonMessage.jpeg" width="auto" height="400">

- **Zalando**: Keeps an eye on your *Zalando Cart*. It alerts you via the *Notification Platforms* if there are changes in price and maximum availability/stock.
<img src="./assets/zalandoMessage.jpeg" width="auto" height="400">





## Notification Platforms
- **Telegram Bot**: Introduce your BOT TOKEN and CHAT ID in the `.env`.


## Usage
`pm2 start ./happyScrappy.js --name "happyScrappy" -- --amazon --zalando
`
  



