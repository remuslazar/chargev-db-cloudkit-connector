# chargEV DB CloudKit Connector

## Abstract

This connects the [chargEV App](http://ev-freaks.com/chargev) CloudKit Backend to [chargev-db](https://remuslazar.github.io/chargev-db/).

## Development

### Setup

#### Setup .env

Create a `.env` file for development:

```
CHARGEV_DB_API_JWT=<here the chargev-db JWY Auth Key>
CHARGEV_DB_API_URL=http://localhost:3001/api/v1
CLOUDKIT_KEY_ID=<here your cloudkit key>
CLOUDKIT_CONTAINER=iCloud.info.lazar.EVPlugFinder
CLOUDKIT_ENV=development
```

## Heroku

This App is currently deployed on Heroku:

https://dashboard.heroku.com/apps/chargev-db-cloudkit-connector

### ENV vars

For production set the same env vars listen in the `.env` file using e.g. `heroku config:add`.

### CloudKit PEM Key

Make sure you create a config var for the PEM file:

```bash
heroku config:add CLOUDKIT_PRIVATE_KEY_FILE="$(cat eckey.pem)"
```

Then use the supplied targets in `package.json` to create the key file on the local filesystem:

```bash
npm run create-cloudkit-key
```

Note: this hook will be called automatically after each `npm install` as well.
