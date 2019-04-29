```bash
sudo apt-get update
wget https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch-6.5.3.deb
wget https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch-6.5.3.deb.sha512
shasum -a 512 -c elasticsearch-6.5.3.deb.sha512
sudo dpkg -i elasticsearch-6.5.3.deb
# change server.host to 0.0.0.0
sudo vi /etc/elasticsearch/elasticsearch.yml
sudo /bin/systemctl daemon-reload
sudo /bin/systemctl enable elasticsearch.service
sudo /usr/share/elasticsearch/bin/elasticsearch-plugin install -b https://github.com/ForgeRock/es-change-feed-plugin/releases/download/v6.5.3/es-changes-feed-plugin.zip
sudo service elasticsearch restart

sudo apt-get update && sudo apt-get install kibana   
# change server.host to 0.0.0.0
sudo vim /etc/kibana/kibana.yml
sudo /bin/systemctl enable kibana.service
sudo service kibana restart

sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv 9DA31620334BD75D9DCB49F368818C72E52529D4
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu xenial/mongodb-org/4.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-4.0.list
sudo apt-get update && sudo apt-get install -y mongodb-org
sudo /bin/systemctl enable mongod.service
sudo service mongod restart

mkdir ~/kaltura
cd ~/kaltura
git clone https://github.com/kaltura/cicd-dashboard
# create configuration files

curl -sL https://deb.nodesource.com/setup_11.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g forever

cd ~/kaltura/cicd-dashboard
npm install
sudo forever start server.js
node addUser {mail} {name} Administrator {dashboard url}


```