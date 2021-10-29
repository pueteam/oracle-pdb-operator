FROM node:16
LABEL maintainer="sergio@pue.es"

COPY . /app
WORKDIR /app
RUN npm install

CMD ["npm", "start"]