const User = require('./lib/model').User;
User.Add("admin@kaltura.com", "Kaltura Admin", "123456", "Administrator")
.then(user => console.log(user))