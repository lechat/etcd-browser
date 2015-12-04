FROM projectplace/base-image:latest
MAINTAINER Stefan Lundström <stefan.lundstrom@projectplace.com>

RUN apt-get -qq update && DEBIAN_FRONTEND=noninteractive apt-get -qqy install nginx --no-install-recommends
ADD frontend /opt/etcd-browser
ADD nginx.conf /etc/nginx/sites-available/default
ADD nginx-ssl.conf /etc/nginx/default-ssl
ADD start-etcd-browser.sh /opt/start-etcd-browser.sh
RUN chmod +x /opt/start-etcd-browser.sh

CMD /opt/start-etcd-browser.sh
EXPOSE 443