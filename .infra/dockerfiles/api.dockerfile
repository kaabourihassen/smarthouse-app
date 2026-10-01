###################
# BUILD FOR LOCAL DEVELOPMENT
###################

FROM node:22-alpine AS development

# Create api directory
WORKDIR /usr/src/api

# Copy application dependency manifests to the container image.
# A wildcard is used to ensure copying both package.json AND package-lock.json (when available).
# Copying this first prevents re-running npm install on every code change.
COPY package*.json ./

RUN npm install

# Bundle app source
COPY . .

# Create the dist folder with proper ownership and permissions
RUN mkdir -p /usr/src/api/dist

EXPOSE 3000

CMD ["npm", "run", "start:dev"]


###################
# BUILD FOR PRODUCTION
###################

FROM node:22 AS build

WORKDIR /usr/src/api

# Copy package files
COPY --chown=node:node package*.json ./


RUN chown -R node:node /usr/src/api


RUN npm ci


COPY --chown=node:node . .


RUN npm run build




FROM node:22 AS production

RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/api

COPY --chown=node:node package*.json ./

RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node --from=build /usr/src/api/dist/ ./dist/
COPY --chown=node:node --from=build /usr/src/api/public/ ./public/

RUN chown -R node:node /usr/src/api && chmod -R 775 /usr/src/api

USER node

CMD ["npm", "run", "start:prod"]