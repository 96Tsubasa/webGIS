FROM node:18

# cài GDAL
RUN apt-get update && apt-get install -y gdal-bin

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5000

CMD ["node", "server.js"]