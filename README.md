<p align="center">
<img alt="App logo (film)" width="200" height="200" src="./assets/logo.svg" />
</p>

<h1 align="center">
<sup>stringplay-core</sup>
</h1>

<p align="center">
<strong>stringplay</strong> is a data collection service that aggregates attendee information from your online spreadsheets and surveys, allowing you to effectively track event and membership data. Based on <a href="https://github.com/cloudydaiyz/membership-logger">membership-logger</a>.
</p>

## Overview

This repository provides the backend for the stringplay project. For other relevant repositories, check out the following links:

- [`stringplay`](https://github.com/cloudydaiyz/stringplay) (Main)
- [`stringplay-ui`](https://github.com/cloudydaiyz/stringplay-ui) (Frontend)

Note that this project uses MongoDB as its database provider. In order for services to properly run in production, you must have a MongoDB (or MongoDB Atlas) instance up and running.

## Packages

- [`stringplay-core`](packages/stringplay-core) - The core backend functionality for the stringplay project. This package provides the controllers for the API service, sync service, and scheduled tasks services, as well as types used for the services.

- [`stringplay-gcp`](packages/stringplay-gcp) - The GCP Cloud Run Functions defined by the project. This package contains definitions for each function to deploy to GCP.

## Installation

Make sure that Node.js version 20.0.0 or higher is installed on your device. 

1. Run `npm install` to install dependencies for the root package.
2. Run `npm run build` to transpile ts code and install dependencies for all child packages.

## Environment Variables

Environment variables are required to be set in order to run the code from the child packages. You can either define these environment variables globally, or create a `.env` file to define the variables specifically within this repository. Look at [`.env.temp`](./.env.temp) for information on each environment variable. 

The `.env` file is injected into each command via [`dotenvx`](https://github.com/dotenvx/dotenvx).

If using this repository for automation, the preferred environment variable name for the absolute path to the root of this repository is `STRINGPLAY_CORE_PATH`.

## Commands

Before running commands, ensure that you have all necessary environment variables set.

- `npm start`: Runs the API server in `packages/stringplay-gcp`
- `npm test`: Runs jest tests in `packages/stringplay-core`
- `npm run build`: Transpiles TS code and installs dependencies for all folders in `/packages`
- `npm run ci`: Performs a [clean install](https://docs.npmjs.com/cli/v10/commands/npm-ci) for all packages in the project
- `npm run quick`: Runs the `quick-test.ts` file in `packages/stringplay-core/src` if available. This allows you to run unique, isolated code with access to the functionality provided by the core package.
- `npm run coverage`: Runs jest tests in `packages/stringplay-core` and displays test coverage
- `npm run core-server`: Runs the (dev) server created by `packages/stringplay-core`

## Debugging

This repository comes with support for the Visual Studio Code debugger. 

- `gcp-server (api) | stringplay-gcp` configuration - debugs `npm start`
- `core-server | stringplay-core` configuration - debugs `npm run core-server`
- `quick-test | stringplay-core` configuration - debugs `npm run quick`
- `*.spec.ts (tests) | stringplay-core` configuration - runs jest in watch mode, and debugs any individual jest test file in `packages/stringplay-core`

For more resources on debugging:

- See [`.vscode/launch.json`](.vscode/launch.json) for configuration details.
- See [Debugging in VS Code](https://code.visualstudio.com/docs/editor/debugging) for how to use the VS Code debugger.