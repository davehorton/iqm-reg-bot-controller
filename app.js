const promisify = require('@jambonz/promisify-redis');
const redis = promisify(require('redis'));
const mysql = require('mysql2');
const opts = Object.assign({
  timestamp: () => {return `, "time": "${new Date().toISOString()}"`;}
}, {level: process.env.LOGLEVEL || 'info'});
const logger = require('pino')(opts);
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  connectionLimit: process.env.MYSQL_CONNECTION_LIMIT || 5
});
const client = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379
});
['ready', 'connect', 'reconnecting', 'error', 'end', 'warning']
  .forEach((event) => {
    client.on(event, (...args) => logger.info({args}, `redis event ${event}`));
  });

const Controller = require('./lib/controller');
const controller = new Controller(logger, client, pool);

setTimeout(async() => {
  try {
    await controller.initialize();
    controller.run();
  } catch (err) {
    logger.error({err}, 'Error initializing reg-bot-controller');
  }
}, 1000);
