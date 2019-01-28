const fs = require('fs');

const config = JSON.parse(fs.readFileSync('config/config.json'));
const logger = console;

const model = require('./lib/model')(logger, config);
model.User.Add("admin@kaltura.com", "Kaltura Admin", "123456", "Administrator")
.then(user => console.log(user))