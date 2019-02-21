const fs = require('fs');
const replace = require('key-value-replace');

const mail = {

    init: (modules) => {
        mail.config = modules.config.mail;
        mail.logger = modules.logger;
        mail.sendmail = require('sendmail')({
            logger: {
                debug: mail.logger.log,
                info: mail.logger.info,
                warn: mail.logger.warn,
                error: mail.logger.error
            },
            silent: false,
            smtpHost: mail.config.smtp
        });
    },
    
    templates: {},
    
    getTemplate: (template) => {
        if(!mail.templates[template]) {
            mail.templates[template] = fs.readFileSync(__dirname + '/../config/templates/' + template + '.html', 'utf8');
        }

        return mail.templates[template];
    },

    getHtml: (template, params) => {
        return replace(mail.getTemplate(template), Object.assign(mail.config.message, params));
    },

    send: (to, subject, template, params) => {
        if(!params) {
            params = {};
        }
        
        var message = mail.config.message;
        message.to = to;
        message.subject = subject;
        message.html = mail.getHtml(template, params);

        mail.sendmail(message, (err, reply) => {
            if(err) {
                mail.logger.log(err);
            }
            mail.logger.dir(reply);
        });
    }
}

module.exports = (modules) => {
    mail.init(modules)
    return mail;
};

