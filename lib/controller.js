const assert = require('assert');
const STATE_IDLE = 'idle';
const STATE_PENDING_ASSIGNMENT = 'pending-assignment';
const STATE_ASSIGNMENTS_IN_PROGRESS = 'assigning';
const PENDING_INTERVAL = 10000;

const {
  sqlRetrieveAllUsers,
  MSISDN_SET_NAME,
  MSISDN_KEY_PREFIX,
  MY_CHANNEL
} = require('./utils');

class Controller {
  constructor(logger, client, pool) {
    this.logger = logger;
    this.client = client;
    this.pool = pool;

    this.channels = new Set();
  }

  async initialize() {
    const users = await this._retrieveAllUsers();
    if (users.length) {
      await this._storeUserInventory(users);
      this._initPubSub();
      this._state = STATE_IDLE;
    }
    return users.length;
  }

  run() {
    assert(STATE_IDLE === this._state);
  }

  async _retrieveAllUsers() {
    const pp = this.pool.promise();
    const [r] = await pp.query(sqlRetrieveAllUsers);
    this.logger.info(`_retrieveAllUsers - retrieved ${r.length} users from the database`);
    return r;
  }

  async _storeUserInventory(users) {
    let result = await this.client.multi()
      .del(MSISDN_SET_NAME)
      .sadd(MSISDN_SET_NAME, users.map((u) => u.msisdn))
      .execAsync();
    const added = result[1];
    this.logger.info(`_storeUserInventory: added ${added} msisdns`);
    assert(added === users.length);

    const keys = users
      .map((u) => [
        `${MSISDN_KEY_PREFIX}${u.msisdn}`,
        JSON.stringify(u)
      ])
      .flat();
    result = await this.client.msetAsync(keys);
    assert('OK' === result);
  }

  _initPubSub() {
    assert(!this.subscriber);
    assert(!this.publisher);

    this.subscriber = this.client.duplicate();
    this.publisher = this.client.duplicate();

    this.subscriber.subscribe(MY_CHANNEL);
    this.subscriber.on('message', this._botMessage.bind(this));
  }

  _botMessage(channel, message) {
    this.logger.debug({channel, message}, '_botMessage');
    try {
      const {action, channel} = JSON.parse(message);
      switch (action) {
        case 'register':
          this._registerBot(channel);
          break;
        case 'unregister':
          this._unregisterBot(channel);
          break;
        default:
          this.logger.info({action}, '_botMessage: invalid or missing action');
      }

    } catch (err) {
      this.logger.error({err}, `Error parsing message from channel ${channel}: ${message}`);
    }
  }

  _registerBot(channel) {
    if (!channel) {
      this.logger.info('_registerBot - channel is missing from register message');
      return;
    }
    if (this.channels.has(channel)) {
      this.logger.debug(`_registerBot - got a checkin from ${channel}`);
      return;
    }
    this.logger.info(`got new register for channel ${channel}`);
    this._setState(STATE_PENDING_ASSIGNMENT);
  }

  _unregisterBot(channel) {
    if (!channel) {
      this.logger.info('_unregisterBot - channel is missing from unregister message');
      return;
    }
    if (!this.channels.has(channel)) {
      this.logger.info(`_unregisterBot - unknown channel is unregistering: ${channel}`);
      return;
    }
    this.channels.delete(channel);
    const numChannels = this.channels.size;
    this.logger.info(`got unregister for channel ${channel}, now have ${numChannels} channels`);
    this._setState(0 === numChannels ? STATE_IDLE : STATE_PENDING_ASSIGNMENT);
  }

  async _assignTasks() {
    const numWorkers = this.channels.size;
    if (0 === numWorkers) {
      this.logger.info('_assignTasks - no workers, nothing to do');
      return;
    }
    try {
      const msidns = await this.client.smembersAsync(MSISDN_SET_NAME);
      if (0 === msidns.length) {
        this.logger.info('_assignTasks - no msisdns found in redis, nothing to do');
        return;
      }
      const allocSize = msidns.length / numWorkers;
      const extra = msidns.length % numWorkers;
      this.logger.info(`_assignTasks: ${numWorkers} workers, ${msidns.length} msisdns, each to handle ~${allocSize}`);
      let start = 0;
      for (const channel of this.channels) {
        const quota = 0 === start ? allocSize + extra : allocSize;
        this._assignTasksToChannel(channel, msidns.slice(start, start + quota));
        start += quota;
      }
      this.logger.info('_assignTasks: finished assigning tasks');
    } catch (err) {
      this.logger.error({err}, '_assignTasks - Error assigning tasks to workers');
    }
  }

  async _assignTasksToChannel(channel, msisdns) {
    const keys = msisdns.map((i) => `${MSISDN_KEY_PREFIX}${i}`);
    this.logger.debug({keys}, '_assignTasksToChannel - retrieving keys');
    const results = await this.client.mgetAsync(keys);
    this.logger.debug({results}, '_assignTasksToChannel - retrieved values');
    assert(keys.length === results.length);
    const users = [];
    for (let i = 0; i < keys.length; i++) {
      const obj = JSON.parse(results[i]);
      users.push({...obj, msisdn: keys[i]});
    }
    this.publisher.publish(channel, JSON.stringify({
      action: 'assign',
      users
    }));
  }

  async _setState(newState) {
    const oldState = this._state;
    this._state = newState;

    if (STATE_PENDING_ASSIGNMENT === this._state) {
      if (this._pendingTimer) {
        clearTimeout(this._pendingTimer);
        this._pendingTimer = null;
      }
      this._pendingTimer = setTimeout(this._setState.bind(this, STATE_ASSIGNMENTS_IN_PROGRESS), PENDING_INTERVAL);
    }
    else if (STATE_ASSIGNMENTS_IN_PROGRESS === this._state) {
      assert(STATE_PENDING_ASSIGNMENT === oldState);
      await this._assignTasks();
      this._setState(STATE_IDLE);
    }
  }

}

module.exports = Controller;