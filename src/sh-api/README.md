<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## IoT ingestion (ESP32) via MQTT (Mosquitto)

If you switched to Mosquitto + MQTT, the API can also subscribe to your sensor topics and ingest readings automatically.

### What the API listens to

By default the API subscribes to:

- DHT22 (temperature + humidity in one topic): `smarthome/+/dht22`
- MQ2: `smarthome/+/mq2`
- Flame: `smarthome/+/flame`
- Alerts: `smarthome/alerts`

With your ESP32 sketch topics:

- `smarthome/salon/dht22`
- `smarthome/salon/mq2`
- `smarthome/salon/flame`
- `smarthome/alerts`

Payload format expected (matches your Arduino sketch `publishData(...)`):

```json
{ "device": "esp32_smart_home", "sensor": "temperature", "value": 23.4, "unit": "C", "status": "normal" }
```

The API pairs temperature + humidity received close together (default window: 2 minutes) and then calls the existing `DevicesService.upsertTemperatureHumidityForUser(...)`.

### MQ2 via MQTT

The API can also ingest MQ2 readings via MQTT.

- Default topic: `smarthome/+/mq2`
- Example: `smarthome/salon/mq2`

Payload example (recommended):

```json
{ "gasValue": 512, "gasDetected": true, "gasLevel": "warning" }
```

Your ESP32 sketch payload also works:

```json
{ "device": "esp32_smart_home", "sensor": "MQ2", "value": 1500, "unit": "ADC", "status": "warning" }
```

### Flame via MQTT

- Default topic: `smarthome/+/flame`
- Example: `smarthome/salon/flame`

ESP32 sketch payload example:

```json
{ "device": "esp32_smart_home", "sensor": "FLAME", "value": 1, "unit": "state", "status": "critical" }
```

When a flame is detected, the API writes a security event into History.

### Alerts topic

- Default topic: `smarthome/alerts`

ESP32 sketch payload example (`publishAlert(...)`):

```json
{ "device":"esp32_smart_home", "type":"TEMP_HIGH", "sensor":"DHT22", "severity":"warning", "message":"Temperature trop elevee", "value":35.2, "threshold":35.0 }
```

### Env vars

Set these in `.env` (API side):

- `MQTT_INGEST_ENABLED=true` to enable MQTT ingestion

User routing (choose one):

- Fixed user (default/simple): `MQTT_INGEST_USER_ID=<userId>`
- Dynamic user from topic: `MQTT_INGEST_USER_ID_FROM_TOPIC=true`
  - Topic format must be `.../<userId>/<room>/<metric>`
  - Example: `smarthome/USER123/salon/temperature`
- Dynamic user from payload: `MQTT_INGEST_USER_ID_FROM_PAYLOAD=true`
  - Payload must include `userId`

Safety (recommended if using dynamic user ids):

- `MQTT_INGEST_ALLOWED_USER_IDS=userId1,userId2`

Connection settings (pick one style):

- `MQTT_URL=mqtt://192.168.1.99:1883`

or

- `MQTT_HOST=192.168.1.99`
- `MQTT_PORT=1883`

Optional:

- `MQTT_USERNAME=` / `MQTT_PASSWORD=` (if your broker requires auth)
- `MQTT_CLIENT_ID=sh-api`
- `MQTT_DHT_TITLE=DHT22` (device title used in the database)
- `MQTT_DHT_TOPIC=smarthome/+/dht22`
- `MQTT_DHT_TEMP_TOPIC=smarthome/+/temperature`
- `MQTT_DHT_HUM_TOPIC=smarthome/+/humidity`
- `MQTT_MQ2_TOPIC=smarthome/+/mq2`
- `MQTT_MQ2_TITLE=MQ2`
- `MQTT_FLAME_TOPIC=smarthome/+/flame`
- `MQTT_ALERTS_TOPIC=smarthome/alerts`
- `MQTT_STATUS_TOPIC=smarthome/device/status`
- `MQTT_DHT_PAIR_WINDOW_MS=120000`
- `MQTT_INGEST_IGNORE_RETAINED=false` (set `true` if you don’t want retained messages to create timeline points after API restarts)

## Google sign-in

This project supports Google Sign-In using Google Identity Services (GIS): the frontend obtains a Google ID token and exchanges it with the API for a normal session cookie.

- Frontend loads GIS in [sh-client/init-client-folder/src/index.html](sh-client/init-client-folder/src/index.html) and needs a public Web Client ID.
- API verifies the ID token and issues a session cookie via `POST /api/auth/google`.

Configuration:

- API env var: `GOOGLE_CLIENT_ID=<your Google OAuth Web Client ID>`
- Frontend global: set `window.__GOOGLE_CLIENT_ID__` in [sh-client/init-client-folder/src/index.html](sh-client/init-client-folder/src/index.html)

## Complaint moderation (OpenAI)

Complaints submitted to `POST /api/complaints` are moderated server-side using OpenAI's Moderation API.

- Env var required on the API: `OPENAI_API_KEY=<your OpenAI API key>`
- Behavior: if the complaint text is flagged as offensive, the API returns HTTP 400 and the complaint is not saved.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
