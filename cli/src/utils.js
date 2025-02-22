const crypto = require('crypto');
const clui = require('clui');
const fs = require('fs');
const chalk = require('chalk');
const { spawn } = require('child_process');
const path = require('path');
const dotenv = require('dotenv');
const dotenvExpand = require('dotenv-expand');
const which = require('which');

const Spinner = clui.Spinner;

function generateRandomToken(size = 64) {
  return crypto.randomBytes(size).toString('hex');
}

function removeEndLineBreak(log) {
  return log.replace(/\s$/g, '');
}

function loadEnv(args) {
  const { ignoreBaseEnv = false, ignoreProcessEnv = false } = args || {};

  let baseEnv = {};
  if (!ignoreBaseEnv) {
    const baseEnvFile = path.resolve(process.cwd(), 'base.env');
    baseEnv = dotenv.parse(fs.readFileSync(baseEnvFile));
  }

  const envFile = path.resolve(process.cwd(), '.env');
  const env = dotenv.parse(fs.readFileSync(envFile));

  return dotenvExpand.expand({
    ignoreProcessEnv,
    parsed: { ...baseEnv, ...env },
  }).parsed;
}

async function runCommand(cmd, parameters = [], options = {}) {
  let spinner;
  if (options.waitLog) {
    spinner = new Spinner(options.waitLog);
    spinner.start();
  }
  return new Promise((resolve, reject) => {
    try {
      const shellCommand = spawn(cmd, parameters, {});

      shellCommand.stdout.on('data', (data) => {
        spinner?.stop();
        console.log(removeEndLineBreak(data.toString()));
        spinner?.start();
      });
      shellCommand.stderr.on('data', (data) => {
        spinner?.stop();
        console.log(removeEndLineBreak(data.toString()));
        spinner?.start();
      });
      shellCommand.on('error', (data) => {
        console.error(chalk.red(removeEndLineBreak(data.toString())));
      });
      shellCommand.on('close', (exitCode) => {
        spinner?.stop();

        if (exitCode !== 0) {
          reject(exitCode);
        } else {
          resolve(exitCode);
        }
      });
    } catch (error) {
      spinner?.stop();
      console.error(chalk.red(error.stack || error));
      reject(1);
    }
  });
}

async function findCRI() {
  // Resolve the CRI to be used
  if (await which('docker-compose', { nothrow: true })) {
    return ['docker-compose'];
  }

  if (await which('docker', { nothrow: true })) {
    return ['docker', 'compose'];
  }

  if (await which('podman-compose', { nothrow: true })) {
    return ['podman-compose'];
  }

  if (await which('podman', { nothrow: true })) {
    return ['podman', 'compose'];
  }

  throw new Error('Cannot find a valid runtime to run containers');
}

function getComposeActions(cri, action) {
  switch (cri) {
    case 'docker':
    case 'docker-compose':
      return {
        start: ['up', '-d', '--force-recreate', '--remove-orphans', '--no-color', '--quiet-pull'],
        ci: ['up', '-d', '--force-recreate', '--remove-orphans',  '--no-color', '--quiet-pull'],
        dev: [
          'up',
          '--build',
          '--force-recreate',
          '--remove-orphans',
          '--no-color',
        ],
        build: ['build', '--no-cache', '--force-rm'],
        stop: ['rm', '--stop', '--force'],
        status: ['ps'],
        config: ['config'],
        run: ['run'],
      }[action];

    case 'podman':
    case 'podman-compose':
      return {
        start: ['up', '-d', '--force-recreate', '--remove-orphans', '--no-color', '--quiet-pull'],
        ci: ['up', '-d', '--force-recreate', '--remove-orphans', '--no-color', '--quiet-pull'],
        dev: [
          'up',
          '--build',
          '--force-recreate',
          '--remove-orphans',
          '--no-color',
        ],
        build: ['build', '--no-cache'],
        stop: ['down'],
        status: ['ps'],
        config: ['config'],
        run: ['run'],
      }[action];
  }
}

async function runCompose(
  composeAction,
  composeArgs,
  composeOptions = { runMode: 'dev' },
  commandOptions = {}
) {
  const prodComposeArgs = [
    '-f',
    'docker-compose.microservices.base.yml',
    '-f',
    'docker-compose.microservices.prod.yml',
  ];
  const devComposeArgs = [
    '-f',
    'docker-compose.microservices.base.yml',
    '-f',
    'docker-compose.microservices.dev.yml',
  ];
  const ciComposeArgs = [
    '-f',
    'docker-compose.microservices.base.yml',
    '-f',
    'docker-compose.microservices.test.yml',
  ];

  let composeFilesArgs = devComposeArgs;
  if (composeOptions.runMode === 'prod') {
    composeFilesArgs = prodComposeArgs;
  } else if (composeOptions.runMode === 'ci') {
    composeFilesArgs = ciComposeArgs;
  }

  // set NODE_ENV environment variable according to runMode
  process.env.NODE_ENV = 'development';
  if (composeOptions.runMode === 'prod') {
    process.env.NODE_ENV = 'production';
  } else if (composeOptions.runMode === 'ci') {
    process.env.NODE_ENV = 'test';
  }
   
  const baseCmd = await findCRI();

  const actionArgs = getComposeActions(baseCmd[0], composeAction);
  if (actionArgs === undefined) {
    return;
  }

  await runCommand(
    baseCmd[0],
    [
      ...baseCmd.slice(1),
      ...composeFilesArgs,
      ...actionArgs,
      ...composeArgs,
    ],
    commandOptions
  );
}

function validEmail(email) {
  const re = /\S+@\S+\.\S+/;
  return re.test(email);
}

module.exports = {
  generateRandomToken,
  loadEnv,
  runCompose,
  validEmail,
};
