const fs = require('fs');
const crypto = require('crypto');
const mongoose = require('mongoose');

var passwordSecret;

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    unique: true,
    required: true,
    trim: true
  },
  username: {
    type: String,
    unique: true,
    required: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
  },
  userRole: {
    type: String,
    required: true,
  }
});

var User = mongoose.model('User', UserSchema);

User.EncryptPassword = password => {
  return crypto.createHmac('sha256', passwordSecret)
    .update(password)
    .digest('hex');
};

User.Add = (email, username, password, userRole) => {
  return new Promise((resolve, reject) => {    
      const userData = {
        email: email,
        username: username,
        password: User.EncryptPassword(password),
        userRole: userRole,
      }
      
      User.create(userData, function (err, user) {
        if (err) {
          reject(err)
        } else {
          resolve(user);
        }
      });
  });
};

User.UpdatePassword = (user, password) => {
  return new Promise((resolve, reject) => {      
      user.password = User.EncryptPassword(password);
      user.save(function (err) {
        if(err) {
            reject(err); 
        }
        else {
          resolve();
        }
    });
  });
};

User.Update = (user, username, password) => {
  return new Promise((resolve, reject) => {      
    user.username = username;
    user.password = User.EncryptPassword(password);
    console.log(user);
    user.save(function (err) {
      if(err) {
          reject(err); 
      }
      else {
        resolve();
      }
    });
  });
};

User.Authenticate = (email, password) => {
  return new Promise((resolve, reject) => {    
    User.findOne({ 
      email: email 
    }).exec((err, user) => {
      if (err) {
        reject(err)
      } 
      else if (!user) {
        reject('User not found.');
      }
      else {
        if(User.EncryptPassword(password) == user.password) {
          resolve(user);
        } else {
          reject('User not found.');
        }
      }
    });
  });
};

User.GetByMail = (email) => {
  return new Promise((resolve, reject) => {    
    User.findOne({ 
      email: email 
    }).exec((err, user) => {
      if (err) {
        reject(err)
      } 
      else if (!user) {
        reject('User not found.');
      }
      else {
        resolve(user);
      }
    });
  });
};

User.List = () => {
  return new Promise((resolve, reject) => {    
    User.find({}).exec((err, users) => {
      if (err) {
        reject(err)
      }
      else {
        resolve(users);
      }
    });
  });
};

module.exports = (modules) => {
  passwordSecret = modules.config.passwordSecret;
  mongoose.connect(modules.config.mongodbUrl);
  return {
    User: User
  };
};