const sqlRetrieveAllUsers = `SELECT card.msisdn, reseller.id as reseller_id, reseller.name, reseller.sip_hostname, 
config.sip_username, config.sip_password, config.auth_username  
FROM sim_card card, reseller, sim_card_config config 
WHERE config.enable_sip = 1 
AND card.config_id = config.id 
AND reseller.sip_hostname IS NOT NULL 
AND config.sip_password IS NOT NULL 
AND card.reseller_id = reseller.id;`;
const sqlRetrievePeeringGateways = 'SELECT * FROM reseller_peering_gateway';

module.exports = {
  sqlRetrieveAllUsers,
  sqlRetrievePeeringGateways,
  MSISDN_SET_NAME: 'msisdns',
  MSISDN_KEY_PREFIX: 'msisdn:',
  MY_CHANNEL: 'reg-bot-controller'
};
