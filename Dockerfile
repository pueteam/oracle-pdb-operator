FROM node:12

LABEL maintainer="sergio@pue.es"

COPY . /app
WORKDIR /app
RUN npm install
EXPOSE 10010

CMD ["npm", "start"]