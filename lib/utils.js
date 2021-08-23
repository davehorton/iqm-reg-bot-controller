const sqlRetrieveAllUsers = `SELECT card.msisdn, reseller.id as reseller_id, reseller.name, reseller.sip_hostname, 
config.enable_sip, config.sip_username, config.sip_password, config.auth_username  
FROM sim_card card, reseller, sim_card_config config 
WHERE card.config_id = config.id 
AND card.reseller_id = reseller.id;`;
const sqlRetrievePeeringGateways = 'SELECT * FROM reseller_peering_gateway';

module.exports = {
  sqlRetrieveAllUsers,
  sqlRetrievePeeringGateways,
  MSISDN_SET_NAME: 'msisdns',
  MSISDN_KEY_PREFIX: 'msisdn:',
  MY_CHANNEL: 'reg-bot-controller'
};
