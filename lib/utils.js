const sqlRetrieveAllUsers = `SELECT card.msisdn, reseller.name, reseller.sip_hostname, 
config.sip_username, config.sip_password 
FROM sim_card card, reseller, sim_card_config config 
WHERE config.enable_sip = 1 
AND card.config_id = config.id 
AND card.reseller_id = reseller.id;`;

module.exports = {
  sqlRetrieveAllUsers,
  MSISDN_SET_NAME: 'msisdns',
  MSISDN_KEY_PREFIX: 'msisdn:',
  MY_CHANNEL: 'reg-bot-controller'
};
