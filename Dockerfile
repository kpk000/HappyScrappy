 FROM arm64v8/node:latest

 WORKDIR /usr/src/app

 RUN npm install pm2 -g

 RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

 COPY package*.json ./

# Instala todas las dependencias de Node.js
RUN npm install

# Copia el resto del código fuente de la aplicación al directorio de trabajo
COPY . .

 

# Configura el comando para ejecutar tu aplicación usando PM2 y pasa los argumentos necesarios
CMD ["pm2-runtime", "start", "happyScrappy.js", "--", "--zalando", "--amazon"]
