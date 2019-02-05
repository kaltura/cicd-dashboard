
const fs = require('fs');
const unzip = require('unzip');
const { Readable } = require('stream');

function validateSecret(secret) {
    // TODO
    return true;
}

const files = {
    init: (logger, config) => {        
        files.logger = logger;
    },

    upload: ({id, secret}, {fileData}, res) => {
        if(!validateSecret(secret)) {
            res.sendStatus(401).end();
            files.logger.error(`Invalid secret [${secret}]`);
        }
        else {
            res.sendStatus(200).end();
            const dir = __dirname + '/../public/reports/';
            if(!fs.existsSync(dir)) {
                fs.mkdirSync(dir);
            }
            const id = fileData.name.replace(/[.]zip$/, '');
            const filePath = dir + id;
            // var dst = fs.writeFile(filePath, );

            const stream = new Readable();
            stream.push(fileData.data);
            stream.push(null);

            stream.pipe(unzip.Extract({ path: filePath }));
        }
    }
}

module.exports = (logger, config) => {
    files.init(logger, config)
    return files;
};