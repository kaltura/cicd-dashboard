const fs = require('fs');

const email = process.argv[2];
const username = process.argv[3];
const role = process.argv[4];
const url = process.argv[5];

var modules = {
    logger: console,
    config: JSON.parse(fs.readFileSync('config/config.json')),
    permissions: JSON.parse(fs.readFileSync('config/permissions.json')),
}
modules.mail = require('./lib/mail')(modules);
modules.model = require('./lib/model')(modules);


const password = Math.random().toString(36).slice(-8);
const updateInfo = `${url}#update-info`;
modules.model.User.Add(email, username, password, role)
.then(user => {
    modules.mail.send(email, 'CI/CD Dashboard Registration Approved', 'register-approved', {password: password, updateInfo: updateInfo})
    .then(process.exit, process.exit);
}, process.exit);
