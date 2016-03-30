FROM nodesource/node:0.10.36

RUN npm install -g nodemon
ENV NODE_ENV development
ADD package.json ./
RUN npm install
ADD * ./
