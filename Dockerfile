FROM node:14-alpine
ADD . /srv/www
WORKDIR /srv/www
RUN npm install --unsafe-perm
RUN npm run build
RUN mv -f /srv/www/blockdomains.txt /blockdomains.txt

CMD ./bin/slackin.js
